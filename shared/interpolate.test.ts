import { describe, expect, test } from 'vitest'

import { interpolateSnapshots } from '@shared/interpolate.ts'
import { serializeWorld } from '@shared/snapshot.ts'
import { createWorld, spawnPlayer } from '@shared/world.ts'

describe('interpolateSnapshots', () => {
  test('interpolate at alpha equals 0 returns positions from earlier snapshot', () => {
    const earlier = createWorld({})
    const later = createWorld({})
    const earlierPlayerId = spawnPlayer(earlier, { x: 10, y: 20 })
    const laterPlayerId = spawnPlayer(later, { x: 30, y: 40 })

    const positions = interpolateSnapshots({
      earlierSnapshot: serializeWorld({ world: earlier }),
      laterSnapshot: serializeWorld({ world: later }),
      alpha: 0,
    })

    expect(positions[earlierPlayerId]).toEqual({ x: 10, y: 20 })
    expect(positions[laterPlayerId]).toEqual({ x: 10, y: 20 })
  })

  test('interpolate at alpha equals 1 returns positions from later snapshot', () => {
    const earlier = createWorld({})
    const later = createWorld({})
    const earlierPlayerId = spawnPlayer(earlier, { x: 10, y: 20 })
    const laterPlayerId = spawnPlayer(later, { x: 30, y: 40 })

    const positions = interpolateSnapshots({
      earlierSnapshot: serializeWorld({ world: earlier }),
      laterSnapshot: serializeWorld({ world: later }),
      alpha: 1,
    })

    expect(positions[earlierPlayerId]).toEqual({ x: 30, y: 40 })
    expect(positions[laterPlayerId]).toEqual({ x: 30, y: 40 })
  })

  test('interpolate at alpha equals 0.5 returns halfway between', () => {
    const earlier = createWorld({})
    const later = createWorld({})
    const earlierPlayerId = spawnPlayer(earlier, { x: 0, y: 20 })
    spawnPlayer(later, { x: 40, y: 60 })

    const positions = interpolateSnapshots({
      earlierSnapshot: serializeWorld({ world: earlier }),
      laterSnapshot: serializeWorld({ world: later }),
      alpha: 0.5,
    })

    expect(positions[earlierPlayerId]).toEqual({ x: 20, y: 40 })
  })

  test('interpolate handles entity that exists in earlier but not later', () => {
    const earlier = createWorld({})
    const later = createWorld({})
    const playerId = spawnPlayer(earlier, { x: 50, y: 70 })

    const positions = interpolateSnapshots({
      earlierSnapshot: serializeWorld({ world: earlier }),
      laterSnapshot: serializeWorld({ world: later }),
      alpha: 0.5,
    })

    expect(positions[playerId]).toEqual({ x: 50, y: 70 })
  })

  test('interpolate handles entity that exists in later but not earlier', () => {
    const earlier = createWorld({})
    const later = createWorld({})
    const playerId = spawnPlayer(later, { x: 80, y: 90 })

    const positions = interpolateSnapshots({
      earlierSnapshot: serializeWorld({ world: earlier }),
      laterSnapshot: serializeWorld({ world: later }),
      alpha: 0.5,
    })

    expect(positions[playerId]).toEqual({ x: 80, y: 90 })
  })

  test('interpolate linear between two positions is exact', () => {
    const earlier = createWorld({})
    const later = createWorld({})
    const earlierPlayerId = spawnPlayer(earlier, { x: 5, y: 15 })
    spawnPlayer(later, { x: 17, y: 39 })

    const positions = interpolateSnapshots({
      earlierSnapshot: serializeWorld({ world: earlier }),
      laterSnapshot: serializeWorld({ world: later }),
      alpha: 0.25,
    })

    expect(positions[earlierPlayerId]).toEqual({ x: 8, y: 21 })
  })
})
