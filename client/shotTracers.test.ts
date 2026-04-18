import { createWorld, spawnPlayer, spawnWall } from '@shared/world.ts'

import { describe, expect, test } from 'vitest'

import {
  createShotTracer,
  createShotTracerFromWorld,
  hasShotTracer,
  stepShotTracers,
} from './shotTracers.ts'

describe('shot tracers', () => {
  test('createShotTracer builds a tracer with default ttl', () => {
    const tracer = createShotTracer({
      endX: 220,
      endY: 140,
      key: '12:7',
      startX: 100,
      startY: 100,
    })

    expect(tracer).toEqual({
      end: { x: 220, y: 140 },
      key: '12:7',
      remainingTicks: 5,
      start: { x: 100, y: 100 },
      ttlTicks: 5,
    })
  })

  test('hasShotTracer checks for a tracer by key', () => {
    const tracers = [
      createShotTracer({
        endX: 220,
        endY: 140,
        key: '12:7',
        startX: 100,
        startY: 100,
      }),
    ]

    expect(hasShotTracer({ key: '12:7', tracers })).toBe(true)
    expect(hasShotTracer({ key: '12:8', tracers })).toBe(false)
  })

  test('createShotTracerFromWorld stops at the first player hit', () => {
    const world = createWorld({})
    const shooterId = spawnPlayer(world, { x: 100, y: 100 })
    spawnPlayer(world, { x: 220, y: 100 })

    const tracer = createShotTracerFromWorld({
      aimX: 320,
      aimY: 100,
      key: '12:7',
      shooterId,
      world,
    })

    expect(tracer).toMatchObject({
      key: '12:7',
      start: { x: 100, y: 100 },
    })
    expect(tracer?.end.x).toBeCloseTo(204)
    expect(tracer?.end.y).toBeCloseTo(100)
  })

  test('createShotTracerFromWorld stops at the first wall hit', () => {
    const world = createWorld({})
    const shooterId = spawnPlayer(world, { x: 100, y: 100 })

    spawnWall(world, {
      x: 170,
      y: 60,
      width: 40,
      height: 80,
    })

    const tracer = createShotTracerFromWorld({
      aimX: 320,
      aimY: 100,
      key: '12:7',
      shooterId,
      world,
    })

    expect(tracer).toMatchObject({
      key: '12:7',
      start: { x: 100, y: 100 },
    })
    expect(tracer?.end.x).toBeCloseTo(170)
    expect(tracer?.end.y).toBeCloseTo(100)
  })

  test('stepShotTracers decrements ttl and removes expired tracers', () => {
    const tracers = [
      createShotTracer({
        endX: 220,
        endY: 140,
        key: '12:7',
        startX: 100,
        startY: 100,
        ttlTicks: 2,
      }),
    ]

    const afterFirstStep = stepShotTracers({ tracers })
    expect(afterFirstStep).toEqual([
      {
        end: { x: 220, y: 140 },
        key: '12:7',
        remainingTicks: 1,
        start: { x: 100, y: 100 },
        ttlTicks: 2,
      },
    ])

    expect(stepShotTracers({ tracers: afterFirstStep })).toEqual([])
  })
})
