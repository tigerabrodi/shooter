import { describe, expect, test } from 'vitest'

import { createWorld, spawnPlayer, spawnWall } from '@shared/world.ts'

import {
  spawnPredictedBullet,
  stepPredictedBullets,
} from './predictedBullets.ts'

describe('predicted bullets', () => {
  test('spawnPredictedBullet creates a moving bullet from aim direction', () => {
    const bullet = spawnPredictedBullet({
      aimX: 200,
      aimY: 100,
      originX: 100,
      originY: 100,
      ownerId: 1,
      seq: 7,
    })

    expect(bullet).not.toBeNull()
    expect(bullet?.position).toEqual({ x: 100, y: 100 })
    expect(bullet?.velocity.x).toBeGreaterThan(0)
    expect(bullet?.velocity.y).toBe(0)
  })

  test('spawnPredictedBullet returns null for zero length aim', () => {
    expect(
      spawnPredictedBullet({
        aimX: 100,
        aimY: 100,
        originX: 100,
        originY: 100,
        ownerId: 1,
        seq: 7,
      })
    ).toBeNull()
  })

  test('stepPredictedBullets advances bullets when unobstructed', () => {
    const world = createWorld({})
    const bullet = spawnPredictedBullet({
      aimX: 200,
      aimY: 100,
      originX: 100,
      originY: 100,
      ownerId: 1,
      seq: 7,
    })

    const nextBullets = stepPredictedBullets({
      bullets: bullet === null ? [] : [bullet],
      world,
    })

    expect(nextBullets).toHaveLength(1)
    expect(nextBullets[0].position.x).toBeGreaterThan(100)
  })

  test('stepPredictedBullets removes bullets that hit walls', () => {
    const world = createWorld({})
    spawnWall(world, {
      x: 108,
      y: 92,
      width: 24,
      height: 24,
    })
    const bullet = spawnPredictedBullet({
      aimX: 200,
      aimY: 100,
      originX: 100,
      originY: 100,
      ownerId: 1,
      seq: 7,
    })

    const nextBullets = stepPredictedBullets({
      bullets: bullet === null ? [] : [bullet],
      world,
    })

    expect(nextBullets).toEqual([])
  })

  test('stepPredictedBullets removes bullets that hit other players', () => {
    const world = createWorld({})
    spawnPlayer(world, { x: 116, y: 100, color: '#ffffff' })
    const bullet = spawnPredictedBullet({
      aimX: 200,
      aimY: 100,
      originX: 100,
      originY: 100,
      ownerId: 99,
      seq: 7,
    })

    const nextBullets = stepPredictedBullets({
      bullets: bullet === null ? [] : [bullet],
      world,
    })

    expect(nextBullets).toEqual([])
  })
})
