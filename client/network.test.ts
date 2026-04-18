import { afterAll, afterEach, beforeAll, describe, expect, test } from 'vitest'
import { setupServer } from 'msw/node'
import { ws } from 'msw'

import { createWorld, spawnPlayer } from '@shared/world.ts'
import type { PlayerInput, ServerSnapshotMessage } from '@shared/types.ts'
import { serializeWorld } from '@shared/snapshot.ts'

import { createNetwork } from './network.ts'

const socketLink = ws.link('ws://localhost:8080/ws')
const server = setupServer()

beforeAll(() => {
  server.listen()
})

afterEach(() => {
  server.resetHandlers()
})

afterAll(() => {
  server.close()
})

function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds))
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
  const playerId = spawnPlayer(world, { x: 100, y: 100, color: '#ffffff' })

  return {
    type: 'snapshot',
    ackedSeq: 4,
    playerId,
    snapshot: serializeWorld({ world }),
  }
}

describe('network', () => {
  test('network sends input as JSON over WebSocket', async () => {
    const receivedMessage = new Promise<Record<string, unknown>>((resolve) => {
      server.use(
        socketLink.addEventListener('connection', ({ client }) => {
          client.addEventListener('message', (event) => {
            if (typeof event.data !== 'string') {
              throw new Error('Expected string WebSocket message payload')
            }

            resolve(JSON.parse(event.data) as Record<string, unknown>)
          })
        })
      )
    })

    const network = createNetwork({
      reconnectDelayMs: 10,
      url: 'ws://localhost:8080/ws',
    })

    await wait(20)
    network.sendInput({ input: makeInput(7, { right: true }), tick: 42 })

    await expect(receivedMessage).resolves.toEqual({
      type: 'input',
      seq: 7,
      tick: 42,
      up: false,
      down: false,
      left: false,
      right: true,
      fire: false,
      aimX: 0,
      aimY: 0,
    })

    network.close()
  })

  test('network fires snapshot callback when server sends a snapshot', async () => {
    const snapshotMessage = makeSnapshotMessage()
    server.use(
      socketLink.addEventListener('connection', ({ client }) => {
        client.send(JSON.stringify(snapshotMessage))
      })
    )

    const network = createNetwork({
      reconnectDelayMs: 10,
      url: 'ws://localhost:8080/ws',
    })

    const actualSnapshot = await new Promise<ServerSnapshotMessage>(
      (resolve) => {
        network.onSnapshot(resolve)
      }
    )

    expect(actualSnapshot).toEqual(snapshotMessage)
    network.close()
  })

  test('network retries connection on disconnect', async () => {
    let connectionCount = 0

    const reconnected = new Promise<void>((resolve) => {
      server.use(
        socketLink.addEventListener('connection', ({ client }) => {
          connectionCount += 1

          if (connectionCount === 1) {
            client.close(1012, 'Restart')
            return
          }

          resolve()
        })
      )
    })

    const network = createNetwork({
      reconnectDelayMs: 10,
      url: 'ws://localhost:8080/ws',
    })

    await reconnected

    expect(connectionCount).toBe(2)
    network.close()
  })

  test('network emits disconnect event when socket closes', async () => {
    let network: ReturnType<typeof createNetwork> | null = null

    const disconnected = new Promise<void>((resolve) => {
      server.use(
        socketLink.addEventListener('connection', ({ client }) => {
          setTimeout(() => {
            client.close(1000, 'Done')
          }, 0)
        })
      )

      network = createNetwork({
        reconnectDelayMs: 50,
        url: 'ws://localhost:8080/ws',
      })
      network.onDisconnect(() => {
        network?.close()
        resolve()
      })
    })

    await disconnected
  })

  test('network handles malformed JSON gracefully', async () => {
    const snapshotMessage = makeSnapshotMessage()
    let snapshotCount = 0

    server.use(
      socketLink.addEventListener('connection', ({ client }) => {
        client.send('not-json')
        client.send(JSON.stringify(snapshotMessage))
      })
    )

    const network = createNetwork({
      reconnectDelayMs: 10,
      url: 'ws://localhost:8080/ws',
    })

    await new Promise<void>((resolve) => {
      network.onSnapshot(() => {
        snapshotCount += 1
        resolve()
      })
    })

    expect(snapshotCount).toBe(1)
    network.close()
  })
})
