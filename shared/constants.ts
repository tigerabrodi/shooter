export const TICK_RATE = 60
export const DT = 1 / TICK_RATE
export const INTERPOLATION_DELAY_MS = 100
export const INTERPOLATION_DELAY_TICKS = Math.round(
  (TICK_RATE * INTERPOLATION_DELAY_MS) / 1000
)
export const MAX_REWIND_TICKS = 12

export const MAP_WIDTH = 800
export const MAP_HEIGHT = 600

export const PLAYER_RADIUS = 16
export const PLAYER_SPEED = 180
export const PLAYER_MAX_HEALTH = 100

export const BULLET_RADIUS = 4
export const BULLET_SPEED = 480
export const BULLET_DAMAGE = 25
export const FIRE_COOLDOWN_TICKS = 10
export const MAX_SHOT_DISTANCE = Math.hypot(MAP_WIDTH, MAP_HEIGHT)

export const DEFAULT_RANDOM_SEED = 1337

export const PLAYER_COLORS = [
  '#ff7a59',
  '#4cc9f0',
  '#ffd166',
  '#80ed99',
  '#f28482',
  '#c77dff',
] as const

export const SPAWN_POINTS = [
  { x: 120, y: 120 },
  { x: 680, y: 120 },
  { x: 120, y: 480 },
  { x: 680, y: 480 },
  { x: 400, y: 140 },
  { x: 400, y: 460 },
] as const

export const DEFAULT_WALL_LAYOUT = [
  { x: 0, y: 0, width: MAP_WIDTH, height: 24 },
  { x: 0, y: MAP_HEIGHT - 24, width: MAP_WIDTH, height: 24 },
  { x: 0, y: 0, width: 24, height: MAP_HEIGHT },
  { x: MAP_WIDTH - 24, y: 0, width: 24, height: MAP_HEIGHT },
  { x: 180, y: 140, width: 140, height: 24 },
  { x: 180, y: 164, width: 24, height: 160 },
  { x: 500, y: 180, width: 120, height: 24 },
  { x: 596, y: 204, width: 24, height: 160 },
  { x: 320, y: 360, width: 160, height: 24 },
] as const
