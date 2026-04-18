# shooter

a small top down multiplayer shooter built to learn fast game netcode in a practical way.

the goal of this project is not polish first. the goal is to understand the core multiplayer architecture clearly and build it by hand in typescript.

## what this project focuses on

- pure deterministic sim. the same shared game rules run on client and server.
- server authority. the server owns the real world state and the real outcomes.
- client prediction. local movement feels immediate instead of waiting on ping.
- input `seq` plus `tick`. input order and simulation timing are both explicit.
- acked input flow. the server tells the client which inputs were really processed.
- reconciliation. the client reapplies only the inputs the server has not confirmed yet.
- remote interpolation. other players render smoothly instead of snapping.
- snapshot history buffer. recent past world states are kept for rewind.
- lag compensation. shots are checked against the past state the shooter likely saw.
- max rewind limit. very old shots are not honored forever.
- authoritative shooting. the server decides the real hit and damage.
- wall aware hitscan. shots stop on cover before hitting players behind it.
- stale and duplicate input rejection. old packets do not get to corrupt state.
- forward only movement on server. late movement input does not rewind the world.

## current status

the local multiplayer core works. movement, walls, shooting, health, respawn, prediction, reconciliation, interpolation, and lag compensation are all in place.

this is a learning first implementation. it is a strong base for future multiplayer games, but it is still an mvp and not a production hardened shooter stack.

## run locally

```bash
bun run dev:server
bun run dev:client
```

then open the client in the browser. use multiple tabs to test multiplayer locally.

## useful commands

```bash
bun run format
bun run lint
bun run tsc
bun run test
```

## docs

- [PLAN.md](./PLAN.md). original phased build plan.
- [docs/netcode-core.md](./docs/netcode-core.md). standalone writeup of the core netcode architecture.
