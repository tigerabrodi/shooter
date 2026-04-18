# Netcode Core for Fast Multiplayer Games in TypeScript

This document explains a practical netcode core for fast multiplayer games in TypeScript. The exact transport can be a browser client plus a WebSocket server, but the structure works with any TypeScript stack. The important parts are the architecture and the data flow, not the specific framework.

The core model is this. Keep the simulation deterministic and shared. Let the server own the real world. Let the client predict its own movement so the game feels immediate. Let the server send snapshots with acknowledgements. Let the client reconcile from those snapshots. Interpolate remote players for smooth rendering. Rewind only for lag compensated shot checks. That is the backbone of most fast multiplayer shooters.

## The core rule

The client is never the source of truth. The client is allowed to predict, smooth, and show cosmetic effects early, but the server decides what really happened.

That means the server owns the real world state, the real tick loop, the real damage, and the real hit checks. The client owns local responsiveness and presentation.

## 1. Keep the simulation pure and deterministic

Your simulation should live in a shared layer that knows nothing about the DOM, sockets, wall clock time, or browser events. It should only know about plain data and pure rules. This is what makes client prediction and server authority possible. If the same world plus the same inputs produces different results on the client and server, the whole model breaks.

A good simulation entry point looks like this.

```ts
export function step(world: World, inputs: Array<PlayerInput> = []): World {
  applyInputsSystem(world, inputs)
  movementSystem(world)
  collisionSystem(world)
  damageSystem(world)
  despawnSystem(world)
  world.tick += 1
  return world
}
```

This function is small on purpose. The order is part of gameplay. Inputs happen first. Movement happens next. Collisions are resolved after movement. Damage and cleanup happen after that. If you change the order, you change the game.

The world itself is just data. Players, bullets, walls, health, positions, velocities, and the simulation tick all live in one serializable object.

### TDD tip

This part should be tested hard. Write tests first for world creation, entity spawning, deterministic stepping, movement, collision, damage, respawn, and every other pure rule. This is the best place for TDD because these tests are fast, stable, and extremely valuable.

Good tests here are things like:

- `createWorld returns an empty world`
- `same state plus same inputs gives the same result`
- `diagonal movement is normalized`
- `player overlapping a wall is pushed out correctly`
- `death sets respawn state correctly`

## 2. Inputs need both sequence and time

Every client input needs two different pieces of metadata.

`seq` tells you input order from one client. It answers the question, "Which input is newer."

`tick` tells you when the input belongs in the simulation. It answers the question, "When should this input apply."

Do not treat those as the same thing. Sequence is ordering. Tick is timing.

A useful input shape and network message shape looks like this.

```ts
type PlayerInput = {
  playerId: number
  seq: number
  up: boolean
  down: boolean
  left: boolean
  right: boolean
  sprint: boolean
  fire: boolean
  aimX: number
  aimY: number
}

type ClientInputMessage = {
  type: 'input'
  seq: number
  tick: number
  up?: boolean
  down?: boolean
  left?: boolean
  right?: boolean
  sprint?: boolean
  fire?: boolean
  aimX?: number
  aimY?: number
}
```

On the server, the queue stores both together.

```ts
type QueuedClientInput = {
  input: PlayerInput
  tick: number
}
```

That is the shape you want. The gameplay part of the input and the timing metadata are both explicit.

## 3. The server owns the real world

The server keeps one authoritative world and one client record per connection. It also keeps a history of past snapshots for lag compensation.

A useful server state shape looks like this.

```ts
type ServerClientState = {
  clientId: string
  playerId: number
  inputQueue: Array<QueuedClientInput>
  lastAppliedInput: PlayerInput | null
  lastAckedSeq: number
  latestQueuedSeq: number
  lastProcessedShotSeq: number
}

type ServerState = {
  world: World
  clients: Record<string, ServerClientState>
  history: Array<Snapshot>
  historyLimit: number
}
```

When the server receives input, it does not immediately mutate the world. It validates the input, rejects stale or duplicate sequences, rejects absurdly future ticks, and then queues the input.

```ts
export function enqueueClientInput({
  state,
  clientId,
  input,
}: {
  state: ServerState
  clientId: string
  input: QueuedClientInput
}): void {
  const client = state.clients[clientId]
  if (client === undefined) return

  if (input.input.seq <= client.lastAckedSeq) return
  if (input.input.seq <= client.latestQueuedSeq) return
  if (input.tick > state.world.tick + MAX_FUTURE_INPUT_TICKS) return

  client.latestQueuedSeq = input.input.seq
  client.inputQueue.push(input)
}
```

Then, on every server tick, the server looks at each client queue, sorts it by tick and sequence, and consumes only the inputs that are due for the current server tick. Future inputs stay queued. Older late inputs never cause the server to rewind the whole world. That is a crucial design rule. Movement is forward only on the server.

The server also keeps `lastAppliedInput`. That matters because movement is state, not a one frame event. If the player is holding right and no newer input arrives yet, the server should keep moving that player right.

