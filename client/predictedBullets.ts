import {
  BULLET_RADIUS,
  BULLET_SPEED,
  DT,
  MAP_HEIGHT,
  MAP_WIDTH,
} from '@shared/constants.ts'
import type { Vector2, World } from '@shared/types.ts'

export interface PredictedBullet {
  ownerId: number
  position: Vector2
  radius: number
  seq: number
  velocity: Vector2
}

export interface SpawnPredictedBulletOptions {
  aimX: number
  aimY: number
  originX: number
  originY: number
  ownerId: number
  seq: number
}

export interface StepPredictedBulletsOptions {
  bullets: Array<PredictedBullet>
  world: World
}

function normalizeAim({
  originX,
  originY,
  aimX,
  aimY,
}: {
  originX: number
  originY: number
  aimX: number
  aimY: number
}): Vector2 | null {
  const dx = aimX - originX
  const dy = aimY - originY
  const length = Math.hypot(dx, dy)

  if (length === 0) {
    return null
  }

  return {
    x: dx / length,
    y: dy / length,
  }
}

function overlapsRect({
  bullet,
  wall,
}: {
  bullet: PredictedBullet
  wall: World['walls'][number]
}): boolean {
  const closestX = Math.max(
    wall.x,
    Math.min(bullet.position.x, wall.x + wall.width)
  )
  const closestY = Math.max(
    wall.y,
    Math.min(bullet.position.y, wall.y + wall.height)
  )
  const dx = bullet.position.x - closestX
  const dy = bullet.position.y - closestY

  return dx * dx + dy * dy <= bullet.radius * bullet.radius
}

function overlapsOtherPlayer({
  bullet,
  world,
}: {
  bullet: PredictedBullet
  world: World
}): boolean {
  for (const playerIdText of Object.keys(world.players)) {
    const playerId = Number(playerIdText)
    if (playerId === bullet.ownerId) {
      continue
    }

    const playerPosition = world.positions[playerId]
    const playerRadius = world.radii[playerId]
    if (playerPosition === undefined || playerRadius === undefined) {
      continue
    }

    const dx = bullet.position.x - playerPosition.x
    const dy = bullet.position.y - playerPosition.y
    const radiusSum = bullet.radius + playerRadius

    if (dx * dx + dy * dy <= radiusSum * radiusSum) {
      return true
    }
  }

  return false
}

function isOutOfBounds(bullet: PredictedBullet): boolean {
  return (
    bullet.position.x < -bullet.radius ||
    bullet.position.x > MAP_WIDTH + bullet.radius ||
    bullet.position.y < -bullet.radius ||
    bullet.position.y > MAP_HEIGHT + bullet.radius
  )
}

export function spawnPredictedBullet({
  aimX,
  aimY,
  originX,
  originY,
  ownerId,
  seq,
}: SpawnPredictedBulletOptions): PredictedBullet | null {
  const aimDirection = normalizeAim({
    originX,
    originY,
    aimX,
    aimY,
  })
  if (aimDirection === null) {
    return null
  }

  return {
    ownerId,
    position: { x: originX, y: originY },
    radius: BULLET_RADIUS,
    seq,
    velocity: {
      x: aimDirection.x * BULLET_SPEED,
      y: aimDirection.y * BULLET_SPEED,
    },
  }
}

export function stepPredictedBullets({
  bullets,
  world,
}: StepPredictedBulletsOptions): Array<PredictedBullet> {
  const nextBullets: Array<PredictedBullet> = []

  for (const bullet of bullets) {
    const nextBullet: PredictedBullet = {
      ...bullet,
      position: {
        x: bullet.position.x + bullet.velocity.x * DT,
        y: bullet.position.y + bullet.velocity.y * DT,
      },
    }

    if (isOutOfBounds(nextBullet)) {
      continue
    }

    if (
      Object.values(world.walls).some((wall) =>
        overlapsRect({
          bullet: nextBullet,
          wall,
        })
      )
    ) {
      continue
    }

    if (
      overlapsOtherPlayer({
        bullet: nextBullet,
        world,
      })
    ) {
      continue
    }

    nextBullets.push(nextBullet)
  }

  return nextBullets
}
