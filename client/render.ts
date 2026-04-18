import {
  MAP_HEIGHT,
  MAP_WIDTH,
  PLAYER_MAX_HEALTH,
  PLAYER_RADIUS,
} from '@shared/constants.ts'
import type { Vector2, World } from '@shared/types.ts'
import { listEntityIds } from '@shared/world.ts'

import type { PredictedBullet } from './predictedBullets.ts'

interface RenderOptions {
  aim: Vector2
  alpha: number
  context: CanvasRenderingContext2D
  localPlayerId: number | null
  predictedBullets?: Array<PredictedBullet>
  remoteInterpolatedPositions?: Record<number, Vector2>
  previousPositions: Record<number, Vector2>
  world: World
}

function interpolatePosition(
  current: Vector2,
  previous: Vector2 | undefined,
  alpha: number
): Vector2 {
  const start = previous ?? current
  return {
    x: start.x + (current.x - start.x) * alpha,
    y: start.y + (current.y - start.y) * alpha,
  }
}

function drawGrid(context: CanvasRenderingContext2D): void {
  context.save()
  context.strokeStyle = 'rgba(255, 255, 255, 0.06)'
  context.lineWidth = 1

  for (let x = 0; x <= MAP_WIDTH; x += 40) {
    context.beginPath()
    context.moveTo(x, 0)
    context.lineTo(x, MAP_HEIGHT)
    context.stroke()
  }

  for (let y = 0; y <= MAP_HEIGHT; y += 40) {
    context.beginPath()
    context.moveTo(0, y)
    context.lineTo(MAP_WIDTH, y)
    context.stroke()
  }

  context.restore()
}

export function snapshotPositions(world: World): Record<number, Vector2> {
  const positions: Record<number, Vector2> = {}

  for (const entityId of listEntityIds(world.positions)) {
    const position = world.positions[entityId]
    positions[entityId] = { x: position.x, y: position.y }
  }

  return positions
}

export function renderGame({
  aim,
  alpha,
  context,
  localPlayerId,
  predictedBullets = [],
  remoteInterpolatedPositions = {},
  previousPositions,
  world,
}: RenderOptions): void {
  const background = context.createLinearGradient(0, 0, MAP_WIDTH, MAP_HEIGHT)
  background.addColorStop(0, '#0b1220')
  background.addColorStop(1, '#1a2435')

  context.clearRect(0, 0, MAP_WIDTH, MAP_HEIGHT)
  context.fillStyle = background
  context.fillRect(0, 0, MAP_WIDTH, MAP_HEIGHT)
  drawGrid(context)

  context.save()
  context.strokeStyle = 'rgba(255, 255, 255, 0.2)'
  context.lineWidth = 2
  context.strokeRect(1, 1, MAP_WIDTH - 2, MAP_HEIGHT - 2)
  context.restore()

  for (const wallId of listEntityIds(world.walls)) {
    const wall = world.walls[wallId]
    context.fillStyle = '#334155'
    context.strokeStyle = '#cbd5e1'
    context.lineWidth = 2
    context.fillRect(wall.x, wall.y, wall.width, wall.height)
    context.strokeRect(wall.x, wall.y, wall.width, wall.height)
  }

  const localPlayerPosition =
    localPlayerId === null ? undefined : world.positions[localPlayerId]
  if (localPlayerPosition !== undefined && localPlayerId !== null) {
    const interpolatedPlayerPosition = interpolatePosition(
      localPlayerPosition,
      previousPositions[localPlayerId],
      alpha
    )

    context.save()
    context.strokeStyle = 'rgba(255, 255, 255, 0.2)'
    context.lineWidth = 2
    context.beginPath()
    context.moveTo(interpolatedPlayerPosition.x, interpolatedPlayerPosition.y)
    context.lineTo(aim.x, aim.y)
    context.stroke()
    context.restore()
  }

  for (const bulletId of listEntityIds(world.bullets)) {
    if (
      localPlayerId !== null &&
      world.bullets[bulletId]?.ownerId === localPlayerId
    ) {
      continue
    }

    const currentPosition = world.positions[bulletId]
    if (currentPosition === undefined) {
      continue
    }

    const position = interpolatePosition(
      currentPosition,
      previousPositions[bulletId],
      alpha
    )
    context.save()
    context.fillStyle = '#ffd166'
    context.shadowColor = '#ffd166'
    context.shadowBlur = 10
    context.beginPath()
    context.arc(position.x, position.y, world.radii[bulletId], 0, Math.PI * 2)
    context.fill()
    context.restore()
  }

  for (const bullet of predictedBullets) {
    context.save()
    context.fillStyle = '#ffd166'
    context.shadowColor = '#ffd166'
    context.shadowBlur = 10
    context.beginPath()
    context.arc(
      bullet.position.x,
      bullet.position.y,
      bullet.radius,
      0,
      Math.PI * 2
    )
    context.fill()
    context.restore()
  }

  for (const playerId of listEntityIds(world.players)) {
    const player = world.players[playerId]
    const currentPosition = world.positions[playerId]
    if (currentPosition === undefined) {
      continue
    }

    const position =
      playerId !== localPlayerId &&
      remoteInterpolatedPositions[playerId] !== undefined
        ? remoteInterpolatedPositions[playerId]
        : interpolatePosition(
            currentPosition,
            previousPositions[playerId],
            alpha
          )
    const healthRatio = world.health[playerId] / PLAYER_MAX_HEALTH

    context.save()
    context.fillStyle = player.color
    context.beginPath()
    context.arc(position.x, position.y, PLAYER_RADIUS, 0, Math.PI * 2)
    context.fill()

    context.lineWidth = playerId === localPlayerId ? 4 : 2
    context.strokeStyle =
      playerId === localPlayerId ? '#f8fafc' : 'rgba(255, 255, 255, 0.45)'
    context.stroke()

    context.fillStyle = 'rgba(15, 23, 42, 0.9)'
    context.fillRect(position.x - 18, position.y - 28, 36, 6)
    context.fillStyle = healthRatio > 0.35 ? '#80ed99' : '#ff7a59'
    context.fillRect(position.x - 18, position.y - 28, 36 * healthRatio, 6)
    context.restore()
  }

  context.save()
  context.fillStyle = 'rgba(248, 250, 252, 0.9)'
  context.font = '14px ui-monospace, SFMono-Regular, Menlo, monospace'
  context.fillText('WASD move', 20, 28)
  context.fillText('Mouse aim', 20, 48)
  context.fillText('Hold click shoot', 20, 68)
  if (localPlayerId === null) {
    context.fillText('Waiting for server...', 20, 96)
  }
  context.restore()
}
