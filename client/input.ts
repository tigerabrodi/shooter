import type { PlayerInput, Vector2 } from '@shared/types.ts'

type MovementKey = 'up' | 'down' | 'left' | 'right'

interface EventTargetLike {
  addEventListener: EventTarget['addEventListener']
  removeEventListener: EventTarget['removeEventListener']
}

interface VisibilityTargetLike extends EventTargetLike {
  hidden?: boolean
}

interface InputController {
  destroy: () => void
  getAim: () => Vector2
  getInput: (playerId: number) => PlayerInput
  isFiring: () => boolean
}

interface CreateInputControllerOptions {
  documentTarget?: VisibilityTargetLike
  windowTarget?: EventTargetLike
}

const KEY_BINDINGS: Record<string, MovementKey> = {
  w: 'up',
  ArrowUp: 'up',
  s: 'down',
  ArrowDown: 'down',
  a: 'left',
  ArrowLeft: 'left',
  d: 'right',
  ArrowRight: 'right',
}

export function createInputController(
  canvas: HTMLCanvasElement,
  {
    documentTarget = document,
    windowTarget = window,
  }: CreateInputControllerOptions = {}
): InputController {
  const movementState = {
    up: false,
    down: false,
    left: false,
    right: false,
  }

  let isFiring = false
  let isSprinting = false
  let nextSequence = 1
  let aim: Vector2 = {
    x: canvas.width / 2,
    y: canvas.height / 2,
  }

  function resetInputState(): void {
    movementState.up = false
    movementState.down = false
    movementState.left = false
    movementState.right = false
    isFiring = false
    isSprinting = false
  }

  function updateAim(clientX: number, clientY: number): void {
    const rect = canvas.getBoundingClientRect()
    aim = {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function onKeyDown(event: Event): void {
    const keyboardEvent = event as KeyboardEvent

    if (keyboardEvent.key === 'Shift') {
      isSprinting = true
      keyboardEvent.preventDefault()
      return
    }

    const binding = KEY_BINDINGS[keyboardEvent.key]
    if (binding === undefined) {
      return
    }

    movementState[binding] = true
    keyboardEvent.preventDefault()
  }

  function onKeyUp(event: Event): void {
    const keyboardEvent = event as KeyboardEvent

    if (keyboardEvent.key === 'Shift') {
      isSprinting = false
      keyboardEvent.preventDefault()
      return
    }

    const binding = KEY_BINDINGS[keyboardEvent.key]
    if (binding === undefined) {
      return
    }

    movementState[binding] = false
    keyboardEvent.preventDefault()
  }

  function onPointerMove(event: PointerEvent): void {
    updateAim(event.clientX, event.clientY)
  }

  function onPointerDown(event: PointerEvent): void {
    updateAim(event.clientX, event.clientY)
    isFiring = true
  }

  function onPointerUp(): void {
    isFiring = false
  }

  function onContextMenu(event: MouseEvent): void {
    event.preventDefault()
  }

  function onBlur(): void {
    resetInputState()
  }

  function onVisibilityChange(): void {
    if (documentTarget.hidden !== true) {
      return
    }

    resetInputState()
  }

  windowTarget.addEventListener('keydown', onKeyDown)
  windowTarget.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  windowTarget.addEventListener('pointerup', onPointerUp)
  windowTarget.addEventListener('blur', onBlur)
  documentTarget.addEventListener('visibilitychange', onVisibilityChange)
  canvas.addEventListener('contextmenu', onContextMenu)

  return {
    destroy() {
      windowTarget.removeEventListener('keydown', onKeyDown)
      windowTarget.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      windowTarget.removeEventListener('pointerup', onPointerUp)
      windowTarget.removeEventListener('blur', onBlur)
      documentTarget.removeEventListener('visibilitychange', onVisibilityChange)
      canvas.removeEventListener('contextmenu', onContextMenu)
    },
    getAim() {
      return { ...aim }
    },
    getInput(playerId) {
      return {
        playerId,
        seq: nextSequence++,
        up: movementState.up,
        down: movementState.down,
        left: movementState.left,
        right: movementState.right,
        sprint: isSprinting,
        fire: isFiring,
        aimX: aim.x,
        aimY: aim.y,
      }
    },
    isFiring() {
      return isFiring
    },
  }
}
