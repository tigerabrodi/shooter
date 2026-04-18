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
