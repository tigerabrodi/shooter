import {
  BULLET_DAMAGE,
  BULLET_RADIUS,
  DEFAULT_RANDOM_SEED,
  PLAYER_COLORS,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
  SPAWN_POINTS,
} from '@shared/constants.ts'
import type {
  CreateWorldOptions,
  EntityId,
  SpawnBulletOptions,
  SpawnPlayerOptions,
  SpawnWallOptions,
  Vector2,
  World,
} from '@shared/types.ts'

const RANDOM_MULTIPLIER = 1_664_525
const RANDOM_INCREMENT = 1_013_904_223
const RANDOM_MODULUS = 2 ** 32

function allocateEntityId(world: World): EntityId {
  const entityId = world.nextEntityId
  world.nextEntityId += 1
  return entityId
}

function nextRandom(world: World): number {
  world.rngState = (world.rngState * RANDOM_MULTIPLIER + RANDOM_INCREMENT) >>> 0
  return world.rngState / RANDOM_MODULUS
}

function copyPoint(point: Vector2): Vector2 {
  return { x: point.x, y: point.y }
}

export function listEntityIds<T>(
  components: Record<number, T>
): Array<EntityId> {
  return Object.keys(components).map(Number)
}

export function chooseRespawnPoint(world: World): Vector2 {
  const index =
    Math.floor(nextRandom(world) * SPAWN_POINTS.length) % SPAWN_POINTS.length
  return copyPoint(SPAWN_POINTS[index])
}

export function createWorld({
  seed = DEFAULT_RANDOM_SEED,
}: CreateWorldOptions = {}): World {
  return {
    tick: 0,
    nextEntityId: 1,
    rngState: seed >>> 0,
    positions: {},
    velocities: {},
    radii: {},
    health: {},
    players: {},
    bullets: {},
    walls: {},
    pendingDespawn: [],
  }
}

export function spawnPlayer(
  world: World,
  options: SpawnPlayerOptions = {}
): EntityId {
  const entityId = allocateEntityId(world)
  const spawnPoint = chooseRespawnPoint(world)
  const x = options.x ?? spawnPoint.x
  const y = options.y ?? spawnPoint.y
  const colorIndex =
    Math.floor(nextRandom(world) * PLAYER_COLORS.length) % PLAYER_COLORS.length

  world.positions[entityId] = { x, y }
  world.velocities[entityId] = { x: 0, y: 0 }
  world.radii[entityId] = PLAYER_RADIUS
  world.health[entityId] = PLAYER_MAX_HEALTH
  world.players[entityId] = {
    color: options.color ?? PLAYER_COLORS[colorIndex],
    fireCooldownTicks: 0,
    needsRespawn: false,
  }

  return entityId
}

export function spawnWall(world: World, options: SpawnWallOptions): EntityId {
  const entityId = allocateEntityId(world)
  world.walls[entityId] = {
    x: options.x,
    y: options.y,
    width: options.width,
    height: options.height,
  }
  return entityId
}

export function spawnBullet(
  world: World,
  options: SpawnBulletOptions
): EntityId {
  const entityId = allocateEntityId(world)
  world.positions[entityId] = { x: options.x, y: options.y }
  world.velocities[entityId] = { x: options.velocityX, y: options.velocityY }
  world.radii[entityId] = BULLET_RADIUS
  world.bullets[entityId] = {
    ownerId: options.ownerId,
    damage: options.damage ?? BULLET_DAMAGE,
  }
  return entityId
}

export function destroyEntity(world: World, entityId: EntityId): void {
  delete world.positions[entityId]
  delete world.velocities[entityId]
  delete world.radii[entityId]
  delete world.health[entityId]
  delete world.players[entityId]
  delete world.bullets[entityId]
  delete world.walls[entityId]
  world.pendingDespawn = world.pendingDespawn.filter(
    (pendingEntityId) => pendingEntityId !== entityId
  )
}
