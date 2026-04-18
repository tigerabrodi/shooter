import type {
  ClientInputMessage,
  ClientShootMessage,
  PlayerInput,
  ServerShotMessage,
  ServerSnapshotMessage,
} from '@shared/types.ts'

export interface CreateNetworkOptions {
  reconnectDelayMs?: number
  url: string
  webSocketFactory?: (url: string) => WebSocket
}

export interface NetworkSendInputOptions {
  input: PlayerInput
  tick: number
}

export interface NetworkSendShootOptions {
  aimX: number
  aimY: number
  seq: number
  tick: number
}

export interface Network {
  close: () => void
  onDisconnect: (listener: () => void) => () => void
  onShot: (listener: (message: ServerShotMessage) => void) => () => void
  onSnapshot: (listener: (message: ServerSnapshotMessage) => void) => () => void
  sendInput: (options: NetworkSendInputOptions) => void
  sendShoot: (options: NetworkSendShootOptions) => void
}

const DEFAULT_RECONNECT_DELAY_MS = 500

function parseSnapshotMessage(rawData: unknown): ServerSnapshotMessage | null {
  if (typeof rawData !== 'string') {
    return null
  }

  let parsedData: unknown

  try {
    parsedData = JSON.parse(rawData)
  } catch {
    return null
  }

  if (
    typeof parsedData !== 'object' ||
    parsedData === null ||
    !('type' in parsedData) ||
    parsedData.type !== 'snapshot'
  ) {
    return null
  }

  return parsedData as ServerSnapshotMessage
}

function parseShotMessage(rawData: unknown): ServerShotMessage | null {
  if (typeof rawData !== 'string') {
    return null
  }

  let parsedData: unknown

  try {
    parsedData = JSON.parse(rawData)
  } catch {
    return null
  }

  if (
    typeof parsedData !== 'object' ||
    parsedData === null ||
    !('type' in parsedData) ||
    parsedData.type !== 'shot'
  ) {
    return null
  }

  return parsedData as ServerShotMessage
}

function removeListener<T>(listeners: Array<T>, listener: T): void {
  const listenerIndex = listeners.indexOf(listener)
  if (listenerIndex === -1) {
    return
  }

  listeners.splice(listenerIndex, 1)
}

export function createNetwork({
  reconnectDelayMs = DEFAULT_RECONNECT_DELAY_MS,
  url,
  webSocketFactory = (socketUrl) => new WebSocket(socketUrl),
}: CreateNetworkOptions): Network {
  const disconnectListeners: Array<() => void> = []
  const shotListeners: Array<(message: ServerShotMessage) => void> = []
  const snapshotListeners: Array<(message: ServerSnapshotMessage) => void> = []

  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  let socket: WebSocket | null = null
  let isClosedManually = false

  function clearReconnectTimeout(): void {
    if (reconnectTimeout === null) {
      return
    }

    clearTimeout(reconnectTimeout)
    reconnectTimeout = null
  }

  function scheduleReconnect(): void {
    clearReconnectTimeout()

    if (isClosedManually) {
      return
    }

    reconnectTimeout = setTimeout(() => {
      reconnectTimeout = null
      connect()
    }, reconnectDelayMs)
  }

  function handleMessage(event: MessageEvent): void {
    const message = parseSnapshotMessage(event.data)
    if (message !== null) {
      for (const listener of snapshotListeners) {
        listener(message)
      }

      return
    }

    const shotMessage = parseShotMessage(event.data)
    if (shotMessage === null) {
      return
    }

    for (const listener of shotListeners) {
      listener(shotMessage)
    }
  }

  function handleClose(): void {
    for (const listener of disconnectListeners) {
      listener()
    }

    scheduleReconnect()
  }

  function connect(): void {
    socket = webSocketFactory(url)
    socket.addEventListener('message', handleMessage)
    socket.addEventListener('close', handleClose)
  }

  connect()

  return {
    close() {
      isClosedManually = true
      clearReconnectTimeout()

      if (socket === null) {
        return
      }

      socket.removeEventListener('message', handleMessage)
      socket.removeEventListener('close', handleClose)
      socket.close()
      socket = null
    },
    onDisconnect(listener) {
      disconnectListeners.push(listener)

      return () => {
        removeListener(disconnectListeners, listener)
      }
    },
    onShot(listener) {
      shotListeners.push(listener)

      return () => {
        removeListener(shotListeners, listener)
      }
    },
    onSnapshot(listener) {
      snapshotListeners.push(listener)

      return () => {
        removeListener(snapshotListeners, listener)
      }
    },
    sendInput({ input, tick }) {
      if (socket === null || socket.readyState !== WebSocket.OPEN) {
        return
      }

      const message: ClientInputMessage = {
        type: 'input',
        seq: input.seq,
        tick,
        up: input.up,
        down: input.down,
        left: input.left,
        right: input.right,
        fire: input.fire,
        aimX: input.aimX,
        aimY: input.aimY,
      }

      socket.send(JSON.stringify(message))
    },
    sendShoot({ aimX, aimY, seq, tick }) {
      if (socket === null || socket.readyState !== WebSocket.OPEN) {
        return
      }

      const message: ClientShootMessage = {
        type: 'shoot',
        seq,
        tick,
        aimX,
        aimY,
      }

      socket.send(JSON.stringify(message))
    },
  }
}
