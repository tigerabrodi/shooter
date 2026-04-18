import { DT } from '@shared/constants.ts'
import { listEntityIds } from '@shared/world.ts'
import type { World } from '@shared/types.ts'

export function movementSystem(world: World): void {
  for (const entityId of listEntityIds(world.positions)) {
    const position = world.positions[entityId]
    const velocity = world.velocities[entityId]

    if (position === undefined || velocity === undefined) {
      continue
    }

    position.x += velocity.x * DT
    position.y += velocity.y * DT
  }
}
