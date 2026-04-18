import { describe, expect, test } from 'vitest'

import { PLAYER_MAX_HEALTH, PLAYER_RADIUS } from '@shared/constants.ts'
import { createWorld, destroyEntity, spawnPlayer } from '@shared/world.ts'

describe('world', () => {
  test('createWorld returns an empty world', () => {
    const world = createWorld()

    expect(world.tick).toBe(0)
    expect(world.nextEntityId).toBe(1)
    expect(world.positions).toEqual({})
    expect(world.velocities).toEqual({})
    expect(world.radii).toEqual({})
    expect(world.health).toEqual({})
    expect(world.players).toEqual({})
    expect(world.bullets).toEqual({})
    expect(world.walls).toEqual({})
    expect(world.pendingDespawn).toEqual([])
  })

  test('spawnPlayer adds position, velocity, health, player components', () => {
    const world = createWorld()

    const playerId = spawnPlayer(world, { x: 32, y: 48, color: '#ffffff' })

    expect(world.positions[playerId]).toEqual({ x: 32, y: 48 })
    expect(world.velocities[playerId]).toEqual({ x: 0, y: 0 })
    expect(world.radii[playerId]).toBe(PLAYER_RADIUS)
    expect(world.health[playerId]).toBe(PLAYER_MAX_HEALTH)
    expect(world.players[playerId]).toMatchObject({
      color: '#ffffff',
      fireCooldownTicks: 0,
      needsRespawn: false,
    })
  })

  test('spawnPlayer assigns unique entity IDs', () => {
    const world = createWorld()

    const firstId = spawnPlayer(world)
    const secondId = spawnPlayer(world)

    expect(firstId).not.toBe(secondId)
    expect(firstId).toBe(1)
    expect(secondId).toBe(2)
  })

  test('destroyEntity removes all components for that entity', () => {
    const world = createWorld()
    const playerId = spawnPlayer(world)

    destroyEntity(world, playerId)

    expect(world.positions[playerId]).toBeUndefined()
    expect(world.velocities[playerId]).toBeUndefined()
    expect(world.radii[playerId]).toBeUndefined()
    expect(world.health[playerId]).toBeUndefined()
    expect(world.players[playerId]).toBeUndefined()
  })

  test('destroyEntity on non-existent entity does nothing', () => {
    const world = createWorld()
    const snapshot = structuredClone(world)

    destroyEntity(world, 999)

    expect(world).toEqual(snapshot)
  })
})
