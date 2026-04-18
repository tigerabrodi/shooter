import type { Snapshot } from '@shared/types.ts'

export interface PushSnapshotToHistoryOptions {
  history: Array<Snapshot>
  snapshot: Snapshot
  limit: number
}

export function pushSnapshotToHistory({
  history,
  snapshot,
  limit,
}: PushSnapshotToHistoryOptions): Array<Snapshot> {
  const nextHistory = [...history, snapshot]
  if (nextHistory.length <= limit) {
    return nextHistory
  }

  return nextHistory.slice(nextHistory.length - limit)
}
