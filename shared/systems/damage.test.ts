import { describe, expect, test } from 'vitest'

import { BULLET_DAMAGE, PLAYER_MAX_HEALTH } from '@shared/constants.ts'
import { damageSystem } from '@shared/systems/damage.ts'
import { createWorld, spawnBullet, spawnPlayer } from '@shared/world.ts'

describe('damageSystem', () => {
  test('bullet overlapping a player reduces player health', () => {
    const world = createWorld()
    const shooterId = spawnPlayer(world, { x: 40, y: 40 })
    const targetId = spawnPlayer(world, { x: 120, y: 120 })

    spawnBullet(world, {
      x: 120,
      y: 120,
      velocityX: 0,
      velocityY: 0,
      ownerId: shooterId,
    })

    damageSystem(world)

    expect(world.health[targetId]).toBe(PLAYER_MAX_HEALTH - BULLET_DAMAGE)
  })

  test('bullet is marked for despawn after hitting a player', () => {
    const world = createWorld()
    const shooterId = spawnPlayer(world, { x: 0, y: 0 })
    const targetId = spawnPlayer(world, { x: 100, y: 100 })

    const bulletId = spawnBullet(world, {
      x: 100,
      y: 100,
      velocityX: 0,
      velocityY: 0,
      ownerId: shooterId,
    })

    damageSystem(world)

    expect(world.health[targetId]).toBeLessThan(PLAYER_MAX_HEALTH)
    expect(world.pendingDespawn).toContain(bulletId)
  })

  test('bullet does not damage its own owner', () => {
    const world = createWorld()
    const shooterId = spawnPlayer(world, { x: 100, y: 100 })

    spawnBullet(world, {
      x: 100,
      y: 100,
      velocityX: 0,
      velocityY: 0,
      ownerId: shooterId,
    })

    damageSystem(world)

    expect(world.health[shooterId]).toBe(PLAYER_MAX_HEALTH)
  })

  test('player health does not go below zero', () => {
    const world = createWorld()
    const shooterId = spawnPlayer(world, { x: 0, y: 0 })
    const targetId = spawnPlayer(world, { x: 100, y: 100 })

    world.health[targetId] = 10

    spawnBullet(world, {
      x: 100,
      y: 100,
      velocityX: 0,
      velocityY: 0,
      ownerId: shooterId,
    })

    damageSystem(world)

    expect(world.health[targetId]).toBe(0)
  })

  test('player with 0 health is marked for respawn', () => {
    const world = createWorld()
    const shooterId = spawnPlayer(world, { x: 0, y: 0 })
    const targetId = spawnPlayer(world, { x: 100, y: 100 })

    world.health[targetId] = BULLET_DAMAGE

    spawnBullet(world, {
      x: 100,
      y: 100,
      velocityX: 0,
      velocityY: 0,
      ownerId: shooterId,
    })

    damageSystem(world)

    expect(world.players[targetId].needsRespawn).toBe(true)
  })
})
