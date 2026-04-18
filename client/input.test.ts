import { describe, expect, test } from 'vitest'

import { createInputController } from './input.ts'

class MockEventTarget extends EventTarget {
  hidden = false
}

function createKeyboardEvent(type: 'keydown' | 'keyup', key: string): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'key', {
    configurable: true,
    value: key,
  })
  return event
}

function createPointerEvent(
  type: 'pointerdown' | 'pointermove' | 'pointerup',
  { clientX, clientY }: { clientX: number; clientY: number }
): Event {
  const event = new Event(type, { bubbles: true, cancelable: true })
  Object.defineProperty(event, 'clientX', {
    configurable: true,
    value: clientX,
  })
  Object.defineProperty(event, 'clientY', {
    configurable: true,
    value: clientY,
  })
  return event
}

function createCanvas(): HTMLCanvasElement {
  const canvas = new EventTarget() as HTMLCanvasElement
  canvas.width = 800
  canvas.height = 600
  canvas.getBoundingClientRect = () =>
    ({
      bottom: 600,
      height: 600,
      left: 0,
      right: 800,
      top: 0,
      width: 800,
      x: 0,
      y: 0,
      toJSON() {
        return {}
      },
    }) as DOMRect

  return canvas
}

describe('input controller', () => {
  test('blur clears stuck movement and sprint state', () => {
    const canvas = createCanvas()
    const windowTarget = new MockEventTarget()
    const documentTarget = new MockEventTarget()
    const controller = createInputController(canvas, {
      documentTarget,
      windowTarget,
    })

    windowTarget.dispatchEvent(createKeyboardEvent('keydown', 'w'))
    windowTarget.dispatchEvent(createKeyboardEvent('keydown', 'Shift'))

    expect(controller.getInput(1)).toMatchObject({
      sprint: true,
      up: true,
    })

    windowTarget.dispatchEvent(new Event('blur'))

    expect(controller.getInput(1)).toMatchObject({
      down: false,
      left: false,
      right: false,
      sprint: false,
      up: false,
    })

    controller.destroy()
  })

  test('visibility change clears stuck firing and movement when tab becomes hidden', () => {
    const canvas = createCanvas()
    const windowTarget = new MockEventTarget()
    const documentTarget = new MockEventTarget()
    const controller = createInputController(canvas, {
      documentTarget,
      windowTarget,
    })

    windowTarget.dispatchEvent(createKeyboardEvent('keydown', 'd'))
    canvas.dispatchEvent(
      createPointerEvent('pointerdown', { clientX: 320, clientY: 240 })
    )

    expect(controller.getInput(1)).toMatchObject({
      fire: true,
      right: true,
    })

    documentTarget.hidden = true
    documentTarget.dispatchEvent(new Event('visibilitychange'))

    expect(controller.getInput(1)).toMatchObject({
      fire: false,
      right: false,
    })
    expect(controller.isFiring()).toBe(false)

    controller.destroy()
  })
})
