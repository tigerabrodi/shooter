# Multiplayer shooter build plan

A detailed, phased plan for building a 2D top-down multiplayer shooter from scratch. Hand-rolled Gambetta-style netcode. TDD where pure, manual testing where not.

---

## On TDD (read first)

When this doc says "TDD" it means:

1. **Write the test first.** The test references code that does not exist yet.
2. **Run the test.** See it fail. This is important. A test that cannot fail cannot prove anything.
3. **Write the minimum code to make the test pass.** No extra features. No speculative abstractions.
4. **Run the test.** See it pass.
5. **Refactor.** Clean up the code if needed. Tests still pass.
6. **Repeat with the next failing test.**

Do NOT skip step 2. "Seeing the test fail" is the whole point. It proves the test actually exercises the code. If you write the test after the code, you never know if the test would catch a regression.

When this doc says "manual test" it means run it, look at it, judge with your eyes. Not everything is unit-testable and that's fine.

---

## Scope (MVP)

Playable multiplayer top-down shooter. Minimum features:

- Players join by opening a URL. Each gets a random-color circle.
- Move with WASD.
- Aim with mouse, click to shoot.
- Bullets damage players.
- Static rectangular walls block players and stop bullets.
- Death at 0 HP, respawn at random location with full health.
- 2 to 8 players per session.
- Local server. Deploy later.

**Explicitly out of scope for MVP:**

- Authentication, accounts, persistence.
- Player-vs-player collision (they pass through each other).
- Character selection, names.
- Multiple weapons, reloading, cooldowns beyond basic fire rate.
- Sprites, animations, sound effects.
- Spatial partitioning (naive O(n²) collision is fine for MVP).
- Particle effects, screen shake, "juice."
- Mobile support.

Ship the skeleton first. Polish after.

---

## Tech stack (locked in)

- **Language:** TypeScript.
- **Client build:** Vite.
- **Client runtime:** plain browser, HTML canvas.
- **Server runtime:** Bun.
- **Server WebSocket:** Bun's built-in WebSocket (no external library).
- **Tests:** Vitest.
- **Network mocking (tests only):** MSW.
- **Package manager:** Bun.
- **Deployment (later):** Railway for the server. Vercel or Netlify for the client build.

### Why each choice

- **TypeScript:** shared types between client and server is the main win.
- **Vite:** fastest dev loop for the client.
- **Bun:** fast, has WebSocket built in, runs TypeScript natively.
- **Vitest:** Jest-compatible, works with TypeScript out of the box.
- **MSW:** gold standard for mocking fetch and WebSocket in tests. Runs in Node (CI) and browsers.

### Docs

