import { requestParentStorage } from './StorageBridge.js';

// 저장소를 차단한 브라우저(학교 공용 PC의 시크릿 모드, 서드파티 쿠키 차단 등)에서는
// localStorage 프로퍼티 접근 자체가 예외를 던진다. 부팅 경로가 여기서 멈추지 않도록
// 모든 접근을 이 모듈 한 곳에서 감싼다.

export function readStorage(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStorage(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function removeStorage(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    return false;
  }
}

// 게임 저장처럼 잃으면 안 되는 데이터 전용. localStorage가 막힌 iframe 임베드(opaque origin)에서는
// 부모 프레임에 postMessage로 대신 부탁한다(StorageBridge.js). 부모가 응답하지 않는 배포에서는
// 타임아웃 뒤 기존과 같은 실패값(null/false)을 돌려준다 — 호출자는 계약이 그대로다.
export async function readStorageAsync(key) {
  try {
    return localStorage.getItem(key);
  } catch {
    const result = await requestParentStorage('storage:get', key);
    return result.ok ? result.value ?? null : null;
  }
}

export async function writeStorageAsync(key, value) {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    const result = await requestParentStorage('storage:set', key, value);
    return result.ok;
  }
}

export async function removeStorageAsync(key) {
  try {
    localStorage.removeItem(key);
    return true;
  } catch {
    const result = await requestParentStorage('storage:remove', key);
    return result.ok;
  }
}
