import { GAME } from './Constants.js';

// labs.pyx.kr 같은 iframe 임베드는 sandbox에서 allow-same-origin을 뺀 채 운영된다(보안상
// 유지 결정). 그러면 문서가 opaque origin이 되어 localStorage 접근 자체가 예외를 던진다.
// 대신 origin이 있는 부모 프레임(window.parent)에게 postMessage로 저장을 대신 부탁한다.
// 부모 쪽 리스너가 없는 배포(단독 페이지, 다른 호스팅)에서는 응답이 오지 않으므로
// 타임아웃으로 안전하게 실패 처리한다.

const REQUEST_SOURCE = 'ecocity-lab';
const RESPONSE_SOURCE = 'ecocity-lab-host';

let requestCounter = 0;
const pending = new Map();

if (typeof window !== 'undefined') {
  window.addEventListener('message', (event) => {
    if (event.source !== window.parent) return;
    const data = event.data;
    if (!data || data.source !== RESPONSE_SOURCE || data.type !== 'storage:result') return;
    const entry = pending.get(data.requestId);
    if (!entry) return;
    pending.delete(data.requestId);
    clearTimeout(entry.timer);
    entry.resolve({ ok: Boolean(data.ok), value: data.value, error: data.error });
  });
}

// 실패해도 reject하지 않는다 — 호출자는 safeStorage의 기존 실패 계약(null/false)만 알면 된다.
export function requestParentStorage(type, key, value) {
  if (typeof window === 'undefined' || window.parent === window) {
    return Promise.resolve({ ok: false, error: 'no-parent' });
  }
  const requestId = `req-${Date.now()}-${requestCounter += 1}`;
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(requestId);
      resolve({ ok: false, error: 'timeout' });
    }, GAME.STORAGE_BRIDGE_TIMEOUT_MS);
    pending.set(requestId, { resolve, timer });
    window.parent.postMessage({ source: REQUEST_SOURCE, type, requestId, key, value }, '*');
  });
}
