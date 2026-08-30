import { CITY_AMBIENT_MOTION } from '../core/Constants.js';

function unitInterval(value) {
  return Math.max(0, Math.min(1, Number(value) || 0));
}

export function nextAmbientDelay(random = Math.random) {
  const progress = unitInterval(random());
  const range = CITY_AMBIENT_MOTION.MAX_DELAY_MS - CITY_AMBIENT_MOTION.MIN_DELAY_MS;
  return Math.round(CITY_AMBIENT_MOTION.MIN_DELAY_MS + progress * range);
}

function nextDuration(random) {
  const progress = unitInterval(random());
  const range = CITY_AMBIENT_MOTION.MAX_DURATION_MS - CITY_AMBIENT_MOTION.MIN_DURATION_MS;
  return Math.round(CITY_AMBIENT_MOTION.MIN_DURATION_MS + progress * range);
}

function uniqueCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = Number(candidate?.cellIndex);
    if (!candidate || candidate.type === 'green' || !Number.isInteger(key) || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function pickCandidate(candidates, random) {
  const index = Math.min(candidates.length - 1, Math.floor(unitInterval(random()) * candidates.length));
  return candidates.splice(index, 1)[0];
}

export function createAmbientMotionController({
  random = Math.random,
  getCandidates,
  onStart,
  onStop = () => {},
  setTimer = globalThis.setTimeout.bind(globalThis),
  clearTimer = globalThis.clearTimeout.bind(globalThis),
}) {
  const pauses = new Set();
  const active = new Map();
  let running = false;
  let timerId = null;
  let effectSequence = 0;

  const cancelTimer = () => {
    if (timerId == null) return;
    clearTimer(timerId);
    timerId = null;
  };

  const schedule = () => {
    if (!running || pauses.size || active.size || timerId != null) return;
    timerId = setTimer(() => {
      const completedTimer = timerId;
      timerId = null;
      clearTimer(completedTimer);
      const candidates = uniqueCandidates(getCandidates?.() ?? []);
      if (!candidates.length) {
        schedule();
        return;
      }
      const maxBatch = Math.min(CITY_AMBIENT_MOTION.MAX_ACTIVE_EFFECTS, candidates.length);
      const batchSize = 1 + Math.min(maxBatch - 1, Math.floor(unitInterval(random()) * maxBatch));
      for (let index = 0; index < batchSize; index += 1) {
        const candidate = pickCandidate(candidates, random);
        const effect = {
          id: `city-ambient-${++effectSequence}`,
          ...candidate,
          durationMs: nextDuration(random),
        };
        active.set(effect.id, effect);
        onStart?.(effect);
      }
    }, nextAmbientDelay(random));
  };

  const stopActive = () => {
    active.forEach((effect) => onStop(effect));
    active.clear();
  };

  return {
    start() {
      running = true;
      schedule();
    },
    complete(id) {
      active.delete(id);
      schedule();
    },
    pause(reason) {
      pauses.add(reason);
      cancelTimer();
      stopActive();
    },
    resume(reason) {
      pauses.delete(reason);
      schedule();
    },
    dispose() {
      running = false;
      cancelTimer();
      stopActive();
      pauses.clear();
    },
    getState() {
      return {
        running,
        paused: pauses.size > 0,
        activeCount: active.size,
        scheduled: timerId != null,
      };
    },
  };
}
