import { describe, expect, test } from 'vitest'

import { PLAYER_MAX_HEALTH, SPAWN_POINTS } from '@shared/constants.ts'
import { despawnSystem } from '@shared/systems/despawn.ts'
import { createWorld, spawnBullet, spawnPlayer } from '@shared/world.ts'

describe('despawnSystem', () => {
  test('despawnSystem destroys marked bullets', () => {
    const world = createWorld()
    const bulletId = spawnBullet(world, {
      x: 40,
      y: 50,
      velocityX: 0,
      velocityY: 0,
      ownerId: 1,
    })

    world.pendingDespawn.push(bulletId)

    despawnSystem(world)

    expect(world.positions[bulletId]).toBeUndefined()
    expect(world.velocities[bulletId]).toBeUndefined()
    expect(world.bullets[bulletId]).toBeUndefined()
  })

  test('despawnSystem respawns marked player with full health', () => {
    const world = createWorld()
    const playerId = spawnPlayer(world, { x: 20, y: 30 })

    world.health[playerId] = 0
    world.players[playerId].needsRespawn = true
    world.velocities[playerId] = { x: 25, y: -15 }

    despawnSystem(world)

    expect(world.health[playerId]).toBe(PLAYER_MAX_HEALTH)
    expect(world.players[playerId].needsRespawn).toBe(false)
    expect(world.velocities[playerId]).toEqual({ x: 0, y: 0 })
    expect(SPAWN_POINTS).toContainEqual(world.positions[playerId])
  })
})
