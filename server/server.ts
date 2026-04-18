import { serializeWorld } from '@shared/snapshot.ts'
import { step } from '@shared/step.ts'
import type { ClientId, PlayerInput, Snapshot, World } from '@shared/types.ts'
import { createWorld, destroyEntity, spawnPlayer } from '@shared/world.ts'

import { pushSnapshotToHistory } from './history.ts'

export interface ServerClientState {
  clientId: ClientId
  inputQueue: Array<PlayerInput>
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
  input: PlayerInput
}

export interface TickServerOptions {
  state: ServerState
}

export interface TickServerResult {
  clientAcks: Record<ClientId, number>
  snapshot: Snapshot
}

const DEFAULT_HISTORY_LIMIT = 120

function sortQueuedInputs(inputs: Array<PlayerInput>): Array<PlayerInput> {
  return [...inputs].sort(
    (firstInput, secondInput) => firstInput.seq - secondInput.seq
  )
}

function getTickInputs(state: ServerState): Array<PlayerInput> {
  const tickInputs: Array<PlayerInput> = []
  const clientIds = Object.keys(state.clients).sort()

  for (const clientId of clientIds) {
    const client = state.clients[clientId]
    const sortedQueue = sortQueuedInputs(client.inputQueue)
    const latestInput = sortedQueue[sortedQueue.length - 1]

    if (latestInput === undefined) {
      client.inputQueue = []
      continue
    }

    tickInputs.push(latestInput)
    client.lastAckedSeq = latestInput.seq
    client.inputQueue = []
  }

  return tickInputs
}

export function createServerState({
  historyLimit = DEFAULT_HISTORY_LIMIT,
  world = createWorld({}),
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
