import { eventBus, Events } from '../core/EventBus.js';
import { RESEARCH_RULES } from '../core/Constants.js';

// 특정 모달에 속하지 않는 범용 이벤트→토스트/효과음 연결.
export function initFeedbackBridge() {
  eventBus.on(Events.QUEST_READY, ({ quest }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '퀘스트 완료 조건 달성',
      text: `${quest.index}. ${quest.title} · 퀘스트 메뉴에서 보상을 받을 수 있습니다.`,
      priority: true,
    });
    eventBus.emit(Events.AUDIO_SFX, { name: 'correct' });
  });

  eventBus.on(Events.QUEST_STARTED, ({ quest }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '새 퀘스트 시작',
      text: `${quest.index}. ${quest.title} · 퀘스트 메뉴에서 목표를 확인하세요.`,
      priority: true,
    });
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

  eventBus.on(Events.BOARD_EXPANDED, ({ settled }) => {
    if (!settled) eventBus.emit(Events.TOAST_SHOW, { title: '저탄소 부지 확장', text: '육각 반경 2 → 3 · 새 대지 18칸 확보' });
  });

  eventBus.on(Events.RESEARCH_COMPLETED, ({ researchId }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '연구 완료',
      text: `${researchId} 기술을 도시 시설 강화에 사용할 수 있습니다.`,
      priority: true,
    });
    eventBus.emit(Events.AUDIO_SFX, { name: 'correct' });
  });

  eventBus.on(Events.RESEARCH_ACCELERATED, ({ appliedJobs, bankedHours }) => {
    eventBus.emit(Events.TOAST_SHOW, {
      title: '퀴즈 연구 가속',
      text: appliedJobs.length
        ? `활성 연구 ${appliedJobs.length}개를 각각 ${RESEARCH_RULES.QUIZ_ACCELERATION_HOURS}시간 단축했습니다.`
        : `${bankedHours}시간을 다음 연구에 적립했습니다.`,
    });
  });
}
