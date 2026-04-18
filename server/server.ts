import { DEFAULT_WALL_LAYOUT } from '@shared/constants.ts'
import { serializeWorld } from '@shared/snapshot.ts'
import { step } from '@shared/step.ts'
import type { ClientId, PlayerInput, Snapshot, World } from '@shared/types.ts'
import {
  createWorld,
  destroyEntity,
  spawnPlayer,
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

const DEFAULT_HISTORY_LIMIT = 120

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
    let nextQueueStartIndex = 0

    for (const queuedInput of sortedQueue) {
      if (queuedInput.tick > currentServerTick) {
        break
      }

      client.lastAppliedInput = queuedInput.input
      client.lastAckedSeq = queuedInput.input.seq
      nextQueueStartIndex += 1
    }

    client.inputQueue = sortedQueue.slice(nextQueueStartIndex)

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

  client.inputQueue.push(input)
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
