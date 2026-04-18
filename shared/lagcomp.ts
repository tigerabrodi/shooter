import type {
  EntityId,
  LagCompShotOptions,
  RewindToTickOptions,
  Snapshot,
  Vector2,
} from '@shared/types.ts'

function cloneSnapshot(snapshot: Snapshot): Snapshot {
  return structuredClone(snapshot)
}

function normalize(vector: Vector2): Vector2 {
  const length = Math.hypot(vector.x, vector.y)
  if (length === 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: vector.x / length,
    y: vector.y / length,
  }
}

function dotProduct(first: Vector2, second: Vector2): number {
  return first.x * second.x + first.y * second.y
}

function rayCircleHitDistance(
  origin: Vector2,
  direction: Vector2,
  maxDistance: number,
  center: Vector2,
  radius: number
): number | null {
  const toCircle = {
    x: center.x - origin.x,
    y: center.y - origin.y,
  }
  const projection = dotProduct(toCircle, direction)

  if (projection < 0 || projection > maxDistance) {
    return null
  }

  const closestPoint = {
    x: origin.x + direction.x * projection,
    y: origin.y + direction.y * projection,
  }
  const distanceToCenter = Math.hypot(
    center.x - closestPoint.x,
    center.y - closestPoint.y
  )

  if (distanceToCenter > radius) {
    return null
  }

  const offset = Math.sqrt(
    radius * radius - distanceToCenter * distanceToCenter
  )
  const entryDistance = projection - offset

  if (entryDistance >= 0 && entryDistance <= maxDistance) {
    return entryDistance
  }

  if (projection <= maxDistance) {
    return projection
  }

  return null
}

function rayRectHitDistance(
  origin: Vector2,
  direction: Vector2,
  maxDistance: number,
  left: number,
  right: number,
  top: number,
  bottom: number
): number | null {
  let tMin = 0
  let tMax = maxDistance

  if (direction.x === 0) {
    if (origin.x < left || origin.x > right) {
      return null
    }
  } else {
    const tx1 = (left - origin.x) / direction.x
    const tx2 = (right - origin.x) / direction.x
    tMin = Math.max(tMin, Math.min(tx1, tx2))
    tMax = Math.min(tMax, Math.max(tx1, tx2))
  }

  if (direction.y === 0) {
    if (origin.y < top || origin.y > bottom) {
      return null
    }
  } else {
    const ty1 = (top - origin.y) / direction.y
    const ty2 = (bottom - origin.y) / direction.y
    tMin = Math.max(tMin, Math.min(ty1, ty2))
    tMax = Math.min(tMax, Math.max(ty1, ty2))
  }

  if (tMax < 0 || tMin > tMax || tMin > maxDistance) {
    return null
  }

  return Math.max(0, tMin)
}

export function rewindToTick({
  history,
  targetTick,
  currentSnapshot,
}: RewindToTickOptions): Snapshot {
  if (history.length === 0) {
    if (currentSnapshot === undefined) {
      throw new Error('rewindToTick needs history or a current snapshot')
    }

    return cloneSnapshot(currentSnapshot)
  }

  const sortedHistory = [...history].sort((firstSnapshot, secondSnapshot) => {
    return firstSnapshot.tick - secondSnapshot.tick
  })
  const oldestSnapshot = sortedHistory[0]
  const latestSnapshot =
    currentSnapshot ?? sortedHistory[sortedHistory.length - 1]

  if (targetTick <= oldestSnapshot.tick) {
    return cloneSnapshot(oldestSnapshot)
  }

  if (targetTick >= latestSnapshot.tick) {
    return cloneSnapshot(latestSnapshot)
  }

  let bestSnapshot = oldestSnapshot
  for (const snapshot of sortedHistory) {
    if (snapshot.tick > targetTick) {
      break
    }
    bestSnapshot = snapshot
  }

  return cloneSnapshot(bestSnapshot)
}

export function checkShotInPast({
  aimX,
  aimY,
  currentSnapshot,
  history,
  maxDistance,
  shooterId,
  targetTick,
}: LagCompShotOptions): EntityId | null {
  const snapshot = rewindToTick({ history, targetTick, currentSnapshot })
  const shooterPosition = snapshot.positions[shooterId]

  if (shooterPosition === undefined) {
    return null
  }

  const shotDirection = normalize({
    x: aimX - shooterPosition.x,
    y: aimY - shooterPosition.y,
  })

  if (shotDirection.x === 0 && shotDirection.y === 0) {
    return null
  }

  let closestHitEntityId: EntityId | null = null
  let closestHitDistance = Number.POSITIVE_INFINITY

  for (const wall of Object.values(snapshot.walls)) {
    const wallHitDistance = rayRectHitDistance(
      shooterPosition,
      shotDirection,
      maxDistance,
      wall.x,
      wall.x + wall.width,
      wall.y,
      wall.y + wall.height
    )

    if (wallHitDistance === null || wallHitDistance >= closestHitDistance) {
      continue
    }

    closestHitDistance = wallHitDistance
  }

  for (const [entityIdText, player] of Object.entries(snapshot.players)) {
    void player
    const entityId = Number(entityIdText)
    if (entityId === shooterId) {
      continue
    }

    const targetPosition = snapshot.positions[entityId]
    const targetRadius = snapshot.radii[entityId]
    if (targetPosition === undefined || targetRadius === undefined) {
      continue
    }

    const hitDistance = rayCircleHitDistance(
      shooterPosition,
      shotDirection,
      maxDistance,
      targetPosition,
      targetRadius
    )

    if (hitDistance === null || hitDistance >= closestHitDistance) {
      continue
    }

    closestHitDistance = hitDistance
    closestHitEntityId = entityId
  }

  return closestHitEntityId
}
