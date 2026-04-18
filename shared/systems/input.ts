import {
  BULLET_SPEED,
  FIRE_COOLDOWN_TICKS,
  PLAYER_SPEED,
  PLAYER_SPRINT_MULTIPLIER,
} from '@shared/constants.ts'
import type { PlayerInput, Vector2, World } from '@shared/types.ts'
import { listEntityIds, spawnBullet } from '@shared/world.ts'

function normalizeVector(x: number, y: number): Vector2 {
  const length = Math.hypot(x, y)
  if (length === 0) {
    return { x: 0, y: 0 }
  }

  return {
    x: x / length,
    y: y / length,
  }
}

export function applyInputsSystem(
  world: World,
  inputs: Array<PlayerInput> = []
): void {
  const inputByPlayerId = new Map(
    inputs.map((input) => [input.playerId, input])
  )

  for (const playerId of listEntityIds(world.players)) {
    const player = world.players[playerId]

    player.fireCooldownTicks = Math.max(0, player.fireCooldownTicks - 1)
    world.velocities[playerId] = { x: 0, y: 0 }

    if (player.needsRespawn || world.health[playerId] <= 0) {
      continue
    }

    const input = inputByPlayerId.get(playerId)
    if (input === undefined) {
      continue
    }

    const horizontal = Number(input.right) - Number(input.left)
    const vertical = Number(input.down) - Number(input.up)
    const moveDirection = normalizeVector(horizontal, vertical)
    const moveSpeed = input.sprint
      ? PLAYER_SPEED * PLAYER_SPRINT_MULTIPLIER
      : PLAYER_SPEED

    world.velocities[playerId] = {
      x: moveDirection.x * moveSpeed,
      y: moveDirection.y * moveSpeed,
    }

    if (!input.fire || player.fireCooldownTicks > 0) {
      continue
    }

    const playerPosition = world.positions[playerId]
    const aimDirection = normalizeVector(
      input.aimX - playerPosition.x,
      input.aimY - playerPosition.y
    )

    if (aimDirection.x === 0 && aimDirection.y === 0) {
      continue
    }

    spawnBullet(world, {
      x: playerPosition.x,
      y: playerPosition.y,
      velocityX: aimDirection.x * BULLET_SPEED,
      velocityY: aimDirection.y * BULLET_SPEED,
      ownerId: playerId,
    })
    player.fireCooldownTicks = FIRE_COOLDOWN_TICKS
  }
}
