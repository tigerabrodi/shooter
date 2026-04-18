import { describe, expect, test } from 'vitest'

import { createWorld, spawnPlayer } from '@shared/world.ts'
import { serializeWorld } from '@shared/snapshot.ts'

import {
  computeRemoteInterpolatedPositions,
  type TimedSnapshot,
} from './remoteInterpolation.ts'

function createTimedSnapshot({
  receivedAt,
  x,
}: {
  receivedAt: number
  x: number
}): TimedSnapshot {
  const world = createWorld({})
  spawnPlayer(world, { x, y: 200, color: '#ffffff' })

  return {
    receivedAt,
    snapshot: serializeWorld({ world }),
  }
}

describe('remote interpolation', () => {
  test('returns empty positions when there are no snapshots', () => {
    expect(
      computeRemoteInterpolatedPositions({
        targetTime: 100,
        timeline: [],
      })
    ).toEqual({})
  })

  test('returns the first snapshot when target time is before the buffer', () => {
    const timeline = [
      createTimedSnapshot({ receivedAt: 100, x: 120 }),
      createTimedSnapshot({ receivedAt: 116, x: 180 }),
    ]

    expect(
      computeRemoteInterpolatedPositions({
        targetTime: 90,
        timeline,
      })
    ).toEqual({
      1: { x: 120, y: 200 },
    })
  })

  test('interpolates between the surrounding snapshots', () => {
    const timeline = [
      createTimedSnapshot({ receivedAt: 100, x: 120 }),
      createTimedSnapshot({ receivedAt: 116, x: 200 }),
    ]

    expect(
      computeRemoteInterpolatedPositions({
        targetTime: 108,
        timeline,
      })
    ).toEqual({
      1: { x: 160, y: 200 },
    })
  })

  test('holds the latest snapshot when target time moves past the buffer', () => {
    const timeline = [
      createTimedSnapshot({ receivedAt: 100, x: 120 }),
      createTimedSnapshot({ receivedAt: 116, x: 180 }),
      createTimedSnapshot({ receivedAt: 132, x: 180 }),
    ]

    expect(
      computeRemoteInterpolatedPositions({
        targetTime: 160,
        timeline,
      })
    ).toEqual({
      1: { x: 180, y: 200 },
    })
  })
})
