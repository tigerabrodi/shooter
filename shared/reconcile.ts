import { deserializeWorld } from '@shared/snapshot.ts'
import { step } from '@shared/step.ts'
import type {
  PlayerInput,
  ReconcileOptions,
  ReconcileResult,
} from '@shared/types.ts'

function sortInputsBySequence(inputs: Array<PlayerInput>): Array<PlayerInput> {
  return [...inputs].sort(
    (firstInput, secondInput) => firstInput.seq - secondInput.seq
  )
}

export function reconcile({
  serverSnapshot,
  ackedSeq,
  pendingInputs,
}: ReconcileOptions): ReconcileResult {
  const world = deserializeWorld({ snapshot: serverSnapshot })
  const remainingInputs = sortInputsBySequence(
    pendingInputs.filter((input) => input.seq > ackedSeq)
  )

  for (const input of remainingInputs) {
    step(world, [input])
  }

  return {
    world,
    remainingInputs,
  }
}
