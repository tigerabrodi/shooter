import { TICK_RATE } from '@shared/constants.ts'
import { serializeWorld } from '@shared/snapshot.ts'
import type { ServerWebSocket } from 'bun'

import {
  createClientId,
  createSnapshotMessage,
  parseClientInputMessage,
  type SocketData,
} from './connections.ts'
import { pushSnapshotToHistory } from './history.ts'
import {
  connectClient,
  createServerState,
  disconnectClient,
  enqueueClientInput,
  tickServer,
} from './server.ts'

const PORT = 8080
const state = createServerState({})
const sockets = new Map<string, ServerWebSocket<SocketData>>()

function rememberCurrentWorldSnapshot(): ReturnType<typeof serializeWorld> {
  const snapshot = serializeWorld({ world: state.world })
  state.history = pushSnapshotToHistory({
    history: state.history,
    snapshot,
    limit: state.historyLimit,
  })
  return snapshot
}

function broadcastSnapshot(snapshot: ReturnType<typeof serializeWorld>): void {
  for (const clientId of Object.keys(state.clients)) {
    const client = state.clients[clientId]
    const socket = sockets.get(clientId)

    if (socket === undefined) {
      continue
    }

    socket.send(
      JSON.stringify(
        createSnapshotMessage({
          ackedSeq: client.lastAckedSeq,
          playerId: client.playerId,
          snapshot,
        })
      )
    )
  }
}

setInterval(() => {
  const tickResult = tickServer({ state })

  for (const clientId of Object.keys(state.clients)) {
    const client = state.clients[clientId]
    const socket = sockets.get(clientId)

    if (socket === undefined) {
      continue
    }

    socket.send(
      JSON.stringify(
        createSnapshotMessage({
          ackedSeq: tickResult.clientAcks[clientId] ?? client.lastAckedSeq,
          playerId: client.playerId,
          snapshot: tickResult.snapshot,
        })
      )
    )
  }
}, 1000 / TICK_RATE)

const server = Bun.serve({
  port: PORT,
  fetch(request, serverInstance) {
    const url = new URL(request.url)

    if (url.pathname === '/health') {
      return new Response('ok')
    }

    if (url.pathname !== '/ws') {
      return new Response('Not found', { status: 404 })
    }

    const clientId = createClientId()
    const isUpgraded = serverInstance.upgrade(request, {
      data: { clientId },
    })

    if (isUpgraded) {
      return
    }

    return new Response('Upgrade failed', { status: 500 })
  },
  websocket: {
    data: {} as SocketData,
    message(ws, rawMessage) {
      const client = state.clients[ws.data.clientId]
      if (client === undefined) {
        return
      }

      const input = parseClientInputMessage({
        message: rawMessage,
        playerId: client.playerId,
      })

      if (input === null) {
        return
      }

      enqueueClientInput({
        state,
        clientId: ws.data.clientId,
        input,
      })
    },
    open(ws) {
      connectClient({
        state,
        clientId: ws.data.clientId,
      })

      sockets.set(ws.data.clientId, ws)
      broadcastSnapshot(rememberCurrentWorldSnapshot())
    },
    close(ws) {
      sockets.delete(ws.data.clientId)
      disconnectClient({
        state,
        clientId: ws.data.clientId,
      })
      broadcastSnapshot(rememberCurrentWorldSnapshot())
    },
  },
})

console.log(`Shooter server listening on ws://localhost:${server.port}/ws`)
