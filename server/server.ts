import {
  BULLET_DAMAGE,
  BULLET_SPEED,
  DEFAULT_WALL_LAYOUT,
  FIRE_COOLDOWN_TICKS,
  MAX_REWIND_TICKS,
  MAX_SHOT_DISTANCE,
  INTERPOLATION_DELAY_TICKS,
} from '@shared/constants.ts'
import { checkShotInPast } from '@shared/lagcomp.ts'
import { serializeWorld } from '@shared/snapshot.ts'
import { step } from '@shared/step.ts'
import type {
  ClientId,
  EntityId,
  PlayerInput,
  Snapshot,
  World,
} from '@shared/types.ts'
import {
  createWorld,
  destroyEntity,
  spawnPlayer,
  spawnBullet,
  spawnWall,
} from '@shared/world.ts'

import { pushSnapshotToHistory } from './history.ts'

export interface QueuedClientInput {
  input: PlayerInput
  tick: number
}

export interface ServerClientState {
  clientId: ClientId
  inputQueue: Array<QueuedClientInput>
  lastAppliedInput: PlayerInput | null
  lastAckedSeq: number
  lastProcessedShotSeq: number
  latestQueuedSeq: number
  playerId: number
}

export interface ServerState {
  clients: Record<ClientId, ServerClientState>
  history: Array<Snapshot>
  historyLimit: number
  world: World
}

export interface CreateServerStateOptions {
  historyLimit?: number
  world?: World
}

export interface ConnectClientOptions {
  state: ServerState
  clientId: ClientId
}

export interface DisconnectClientOptions {
  state: ServerState
  clientId: ClientId
}

export interface EnqueueClientInputOptions {
  state: ServerState
  clientId: ClientId
  input: QueuedClientInput
}

export interface TickServerOptions {
  state: ServerState
}

export interface TickServerResult {
  clientAcks: Record<ClientId, number>
  snapshot: Snapshot
}

export interface PlayerShot {
  aimX: number
  aimY: number
  playerId: EntityId
  seq: number
  tick: number
}

export interface ProcessClientShootOptions {
  state: ServerState
  clientId: ClientId
  shot: PlayerShot
}

export interface ProcessClientShootResult {
  shooterId: EntityId
  shotSeq: number
  targetId: EntityId | null
}

const DEFAULT_HISTORY_LIMIT = 120
export const MAX_FUTURE_INPUT_TICKS = 20

function sortQueuedInputs(
  inputs: Array<QueuedClientInput>
): Array<QueuedClientInput> {
  return [...inputs].sort(
    (firstInput, secondInput) =>
      firstInput.tick - secondInput.tick ||
      firstInput.input.seq - secondInput.input.seq
  )
}

function getTickInputs(state: ServerState): Array<PlayerInput> {
  const tickInputs: Array<PlayerInput> = []
  const clientIds = Object.keys(state.clients).sort()
  const currentServerTick = state.world.tick

  for (const clientId of clientIds) {
    const client = state.clients[clientId]
    const sortedQueue = sortQueuedInputs(client.inputQueue)
    let hasFirePulseInDueInputs = false
    let latestDueInput: PlayerInput | null = null
    let nextQueueStartIndex = 0

    for (const queuedInput of sortedQueue) {
      if (queuedInput.tick > currentServerTick) {
        break
      }

      latestDueInput = queuedInput.input
      hasFirePulseInDueInputs ||= queuedInput.input.fire
      nextQueueStartIndex += 1
    }

    client.inputQueue = sortedQueue.slice(nextQueueStartIndex)

    if (latestDueInput !== null) {
      client.lastAppliedInput = latestDueInput
      client.lastAckedSeq = Math.max(client.lastAckedSeq, latestDueInput.seq)

      // Preserve a short fire pulse even if several due inputs collapse into one
      // authoritative server tick and the latest input in that batch is `fire: false`.
      tickInputs.push(
        hasFirePulseInDueInputs && !latestDueInput.fire
          ? { ...latestDueInput, fire: true }
          : latestDueInput
      )
      continue
    }

    if (client.lastAppliedInput === null) {
      continue
    }

    tickInputs.push(client.lastAppliedInput)
  }

  return tickInputs
}

function createDefaultServerWorld(): World {
  const world = createWorld({})

  for (const wall of DEFAULT_WALL_LAYOUT) {
    spawnWall(world, wall)
  }

  return world
}

function normalizeAim({
  fromX,
  fromY,
  toX,
  toY,
}: {
  fromX: number
  fromY: number
  toX: number
  toY: number
}): { x: number; y: number } | null {
  const dx = toX - fromX
  const dy = toY - fromY
  const length = Math.hypot(dx, dy)

  if (length === 0) {
    return null
  }

  return {
    x: dx / length,
    y: dy / length,
  }
}