## 4. Client prediction makes local movement feel immediate

If the client waited for the server round trip before moving, the game would feel delayed. The fix is client prediction.

The client reads local input, stores it in a pending input buffer, immediately runs the shared simulation locally, and also sends that same input to the server. This makes your own movement feel instant.

A simple pending input buffer looks like this.

```ts
export function createPredictionBuffer() {
  let inputs: Array<PlayerInput> = []
  let lastAckedSeq = 0

  return {
    addInput({ input }: { input: PlayerInput }) {
      if (input.seq <= lastAckedSeq) return
      inputs = [...inputs, input]
    },
    acknowledge({ ackedSeq }: { ackedSeq: number }) {
      lastAckedSeq = Math.max(lastAckedSeq, ackedSeq)
      inputs = inputs.filter((input) => input.seq > lastAckedSeq)
    },
    getUnackedInputs() {
      return inputs.filter((input) => input.seq > lastAckedSeq)
    },
  }
}
```

A client update loop usually uses it like this.

```ts
const input = inputController.getInput(localPlayerId)
const clientTick = localWorld.tick

predictionBuffer.addInput({ input })
step(localWorld, [input])

network.sendInput({
  input,
  tick: clientTick,
})
```

The idea is simple. Move now. Correct later if needed.

## 5. Acknowledgements and reconciliation keep the client honest

Prediction alone is not enough. The client will drift from the server because of latency, packet timing, and the fact that the server is authoritative. That is normal.

So each server snapshot includes `ackedSeq`. That means the server is saying, "I have processed your inputs up to this sequence number."

The client then reconciles in four steps.

1. Start from the authoritative server snapshot.
2. Drop every pending input whose `seq <= ackedSeq`.
3. Sort the remaining inputs by sequence.
4. Replay those remaining inputs on top of the authoritative world.

The reconciliation logic can stay pure and small.

```ts
export function reconcile({
  serverSnapshot,
  ackedSeq,
  pendingInputs,
}: {
  serverSnapshot: Snapshot
  ackedSeq: number
  pendingInputs: Array<PlayerInput>
}) {
  const world = deserializeWorld({ snapshot: serverSnapshot })
  const remainingInputs = [...pendingInputs]
    .filter((input) => input.seq > ackedSeq)
    .sort((a, b) => a.seq - b.seq)

  for (const input of remainingInputs) {
    step(world, [input])
  }

  return { world, remainingInputs }
}
```

This is the core correction loop for client side prediction. Prediction gives responsiveness. Reconciliation gives correctness.

### TDD tip

This is another great TDD target because it is pure logic. Write tests for empty buffers, partial acknowledgements, many pending inputs, out of order input buffers, and mismatched predicted state that must snap back to server truth and replay correctly.

## 6. Interpolate remote players for smooth rendering

Your own player uses prediction. Remote players usually should not. Remote players should be drawn from a small buffer of past snapshots and interpolated between them.

A common setup renders remote players about `100 ms` in the past. That sounds strange at first, but it is the standard tradeoff. You give up a tiny bit of visual freshness to gain much smoother motion.

A clean interpolation pass looks like this.

```ts
export function computeRemoteInterpolatedPositions({
  targetTime,
  timeline,
}: {
  targetTime: number
  timeline: Array<{ receivedAt: number; snapshot: Snapshot }>
}) {
  if (timeline.length === 0) return {}
  if (timeline.length === 1) return snapshotPositions(timeline[0].snapshot)

  for (let index = 0; index < timeline.length - 1; index += 1) {
    const earlier = timeline[index]
    const later = timeline[index + 1]

    if (targetTime > later.receivedAt) continue

    const alpha =
      (targetTime - earlier.receivedAt) /
      (later.receivedAt - earlier.receivedAt)

    return interpolateSnapshots({
      earlierSnapshot: earlier.snapshot,
      laterSnapshot: later.snapshot,
      alpha,
    })
  }

  return interpolateSnapshots({
    earlierSnapshot: timeline[timeline.length - 2].snapshot,
    laterSnapshot: timeline[timeline.length - 1].snapshot,
    alpha: 1,
  })
}
```

The important point is that interpolation is a rendering concern. It is not the same thing as gameplay correction. Do not mix those jobs.

### TDD tip

This part is pure too. Test the cases where the timeline is empty, has one snapshot, has a clean in between render time, and has a target time beyond the newest snapshot. This is exactly the kind of small math heavy logic that benefits from tests.

## 7. Rewind only for lag compensated shot checks

Late movement input should not rewind the server. Shots are different. For hitscan weapons, you usually want the server to evaluate the shot against the past state that the shooter actually saw.

That is lag compensation.

The server keeps a ring buffer of snapshots. When a shot arrives, it computes the allowed rewind target, rewinds to that past snapshot, traces the shot there, and then applies damage in the current authoritative world.

The history buffer can stay tiny and simple.

