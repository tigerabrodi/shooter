import type { PlayerInput } from '@shared/types.ts'

export interface CreatePredictionBufferOptions {
  maxSize?: number
}

export interface AddPredictionInputOptions {
  input: PlayerInput
}

export interface AcknowledgePredictionOptions {
  ackedSeq: number
}

export interface PredictionBuffer {
  acknowledge: (options: AcknowledgePredictionOptions) => void
  addInput: (options: AddPredictionInputOptions) => void
  getUnackedInputs: () => Array<PlayerInput>
  reset: () => void
}

const DEFAULT_MAX_SIZE = 120

export function createPredictionBuffer({
  maxSize = DEFAULT_MAX_SIZE,
}: CreatePredictionBufferOptions): PredictionBuffer {
  let inputs: Array<PlayerInput> = []
  let lastAckedSeq = 0

  function trimToMaxSize(): void {
    if (inputs.length <= maxSize) {
      return
    }

    inputs = inputs.slice(inputs.length - maxSize)
  }

  return {
    acknowledge({ ackedSeq }) {
      lastAckedSeq = Math.max(lastAckedSeq, ackedSeq)
      inputs = inputs.filter((input) => input.seq > lastAckedSeq)
    },
    addInput({ input }) {
      if (input.seq <= lastAckedSeq) {
        return
      }

      inputs = [...inputs, input]
      trimToMaxSize()
    },
    getUnackedInputs() {
      return inputs.filter((input) => input.seq > lastAckedSeq)
    },
    reset() {
      inputs = []
      lastAckedSeq = 0
    },
  }
}
