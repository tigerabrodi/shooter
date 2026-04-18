import { describe, expect, test } from 'vitest'

import { DT } from '@shared/constants.ts'
import { movementSystem } from '@shared/systems/movement.ts'
import { createWorld, spawnBullet, spawnPlayer } from '@shared/world.ts'

describe('movementSystem', () => {
  test('entity with position and velocity moves by velocity * dt each tick', () => {
    const world = createWorld()
    const playerId = spawnPlayer(world, { x: 10, y: 20 })

    world.velocities[playerId] = { x: 120, y: -60 }

    movementSystem(world)

    expect(world.positions[playerId].x).toBeCloseTo(10 + 120 * DT)
    expect(world.positions[playerId].y).toBeCloseTo(20 - 60 * DT)
  })

  test('entity with only position does not move', () => {
    const world = createWorld()

    world.positions[99] = { x: 10, y: 20 }

    movementSystem(world)

    expect(world.positions[99]).toEqual({ x: 10, y: 20 })
  })

  test('entity with only velocity does nothing', () => {
    const world = createWorld()

    world.velocities[77] = { x: 90, y: 45 }

    movementSystem(world)

    expect(world.positions[77]).toBeUndefined()
  })

  test('negative velocity moves entity backward', () => {
    const world = createWorld()
    const playerId = spawnPlayer(world, { x: 30, y: 30 })

    world.velocities[playerId] = { x: -90, y: -30 }

    movementSystem(world)

    expect(world.positions[playerId].x).toBeCloseTo(30 - 90 * DT)
    expect(world.positions[playerId].y).toBeCloseTo(30 - 30 * DT)
  })

  test('zero velocity keeps entity stationary', () => {
    const world = createWorld()
    const playerId = spawnPlayer(world, { x: 45, y: 90 })

    movementSystem(world)

    expect(world.positions[playerId]).toEqual({ x: 45, y: 90 })
  })

  test('bullet position updates each tick by velocity * dt', () => {
    const world = createWorld()
    const bulletId = spawnBullet(world, {
      x: 100,
      y: 200,
      velocityX: 300,
      velocityY: -150,
      ownerId: 1,
    })

    movementSystem(world)

    expect(world.positions[bulletId].x).toBeCloseTo(100 + 300 * DT)
    expect(world.positions[bulletId].y).toBeCloseTo(200 - 150 * DT)
  })
})
