export type EntityId = number
export type ClientId = string

export interface Vector2 {
  x: number
  y: number
}

export interface PlayerInput {
  playerId: EntityId
  seq: number
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  fire: boolean
  aimX: number
  aimY: number
}

export interface PlayerComponent {
  color: string
  fireCooldownTicks: number
  needsRespawn: boolean
}

export interface BulletComponent {
  ownerId: EntityId
  damage: number
}

export interface WallComponent {
  x: number
  y: number
  width: number
  height: number
}

export interface World {
  tick: number
  nextEntityId: number
  rngState: number
  positions: Record<EntityId, Vector2>
  velocities: Record<EntityId, Vector2>
  radii: Record<EntityId, number>
  health: Record<EntityId, number>
  players: Record<EntityId, PlayerComponent>
  bullets: Record<EntityId, BulletComponent>
  walls: Record<EntityId, WallComponent>
  pendingDespawn: Array<EntityId>
}

export type Snapshot = World

export type InterpolatedPositions = Record<EntityId, Vector2>

export interface CreateWorldOptions {
  seed?: number
}

export interface SerializeWorldOptions {
  world: World
}

export interface DeserializeWorldOptions {
  snapshot: Snapshot
}

export interface InterpolateSnapshotsOptions {
  earlierSnapshot: Snapshot
  laterSnapshot: Snapshot
  alpha: number
}

export interface ReconcileOptions {
  serverSnapshot: Snapshot
  ackedSeq: number
  pendingInputs: Array<PlayerInput>
}

export interface ReconcileResult {
  world: World
  remainingInputs: Array<PlayerInput>
}

export interface SpawnPlayerOptions {
  x?: number
  y?: number
  color?: string
}

export interface SpawnWallOptions {
  x: number
  y: number
  width: number
  height: number
}

export interface SpawnBulletOptions {
  x: number
  y: number
  velocityX: number
  velocityY: number
  ownerId: EntityId
}

export interface CollisionResolution {
  x: number
  y: number
  axis: 'x' | 'y' | null
}

export interface LagCompShotOptions {
  aimX: number
  aimY: number
  currentSnapshot: Snapshot
  history: Array<Snapshot>
  maxDistance: number
  shooterId: EntityId
  targetTick: number
}

export interface RewindToTickOptions {
  history: Array<Snapshot>
  targetTick: number
  currentSnapshot?: Snapshot
}

export interface ClientInputMessage {
  type: 'input'
  seq: number
  up?: boolean
  down?: boolean
  left?: boolean
  right?: boolean
  fire?: boolean
  aimX?: number
  aimY?: number
  keys?: Partial<Record<'up' | 'down' | 'left' | 'right' | 'fire', boolean>>
}

export interface ServerSnapshotMessage {
  type: 'snapshot'
  ackedSeq: number
  playerId: EntityId
  snapshot: Snapshot
}
