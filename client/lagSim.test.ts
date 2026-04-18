import { afterEach, describe, expect, test, vi } from 'vitest'

import { createWorld, spawnPlayer } from '@shared/world.ts'
import type { PlayerInput, ServerSnapshotMessage } from '@shared/types.ts'
import { serializeWorld } from '@shared/snapshot.ts'

import { createLagSim } from './lagSim.ts'
import type { Network, NetworkSendInputOptions } from './network.ts'

interface MockNetwork {
  closeCalled: boolean
  emitDisconnect: () => void
  emitSnapshot: (message: ServerSnapshotMessage) => void
  network: Network
  sentInputs: Array<NetworkSendInputOptions>
}

function makeInput(
  seq: number,
  overrides: Partial<Omit<PlayerInput, 'playerId' | 'seq'>> = {}
): PlayerInput {
  return {
    playerId: 1,
    seq,
    up: overrides.up ?? false,
    down: overrides.down ?? false,
    left: overrides.left ?? false,
    right: overrides.right ?? false,
    fire: overrides.fire ?? false,
    aimX: overrides.aimX ?? 0,
    aimY: overrides.aimY ?? 0,
  }
}

function makeSnapshotMessage(): ServerSnapshotMessage {
  const world = createWorld({})
  const playerId = spawnPlayer(world, { x: 120, y: 180, color: '#ffffff' })

  return {
    type: 'snapshot',
    ackedSeq: 3,
    playerId,
    snapshot: serializeWorld({ world }),
  }
}

function createMockNetwork(): MockNetwork {
  const disconnectListeners: Array<() => void> = []
  const snapshotListeners: Array<(message: ServerSnapshotMessage) => void> = []
  const sentInputs: Array<NetworkSendInputOptions> = []
  let wasCloseCalled = false

  return {
    emitDisconnect() {
      for (const listener of disconnectListeners) {
        listener()
      }
    },
    emitSnapshot(message) {
      for (const listener of snapshotListeners) {
        listener(message)
      }
    },
    network: {
      close() {
        wasCloseCalled = true
      },
      onDisconnect(listener) {
        disconnectListeners.push(listener)

        return () => {
          const index = disconnectListeners.indexOf(listener)
          if (index >= 0) {
            disconnectListeners.splice(index, 1)
          }
        }
      },
      onSnapshot(listener) {
        snapshotListeners.push(listener)

        return () => {
          const index = snapshotListeners.indexOf(listener)
          if (index >= 0) {
            snapshotListeners.splice(index, 1)
          }
        }
      },
      sendInput(options) {
        sentInputs.push(options)
      },
    },
    sentInputs,
    get closeCalled() {
      return wasCloseCalled
    },
  }
}

afterEach(() => {
  vi.useRealTimers()
})

describe('lag sim', () => {
  test('delays outgoing input sends', () => {
    vi.useFakeTimers()
    const mockNetwork = createMockNetwork()
    const lagSim = createLagSim({
      config: { latencyMs: 120, dropRate: 0 },
      network: mockNetwork.network,
      random: () => 0.99,
    })

    const input = makeInput(7, { right: true })
    lagSim.sendInput({ input, tick: 42 })

    expect(mockNetwork.sentInputs).toEqual([])

    vi.advanceTimersByTime(120)

    expect(mockNetwork.sentInputs).toEqual([{ input, tick: 42 }])
    lagSim.close()
  })

  test('delays incoming snapshots', () => {
    vi.useFakeTimers()
    const mockNetwork = createMockNetwork()
    const lagSim = createLagSim({
      config: { latencyMs: 80, dropRate: 0 },
      network: mockNetwork.network,
      random: () => 0.99,
    })
    const snapshot = makeSnapshotMessage()
    const receivedSnapshots: Array<ServerSnapshotMessage> = []

    lagSim.onSnapshot((message) => {
      receivedSnapshots.push(message)
    })

    mockNetwork.emitSnapshot(snapshot)
    expect(receivedSnapshots).toEqual([])

    vi.advanceTimersByTime(80)

    expect(receivedSnapshots).toEqual([snapshot])
    lagSim.close()
  })

  test('drops packets when random roll is under the drop rate', () => {
    vi.useFakeTimers()
    const mockNetwork = createMockNetwork()
    const lagSim = createLagSim({
      config: { latencyMs: 50, dropRate: 0.5 },
      network: mockNetwork.network,
      random: () => 0.1,
    })
    const receivedSnapshots: Array<ServerSnapshotMessage> = []

    lagSim.onSnapshot((message) => {
      receivedSnapshots.push(message)
    })

    lagSim.sendInput({ input: makeInput(1), tick: 5 })
    mockNetwork.emitSnapshot(makeSnapshotMessage())
    vi.advanceTimersByTime(50)

    expect(mockNetwork.sentInputs).toEqual([])
    expect(receivedSnapshots).toEqual([])
    lagSim.close()
  })

  test('close clears pending timers and closes the wrapped network', () => {
    vi.useFakeTimers()
    const mockNetwork = createMockNetwork()
    const lagSim = createLagSim({
      config: { latencyMs: 100, dropRate: 0 },
      network: mockNetwork.network,
      random: () => 0.99,
    })

    lagSim.sendInput({ input: makeInput(2), tick: 9 })
    lagSim.close()
    vi.advanceTimersByTime(100)

    expect(mockNetwork.sentInputs).toEqual([])
    expect(mockNetwork.closeCalled).toBe(true)
  })
})
