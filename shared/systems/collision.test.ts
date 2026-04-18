import { describe, expect, test } from 'vitest'

import { PLAYER_RADIUS } from '@shared/constants.ts'
import { collisionSystem } from '@shared/systems/collision.ts'
import { movementSystem } from '@shared/systems/movement.ts'
import {
  createWorld,
  spawnBullet,
  spawnPlayer,
  spawnWall,
} from '@shared/world.ts'

describe('collisionSystem', () => {
  test('circle does not overlap with a wall it is not touching', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world, { x: 40, y: 40 })

    spawnWall(world, { x: 100, y: 100, width: 80, height: 40 })

    collisionSystem(world)

    expect(world.positions[playerId]).toEqual({ x: 40, y: 40 })
  })

  test('circle overlapping wall gets pushed to the boundary', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world, { x: 90, y: 120 })

    spawnWall(world, { x: 100, y: 100, width: 80, height: 40 })

    collisionSystem(world)

    expect(world.positions[playerId]).toEqual({
      x: 100 - PLAYER_RADIUS,
      y: 120,
    })
  })

  test('circle moving into a wall stops at the boundary', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world, { x: 83, y: 120 })

    spawnWall(world, { x: 100, y: 100, width: 80, height: 40 })
    world.velocities[playerId] = { x: 120, y: 0 }

    movementSystem(world)
    collisionSystem(world)

    expect(world.positions[playerId]).toEqual({
      x: 100 - PLAYER_RADIUS,
      y: 120,
    })
    expect(world.velocities[playerId]).toEqual({ x: 0, y: 0 })
  })

  test('circle between two walls does not get stuck', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world, { x: 150, y: 120 })

    spawnWall(world, { x: 100, y: 60, width: 20, height: 220 })
    spawnWall(world, { x: 180, y: 60, width: 20, height: 220 })
    world.velocities[playerId] = { x: 0, y: 180 }

    movementSystem(world)
    collisionSystem(world)

    expect(world.positions[playerId].x).toBeCloseTo(150)
    expect(world.positions[playerId].y).toBeGreaterThan(120)
  })

  test('bullet overlapping a wall is marked for despawn', () => {
    const world = createWorld({})
    const bulletId = spawnBullet(world, {
      x: 120,
      y: 120,
      velocityX: 0,
      velocityY: 0,
      ownerId: 1,
    })

    spawnWall(world, { x: 100, y: 100, width: 80, height: 40 })

    collisionSystem(world)

    expect(world.pendingDespawn).toContain(bulletId)
  })
})
