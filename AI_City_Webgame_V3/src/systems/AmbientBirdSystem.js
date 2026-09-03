import { CITY_AMBIENT } from '../core/Constants.js';

// 새 방문 사이 간격(BIRD_DELAY_MIN_MS~BIRD_DELAY_MAX_MS)·마리 수·지속 시간은 settings.json VISUAL.CITY_AMBIENT에 있다.
export function nextBirdDelay(random = Math.random) {
  const value = Math.max(0, Math.min(1, Number(random())));
  return Math.round(CITY_AMBIENT.BIRD_DELAY_MIN_MS + value * (CITY_AMBIENT.BIRD_DELAY_MAX_MS - CITY_AMBIENT.BIRD_DELAY_MIN_MS));
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
        // 최소 마리 수에 0~(풀 크기-최소) 마리를 무작위로 더한다.
        const extraBirds = CITY_AMBIENT.BIRD_POOL_SIZE - CITY_AMBIENT.BIRD_MIN_COUNT;
        const birdCount = CITY_AMBIENT.BIRD_MIN_COUNT + Math.min(extraBirds, Math.floor(random() * (extraBirds + 1)));
        onVisit({ flockId: 'shared-bird-flock', greenIndex, birdCount, durationMs: CITY_AMBIENT.BIRD_VISIT_MS });
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
