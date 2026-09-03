import { AUDIO } from '../core/Constants.js';

// 효과음 정의(주파수 Hz·길이 초)와 음량은 settings.json AUDIO.SFX / AUDIO.SFX_GAIN에 있다.
export function playSfx(ctx, destination, name) {
  const def = AUDIO.SFX[name] || AUDIO.SFX.click;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = def.freq;
    g.gain.value = AUDIO.SFX_GAIN;
    o.connect(g);
    g.connect(destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(AUDIO.SFX_RAMP_FLOOR, ctx.currentTime + def.duration);
    o.stop(ctx.currentTime + def.duration);
  } catch (err) {
    // 오디오는 부가 기능 — 실패해도 게임에 영향 없음
  }
}
