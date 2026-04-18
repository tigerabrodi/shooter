import type {
  CollisionResolution,
  Vector2,
  WallComponent,
  World,
} from '@shared/types.ts'
import { listEntityIds } from '@shared/world.ts'

function pushPointOutOfExpandedRect(
  position: Vector2,
  radius: number,
  wall: WallComponent
): CollisionResolution | null {
  const left = wall.x - radius
  const right = wall.x + wall.width + radius
  const top = wall.y - radius
  const bottom = wall.y + wall.height + radius

  if (
    position.x <= left ||
    position.x >= right ||
    position.y <= top ||
    position.y >= bottom
  ) {
    return null
  }

  const distances = {
    left: position.x - left,
    right: right - position.x,
    top: position.y - top,
    bottom: bottom - position.y,
  }

  const minimumDistance = Math.min(
    distances.left,
    distances.right,
    distances.top,
    distances.bottom
  )

  if (minimumDistance === distances.left) {
    return { x: left, y: position.y, axis: 'x' }
  }

  if (minimumDistance === distances.right) {
    return { x: right, y: position.y, axis: 'x' }
  }

  if (minimumDistance === distances.top) {
    return { x: position.x, y: top, axis: 'y' }
  }

  return { x: position.x, y: bottom, axis: 'y' }
}

function markForDespawn(world: World, entityId: number): void {
  if (!world.pendingDespawn.includes(entityId)) {
    world.pendingDespawn.push(entityId)
  }
}

export function collisionSystem(world: World): void {
  const wallIds = listEntityIds(world.walls)

  for (const playerId of listEntityIds(world.players)) {
    const position = world.positions[playerId]
    const radius = world.radii[playerId]
    const velocity = world.velocities[playerId]

    if (
      position === undefined ||
      radius === undefined ||
      velocity === undefined
    ) {
      continue
    }

    for (let iteration = 0; iteration < wallIds.length; iteration += 1) {
      let isResolvedThisPass = false

      for (const wallId of wallIds) {
        const wall = world.walls[wallId]
        const resolution = pushPointOutOfExpandedRect(position, radius, wall)

        if (resolution === null) {
          continue
        }

        position.x = resolution.x
        position.y = resolution.y
        if (resolution.axis === 'x') {
          velocity.x = 0
        }
        if (resolution.axis === 'y') {
          velocity.y = 0
        }
        isResolvedThisPass = true
      }

      if (!isResolvedThisPass) {
        break
      }
    }
  }

  for (const bulletId of listEntityIds(world.bullets)) {
    const position = world.positions[bulletId]
    const radius = world.radii[bulletId]

    if (position === undefined || radius === undefined) {
      continue
    }

    for (const wallId of wallIds) {
      const wall = world.walls[wallId]
      if (pushPointOutOfExpandedRect(position, radius, wall) !== null) {
        markForDespawn(world, bulletId)
        break
      }
    }
  }
}
