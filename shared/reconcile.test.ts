import { describe, expect, test } from 'vitest'

import { reconcile } from '@shared/reconcile.ts'
import { serializeWorld } from '@shared/snapshot.ts'
import { step } from '@shared/step.ts'
import type { PlayerInput } from '@shared/types.ts'
import { createWorld, spawnPlayer } from '@shared/world.ts'

function makeInput(
  playerId: number,
  seq: number,
  overrides: Partial<Omit<PlayerInput, 'playerId' | 'seq'>> = {}
): PlayerInput {
  return {
    playerId,
    seq,
    up: overrides.up ?? false,
    down: overrides.down ?? false,
    left: overrides.left ?? false,
    right: overrides.right ?? false,
    sprint: overrides.sprint ?? false,
    fire: overrides.fire ?? false,
    aimX: overrides.aimX ?? 0,
    aimY: overrides.aimY ?? 0,
  }
}

describe('reconcile', () => {
  test('reconcile with empty buffer and matching server state keeps state unchanged', () => {
    const world = createWorld({})
    spawnPlayer(world, { x: 100, y: 100 })

    const result = reconcile({
      serverSnapshot: serializeWorld({ world }),
      ackedSeq: 0,
      pendingInputs: [],
    })

    expect(result.world).toEqual(world)
    expect(result.remainingInputs).toEqual([])
  })

  test('reconcile with buffer of 1 unacked input replays that input on top of server state', () => {
    const serverWorld = createWorld({})
    const playerId = spawnPlayer(serverWorld, { x: 100, y: 100 })
    const pendingInput = makeInput(playerId, 1, { right: true })

    const expectedWorld = createWorld({})
    const expectedPlayerId = spawnPlayer(expectedWorld, { x: 100, y: 100 })
    step(expectedWorld, [{ ...pendingInput, playerId: expectedPlayerId }])

    const result = reconcile({
      serverSnapshot: serializeWorld({ world: serverWorld }),
      ackedSeq: 0,
      pendingInputs: [pendingInput],
    })

    expect(result.world).toEqual(expectedWorld)
    expect(result.remainingInputs).toEqual([pendingInput])
  })

  test('reconcile with buffer of many inputs replays them in sequence order', () => {
    const serverWorld = createWorld({})
    const playerId = spawnPlayer(serverWorld, { x: 100, y: 100 })
    const pendingInputs = [
      makeInput(playerId, 3, { down: true }),
      makeInput(playerId, 1, { right: true }),
      makeInput(playerId, 2, { up: true, right: true }),
    ]

    const expectedWorld = createWorld({})
    const expectedPlayerId = spawnPlayer(expectedWorld, { x: 100, y: 100 })
    step(expectedWorld, [{ ...pendingInputs[1], playerId: expectedPlayerId }])
    step(expectedWorld, [{ ...pendingInputs[2], playerId: expectedPlayerId }])
    step(expectedWorld, [{ ...pendingInputs[0], playerId: expectedPlayerId }])

    const result = reconcile({
      serverSnapshot: serializeWorld({ world: serverWorld }),
      ackedSeq: 0,
      pendingInputs,
    })

    expect(result.world).toEqual(expectedWorld)
    expect(result.remainingInputs).toEqual([
      pendingInputs[1],
      pendingInputs[2],
      pendingInputs[0],
    ])
  })

  test('reconcile drops acked inputs from buffer', () => {
    const serverWorld = createWorld({})
    const playerId = spawnPlayer(serverWorld, { x: 100, y: 100 })
    const pendingInputs = [
      makeInput(playerId, 1, { right: true }),
      makeInput(playerId, 2, { right: true }),
      makeInput(playerId, 3, { down: true }),
    ]

    const result = reconcile({
      serverSnapshot: serializeWorld({ world: serverWorld }),
      ackedSeq: 2,
      pendingInputs,
    })

    expect(result.remainingInputs).toEqual([pendingInputs[2]])
  })

  test('reconcile handles case where server seq is ahead of all buffered inputs', () => {
    const serverWorld = createWorld({})
    const playerId = spawnPlayer(serverWorld, { x: 100, y: 100 })
    step(serverWorld, [makeInput(playerId, 10, { right: true })])

    const result = reconcile({
      serverSnapshot: serializeWorld({ world: serverWorld }),
      ackedSeq: 10,
      pendingInputs: [
        makeInput(playerId, 7, { right: true }),
        makeInput(playerId, 9, { down: true }),
      ],
    })

    expect(result.world).toEqual(serverWorld)
    expect(result.remainingInputs).toEqual([])
  })

  test('reconcile with mismatched prediction snaps to server state then replays', () => {
    const playerId = 1
    const serverWorld = createWorld({})
    spawnPlayer(serverWorld, { x: 100, y: 100, color: '#ffffff' })
    step(serverWorld, [makeInput(playerId, 1, { right: true })])

    const pendingInputs = [makeInput(playerId, 2, { down: true })]

    const expectedWorld = createWorld({})
    spawnPlayer(expectedWorld, { x: 100, y: 100, color: '#ffffff' })
    step(expectedWorld, [makeInput(playerId, 1, { right: true })])
    step(expectedWorld, pendingInputs)

    const clientPredictedWorld = createWorld({})
    spawnPlayer(clientPredictedWorld, { x: 400, y: 400, color: '#ffffff' })
    step(clientPredictedWorld, [makeInput(playerId, 99, { left: true })])

    expect(clientPredictedWorld).not.toEqual(expectedWorld)

    const result = reconcile({
      serverSnapshot: serializeWorld({ world: serverWorld }),
      ackedSeq: 1,
      pendingInputs,
    })

    expect(result.world).toEqual(expectedWorld)
    expect(result.remainingInputs).toEqual(pendingInputs)
  })
})
