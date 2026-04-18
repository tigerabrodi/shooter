import {
  DEFAULT_WALL_LAYOUT,
  FIRE_COOLDOWN_TICKS,
  INTERPOLATION_DELAY_MS,
  MAP_HEIGHT,
  MAP_WIDTH,
  TICK_RATE,
} from '@shared/constants.ts'
import { reconcile } from '@shared/reconcile.ts'
import { step } from '@shared/step.ts'
import type { Snapshot, World } from '@shared/types.ts'
import { createWorld, spawnWall } from '@shared/world.ts'

import { startGameLoop } from './gameLoop.ts'
import { createInputController } from './input.ts'
import { createLagSim, type LagSimConfig } from './lagSim.ts'
import { createNetwork } from './network.ts'
import { createPredictionBuffer } from './prediction.ts'
import {
  computeRemoteInterpolatedPositions,
  type TimedSnapshot,
} from './remoteInterpolation.ts'
import { renderGame, snapshotPositions } from './render.ts'
import {
  createShotTracer,
  createShotTracerFromWorld,
  hasShotTracer,
  stepShotTracers,
  type ShotTracer,
} from './shotTracers.ts'

interface NetToggleState {
  interpolationEnabled: boolean
  predictionEnabled: boolean
}

declare global {
  interface Window {
    __shooterDebug?: {
      getLagConfig: () => LagSimConfig
      getLocalPlayerId: () => number | null
      getNetworkState: () => {
        connected: boolean
        interpolationEnabled: boolean
        predictionEnabled: boolean
      }
      getShotTracerCount: () => number
      getSnapshotTimeline: () => Array<{ receivedAt: number; tick: number }>
      getWorld: () => World
    }
  }
}

const MAX_SNAPSHOT_TIMELINE = 20

const canvas = document.querySelector<HTMLCanvasElement>('#game')
const hud = document.querySelector<HTMLDivElement>('#hud')
const devControls = document.querySelector<HTMLDivElement>('#dev-controls')
const latencyInput = document.querySelector<HTMLInputElement>('#latency')
const latencyValue = document.querySelector<HTMLSpanElement>('#latency-value')
const dropRateInput = document.querySelector<HTMLInputElement>('#drop-rate')
const dropRateValue =
  document.querySelector<HTMLSpanElement>('#drop-rate-value')
const predictionToggle = document.querySelector<HTMLInputElement>(
  '#prediction-enabled'
)
const interpolationToggle = document.querySelector<HTMLInputElement>(
  '#interpolation-enabled'
)

if (canvas === null) {
  throw new Error('Missing canvas element')
}

const context = canvas.getContext('2d')
if (context === null) {
  throw new Error('Missing 2D rendering context')
}

canvas.width = MAP_WIDTH
canvas.height = MAP_HEIGHT

function createPlaceholderWorld(): World {
  const world = createWorld({})

  for (const wall of DEFAULT_WALL_LAYOUT) {
    spawnWall(world, wall)
  }

  return world
}

function buildServerUrl(): string {
  const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws'
  return `${protocol}://${window.location.hostname}:8080/ws`
}

function trimSnapshotTimeline({
  timeline,
}: {
  timeline: Array<TimedSnapshot>
}): Array<TimedSnapshot> {
  if (timeline.length <= MAX_SNAPSHOT_TIMELINE) {
    return timeline
  }

  return timeline.slice(timeline.length - MAX_SNAPSHOT_TIMELINE)
}

function formatDropRate(dropRate: number): string {
  return `${Math.round(dropRate * 100)}%`
}

function syncRangeValueLabels({
  lagSimConfig,
}: {
  lagSimConfig: LagSimConfig
}): void {
  if (latencyValue !== null) {
    latencyValue.textContent = `${lagSimConfig.latencyMs} ms`
  }

  if (dropRateValue !== null) {
    dropRateValue.textContent = formatDropRate(lagSimConfig.dropRate)
  }
}

