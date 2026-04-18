import {
  DEFAULT_WALL_LAYOUT,
  MAP_HEIGHT,
  MAP_WIDTH,
  TICK_RATE,
} from '@shared/constants.ts'
import { step } from '@shared/step.ts'
import type { World } from '@shared/types.ts'
import { createWorld, spawnPlayer, spawnWall } from '@shared/world.ts'

import { startGameLoop } from './gameLoop.ts'
import { createInputController } from './input.ts'
import { renderGame, snapshotPositions } from './render.ts'

declare global {
  interface Window {
    __shooterDebug?: {
      getLocalPlayerId: () => number
      getWorld: () => World
    }
  }
}

const canvas = document.querySelector<HTMLCanvasElement>('#game')
const hud = document.querySelector<HTMLDivElement>('#hud')

if (canvas === null) {
  throw new Error('Missing canvas element')
}

const context = canvas.getContext('2d')
if (context === null) {
  throw new Error('Missing 2D rendering context')
}

canvas.width = MAP_WIDTH
canvas.height = MAP_HEIGHT

const world = createWorld({})
for (const wall of DEFAULT_WALL_LAYOUT) {
  spawnWall(world, wall)
}

const localPlayerId = spawnPlayer(world)
const inputController = createInputController(canvas)
let previousPositions = snapshotPositions(world)

window.__shooterDebug = {
  getLocalPlayerId: () => localPlayerId,
  getWorld: () => structuredClone(world),
}

function updateHud(): void {
  if (hud === null) {
    return
  }

  const health = world.health[localPlayerId] ?? 0
  hud.textContent = `Tick ${world.tick}. HP ${health}.`
}

const stopLoop = startGameLoop({
  tickRate: TICK_RATE,
  update() {
    previousPositions = snapshotPositions(world)
    step(world, [inputController.getInput(localPlayerId)])
    updateHud()
  },
  render(alpha) {
    renderGame({
      aim: inputController.getAim(),
      alpha,
      context,
      localPlayerId,
      previousPositions,
      world,
    })
  },
})

updateHud()

window.addEventListener('beforeunload', () => {
  stopLoop()
  inputController.destroy()
})
