import { describe, expect, test } from 'vitest'

import { DT, PLAYER_SPEED } from '@shared/constants.ts'
import { deserializeWorld, serializeWorld } from '@shared/snapshot.ts'
import type { PlayerInput } from '@shared/types.ts'

import {
  connectClient,
  createServerState,
  disconnectClient,
  enqueueClientInput,
  tickServer,
} from './server.ts'

function makeQueuedInput(
  playerId: number,
  seq: number,
  tick: number,
  overrides: Partial<Omit<PlayerInput, 'playerId' | 'seq'>> = {}
): { input: PlayerInput; tick: number } {
  return {
    input: {
      playerId,
      seq,
      up: overrides.up ?? false,
      down: overrides.down ?? false,
      left: overrides.left ?? false,
      right: overrides.right ?? false,
      fire: overrides.fire ?? false,
      aimX: overrides.aimX ?? 0,
      aimY: overrides.aimY ?? 0,
    },
    tick,
  }
}

describe('server state', () => {
  test('server tick loop advances tick counter', () => {
    const state = createServerState({})

    tickServer({ state })

    expect(state.world.tick).toBe(1)
  })

  test('server applies queued inputs in sequence order per client', () => {
    const state = createServerState({})
    const firstClient = connectClient({ state, clientId: 'client-1' })
    const secondClient = connectClient({ state, clientId: 'client-2' })

    enqueueClientInput({
      state,
      clientId: firstClient.clientId,
      input: makeQueuedInput(firstClient.playerId, 3, 2, { left: true }),
    })
    enqueueClientInput({
      state,
      clientId: firstClient.clientId,
      input: makeQueuedInput(firstClient.playerId, 1, 0, { right: true }),
    })
    enqueueClientInput({
      state,
      clientId: firstClient.clientId,
      input: makeQueuedInput(firstClient.playerId, 2, 1, { up: true }),
    })
    enqueueClientInput({
      state,
      clientId: secondClient.clientId,
      input: makeQueuedInput(secondClient.playerId, 10, 0, { down: true }),
    })

    const firstClientStartX = state.world.positions[firstClient.playerId].x
    const firstClientStartY = state.world.positions[firstClient.playerId].y
    const secondClientStartY = state.world.positions[secondClient.playerId].y

    tickServer({ state })

    expect(state.world.positions[firstClient.playerId].x).toBeCloseTo(
      firstClientStartX + PLAYER_SPEED * DT
    )
    expect(state.world.positions[firstClient.playerId].y).toBeCloseTo(
      firstClientStartY
    )
    expect(state.world.positions[secondClient.playerId].y).toBeCloseTo(
      secondClientStartY + PLAYER_SPEED * DT
    )
    expect(state.clients[firstClient.clientId]?.lastAckedSeq).toBe(1)
    expect(state.clients[secondClient.clientId]?.lastAckedSeq).toBe(10)

    tickServer({ state })

    expect(state.world.positions[firstClient.playerId].x).toBeCloseTo(
      firstClientStartX + PLAYER_SPEED * DT
    )
    expect(state.world.positions[firstClient.playerId].y).toBeCloseTo(
      firstClientStartY - PLAYER_SPEED * DT
    )
    expect(state.clients[firstClient.clientId]?.lastAckedSeq).toBe(2)

    tickServer({ state })

    expect(state.world.positions[firstClient.playerId].x).toBeCloseTo(
      firstClientStartX
    )
    expect(state.world.positions[firstClient.playerId].y).toBeCloseTo(
      firstClientStartY - PLAYER_SPEED * DT
    )
    expect(state.clients[firstClient.clientId]?.lastAckedSeq).toBe(3)
  })

  test('server clears input queue each tick', () => {
    const state = createServerState({})
    const client = connectClient({ state, clientId: 'client-1' })

    enqueueClientInput({
      state,
      clientId: client.clientId,
      input: makeQueuedInput(client.playerId, 1, 0, { right: true }),
    })

    tickServer({ state })

    expect(state.clients[client.clientId]?.inputQueue).toEqual([])
  })

  test('server builds a snapshot after each tick', () => {
    const state = createServerState({})
    const client = connectClient({ state, clientId: 'client-1' })

    enqueueClientInput({
      state,
      clientId: client.clientId,
      input: makeQueuedInput(client.playerId, 1, 0, { right: true }),
    })

    const result = tickServer({ state })
    const snapshotWorld = deserializeWorld({ snapshot: result.snapshot })

    expect(result.snapshot).toEqual(serializeWorld({ world: state.world }))
    expect(snapshotWorld.tick).toBe(1)
    expect(result.clientAcks[client.clientId]).toBe(1)
  })

  test('server adds snapshots to history buffer up to N entries', () => {
    const state = createServerState({ historyLimit: 2 })
    connectClient({ state, clientId: 'client-1' })

    tickServer({ state })
    tickServer({ state })
    tickServer({ state })

    expect(state.history).toHaveLength(2)
    expect(state.history[0]?.tick).toBe(2)
    expect(state.history[1]?.tick).toBe(3)
  })

  test('connect spawns a player and disconnect removes it', () => {
    const state = createServerState({})

    const client = connectClient({ state, clientId: 'client-1' })

    expect(state.world.players[client.playerId]).toBeDefined()

    disconnectClient({ state, clientId: client.clientId })

    expect(state.world.players[client.playerId]).toBeUndefined()
    expect(state.clients[client.clientId]).toBeUndefined()
  })
})
