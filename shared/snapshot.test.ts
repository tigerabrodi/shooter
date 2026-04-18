import { describe, expect, test } from 'vitest'

import { serializeWorld, deserializeWorld } from '@shared/snapshot.ts'
import {
  createWorld,
  spawnBullet,
  spawnPlayer,
  spawnWall,
} from '@shared/world.ts'

describe('snapshot', () => {
  test('serialize world returns a plain object', () => {
    const world = createWorld({})
    spawnPlayer(world, { x: 10, y: 20, color: '#ffffff' })

    const snapshot = serializeWorld({ world })

    expect(snapshot).not.toBe(world)
    expect(Array.isArray(snapshot.pendingDespawn)).toBe(true)
    expect(Object.getPrototypeOf(snapshot)).toBe(Object.prototype)
  })

  test('deserialize reverses serialize round trip', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world, { x: 10, y: 20, color: '#ffffff' })
    spawnWall(world, { x: 100, y: 120, width: 40, height: 80 })
    spawnBullet(world, {
      x: 10,
      y: 20,
      velocityX: 100,
      velocityY: 0,
      ownerId: playerId,
    })
    world.tick = 42
    world.pendingDespawn.push(999)

    const roundTrippedWorld = deserializeWorld({
      snapshot: serializeWorld({ world }),
    })

    expect(roundTrippedWorld).toEqual(world)
    expect(roundTrippedWorld).not.toBe(world)
  })

  test('snapshot includes tick number', () => {
    const world = createWorld({})
    world.tick = 19

    const snapshot = serializeWorld({ world })

    expect(snapshot.tick).toBe(19)
  })

  test('snapshot includes all relevant components', () => {
    const world = createWorld({})
    const playerId = spawnPlayer(world, { x: 15, y: 25, color: '#123456' })
    const wallId = spawnWall(world, { x: 40, y: 50, width: 60, height: 70 })
    const bulletId = spawnBullet(world, {
      x: 15,
      y: 25,
      velocityX: 140,
      velocityY: -20,
      ownerId: playerId,
    })

    const snapshot = serializeWorld({ world })

    expect(snapshot.positions[playerId]).toEqual({ x: 15, y: 25 })
    expect(snapshot.players[playerId]?.color).toBe('#123456')
    expect(snapshot.walls[wallId]).toEqual({
      x: 40,
      y: 50,
      width: 60,
      height: 70,
    })
    expect(snapshot.bullets[bulletId]?.ownerId).toBe(playerId)
    expect(snapshot.velocities[bulletId]).toEqual({ x: 140, y: -20 })
  })
})
