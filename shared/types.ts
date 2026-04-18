export type EntityId = number

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
