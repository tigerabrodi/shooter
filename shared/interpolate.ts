import type {
  InterpolateSnapshotsOptions,
  InterpolatedPositions,
} from '@shared/types.ts'
import { listEntityIds } from '@shared/world.ts'

function clampAlpha(alpha: number): number {
  return Math.max(0, Math.min(1, alpha))
}

export function interpolateSnapshots({
  earlierSnapshot,
  laterSnapshot,
  alpha,
}: InterpolateSnapshotsOptions): InterpolatedPositions {
  const clampedAlpha = clampAlpha(alpha)
  const entityIds = new Set([
    ...listEntityIds(earlierSnapshot.positions),
    ...listEntityIds(laterSnapshot.positions),
  ])
  const positions: InterpolatedPositions = {}

  for (const entityId of entityIds) {
    const earlierPosition = earlierSnapshot.positions[entityId]
    const laterPosition = laterSnapshot.positions[entityId]

    if (earlierPosition !== undefined && laterPosition !== undefined) {
      positions[entityId] = {
        x:
          earlierPosition.x +
          (laterPosition.x - earlierPosition.x) * clampedAlpha,
        y:
          earlierPosition.y +
          (laterPosition.y - earlierPosition.y) * clampedAlpha,
      }
      continue
    }

    if (earlierPosition !== undefined) {
      positions[entityId] = { x: earlierPosition.x, y: earlierPosition.y }
      continue
    }

    if (laterPosition !== undefined) {
      positions[entityId] = { x: laterPosition.x, y: laterPosition.y }
    }
  }

  return positions
}
