import type {
  ClientId,
  ClientInputMessage,
  EntityId,
  PlayerInput,
  ServerSnapshotMessage,
  Snapshot,
} from '@shared/types.ts'

export interface SocketData {
  clientId: ClientId
}

export interface ParseClientMessageOptions {
  message: string | Uint8Array | ArrayBuffer
  playerId: EntityId
}

function decodeMessage(
  rawMessage: ParseClientMessageOptions['message']
): string {
  if (typeof rawMessage === 'string') {
    return rawMessage
  }

  if (rawMessage instanceof ArrayBuffer) {
    return new TextDecoder().decode(new Uint8Array(rawMessage))
  }

  if (rawMessage instanceof Uint8Array) {
    return new TextDecoder().decode(rawMessage)
  }

  return new TextDecoder().decode(rawMessage)
}

export function createClientId(): ClientId {
  return crypto.randomUUID()
}

export function parseClientInputMessage({
  message,
  playerId,
}: ParseClientMessageOptions): PlayerInput | null {
  let parsedMessage: ClientInputMessage

  try {
    parsedMessage = JSON.parse(decodeMessage(message)) as ClientInputMessage
  } catch {
    return null
  }

  if (parsedMessage.type !== 'input' || typeof parsedMessage.seq !== 'number') {
    return null
  }

  const keys = parsedMessage.keys ?? {}

  return {
    playerId,
    seq: parsedMessage.seq,
    up: parsedMessage.up ?? keys.up ?? false,
    down: parsedMessage.down ?? keys.down ?? false,
    left: parsedMessage.left ?? keys.left ?? false,
    right: parsedMessage.right ?? keys.right ?? false,
    fire: parsedMessage.fire ?? keys.fire ?? false,
    aimX: parsedMessage.aimX ?? 0,
    aimY: parsedMessage.aimY ?? 0,
  }
}

export function createSnapshotMessage({
  ackedSeq,
  playerId,
  snapshot,
}: {
  ackedSeq: number
  playerId: EntityId
  snapshot: Snapshot
}): ServerSnapshotMessage {
  return {
    type: 'snapshot',
    ackedSeq,
    playerId,
    snapshot,
  }
}
