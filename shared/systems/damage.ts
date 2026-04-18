import { listEntityIds } from '@shared/world.ts'
import type { World } from '@shared/types.ts'

function circlesOverlap(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number
): boolean {
  const dx = ax - bx
  const dy = ay - by
  const radiusSum = ar + br
  return dx * dx + dy * dy <= radiusSum * radiusSum
}

function markForDespawn(world: World, entityId: number): void {
  if (!world.pendingDespawn.includes(entityId)) {
    world.pendingDespawn.push(entityId)
  }
}

export function damageSystem(world: World): void {
  const playerIds = listEntityIds(world.players)

  for (const bulletId of listEntityIds(world.bullets)) {
    const bullet = world.bullets[bulletId]
    const bulletPosition = world.positions[bulletId]
    const bulletRadius = world.radii[bulletId]

    if (bulletPosition === undefined || bulletRadius === undefined) {
      continue
    }

    for (const playerId of playerIds) {
      const player = world.players[playerId]
      const playerPosition = world.positions[playerId]
      const playerRadius = world.radii[playerId]

      if (
        playerId === bullet.ownerId ||
        playerPosition === undefined ||
        playerRadius === undefined
      ) {
        continue
      }

      if (player.needsRespawn || world.health[playerId] <= 0) {
        continue
      }

      if (
        !circlesOverlap(
          bulletPosition.x,
          bulletPosition.y,
          bulletRadius,
          playerPosition.x,
          playerPosition.y,
          playerRadius
        )
      ) {
        continue
      }

      world.health[playerId] = Math.max(
        0,
        world.health[playerId] - bullet.damage
      )
      if (world.health[playerId] === 0) {
        player.needsRespawn = true
      }
      markForDespawn(world, bulletId)
      break
    }
  }
}