```ts
export function pushSnapshotToHistory({
  history,
  snapshot,
  limit,
}: {
  history: Array<Snapshot>
  snapshot: Snapshot
  limit: number
}) {
  const nextHistory = [...history, snapshot]
  return nextHistory.length <= limit
    ? nextHistory
    : nextHistory.slice(nextHistory.length - limit)
}
```

The actual rewind and trace logic should rewind to a past snapshot, trace against walls first, then trace against players, and return the closest valid hit. A server side shot handler can then use that result like this.

```ts
export function processClientShoot({
  state,
  clientId,
  shot,
}: {
  state: ServerState
  clientId: string
  shot: PlayerShot
}) {
  const client = state.clients[clientId]
  if (client === undefined) return null
  if (shot.seq <= client.lastProcessedShotSeq) return null

  client.lastProcessedShotSeq = shot.seq

  const shooter = state.world.players[client.playerId]
  const shooterPosition = state.world.positions[client.playerId]
  if (shooter === undefined || shooterPosition === undefined) return null
  if (shooter.needsRespawn || state.world.health[client.playerId] <= 0) return null
  if (shooter.fireCooldownTicks > 0) return null

  const minimumAllowedTick = state.world.tick - MAX_REWIND_TICKS
  const rewoundHistory = state.history.filter(
    (snapshot) => snapshot.tick >= minimumAllowedTick
  )
  const targetTick = Math.max(
    minimumAllowedTick,
    shot.tick - INTERPOLATION_DELAY_TICKS
  )

  const traceResult = traceShotInPast({
    aimX: shot.aimX,
    aimY: shot.aimY,
    currentSnapshot: serializeWorld({ world: state.world }),
    history: rewoundHistory,
    maxDistance: MAX_SHOT_DISTANCE,
    shooterId: client.playerId,
    targetTick,
  })

  shooter.fireCooldownTicks = FIRE_COOLDOWN_TICKS

  if (traceResult?.targetId !== null && traceResult !== null) {
    applyShotDamage({
      state,
      targetId: traceResult.targetId,
    })
  }

  return {
    shooterId: client.playerId,
    shotSeq: shot.seq,
    targetId: traceResult?.targetId ?? null,
  }
}
```

This is the right split. Forward only for movement. Controlled rewind only for shot validation.

### TDD tip

Lag compensation should be tested as pure logic. Write tests for rewind selection, wall blocking, max rewind limits, and hits that should land in the past but not in the current world. This is one of the most important pure modules to cover well.

## 8. Use dedicated shot events for weapons

In a real multiplayer shooter, shooting is usually better as a dedicated event than as a normal held movement flag. Movement is continuous state. Shooting is an action. Those are different shapes. A dedicated shot message can look like this.

```ts
type ClientShootMessage = {
  type: 'shoot'
  seq: number
  tick: number
  aimX: number
  aimY: number
}
```

That keeps weapon logic cleaner and avoids losing short fire pulses when network timing collapses multiple movement states together.

## 9. What to test with TDD and what to test manually

Use TDD where the code is pure and deterministic. That means your shared simulation, reconciliation, interpolation, lag compensation, and history buffer are all perfect TDD targets.

Do not force TDD equally hard on raw browser input capture, sockets, and rendering glue. Those still deserve tests, but they usually benefit more from targeted integration tests and manual verification.

If you want a practical rule, use TDD for any function where you can say, "Given this input data, I should get this exact output data." That is the sweet spot.

## 10. The most important mistakes to avoid

Do not rely on sequence numbers alone. You still need tick timing.

Do not rewind the whole server for late movement input. That is the wrong model for forward simulation.

Do not accept stale or duplicate input sequences. Reject them before they touch the queue.

Do not let the client apply real damage. The server must own that.

Do not interpolate the local player the same way as remote players. The local player should feel immediate.

Do not allow unlimited rewind for lag compensation. Always keep a max rewind policy.

## 11. What you would improve later for a larger production game

This is a strong core, but a larger game usually adds more sophistication. The biggest upgrades would be explicit clock sync between client and server, better latency estimation, compressed snapshots, delta snapshots, stronger anti cheat rules, better interest management, and more weapon specific lag compensation rules.

One common simplification in MVP implementations is that shot rewind is based on the client tick plus the render delay model, not a deeper clock sync layer. That is fine for learning and for small games, but larger games usually invest more in time sync.

## 12. The portable version of this architecture

If you want to reuse this in future multiplayer games, keep this exact mental model.

1. Build one shared deterministic sim.
2. Let the server own the real world.
3. Send ordered client input with both `seq` and `tick`.
4. Predict local movement immediately.
5. Ack processed input back from the server.
6. Reconcile from authoritative snapshots.
7. Interpolate remote players for rendering.
8. Rewind only for lag compensated events like hitscan shots.

The movement rules can change. The weapon rules can change. The art can change. The transport can change. But this core loop is the thing you keep.
