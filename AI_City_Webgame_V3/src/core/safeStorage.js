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
