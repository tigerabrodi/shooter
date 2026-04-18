import type {
  DeserializeWorldOptions,
  SerializeWorldOptions,
  Snapshot,
  World,
} from '@shared/types.ts'

function cloneSerializable<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

export function serializeWorld({ world }: SerializeWorldOptions): Snapshot {
  return cloneSerializable(world)
}

export function deserializeWorld({ snapshot }: DeserializeWorldOptions): World {
  return cloneSerializable(snapshot)
}