let localWorld = createPlaceholderWorld()
let localPlayerId: number | null = null
let previousPositions = snapshotPositions(localWorld)
let latestServerSnapshot: Snapshot | null = null
let lastServerAckedSeq = 0
let isConnected = false
let localShotCooldownTicks = 0
let nextShotSequence = 1
let snapshotTimeline: Array<TimedSnapshot> = []
let shotTracers: Array<ShotTracer> = []

const lagSimConfig: LagSimConfig = {
  latencyMs: 0,
  dropRate: 0,
}
const netToggleState: NetToggleState = {
  interpolationEnabled: true,
  predictionEnabled: true,
}

const inputController = createInputController(canvas)
const predictionBuffer = createPredictionBuffer({})
const baseNetwork = createNetwork({
  url: buildServerUrl(),
})
const network = createLagSim({
  config: lagSimConfig,
  network: baseNetwork,
})

function applyAuthoritativeState(): void {
  if (latestServerSnapshot === null) {
    return
  }

  const pendingInputs = netToggleState.predictionEnabled
    ? predictionBuffer.getUnackedInputs()
    : []
  const { world } = reconcile({
    serverSnapshot: latestServerSnapshot,
    ackedSeq: lastServerAckedSeq,
    pendingInputs,
  })

  localWorld = world
  previousPositions = snapshotPositions(localWorld)
}

function updateHud(): void {
  if (hud === null) {
    return
  }

  const status = isConnected ? 'Connected' : 'Waiting for server'
  const pendingInputs = predictionBuffer.getUnackedInputs().length
  const health =
    localPlayerId === null
      ? 'n/a'
      : String(localWorld.health[localPlayerId] ?? 0)

  hud.textContent =
    `${status}. Tick ${localWorld.tick}. HP ${health}. Pending ${pendingInputs}. ` +
    `Lag ${lagSimConfig.latencyMs} ms. Drop ${formatDropRate(lagSimConfig.dropRate)}. ` +
    `Prediction ${netToggleState.predictionEnabled ? 'on' : 'off'}. ` +
    `Interpolation ${netToggleState.interpolationEnabled ? 'on' : 'off'}.`
}

function syncPredictionMode(): void {
  predictionBuffer.reset()
  applyAuthoritativeState()
  updateHud()
}

function setupDevControls(): void {
  if (!import.meta.env.DEV) {
    return
  }

  if (
    devControls === null ||
    latencyInput === null ||
    dropRateInput === null ||
    predictionToggle === null ||
    interpolationToggle === null
  ) {
    return
  }

  devControls.hidden = false
  latencyInput.value = String(lagSimConfig.latencyMs)
  dropRateInput.value = String(Math.round(lagSimConfig.dropRate * 100))
  predictionToggle.checked = netToggleState.predictionEnabled
  interpolationToggle.checked = netToggleState.interpolationEnabled
  syncRangeValueLabels({ lagSimConfig })

  latencyInput.addEventListener('input', () => {
    lagSimConfig.latencyMs = Number(latencyInput.value)
    syncRangeValueLabels({ lagSimConfig })
    updateHud()
  })

  dropRateInput.addEventListener('input', () => {
    lagSimConfig.dropRate = Number(dropRateInput.value) / 100
    syncRangeValueLabels({ lagSimConfig })
    updateHud()
  })

  predictionToggle.addEventListener('change', () => {
    netToggleState.predictionEnabled = predictionToggle.checked
    syncPredictionMode()
  })

  interpolationToggle.addEventListener('change', () => {
    netToggleState.interpolationEnabled = interpolationToggle.checked
    updateHud()
  })
}

window.__shooterDebug = {
  getLagConfig: () => ({ ...lagSimConfig }),
  getLocalPlayerId: () => localPlayerId,
  getNetworkState: () => ({
    connected: isConnected,
    interpolationEnabled: netToggleState.interpolationEnabled,
    predictionEnabled: netToggleState.predictionEnabled,
  }),
  getShotTracerCount: () => shotTracers.length,
  getSnapshotTimeline: () =>
    snapshotTimeline.map((entry) => ({
      receivedAt: entry.receivedAt,
      tick: entry.snapshot.tick,
    })),
  getWorld: () => structuredClone(localWorld),
}

