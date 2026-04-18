import type { PlayerInput, Vector2 } from '@shared/types.ts'

type MovementKey = 'up' | 'down' | 'left' | 'right'

interface InputController {
  destroy: () => void
  getAim: () => Vector2
  getInput: (playerId: number) => PlayerInput
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
  canvas: HTMLCanvasElement
): InputController {
  const movementState = {
    up: false,
    down: false,
    left: false,
    right: false,
  }

  let isFiring = false
  let nextSequence = 1
  let aim: Vector2 = {
    x: canvas.width / 2,
    y: canvas.height / 2,
  }

  function updateAim(clientX: number, clientY: number): void {
    const rect = canvas.getBoundingClientRect()
    aim = {
      x: ((clientX - rect.left) / rect.width) * canvas.width,
      y: ((clientY - rect.top) / rect.height) * canvas.height,
    }
  }

  function onKeyDown(event: KeyboardEvent): void {
    const binding = KEY_BINDINGS[event.key]
    if (binding === undefined) {
      return
    }

    movementState[binding] = true
    event.preventDefault()
  }

  function onKeyUp(event: KeyboardEvent): void {
    const binding = KEY_BINDINGS[event.key]
    if (binding === undefined) {
      return
    }

    movementState[binding] = false
    event.preventDefault()
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

  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('keyup', onKeyUp)
  canvas.addEventListener('pointermove', onPointerMove)
  canvas.addEventListener('pointerdown', onPointerDown)
  window.addEventListener('pointerup', onPointerUp)
  canvas.addEventListener('contextmenu', onContextMenu)

  return {
    destroy() {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerUp)
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
        fire: isFiring,
        aimX: aim.x,
        aimY: aim.y,
      }
    },
  }
}
