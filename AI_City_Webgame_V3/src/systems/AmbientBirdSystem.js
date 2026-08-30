export function nextBirdDelay(random = Math.random) {
  const value = Math.max(0, Math.min(1, Number(random())));
  return Math.round(10000 + value * 20000);
}

export function createBirdVisitController({
  random = Math.random,
  getGreenIndices,
  onVisit,
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
}) {
  const pauses = new Set();
  let running = false;
  let timerId = null;
  const cancel = () => {
    if (timerId == null) return;
    clearTimer(timerId);
    timerId = null;
  };
  const schedule = () => {
    if (!running || pauses.size || timerId != null) return;
    timerId = setTimer(() => {
      const completed = timerId;
      timerId = null;
      clearTimer(completed);
      const greens = getGreenIndices();
      if (greens.length) {
        const greenIndex = greens[Math.min(greens.length - 1, Math.floor(random() * greens.length))];
        const birdCount = 2 + Math.min(1, Math.floor(random() * 2));
        onVisit({ flockId: 'shared-bird-flock', greenIndex, birdCount, durationMs: 2000 });
      }
      schedule();
    }, nextBirdDelay(random));
  };
  return {
    start() { running = true; schedule(); },
    pause(reason) { pauses.add(reason); cancel(); },
    resume(reason) { pauses.delete(reason); schedule(); },
    dispose() { running = false; cancel(); pauses.clear(); },
    getState() { return { running, paused: pauses.size > 0, scheduled: timerId != null }; },
  };
}
