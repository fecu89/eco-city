import { ADVISOR_ANSWERS, ADVISOR_PROMPT_LABELS, AI_BLIND_SUGGESTION_ORDER, FACILITIES, STAGES } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { placeFacility } from './BoardSystem.js';

function transcriptBucket() {
  if (gameState.stage === STAGES.EXECUTION) return 'execution';
  if (gameState.stage === STAGES.REDESIGN) return 'redesign';
  return null;
}

export function defaultAdvisorTopic() {
  return gameState.stage >= STAGES.REDESIGN ? 'rethink' : 'score';
}

export function ask(type = 'score') {
  gameState.advisorQuestions++;
  const question = ADVISOR_PROMPT_LABELS[type] || '도시 전략?';
  const bank = ADVISOR_ANSWERS[type] || ADVISOR_ANSWERS.score;
  const answer = bank[(gameState.advisorQuestions - 1) % bank.length];

  const bucket = transcriptBucket();
  if (bucket) gameState.logTranscript(bucket, question, answer);

  eventBus.emit(Events.ADVISOR_ASKED, { type, question, answer });
  return { question, answer };
}

// 1단계: "AI 말대로 짓기" — 항상 성장점수 관점의 정답만 제시해, 숨은 비용은 알려주지 않는
// 지도안의 핵심 함정("AI는 물어본 것만 답한다")을 재현한다.
export function blindBuild() {
  if (gameState.stage !== STAGES.EXECUTION) return { ok: false, reason: 'wrong_stage' };
  const emptyIndex = gameState.grid.findIndex((c) => c === null);
  if (emptyIndex === -1) return { ok: false, reason: 'grid_full' };
  const affordable = AI_BLIND_SUGGESTION_ORDER.find((key) => FACILITIES[key].cost <= gameState.credits);
  if (!affordable) return { ok: false, reason: 'insufficient_credits' };

  gameState.selectedFacility = affordable;
  const result = placeFacility(emptyIndex);
  if (result.ok) {
    gameState.advisorQuestions++;
    const f = FACILITIES[affordable];
    gameState.logTranscript(
      'execution',
      '시설을 어떻게 배치하면 점수가 오르나요?',
      `${f.name}을(를) 지어보세요. (+${f.dev} 발전점수)`
    );
    eventBus.emit(Events.ADVISOR_BLIND_BUILD, { key: affordable, index: emptyIndex, facility: f });
  }
  return { ...result, key: affordable, index: emptyIndex };
}
