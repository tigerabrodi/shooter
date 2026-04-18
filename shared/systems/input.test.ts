import { describe, expect, test } from 'vitest'

import {
  BULLET_SPEED,
  FIRE_COOLDOWN_TICKS,
  PLAYER_SPEED,
} from '@shared/constants.ts'
import { applyInputsSystem } from '@shared/systems/input.ts'
import { createWorld, spawnPlayer } from '@shared/world.ts'

function makeInput(
  playerId: number,
  overrides: Partial<{
    up: boolean
    down: boolean
    left: boolean
    right: boolean
    fire: boolean
    aimX: number
    aimY: number
    seq: number
  }> = {}
) {
  return {
    playerId,
    seq: overrides.seq ?? 1,
    up: overrides.up ?? false,
    down: overrides.down ?? false,
    left: overrides.left ?? false,
    right: overrides.right ?? false,
    fire: overrides.fire ?? false,
    aimX: overrides.aimX ?? 0,
    aimY: overrides.aimY ?? 0,
  }
}

describe('applyInputsSystem', () => {
  test('WASD input sets velocity toward that direction', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world, { x: 100, y: 100 })

    applyInputsSystem(world, [makeInput(playerId, { up: true })])

    expect(world.velocities[playerId]).toEqual({ x: 0, y: -PLAYER_SPEED })
  })

  test('no input sets velocity to zero', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world)

    world.velocities[playerId] = { x: 25, y: -10 }

    applyInputsSystem(world, [])

    expect(world.velocities[playerId]).toEqual({ x: 0, y: 0 })
  })

  test('opposing inputs cancel (W+S = no vertical movement)', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world)

    applyInputsSystem(world, [makeInput(playerId, { up: true, down: true })])

    expect(world.velocities[playerId]).toEqual({ x: 0, y: 0 })
  })

  test('diagonal input is normalized (W+D does not move faster than W alone)', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world)

    applyInputsSystem(world, [makeInput(playerId, { up: true, right: true })])

    expect(
      Math.hypot(world.velocities[playerId].x, world.velocities[playerId].y)
    ).toBeCloseTo(PLAYER_SPEED)
    expect(world.velocities[playerId].x).toBeCloseTo(
      PLAYER_SPEED / Math.sqrt(2)
    )
    expect(world.velocities[playerId].y).toBeCloseTo(
      -PLAYER_SPEED / Math.sqrt(2)
    )
  })

  test('fire input spawns a bullet at player position with velocity in aim direction', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world, { x: 50, y: 75 })

    applyInputsSystem(world, [
      makeInput(playerId, { fire: true, aimX: 150, aimY: 75 }),
    ])

    const bulletIds = Object.keys(world.bullets).map(Number)
    expect(bulletIds).toHaveLength(1)

    const bulletId = bulletIds[0]
    expect(world.positions[bulletId]).toEqual({ x: 50, y: 75 })
    expect(world.velocities[bulletId].x).toBeCloseTo(BULLET_SPEED)
    expect(world.velocities[bulletId].y).toBeCloseTo(0)
    expect(world.players[playerId].fireCooldownTicks).toBe(FIRE_COOLDOWN_TICKS)
  })

  test('fire input on cooldown does not spawn a bullet', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world)

    world.players[playerId].fireCooldownTicks = FIRE_COOLDOWN_TICKS

    applyInputsSystem(world, [
      makeInput(playerId, { fire: true, aimX: 200, aimY: 200 }),
    ])

    expect(Object.keys(world.bullets)).toHaveLength(0)
  })
})
