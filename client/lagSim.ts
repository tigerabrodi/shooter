import type { ServerSnapshotMessage } from '@shared/types.ts'

import type { Network, NetworkSendInputOptions } from './network.ts'

export interface LagSimConfig {
  latencyMs: number
  dropRate: number
}

export interface CreateLagSimOptions {
  config: LagSimConfig
  network: Network
  random?: () => number
}

function removeListener<T>(listeners: Array<T>, listener: T): void {
  const listenerIndex = listeners.indexOf(listener)
  if (listenerIndex === -1) {
    return
  }

  listeners.splice(listenerIndex, 1)
}

function clampDropRate(dropRate: number): number {
  return Math.max(0, Math.min(1, dropRate))
}

export function createLagSim({
  config,
  network,
  random = Math.random,
}: CreateLagSimOptions): Network {
  const disconnectListeners: Array<() => void> = []
  const snapshotListeners: Array<(message: ServerSnapshotMessage) => void> = []
  const pendingTimers = new Set<ReturnType<typeof setTimeout>>()

  function shouldDropPacket(): boolean {
    return random() < clampDropRate(config.dropRate)
  }

  function clearPendingTimers(): void {
    for (const timer of pendingTimers) {
      clearTimeout(timer)
    }

    pendingTimers.clear()
  }

  function schedule(callback: () => void): void {
    const timer = setTimeout(() => {
      pendingTimers.delete(timer)
      callback()
    }, config.latencyMs)

    pendingTimers.add(timer)
  }

  const unsubscribeSnapshot = network.onSnapshot((message) => {
    if (shouldDropPacket()) {
      return
    }

    schedule(() => {
      for (const listener of snapshotListeners) {
        listener(message)
      }
    })
  })

  const unsubscribeDisconnect = network.onDisconnect(() => {
    for (const listener of disconnectListeners) {
      listener()
    }
  })

  return {
    close() {
      clearPendingTimers()
      unsubscribeSnapshot()
      unsubscribeDisconnect()
      network.close()
    },
    onDisconnect(listener) {
      disconnectListeners.push(listener)

      return () => {
        removeListener(disconnectListeners, listener)
      }
    },
    onSnapshot(listener) {
      snapshotListeners.push(listener)

      return () => {
        removeListener(snapshotListeners, listener)
      }
    },
    sendInput(options: NetworkSendInputOptions) {
      if (shouldDropPacket()) {
        return
      }

      schedule(() => {
        network.sendInput(options)
      })
    },
  }
}