function applyShotDamage({
  state,
  targetId,
}: {
  state: ServerState
  targetId: EntityId
}): void {
  const targetPlayer = state.world.players[targetId]
  if (targetPlayer === undefined) {
    return
  }

  state.world.health[targetId] = Math.max(
    0,
    state.world.health[targetId] - BULLET_DAMAGE
  )
  if (state.world.health[targetId] === 0) {
    targetPlayer.needsRespawn = true
  }
}

export function createServerState({
  historyLimit = DEFAULT_HISTORY_LIMIT,
  world = createDefaultServerWorld(),
}: CreateServerStateOptions): ServerState {
  return {
    clients: {},
    history: [],
    historyLimit,
    world,
  }
}

export function connectClient({
  state,
  clientId,
}: ConnectClientOptions): ServerClientState {
  const playerId = spawnPlayer(state.world)
  const client: ServerClientState = {
    clientId,
    inputQueue: [],
    lastAppliedInput: null,
    lastAckedSeq: 0,
    lastProcessedShotSeq: 0,
    latestQueuedSeq: 0,
    playerId,
  }

  state.clients[clientId] = client
  return client
}

export function disconnectClient({
  state,
  clientId,
}: DisconnectClientOptions): void {
  const client = state.clients[clientId]
  if (client === undefined) {
    return
  }

  destroyEntity(state.world, client.playerId)
  delete state.clients[clientId]
}

export function enqueueClientInput({
  state,
  clientId,
  input,
}: EnqueueClientInputOptions): void {
  const client = state.clients[clientId]
  if (client === undefined) {
    return
  }

  if (input.input.seq <= client.lastAckedSeq) {
    return
  }

  if (input.input.seq <= client.latestQueuedSeq) {
    return
  }

  if (input.tick > state.world.tick + MAX_FUTURE_INPUT_TICKS) {
    return
  }

  client.latestQueuedSeq = input.input.seq
  client.inputQueue.push(input)
}

export function processClientShoot({
  state,
  clientId,
  shot,
}: ProcessClientShootOptions): ProcessClientShootResult | null {
  const client = state.clients[clientId]
  if (client === undefined) {
    return null
  }

  if (shot.seq <= client.lastProcessedShotSeq) {
    return null
  }

  client.lastProcessedShotSeq = shot.seq

  const shooter = state.world.players[client.playerId]
  const shooterPosition = state.world.positions[client.playerId]
  if (shooter === undefined || shooterPosition === undefined) {
    return null
  }

  if (shooter.needsRespawn || state.world.health[client.playerId] <= 0) {
    return null
  }

  if (shooter.fireCooldownTicks > 0) {
    return null
  }

  const shotDirection = normalizeAim({
    fromX: shooterPosition.x,
    fromY: shooterPosition.y,
    toX: shot.aimX,
    toY: shot.aimY,
  })
  if (shotDirection === null) {
    return null
  }

  const minimumAllowedTick = state.world.tick - MAX_REWIND_TICKS
  const rewoundHistory = state.history.filter(
    (snapshot) => snapshot.tick >= minimumAllowedTick
  )
  const targetTick = Math.max(
    minimumAllowedTick,
    shot.tick - INTERPOLATION_DELAY_TICKS
  )
  const currentSnapshot = serializeWorld({ world: state.world })
  const targetId = checkShotInPast({
    aimX: shot.aimX,
    aimY: shot.aimY,
    currentSnapshot,
    history: rewoundHistory,
    maxDistance: MAX_SHOT_DISTANCE,
    shooterId: client.playerId,
    targetTick,
  })

  spawnBullet(state.world, {
    x: shooterPosition.x,
    y: shooterPosition.y,
    velocityX: shotDirection.x * BULLET_SPEED,
    velocityY: shotDirection.y * BULLET_SPEED,
    ownerId: client.playerId,
    damage: 0,
  })
  shooter.fireCooldownTicks = FIRE_COOLDOWN_TICKS

  if (targetId !== null) {
    applyShotDamage({
      state,
      targetId,
    })
  }

  return {
    shooterId: client.playerId,
    shotSeq: shot.seq,
    targetId,
  }
}

export function tickServer({ state }: TickServerOptions): TickServerResult {
  step(state.world, getTickInputs(state))

  const snapshot = serializeWorld({ world: state.world })
  state.history = pushSnapshotToHistory({
    history: state.history,
    snapshot,
    limit: state.historyLimit,
  })

  const clientAcks: Record<ClientId, number> = {}
  for (const [clientId, client] of Object.entries(state.clients)) {
    clientAcks[clientId] = client.lastAckedSeq
  }

  return {
    clientAcks,
    snapshot,
  }
}
