import { collisionSystem } from '@shared/systems/collision.ts'
import { damageSystem } from '@shared/systems/damage.ts'
import { despawnSystem } from '@shared/systems/despawn.ts'
import { applyInputsSystem } from '@shared/systems/input.ts'
import { movementSystem } from '@shared/systems/movement.ts'
import type { PlayerInput, World } from '@shared/types.ts'

export function step(world: World, inputs: Array<PlayerInput> = []): World {
  applyInputsSystem(world, inputs)
  movementSystem(world)
  collisionSystem(world)
  damageSystem(world)
  despawnSystem(world)
  world.tick += 1
  return world
}
