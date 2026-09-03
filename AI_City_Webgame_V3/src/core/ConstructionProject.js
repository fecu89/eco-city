// GameState(core)가 로드마다 저장된 공사 정보를 방어적으로 보정할 때 쓰는 순수 헬퍼들이다.
// core가 systems를 import하는 계층 역전을 없애려고 이 파일로 옮겼다.
// systems/ConstructionProjectSystem.js가 그대로 다시 export하므로 다른 import는 바뀌지 않는다.
import { CONSTRUCTION, FACILITIES } from './Constants.js';
import { roundCredits } from './Money.js';

export function constructionDurationDays(type) {
  return CONSTRUCTION.BUILD_DAYS[type] ?? null;
}

export function upgradeDurationDays(fromLevel) {
  return CONSTRUCTION.UPGRADE_DAYS[Math.trunc(Number(fromLevel))] ?? null;
}

export function isBuildProject(cell) {
  return cell?.project?.kind === 'build';
}

export function isOperationalCell(cell) {
  return Boolean(cell) && !isBuildProject(cell);
}

export function normalizeConstructionProject(cell, rawProject) {
  if (rawProject == null) return { valid: true, complete: false, project: null };
  const kind = rawProject?.kind;
  const paidCost = Number(rawProject?.paidCost);
  const elapsedDays = Number(rawProject?.elapsedDays);
  const durationDays = Number(rawProject?.durationDays);
  const commonValid = ['build', 'upgrade'].includes(kind)
    && Number.isFinite(paidCost)
    && paidCost >= 0
    && Number.isInteger(elapsedDays)
    && elapsedDays >= 0
    && Number.isInteger(durationDays)
    && durationDays > 0;
  if (!commonValid) return { valid: false, kind };

  if (kind === 'build') {
    const expectedDuration = constructionDurationDays(cell?.type);
    if (!expectedDuration || durationDays !== expectedDuration) return { valid: false, kind };
    return {
      valid: true,
      complete: elapsedDays >= durationDays,
      project: {
        kind,
        elapsedDays: Math.min(elapsedDays, durationDays),
        durationDays,
        paidCost: roundCredits(paidCost),
      },
    };
  }

  const fromLevel = Number(rawProject?.fromLevel);
  const toLevel = Number(rawProject?.toLevel);
  const expectedDuration = upgradeDurationDays(fromLevel);
  const validUpgrade = Number.isInteger(fromLevel)
    && Number.isInteger(toLevel)
    && fromLevel === Number(cell?.level)
    && toLevel === fromLevel + 1
    && toLevel <= (FACILITIES[cell?.type]?.maxLevel || 0)
    && durationDays === expectedDuration;
  if (!validUpgrade) return { valid: false, kind };
  return {
    valid: true,
    complete: elapsedDays >= durationDays,
    project: {
      kind,
      fromLevel,
      toLevel,
      elapsedDays: Math.min(elapsedDays, durationDays),
      durationDays,
      paidCost: roundCredits(paidCost),
    },
  };
}
