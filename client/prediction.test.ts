import { describe, expect, test } from 'vitest'

import type { PlayerInput } from '@shared/types.ts'

import { createPredictionBuffer } from './prediction.ts'

function makeInput(
  seq: number,
  overrides: Partial<Omit<PlayerInput, 'playerId' | 'seq'>> = {}
): PlayerInput {
  return {
    playerId: 1,
    seq,
    up: overrides.up ?? false,
    down: overrides.down ?? false,
    left: overrides.left ?? false,
    right: overrides.right ?? false,
    fire: overrides.fire ?? false,
    aimX: overrides.aimX ?? 0,
    aimY: overrides.aimY ?? 0,
  }
}

describe('prediction buffer', () => {
  test('adding an input appends to buffer', () => {
    const buffer = createPredictionBuffer({})

    buffer.addInput({ input: makeInput(1) })

    expect(buffer.getUnackedInputs()).toEqual([makeInput(1)])
  })

  test('receiving a server ack clears acked inputs from buffer', () => {
    const buffer = createPredictionBuffer({})

    buffer.addInput({ input: makeInput(1) })
    buffer.addInput({ input: makeInput(2) })
    buffer.addInput({ input: makeInput(3) })

    buffer.acknowledge({ ackedSeq: 2 })

    expect(buffer.getUnackedInputs()).toEqual([makeInput(3)])
  })

  test('buffer caps at N inputs and drops oldest', () => {
    const buffer = createPredictionBuffer({ maxSize: 2 })

    buffer.addInput({ input: makeInput(1) })
    buffer.addInput({ input: makeInput(2) })
    buffer.addInput({ input: makeInput(3) })

    expect(buffer.getUnackedInputs()).toEqual([makeInput(2), makeInput(3)])
  })

  test('getUnackedInputs returns inputs after the last acked seq', () => {
    const buffer = createPredictionBuffer({})

    buffer.addInput({ input: makeInput(1) })
    buffer.addInput({ input: makeInput(2) })
    buffer.addInput({ input: makeInput(3) })
    buffer.acknowledge({ ackedSeq: 1 })

    expect(buffer.getUnackedInputs()).toEqual([makeInput(2), makeInput(3)])
  })
})