network.onDisconnect(() => {
  isConnected = false
  localPlayerId = null
  latestServerSnapshot = null
  lastServerAckedSeq = 0
  localShotCooldownTicks = 0
  nextShotSequence = 1
  snapshotTimeline = []
  shotTracers = []
  predictionBuffer.reset()
  previousPositions = snapshotPositions(localWorld)
  updateHud()
})

network.onSnapshot((message) => {
  const receivedAt = performance.now()
  const hasPlayerChanged = localPlayerId !== message.playerId

  if (hasPlayerChanged) {
    localPlayerId = message.playerId
    localShotCooldownTicks = 0
    nextShotSequence = 1
    predictionBuffer.reset()
    snapshotTimeline = []
    shotTracers = []
  }

  isConnected = true
  latestServerSnapshot = message.snapshot
  lastServerAckedSeq = message.ackedSeq
  predictionBuffer.acknowledge({ ackedSeq: message.ackedSeq })
  snapshotTimeline = trimSnapshotTimeline({
    timeline: [...snapshotTimeline, { receivedAt, snapshot: message.snapshot }],
  })
  applyAuthoritativeState()
  updateHud()
})

network.onShot((message) => {
  const tracerKey = `${message.shooterId}:${message.shotSeq}`

  if (message.shooterId === localPlayerId) {
    return
  }

  if (hasShotTracer({ key: tracerKey, tracers: shotTracers })) {
    return
  }

  shotTracers = [
    ...shotTracers,
    createShotTracer({
      endX: message.endX,
      endY: message.endY,
      key: tracerKey,
      startX: message.originX,
      startY: message.originY,
    }),
  ]
})

setupDevControls()

const stopLoop = startGameLoop({
  tickRate: TICK_RATE,
  update() {
    previousPositions = snapshotPositions(localWorld)
    shotTracers = stepShotTracers({
      tracers: shotTracers,
    })

    if (!isConnected || localPlayerId === null) {
      updateHud()
      return
    }

    localShotCooldownTicks = Math.max(0, localShotCooldownTicks - 1)

    const input = inputController.getInput(localPlayerId)
    input.fire = false
    const clientTick = localWorld.tick
    const aim = inputController.getAim()
    const playerPosition = localWorld.positions[localPlayerId]

    if (
      inputController.isFiring() &&
      localShotCooldownTicks === 0 &&
      playerPosition !== undefined
    ) {
      const shotSeq = nextShotSequence++
      const localTracer = createShotTracerFromWorld({
        aimX: aim.x,
        aimY: aim.y,
        key: `${localPlayerId}:${shotSeq}`,
        shooterId: localPlayerId,
        world: localWorld,
      })

      if (localTracer !== null) {
        shotTracers = [...shotTracers, localTracer]
      }

      localShotCooldownTicks = FIRE_COOLDOWN_TICKS
      network.sendShoot({
        aimX: aim.x,
        aimY: aim.y,
        seq: shotSeq,
        tick: clientTick,
      })
    }

    if (netToggleState.predictionEnabled) {
      predictionBuffer.addInput({ input })
      step(localWorld, [input])
    }

    network.sendInput({
      input,
      tick: clientTick,
    })
    updateHud()
  },
  render(alpha) {
    const aim = inputController.getAim()

    renderGame({
      aim,
      alpha,
      context,
      localPlayerId,
      remoteInterpolatedPositions: netToggleState.interpolationEnabled
        ? computeRemoteInterpolatedPositions({
            targetTime: performance.now() - INTERPOLATION_DELAY_MS,
            timeline: snapshotTimeline,
          })
        : {},
      shotTracers,
      previousPositions,
      world: localWorld,
    })
  },
})

updateHud()

window.addEventListener('beforeunload', () => {
  stopLoop()
  inputController.destroy()
  network.close()
})
