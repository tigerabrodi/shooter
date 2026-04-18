import { describe, expect, test } from 'vitest'

import {
  BULLET_DAMAGE,
  DT,
  FIRE_COOLDOWN_TICKS,
  INTERPOLATION_DELAY_TICKS,
  MAX_REWIND_TICKS,
  PLAYER_SPEED,
} from '@shared/constants.ts'
import { deserializeWorld, serializeWorld } from '@shared/snapshot.ts'
import type { PlayerInput } from '@shared/types.ts'
import { createWorld, spawnPlayer, spawnWall } from '@shared/world.ts'

import {
  connectClient,
  createServerState,
  disconnectClient,
  enqueueClientInput,
  MAX_FUTURE_INPUT_TICKS,
  processClientShoot,
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

  test('server applies due inputs in tick order per client', () => {
    const state = createServerState({})
    const firstClient = connectClient({ state, clientId: 'client-1' })
    const secondClient = connectClient({ state, clientId: 'client-2' })

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
      clientId: firstClient.clientId,
      input: makeQueuedInput(firstClient.playerId, 3, 2, { left: true }),
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

  test('server ignores stale duplicate inputs and keeps ack monotonic', () => {
    const state = createServerState({})
    const client = connectClient({ state, clientId: 'client-1' })
    const startX = state.world.positions[client.playerId].x

    enqueueClientInput({
      state,
      clientId: client.clientId,
      input: makeQueuedInput(client.playerId, 1, 0, { right: true }),
    })

    tickServer({ state })

    expect(state.clients[client.clientId]?.lastAckedSeq).toBe(1)
    expect(state.world.positions[client.playerId].x).toBeCloseTo(
      startX + PLAYER_SPEED * DT
    )

    enqueueClientInput({
      state,
      clientId: client.clientId,
      input: makeQueuedInput(client.playerId, 1, 1, { left: true }),
    })

    tickServer({ state })

    expect(state.clients[client.clientId]?.lastAckedSeq).toBe(1)
    expect(state.world.positions[client.playerId].x).toBeCloseTo(
      startX + PLAYER_SPEED * DT * 2
    )
  })

  test('server ignores duplicate sequence numbers before they are acked', () => {
    const state = createServerState({})
    const client = connectClient({ state, clientId: 'client-1' })

    enqueueClientInput({
      state,
      clientId: client.clientId,
      input: makeQueuedInput(client.playerId, 1, 0, { right: true }),
    })
    enqueueClientInput({
      state,
      clientId: client.clientId,
      input: makeQueuedInput(client.playerId, 1, 0, { left: true }),
    })

    expect(state.clients[client.clientId]?.inputQueue).toHaveLength(1)
  })

  test('server ignores inputs that are too far in the future', () => {
    const state = createServerState({})
    const client = connectClient({ state, clientId: 'client-1' })
    const startX = state.world.positions[client.playerId].x

    enqueueClientInput({
      state,
      clientId: client.clientId,
      input: makeQueuedInput(
        client.playerId,
        1,
        state.world.tick + MAX_FUTURE_INPUT_TICKS + 1,
        { right: true }
      ),
    })

    tickServer({ state })

    expect(state.clients[client.clientId]?.lastAckedSeq).toBe(0)
    expect(state.clients[client.clientId]?.inputQueue).toEqual([])
    expect(state.world.positions[client.playerId].x).toBeCloseTo(startX)
  })

  test('server preserves a short fire pulse when due inputs collapse into one tick', () => {
    const world = createWorld({})
    const state = createServerState({ world })
    const client = connectClient({ state, clientId: 'client-1' })
    const playerPosition = state.world.positions[client.playerId]

    enqueueClientInput({
      state,
      clientId: client.clientId,
      input: makeQueuedInput(client.playerId, 1, 0, {
        fire: true,
        aimX: playerPosition.x + 100,
        aimY: playerPosition.y,
      }),
    })
    enqueueClientInput({
      state,
      clientId: client.clientId,
      input: makeQueuedInput(client.playerId, 2, 0, {
        fire: false,
        aimX: playerPosition.x + 100,
        aimY: playerPosition.y,
      }),
    })

    tickServer({ state })

    expect(Object.keys(state.world.bullets)).toHaveLength(1)
    expect(state.clients[client.clientId]?.lastAckedSeq).toBe(2)
  })

  test('server applies shot damage using rewound positions and not current positions', () => {
    const world = createWorld({})
    const state = createServerState({ world })
    const client = connectClient({ state, clientId: 'client-1' })
    const shooterId = client.playerId
    const targetId = spawnPlayer(state.world, {
      x: 220,
      y: 220,
      color: '#ffffff',
    })

    state.world.positions[shooterId] = { x: 100, y: 100 }
    state.world.positions[targetId] = { x: 220, y: 220 }
    state.world.tick = 20

    const rewoundWorld = deserializeWorld({
      snapshot: serializeWorld({ world: state.world }),
    })
    rewoundWorld.tick = state.world.tick - INTERPOLATION_DELAY_TICKS
    rewoundWorld.positions[targetId] = { x: 220, y: 100 }
    state.history = [serializeWorld({ world: rewoundWorld })]

    const result = processClientShoot({
      state,
      clientId: client.clientId,
      shot: {
        aimX: 320,
        aimY: 100,
        playerId: shooterId,
        seq: 1,
        tick: state.world.tick,
      },
    })

    expect(result).toEqual({
      shooterId,
      shotSeq: 1,
      targetId,
    })
    expect(state.world.health[targetId]).toBe(100 - BULLET_DAMAGE)
    expect(state.world.players[shooterId]?.fireCooldownTicks).toBe(
      FIRE_COOLDOWN_TICKS
    )
    expect(Object.keys(state.world.bullets)).toHaveLength(1)
  })

  test('server does not process duplicate shot sequence numbers twice', () => {
    const world = createWorld({})
    const state = createServerState({ world })
    const client = connectClient({ state, clientId: 'client-1' })
    const shooterId = client.playerId
    const targetId = spawnPlayer(state.world, {
      x: 220,
      y: 100,
      color: '#ffffff',
    })

    state.world.positions[shooterId] = { x: 100, y: 100 }
    state.world.tick = 20

    const firstResult = processClientShoot({
      state,
      clientId: client.clientId,
      shot: {
        aimX: 320,
        aimY: 100,
        playerId: shooterId,
        seq: 1,
        tick: state.world.tick,
      },
    })
    const healthAfterFirstShot = state.world.health[targetId]
    const secondResult = processClientShoot({
      state,
      clientId: client.clientId,
      shot: {
        aimX: 320,
        aimY: 100,
        playerId: shooterId,
        seq: 1,
        tick: state.world.tick,
      },
    })

    expect(firstResult?.targetId).toBe(targetId)
    expect(secondResult).toBeNull()
    expect(state.world.health[targetId]).toBe(healthAfterFirstShot)
  })

  test('server burns rejected shot sequence numbers so duplicates cannot succeed later', () => {
    const world = createWorld({})
    const state = createServerState({ world })
    const client = connectClient({ state, clientId: 'client-1' })
    const shooterId = client.playerId
    const targetId = spawnPlayer(state.world, {
      x: 220,
      y: 100,
      color: '#ffffff',
    })

    state.world.positions[shooterId] = { x: 100, y: 100 }
    state.world.tick = 20
    state.world.players[shooterId].fireCooldownTicks = 3

    const rejectedShot = processClientShoot({
      state,
      clientId: client.clientId,
      shot: {
        aimX: 320,
        aimY: 100,
        playerId: shooterId,
        seq: 1,
        tick: state.world.tick,
      },
    })

    state.world.players[shooterId].fireCooldownTicks = 0

    const duplicateShot = processClientShoot({
      state,
      clientId: client.clientId,
      shot: {
        aimX: 320,
        aimY: 100,
        playerId: shooterId,
        seq: 1,
        tick: state.world.tick,
      },
    })

    expect(rejectedShot).toBeNull()
    expect(duplicateShot).toBeNull()
    expect(state.world.health[targetId]).toBe(100)
  })

  test('server ignores shots that are outside the max rewind window', () => {
    const world = createWorld({})
    const state = createServerState({ world })
    const client = connectClient({ state, clientId: 'client-1' })
    const shooterId = client.playerId
    const targetId = spawnPlayer(state.world, {
      x: 220,
      y: 220,
      color: '#ffffff',
    })

    state.world.positions[shooterId] = { x: 100, y: 100 }
    state.world.positions[targetId] = { x: 220, y: 220 }
    state.world.tick = 40

    const oldWorld = deserializeWorld({
      snapshot: serializeWorld({ world: state.world }),
    })
    oldWorld.tick = state.world.tick - MAX_REWIND_TICKS - 10
    oldWorld.positions[targetId] = { x: 220, y: 100 }
    state.history = [serializeWorld({ world: oldWorld })]

    const result = processClientShoot({
      state,
      clientId: client.clientId,
      shot: {
        aimX: 320,
        aimY: 100,
        playerId: shooterId,
        seq: 1,
        tick: oldWorld.tick + INTERPOLATION_DELAY_TICKS,
      },
    })

    expect(result?.targetId).toBeNull()
    expect(state.world.health[targetId]).toBe(100)
  })

  test('server shot handling respects rewound wall cover', () => {
    const world = createWorld({})
    const state = createServerState({ world })
    const client = connectClient({ state, clientId: 'client-1' })
    const shooterId = client.playerId
    const targetId = spawnPlayer(state.world, {
      x: 260,
      y: 100,
      color: '#ffffff',
    })

    state.world.positions[shooterId] = { x: 100, y: 100 }
    state.world.positions[targetId] = { x: 260, y: 100 }
    spawnWall(state.world, {
      x: 170,
      y: 60,
      width: 40,
      height: 80,
    })
    state.world.tick = 20
    state.history = [serializeWorld({ world: state.world })]

    const result = processClientShoot({
      state,
      clientId: client.clientId,
      shot: {
        aimX: 320,
        aimY: 100,
        playerId: shooterId,
        seq: 1,
        tick: state.world.tick,
      },
    })

    expect(result?.targetId).toBeNull()
    expect(state.world.health[targetId]).toBe(100)
  })
})
