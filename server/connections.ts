import type {
  ClientId,
  ClientInputMessage,
  ClientShootMessage,
  EntityId,
  PlayerInput,
  ServerShotMessage,
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

export interface ParsedClientInput {
  input: PlayerInput
  tick: number
}

export interface ParsedClientShoot {
  aimX: number
  aimY: number
  playerId: EntityId
  seq: number
  tick: number
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
}: ParseClientMessageOptions): ParsedClientInput | null {
  let parsedMessage: ClientInputMessage | ClientShootMessage

  try {
    parsedMessage = JSON.parse(decodeMessage(message)) as
      | ClientInputMessage
      | ClientShootMessage
  } catch {
    return null
  }

  if (
    parsedMessage.type !== 'input' ||
    typeof parsedMessage.seq !== 'number' ||
    typeof parsedMessage.tick !== 'number'
  ) {
    return null
  }

  const keys = parsedMessage.keys ?? {}

  return {
    input: {
      playerId,
      seq: parsedMessage.seq,
      up: parsedMessage.up ?? keys.up ?? false,
      down: parsedMessage.down ?? keys.down ?? false,
      left: parsedMessage.left ?? keys.left ?? false,
      right: parsedMessage.right ?? keys.right ?? false,
      fire: parsedMessage.fire ?? keys.fire ?? false,
      aimX: parsedMessage.aimX ?? 0,
      aimY: parsedMessage.aimY ?? 0,
    },
    tick: parsedMessage.tick,
  }
}

export function parseClientShootMessage({
  message,
  playerId,
}: ParseClientMessageOptions): ParsedClientShoot | null {
  let parsedMessage: ClientInputMessage | ClientShootMessage

  try {
    parsedMessage = JSON.parse(decodeMessage(message)) as
      | ClientInputMessage
      | ClientShootMessage
  } catch {
    return null
  }

  if (
    parsedMessage.type !== 'shoot' ||
    typeof parsedMessage.seq !== 'number' ||
    typeof parsedMessage.tick !== 'number' ||
    typeof parsedMessage.aimX !== 'number' ||
    typeof parsedMessage.aimY !== 'number'
  ) {
    return null
  }

  return {
    aimX: parsedMessage.aimX,
    aimY: parsedMessage.aimY,
    playerId,
    seq: parsedMessage.seq,
    tick: parsedMessage.tick,
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

export function createShotMessage({
  shooterId,
  shotSeq,
  targetId,
}: {
  shooterId: EntityId
  shotSeq: number
  targetId: EntityId | null
}): ServerShotMessage {
  return {
    type: 'shot',
    shooterId,
    shotSeq,
    targetId,
  }
}
