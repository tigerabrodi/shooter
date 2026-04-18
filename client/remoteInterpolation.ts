import { interpolateSnapshots } from '@shared/interpolate.ts'
import type { Snapshot, Vector2 } from '@shared/types.ts'

import { snapshotPositions } from './render.ts'

export interface TimedSnapshot {
  receivedAt: number
  snapshot: Snapshot
}

export interface ComputeRemoteInterpolatedPositionsOptions {
  targetTime: number
  timeline: Array<TimedSnapshot>
}

function computeAlpha({
  earlierTime,
  laterTime,
  targetTime,
}: {
  earlierTime: number
  laterTime: number
  targetTime: number
}): number {
  const timeSpan = laterTime - earlierTime
  if (timeSpan <= 0) {
    return 1
  }

  return (targetTime - earlierTime) / timeSpan
}

export function computeRemoteInterpolatedPositions({
  targetTime,
  timeline,
}: ComputeRemoteInterpolatedPositionsOptions): Record<number, Vector2> {
  if (timeline.length === 0) {
    return {}
  }

  if (timeline.length === 1) {
    return snapshotPositions(timeline[0].snapshot)
  }

  const firstEntry = timeline[0]
  if (targetTime <= firstEntry.receivedAt) {
    return snapshotPositions(firstEntry.snapshot)
  }

  for (let index = 0; index < timeline.length - 1; index += 1) {
    const earlierEntry = timeline[index]
    const laterEntry = timeline[index + 1]

    if (targetTime > laterEntry.receivedAt) {
      continue
    }

    return interpolateSnapshots({
      earlierSnapshot: earlierEntry.snapshot,
      laterSnapshot: laterEntry.snapshot,
      alpha: computeAlpha({
        earlierTime: earlierEntry.receivedAt,
        laterTime: laterEntry.receivedAt,
        targetTime,
      }),
    })
  }

  const earlierEntry = timeline[timeline.length - 2]
  const laterEntry = timeline[timeline.length - 1]

  return interpolateSnapshots({
    earlierSnapshot: earlierEntry.snapshot,
    laterSnapshot: laterEntry.snapshot,
    alpha: 1,
  })
}