- [Bun WebSocket](https://bun.sh/docs/api/websockets)
- [Vite](https://vite.dev/guide/)
- [Vitest](https://vitest.dev/)
- [MSW WebSocket mocking](https://mswjs.io/docs/websocket/)
- [Canvas 2D context](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D)

---

## Folder structure

```
/shooter
  /shared              # pure, deterministic code. No DOM, no sockets, no clocks.
    types.ts           # EntityId, Input, Snapshot, all shared types
    constants.ts       # TICK_RATE, DT, MAP_SIZE, PLAYER_SPEED, etc.
    world.ts           # World definition, createWorld(), destroyEntity()
    step.ts            # step() function, orchestrates systems
    systems/
      input.ts         # applyInputsSystem
      movement.ts      # movementSystem
      collision.ts     # collisionSystem
      damage.ts        # damageSystem
      despawn.ts       # despawnSystem
    reconcile.ts       # client-side reconciliation (pure)
    interpolate.ts     # entity interpolation (pure)
    lagcomp.ts         # server-side lag compensation (pure)
    snapshot.ts        # serialize/deserialize world to snapshot

  /client
    index.ts           # entry point, wires everything
    gameLoop.ts        # fixed timestep loop with render interpolation
    input.ts           # keyboard + mouse capture
    network.ts         # WebSocket wrapper, send inputs, receive snapshots
    prediction.ts      # local prediction buffer, calls reconcile
    render.ts          # canvas drawing
    index.html

  /server
    index.ts           # entry point, starts tick loop + WebSocket server
    server.ts          # tick loop, input queue per client, broadcast
    history.ts         # ring buffer of past snapshots for lag comp
    connections.ts     # client registry, disconnect handling

  /tests
    # Test files live next to the code they test (e.g. shared/step.test.ts)
    # This folder is for integration tests that cross module boundaries.
    integration.test.ts

  package.json
  tsconfig.json
  vitest.config.ts
  Dockerfile           # for Railway deploy later
```

**The golden rule:** `/shared` imports nothing from `/client` or `/server`. It is the pure simulation. Both sides import from it.

---

## Phase 0: Project setup (no tests yet, just scaffolding)

**Goal:** empty project that compiles and runs.

Steps:

1. `bun init` in a new folder.
2. `bun add -d typescript vitest @vitest/ui vite msw`
3. Set up `tsconfig.json` with strict mode on.
4. Set up `vitest.config.ts`.
5. Create folder structure from above (empty files are fine).
6. `bun run` command in `package.json` for server, `vite` command for client.
7. Commit.

**Acceptance:** `bun run dev:server` starts (even if it does nothing). `bun run dev:client` serves a blank page. `bun run test` runs Vitest with zero tests.

---

## Phase 1: The pure sim (TDD hard here)

**Goal:** a deterministic sim that runs single-player with no network.

All code in `/shared` and `/client`. No server, no sockets. Every piece of sim code is TDD'd.

### 1.1 Types and world

**TDD:** write `shared/world.test.ts` first.

Tests to write (see fail, then implement):

```typescript
// world.test.ts
test('createWorld returns an empty world')
test('spawnPlayer adds position, velocity, health, player components')
test('spawnPlayer assigns unique entity IDs')
test('destroyEntity removes all components for that entity')
test('destroyEntity on non-existent entity does nothing')
```

Then implement `shared/types.ts`, `shared/world.ts`.

Do not add `spawnBullet` yet. Only what the tests demand.

### 1.2 The step function skeleton

**TDD:** write `shared/step.test.ts`.

```typescript
test('step increments world.tick by 1')
test('step with no entities does nothing')
test('step is deterministic: same state + same inputs = same output')
```

For the determinism test: create a world, call step 100 times, record final state. Create a second identical world, do the same, assert deep equality.

Implement `step.ts` as an empty function that just increments tick. Tests pass.

### 1.3 Movement system

**TDD:** write `shared/systems/movement.test.ts`.

```typescript
test('entity with position and velocity moves by velocity * dt each tick')
test('entity with only position does not move')
test('entity with only velocity does nothing')
test('negative velocity moves entity backward')
test('zero velocity keeps entity stationary')
```

Implement `systems/movement.ts`. Wire it into `step()`.

### 1.4 Input system

**TDD:** write `shared/systems/input.test.ts`.

```typescript
test('WASD input sets velocity toward that direction')
test('no input sets velocity to zero')
test('opposing inputs cancel (W+S = no vertical movement)')
test('diagonal input is normalized (W+D does not move faster than W alone)')
```

Implement `systems/input.ts`. Wire into `step()`.

### 1.5 Client single-player prototype

Now without tests, just make it work in the browser:

1. `client/gameLoop.ts`: fixed timestep loop. See [Fix Your Timestep](https://gafferongames.com/post/fix_your_timestep/).
2. `client/input.ts`: capture WASD and mouse.
3. `client/render.ts`: draw a circle at player position on canvas.
4. `client/index.ts`: create a world, spawn one player, wire input → sim → render.

**Acceptance:** open the browser, press WASD, the circle moves. Smooth at any refresh rate (render interpolation). Runs at 60 Hz sim rate.

### 1.6 Walls and collision

**TDD:** write `shared/systems/collision.test.ts`.

```typescript
test('circle does not overlap with a wall it is not touching')
test('circle overlapping wall gets pushed to the boundary')
test('circle moving into a wall stops at the boundary')
test('circle between two walls does not get stuck')  // edge case
```

Implement `systems/collision.ts`. The algorithm is "push circle out of overlapping rect along the shortest axis." For each player, for each wall, check overlap, resolve.

Wire into `step()` AFTER movement (movement first, then resolve collisions).

In the client, add some walls to the world on init. Test manually: circle bumps into walls.

### 1.7 Shooting and bullets

**TDD:** write tests for bullet spawning and bullet movement.

```typescript
test('spawnBullet creates entity with position, velocity, bullet components')
test('fire input spawns a bullet at player position with velocity in aim direction')
test('bullet position updates each tick by velocity * dt')
test('fire input on cooldown does not spawn a bullet')
```

Implement bullet component, `spawnBullet`, fire logic in input system.

Wire into client: click mouse, bullet appears, travels in aim direction.

### 1.8 Damage and death

**TDD:** write `shared/systems/damage.test.ts`.

```typescript
test('bullet overlapping a player reduces player health')
test('bullet is marked for despawn after hitting a player')
test('bullet does not damage its own owner')
test('player health does not go below zero')
test('player with 0 health is marked for respawn')
```

Implement `systems/damage.ts` and `systems/despawn.ts`.

Respawn logic: on death, move player to a random spawn point, restore full health.

Wire into client. Manually test: shoot yourself (temporarily allow self-damage), die, respawn.

### 1.9 End of Phase 1 acceptance

Single-player prototype in the browser:

- Move with WASD.
- Aim with mouse.
- Click to shoot bullets.
- Bullets travel, hit walls and despawn.
- Walls block player movement.
- Sim runs deterministically at 60 Hz.
- Render smooth on any refresh rate.
- All sim logic has unit tests. Run `bun run test`, see green.

No network code exists yet. This is intentional.

---

## Phase 2: Reconciliation and interpolation (still pure)

**Goal:** implement the pure logic for prediction reconciliation and entity interpolation. Still no sockets.

### 2.1 Reconciliation

**TDD:** write `shared/reconcile.test.ts`.

```typescript
test('reconcile with empty buffer and matching server state keeps state unchanged')
test('reconcile with buffer of 1 unacked input replays that input on top of server state')
test('reconcile with buffer of N inputs replays them in sequence order')
test('reconcile drops acked inputs from buffer')
test('reconcile handles case where server seq is ahead of all buffered inputs')
test('reconcile with mismatched prediction snaps to server state then replays')
```

Implement `reconcile.ts`. Signature roughly:

```typescript
function reconcile(
  serverSnapshot: Snapshot,
  ackedSeq: number,
  pendingInputs: Input[]
): { world: World, remainingInputs: Input[] }
```

Pure function. Pass in a snapshot and inputs, get back a reconciled world and the inputs still unacked. No state stored in the function.

### 2.2 Interpolation

**TDD:** write `shared/interpolate.test.ts`.

```typescript
test('interpolate at alpha=0 returns positions from earlier snapshot')
test('interpolate at alpha=1 returns positions from later snapshot')
test('interpolate at alpha=0.5 returns halfway between')
test('interpolate handles entity that exists in earlier but not later (despawned)')
test('interpolate handles entity that exists in later but not earlier (spawned)')
test('interpolate linear between two positions is exact')
```

Implement `interpolate.ts`. Pure function. Given two snapshots and an alpha (0-1), return interpolated positions for all entities.

### 2.3 Snapshot serialization

**TDD:** write `shared/snapshot.test.ts`.

```typescript
test('serialize world returns a plain object')
test('deserialize reverses serialize (round-trip)')
test('snapshot includes tick number')
test('snapshot includes all relevant components')
```

Implement `snapshot.ts`. For MVP just JSON-serialize the world. Optimize later.

### 2.4 Lag compensation (for later, but skeleton)

**TDD:** write `shared/lagcomp.test.ts`.

```typescript
test('rewindToTick returns the snapshot from history at that tick')
test('rewindToTick clamps to oldest snapshot if tick is too old')
test('rewindToTick returns current state if tick is in the future')
test('checkShotInPast uses rewound positions, not current')
```

Implement `lagcomp.ts`. Keep it simple: a function that takes a history of snapshots and a target tick, returns the appropriate past state to run hit detection against.

### 2.5 End of Phase 2 acceptance

All pure network-related logic implemented and tested. Still no sockets. Run tests, all green.

---

## Phase 3: The server

**Goal:** Bun server that runs a tick loop, accepts WebSocket connections, broadcasts snapshots.

### 3.1 Server tick loop

**TDD:** write `server/server.test.ts` for the pure parts.

```typescript
test('server tick loop advances tick counter')
test('server applies queued inputs in sequence order per client')
test('server clears input queue each tick')
test('server builds a snapshot after each tick')
test('server adds snapshots to history buffer up to N entries')
```

Implement `server/server.ts`. Just pure tick logic, no sockets yet.

### 3.2 WebSocket integration

This is the glue. Harder to test cleanly. Do a combination:

- Use Bun's `Bun.serve` with `websocket` handler.
- Parse incoming messages, push to per-client input queue.
- Send snapshots to all connected clients on broadcast interval.
- Handle connect and disconnect.

**Manual test:** run the server, connect to it with a browser console:

```javascript
const ws = new WebSocket('ws://localhost:8080')
ws.onmessage = (e) => console.log('server sent:', e.data)
ws.send(JSON.stringify({ type: 'input', seq: 1, tick: 0, keys: { right: true } }))
```

You should see snapshots arriving in the console. Not a proper test but confirms the wiring works.

### 3.3 Spawn and despawn on connect and disconnect

- On connect: spawn a player entity, assign random color, send initial snapshot.
- On disconnect: remove the player entity from the world.

Manual test: open two browser tabs, see both players in the world, close one, see the other player's entity disappear.

### 3.4 End of Phase 3 acceptance

Server runs, accepts connections, processes inputs, broadcasts snapshots. No client code consumes it yet (that's Phase 4). Manually verified with browser console.

---

## Phase 4: The client network layer

**Goal:** client sends inputs, receives snapshots, hands them off to reconciliation and interpolation.

### 4.1 Network adapter

**TDD with MSW:** write `client/network.test.ts`.

```typescript
// Use MSW to intercept WebSocket
test('network sends input as JSON over WebSocket')
test('network fires snapshot callback when server sends a snapshot')
test('network retries connection on disconnect')
test('network emits disconnect event when socket closes')
test('network handles malformed JSON gracefully')
```

MSW setup: create a `ws.link('ws://localhost:8080')` in test setup, use `addEventListener('connection', ...)` to simulate server behavior.

See [MSW WebSocket docs](https://mswjs.io/docs/websocket/) for exact syntax.

Implement `client/network.ts`. A small class or object that wraps `new WebSocket(url)` and exposes:

```typescript
interface Network {
  send(input: Input): void
  onSnapshot(cb: (snap: Snapshot) => void): void
  onDisconnect(cb: () => void): void
}
```

### 4.2 Prediction buffer

**TDD:** write `client/prediction.test.ts`.

```typescript
test('adding an input appends to buffer')
test('receiving a server ack clears acked inputs from buffer')
test('buffer caps at N inputs and drops oldest')  // safety
test('getUnackedInputs returns inputs after the last acked seq')
```

Implement `client/prediction.ts`. This is the client-side state that holds unacked inputs and feeds into reconciliation.

### 4.3 Wire it all together

Back in `client/index.ts`:

1. Open network connection.
2. On input: apply locally (prediction), send over network, add to buffer.
3. On snapshot: call reconcile, update local world, update interpolation buffers for remote players.
4. Render loop reads local world for own player, reads interpolated remote player positions.

This is integration work. Test manually with two browser tabs.

### 4.4 Lag simulation

Write `client/lagSim.ts`. Wraps the network's `send` and snapshot dispatch with configurable delay and packet drop rate.

```typescript
function createLagSim(network: Network, latencyMs: number, dropRate: number): Network
```

Add UI sliders for latency and drop rate in dev mode. Toggle them to feel the difference with prediction on/off.

**Manual test:** set latency to 150ms, drop rate to 5%. Move around. Should feel instant locally. Other player smooth but slightly behind.

### 4.5 Entity interpolation for remote players

In the render loop, for the local player use the predicted world. For remote players, use `interpolate(snapA, snapB, alpha)` where alpha is based on the render time offset behind the latest snapshot.

Set interpolation delay to ~100ms.

**Manual test:** two browser tabs. Tab A moves. Tab B sees smooth motion with small delay. Toggle interpolation off (render latest snapshot directly) and watch it stutter. Contrast is the proof.

### 4.6 End of Phase 4 acceptance

- Two browser tabs playing together.
- Moving feels instant (prediction working).
- Other players move smoothly (interpolation working).
- Under 150ms simulated lag, game still feels responsive.
- Reconciliation runs when server disagrees with prediction. Visible as small, rare corrections.
- No rubber-banding under normal conditions.

Shooting still broken at this point (no lag comp yet). That's Phase 5.

---

## Phase 5: Shooting with lag compensation

**Goal:** shots register honestly against what the shooter saw.

### 5.1 Client sends shot events

When player clicks, client sends a `shoot` event with:

- Sequence number.
- Tick number (client's current tick).
- Aim direction.

Client still spawns a local bullet for visual feedback (prediction). Server will confirm or correct.

### 5.2 Server rewinds for hit detection

**TDD:** tests for lag comp already written in Phase 2.4. Now wire them up.

On `shoot` event server-side:

1. Look up the rewound world state for `shot.tick - interpolationDelayTicks`.
2. Raycast in that rewound world (bullet path through enemies).
3. If hit: apply damage in current state. Mark the bullet as confirmed.
4. Broadcast the hit event to all clients.

### 5.3 Handling rejected shots

If the server says "no hit" but the client predicted a hit: the local bullet despawns without doing damage. The client's predicted health of the target was wrong and will be corrected on next reconciliation.

Edge case: client predicts a kill, plays death animation, then server says "no kill." Don't play killed state until server confirms. Prediction should only be visual/cosmetic for high-stakes events like death.

### 5.4 End of Phase 5 acceptance

- Shooting feels fair. Aiming on target = hit.
- High-ping players (simulated 200ms) can still aim and hit honestly.
- Occasional "shot around corner" from the victim's perspective. Accepted tradeoff.

---

## Phase 6: Polish (only after Phase 5 works)

Anything below this line is juice, not skeleton.

- Hit flashes on damage.
- Muzzle flash on fire.
- Bullet trails.
- Player name floating above head.
- HP bar.
- Death cam (brief pause on death).
- Screen shake on hit.
- Sound effects.
- Better visuals (sprites, colors, background grid).
- Multiple weapon types.
- Scoreboard.

Ship polish incrementally. Each item is a day or two.

---

## Phase 7: Deploy (optional, after MVP is fun locally)

### 7.1 Server on Railway

1. Write a `Dockerfile` using `oven/bun` image.
2. Expose the WebSocket port.
3. Connect your GitHub repo to Railway.
4. Railway auto-deploys on push.
5. Get the public URL (something like `wss://your-project.up.railway.app`).

Cost estimate: $5/month base + a few cents of usage at your scale.

See [Railway docs](https://docs.railway.com/).

### 7.2 Client on Vercel or Netlify

1. Client is static after Vite builds it. `bun run build` produces a `dist/` folder.
2. Deploy `dist/` to Vercel or Netlify. Both are free for this scale.
3. Environment variable: `VITE_WS_URL=wss://your-project.up.railway.app`.
4. Client reads that at build time and connects.

### 7.3 End of Phase 7 acceptance

Share a URL with a friend. They open it, you open it, you're in the same game. No local setup required.

---

## Anti-patterns to watch for

- **Writing sim code that calls `Date.now()` or `performance.now()`.** Breaks determinism. Use tick numbers.
- **Importing DOM, WebSocket, or browser APIs into `/shared`.** `/shared` is pure. No exceptions.
- **Testing the renderer.** Don't. Eyeball it.
- **Mocking your own pure functions.** If a function is pure, call it directly in tests. No mocks needed.
- **Writing tests after implementation.** That's not TDD. The whole point is the test guides the design.
- **Premature optimization.** No quadtree, no binary protocols, no delta snapshots in MVP. Naive JSON and O(n²) is fine.
- **Skipping the "see the test fail" step.** A test you never saw fail can't be trusted.

---

## Daily rhythm while building

1. Start the day by running all tests. Green baseline.
2. Pick the next item from the current phase.
3. Write a failing test.
4. Run it, see it fail.
5. Write code until it passes.
6. Run all tests, still green.
7. Refactor if needed.
8. Commit.
9. Repeat.

At the end of each phase, run the whole thing manually. Play it. See it work. Judge with your eyes. If it doesn't feel right, note what's wrong and address in the next phase.

---

## Reference links

- [Gabriel Gambetta, Fast-Paced Multiplayer](https://gabrielgambetta.com/client-server-game-architecture.html) — the canonical netcode articles.
- [Gaffer On Games](https://gafferongames.com/) — deeper netcode, especially "Fix Your Timestep" and "What Every Programmer Needs to Know About Game Networking."
- [Overwatch Gameplay Architecture and Netcode (GDC 2017)](https://www.youtube.com/watch?v=W3aieHjyNvw) — one hour, worth it.
- [Bun docs](https://bun.sh/docs) — runtime and WebSocket API.
- [Vite guide](https://vite.dev/guide/) — client bundler.
- [Vitest](https://vitest.dev/) — test runner.
- [MSW WebSocket mocking](https://mswjs.io/docs/websocket/) — the only mocking library you need.
- [Canvas 2D API](https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D) — for rendering.
- [Railway docs](https://docs.railway.com/) — deployment.

---

## Final thoughts

The goal is not the game. The goal is to deeply understand how multiplayer games work by building one from scratch.

Cut scope aggressively. MVP first. Polish last.

Write tests first, watch them fail, then make them pass. That discipline is what separates code that works from code that works for the right reasons.

Deploy when it's fun locally, not before. Local iteration is 10x faster than deploy-and-refresh.

You got this.
