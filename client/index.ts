import {
  DEFAULT_WALL_LAYOUT,
  MAP_HEIGHT,
  MAP_WIDTH,
  TICK_RATE,
} from '@shared/constants.ts'
import { interpolateSnapshots } from '@shared/interpolate.ts'
import { reconcile } from '@shared/reconcile.ts'
import { step } from '@shared/step.ts'
import type { Snapshot, Vector2, World } from '@shared/types.ts'
import { createWorld, spawnWall } from '@shared/world.ts'

import { startGameLoop } from './gameLoop.ts'
import { createInputController } from './input.ts'
import { createLagSim, type LagSimConfig } from './lagSim.ts'
import { createNetwork } from './network.ts'
import { createPredictionBuffer } from './prediction.ts'
import { renderGame, snapshotPositions } from './render.ts'

interface TimedSnapshot {
  receivedAt: number
  snapshot: Snapshot
}

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
      getSnapshotTimeline: () => Array<{ receivedAt: number; tick: number }>
      getWorld: () => World
    }
  }
}

const INTERPOLATION_DELAY_MS = 100
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

function computeRemoteInterpolatedPositions({
  timeline,
  interpolationEnabled,
}: {
  timeline: Array<TimedSnapshot>
  interpolationEnabled: boolean
}): Record<number, Vector2> {
  if (!interpolationEnabled || timeline.length === 0) {
    return {}
  }

  const targetTime = performance.now() - INTERPOLATION_DELAY_MS

  while (timeline.length >= 2 && timeline[1].receivedAt <= targetTime) {
    timeline.shift()
  }

  if (timeline.length === 1) {
    return snapshotPositions(timeline[0].snapshot)
  }

  const earlier = timeline[0]
  const later = timeline[1]
  const timeSpan = later.receivedAt - earlier.receivedAt

  if (timeSpan <= 0) {
    return snapshotPositions(later.snapshot)
  }

  return interpolateSnapshots({
    earlierSnapshot: earlier.snapshot,
    laterSnapshot: later.snapshot,
    alpha: (targetTime - earlier.receivedAt) / timeSpan,
  })
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
let snapshotTimeline: Array<TimedSnapshot> = []

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
  snapshotTimeline = []
  predictionBuffer.reset()
  previousPositions = snapshotPositions(localWorld)
  updateHud()
})

network.onSnapshot((message) => {
  const receivedAt = performance.now()
  const hasPlayerChanged = localPlayerId !== message.playerId

  if (hasPlayerChanged) {
    localPlayerId = message.playerId
    predictionBuffer.reset()
    snapshotTimeline = []
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

setupDevControls()

const stopLoop = startGameLoop({
  tickRate: TICK_RATE,
  update() {
    previousPositions = snapshotPositions(localWorld)

    if (!isConnected || localPlayerId === null) {
      updateHud()
      return
    }

    const input = inputController.getInput(localPlayerId)
    const clientTick = localWorld.tick

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
    renderGame({
      aim: inputController.getAim(),
      alpha,
      context,
      localPlayerId,
      remoteInterpolatedPositions: computeRemoteInterpolatedPositions({
        timeline: snapshotTimeline,
        interpolationEnabled: netToggleState.interpolationEnabled,
      }),
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
