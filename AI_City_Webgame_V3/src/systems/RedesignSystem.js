import { EVIDENCE_MATCHES, EVIDENCE_MIN_LENGTH, FACILITIES, STAGES } from '../core/Constants.js';
import { gameState } from '../core/GameState.js';
import { eventBus, Events } from '../core/EventBus.js';
import { calcMetrics } from './BoardSystem.js';
import { setStage } from './StageSystem.js';

export function saveEvidence(conceptValue, conceptLabel, reasonText) {
  if (gameState.stage !== STAGES.REDESIGN) return { ok: false, reason: 'wrong_stage' };
  if (gameState.selectedCell == null || !gameState.grid[gameState.selectedCell]) {
    return { ok: false, reason: 'no_facility_selected' };
  }
  const reason = (reasonText || '').trim();
  if (!conceptValue || reason.length < EVIDENCE_MIN_LENGTH) return { ok: false, reason: 'too_short' };

  const cell = gameState.grid[gameState.selectedCell];
  const good = (EVIDENCE_MATCHES[cell.type] || []).includes(conceptValue);
  const entry = {
    cell: gameState.selectedCell + 1,
    facility: FACILITIES[cell.type].name,
    level: cell.level,
    concept: conceptValue,
    conceptLabel,
    reason,
    good,
  };
  gameState.evidence.push(entry);
  eventBus.emit(Events.EVIDENCE_SAVED, { entry, good });
  return { ok: true, good };
}

export function evaluateRedesign() {
  const m = calcMetrics(gameState.grid, gameState.gridSize);
  gameState.metrics = m;
  const b = gameState.baseline;
  const good = gameState.evidence.filter((e) => e.good).length;
  const checks = [
    { label: '전력수지', ok: m.balance >= 0, text: `${m.balance}` },
    { label: '탄소', ok: m.carbon < b.carbon || m.carbon <= 10, text: `${b.carbon}→${m.carbon}` },
    { label: '냉각·물', ok: m.water < b.water || m.water <= 12, text: `${b.water}→${m.water}` },
    { label: '인접 설계', ok: m.synergyLinks >= 2, text: `연결 ${m.synergyLinks}개` },
    { label: '과학 근거', ok: good >= 3, text: `인정 ${good}개` },
    { label: '도시 기능', ok: m.dev >= Math.max(28, b.dev * 0.72), text: `${b.dev}→${m.dev}` },
  ];
  const passed = checks.filter((c) => c.ok).length;
  const allPassed = passed === checks.length;
  eventBus.emit(Events.REDESIGN_VALIDATED, { checks, allPassed, passed, total: checks.length, metrics: m });
  return { checks, allPassed, passed, total: checks.length, metrics: m };
}

export function confirmRedesignResult(allPassed) {
  if (allPassed) setStage(STAGES.REPORT);
}
