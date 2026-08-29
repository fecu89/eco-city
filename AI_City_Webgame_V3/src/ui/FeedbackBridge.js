import { eventBus, Events } from '../core/EventBus.js';

// 특정 모달에 속하지 않는 범용 이벤트→토스트/효과음 연결.
export function initFeedbackBridge() {
  eventBus.on(Events.BADGE_UNLOCKED, ({ badge }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '성취 해금',
      text: `${badge.icon} ${badge.name}`,
      priority: true,
    });
    eventBus.emit(Events.AUDIO_SFX, { name: 'badge' });
  });

  eventBus.on(Events.DIAGNOSIS_TILE_FOUND, ({ isProblem }) => {
    eventBus.emit(Events.AUDIO_SFX, { name: isProblem ? 'problem-found' : 'tile-ok' });
  });

  eventBus.on(Events.DIAGNOSIS_COMPLETE, ({ noHints }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '진단 완료',
      text: noHints ? '힌트 없이 모든 문제를 찾았습니다!' : '문제 지점을 모두 확인했습니다.',
    });
  });

  eventBus.on(Events.EVIDENCE_SAVED, ({ good, entry }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: good ? '근거 기록' : '근거 보완 필요',
      text: `${entry.facility} ↔ ${entry.conceptLabel}`,
    });
  });

  eventBus.on(Events.REFLECTION_SAVED, () => {
    eventBus.emit(Events.TOAST_SHOW, { title: '성찰 저널 저장됨', text: '' });
  });

  eventBus.on(Events.BOARD_EXPANDED, ({ settled }) => {
    if (!settled) eventBus.emit(Events.TOAST_SHOW, { title: '영토 확장 + 재설계 예산', text: '5×5 → 6×6 · +11칸 · Lv.3 해금' });
  });
}
