interface GameLoopOptions {
  render: (alpha: number) => void
  tickRate: number
  update: () => void
}

export function startGameLoop({
  render,
  tickRate,
  update,
}: GameLoopOptions): () => void {
  const stepMs = 1000 / tickRate

  let animationFrameId = 0
  let accumulator = 0
  let previousTime = performance.now()

  function frame(currentTime: number): void {
    const frameTime = Math.min(currentTime - previousTime, 250)
    previousTime = currentTime
    accumulator += frameTime

    while (accumulator >= stepMs) {
      update()
      accumulator -= stepMs
    }

    render(accumulator / stepMs)
    animationFrameId = window.requestAnimationFrame(frame)
  }

  animationFrameId = window.requestAnimationFrame(frame)

  return () => window.cancelAnimationFrame(animationFrameId)
}
