import { PLAYER_MAX_HEALTH } from '@shared/constants.ts'
import type { World } from '@shared/types.ts'
import {
  chooseRespawnPoint,
  destroyEntity,
  listEntityIds,
} from '@shared/world.ts'

export function despawnSystem(world: World): void {
  for (const entityId of new Set(world.pendingDespawn)) {
    destroyEntity(world, entityId)
  }

  world.pendingDespawn = []

  for (const playerId of listEntityIds(world.players)) {
    const player = world.players[playerId]
    if (!player.needsRespawn) {
      continue
    }

    const respawnPoint = chooseRespawnPoint(world)
    world.positions[playerId] = respawnPoint
    world.velocities[playerId] = { x: 0, y: 0 }
    world.health[playerId] = PLAYER_MAX_HEALTH
    player.fireCooldownTicks = 0
    player.needsRespawn = false
  }
}
