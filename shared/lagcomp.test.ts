import { describe, expect, test } from 'vitest'

import { checkShotInPast, rewindToTick } from '@shared/lagcomp.ts'
import { serializeWorld } from '@shared/snapshot.ts'
import { createWorld, spawnPlayer } from '@shared/world.ts'

describe('lag compensation', () => {
  test('rewindToTick returns the snapshot from history at that tick', () => {
    const worldAtTick3 = createWorld({})
    spawnPlayer(worldAtTick3, { x: 30, y: 30 })
    worldAtTick3.tick = 3

    const worldAtTick4 = createWorld({})
    spawnPlayer(worldAtTick4, { x: 40, y: 40 })
    worldAtTick4.tick = 4

    const result = rewindToTick({
      history: [
        serializeWorld({ world: worldAtTick3 }),
        serializeWorld({ world: worldAtTick4 }),
      ],
      targetTick: 4,
    })

    expect(result).toEqual(serializeWorld({ world: worldAtTick4 }))
  })

  test('rewindToTick clamps to oldest snapshot if tick is too old', () => {
    const oldestWorld = createWorld({})
    spawnPlayer(oldestWorld, { x: 10, y: 10 })
    oldestWorld.tick = 5

    const latestWorld = createWorld({})
    spawnPlayer(latestWorld, { x: 20, y: 20 })
    latestWorld.tick = 9

    const result = rewindToTick({
      history: [
        serializeWorld({ world: oldestWorld }),
        serializeWorld({ world: latestWorld }),
      ],
      targetTick: 1,
    })

    expect(result).toEqual(serializeWorld({ world: oldestWorld }))
  })

  test('rewindToTick returns current state if tick is in the future', () => {
    const historyWorld = createWorld({})
    spawnPlayer(historyWorld, { x: 10, y: 10 })
    historyWorld.tick = 5

    const currentWorld = createWorld({})
    spawnPlayer(currentWorld, { x: 100, y: 100 })
    currentWorld.tick = 8

    const result = rewindToTick({
      history: [serializeWorld({ world: historyWorld })],
      targetTick: 20,
      currentSnapshot: serializeWorld({ world: currentWorld }),
    })

    expect(result).toEqual(serializeWorld({ world: currentWorld }))
  })

  test('checkShotInPast uses rewound positions and not current', () => {
    const historyWorld = createWorld({})
    const shooterId = spawnPlayer(historyWorld, {
      x: 100,
      y: 100,
      color: '#111111',
    })
    const targetId = spawnPlayer(historyWorld, {
      x: 220,
      y: 100,
      color: '#222222',
    })
    historyWorld.tick = 5

    const currentWorld = createWorld({})
    spawnPlayer(currentWorld, { x: 100, y: 100, color: '#111111' })
    spawnPlayer(currentWorld, { x: 220, y: 220, color: '#222222' })
    currentWorld.tick = 8

    const hitEntityId = checkShotInPast({
      aimX: 320,
      aimY: 100,
      currentSnapshot: serializeWorld({ world: currentWorld }),
      history: [serializeWorld({ world: historyWorld })],
      maxDistance: 300,
      shooterId,
      targetTick: 5,
    })

    expect(hitEntityId).toBe(targetId)
  })
})
