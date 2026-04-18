import { describe, expect, test } from 'vitest'

import { step } from '@shared/step.ts'
import { createWorld, spawnPlayer, spawnWall } from '@shared/world.ts'

describe('step', () => {
  test('step increments world.tick by 1', () => {
    const world = createWorld({})

    step(world)

    expect(world.tick).toBe(1)
  })

  test('step with no entities does nothing', () => {
    const world = createWorld({})

    step(world)

    expect(world.tick).toBe(1)
    expect(world.positions).toEqual({})
    expect(world.velocities).toEqual({})
    expect(world.pendingDespawn).toEqual([])
  })

  test('step is deterministic: same state + same inputs = same output', () => {
    const firstWorld = createWorld({})
    const secondWorld = createWorld({})

    const firstPlayerId = spawnPlayer(firstWorld, { x: 120, y: 120 })
    const secondPlayerId = spawnPlayer(secondWorld, { x: 120, y: 120 })

    spawnWall(firstWorld, { x: 220, y: 80, width: 40, height: 160 })
    spawnWall(secondWorld, { x: 220, y: 80, width: 40, height: 160 })

    for (let tick = 0; tick < 100; tick += 1) {
      const input = {
        playerId: firstPlayerId,
        seq: tick,
        up: tick % 3 === 0,
        down: false,
        left: tick % 5 === 0,
        right: tick % 2 === 0,
        fire: tick % 9 === 0,
        aimX: 400,
        aimY: 300,
      }

      step(firstWorld, [input])
      step(secondWorld, [{ ...input, playerId: secondPlayerId }])
    }

    expect(firstWorld).toEqual(secondWorld)
  })
})
