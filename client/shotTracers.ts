import { MAX_SHOT_DISTANCE } from '@shared/constants.ts'
import { traceShotInPast } from '@shared/lagcomp.ts'
import { serializeWorld } from '@shared/snapshot.ts'
import type { EntityId, Vector2, World } from '@shared/types.ts'

export interface ShotTracer {
  end: Vector2
  key: string
  remainingTicks: number
  start: Vector2
  ttlTicks: number
}

export interface CreateShotTracerOptions {
  endX: number
  endY: number
  key: string
  startX: number
  startY: number
  ttlTicks?: number
}

export interface StepShotTracersOptions {
  tracers: Array<ShotTracer>
}

export interface CreateShotTracerFromWorldOptions {
  aimX: number
  aimY: number
  key: string
  shooterId: EntityId
  world: World
}

const DEFAULT_TRACER_TTL_TICKS = 5

export function createShotTracer({
  endX,
  endY,
  key,
  startX,
  startY,
  ttlTicks = DEFAULT_TRACER_TTL_TICKS,
}: CreateShotTracerOptions): ShotTracer {
  return {
    end: { x: endX, y: endY },
    key,
    remainingTicks: ttlTicks,
    start: { x: startX, y: startY },
    ttlTicks,
  }
}

export function hasShotTracer({
  key,
  tracers,
}: {
  key: string
  tracers: Array<ShotTracer>
}): boolean {
  return tracers.some((tracer) => tracer.key === key)
}

export function createShotTracerFromWorld({
  aimX,
  aimY,
  key,
  shooterId,
  world,
}: CreateShotTracerFromWorldOptions): ShotTracer | null {
  const shooterPosition = world.positions[shooterId]
  if (shooterPosition === undefined) {
    return null
  }

  const dx = aimX - shooterPosition.x
  const dy = aimY - shooterPosition.y
  const length = Math.hypot(dx, dy)

  if (length === 0) {
    return null
  }

  const traceResult = traceShotInPast({
    aimX,
    aimY,
    currentSnapshot: serializeWorld({ world }),
    history: [],
    maxDistance: MAX_SHOT_DISTANCE,
    shooterId,
    targetTick: world.tick,
  })

  if (traceResult === null) {
    return null
  }

  const directionX = dx / length
  const directionY = dy / length

  return createShotTracer({
    endX: shooterPosition.x + directionX * traceResult.hitDistance,
    endY: shooterPosition.y + directionY * traceResult.hitDistance,
    key,
    startX: shooterPosition.x,
    startY: shooterPosition.y,
  })
}

export function stepShotTracers({
  tracers,
}: StepShotTracersOptions): Array<ShotTracer> {
  const nextTracers: Array<ShotTracer> = []

  for (const tracer of tracers) {
    const remainingTicks = tracer.remainingTicks - 1
    if (remainingTicks <= 0) {
      continue
    }

    nextTracers.push({
      ...tracer,
      remainingTicks,
    })
  }

  return nextTracers
}
