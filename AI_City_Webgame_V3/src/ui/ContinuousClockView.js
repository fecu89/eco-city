import { calendarAtElapsedDay, formatCalendarDate } from '../systems/CalendarSystem.js';

export function createContinuousClockView({
  timeElement,
  getElapsedDays,
  getProgress,
  onProgress = () => {},
  // 프레임마다 갱신할 것이 실제로 있을 때만 rAF 루프를 돌린다. 일시정지·0배속이거나
  // 진행 중인 공사가 없으면 날짜 라벨도 진행 배지도 프레임 사이에 변하지 않는다.
  shouldAnimate = () => true,
  requestFrame = globalThis.requestAnimationFrame?.bind(globalThis),
  cancelFrame = globalThis.cancelAnimationFrame?.bind(globalThis),
}) {
  let frameId = null;
  let running = false;
  let lastLabel = '';

  const render = () => {
    const tickProgress = Math.max(0, Math.min(1, Number(getProgress()) || 0));
    const visualElapsedDays = Math.max(0, getElapsedDays() + tickProgress);
    onProgress(tickProgress);
    const snapshot = calendarAtElapsedDay(visualElapsedDays);
    const label = formatCalendarDate(snapshot);
    if (label !== lastLabel) {
      timeElement.textContent = label;
      lastLabel = label;
    }
    return { visualElapsedDays, snapshot, label };
  };

  const schedule = () => {
    if (!running || frameId != null || !shouldAnimate()) return;
    frameId = requestFrame(loop);
  };

  function loop() {
    frameId = null;
    if (!running) return;
    render();
    schedule();
  }

  return {
    start() {
      if (running) return;
      running = true;
      render();
      schedule();
    },
    stop() {
      running = false;
      if (frameId != null) cancelFrame(frameId);
      frameId = null;
    },
    // 애니메이션 조건이 다시 참이 됐을 때(공사 시작, 재생, 모달 닫힘) 루프를 되살린다.
    resume: schedule,
    renderNow() {
      const result = render();
      schedule();
      return result;
    },
  };
}
