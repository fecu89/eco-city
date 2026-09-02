const SFX_DEFS = {
  place: { freq: 540, duration: 0.055 },
  upgrade: { freq: 820, duration: 0.08 },
  demolish: { freq: 300, duration: 0.06 },
  correct: { freq: 720, duration: 0.07 },
  wrong: { freq: 220, duration: 0.09 },
  click: { freq: 540, duration: 0.04 },
};

export function playSfx(ctx, destination, name) {
  const def = SFX_DEFS[name] || SFX_DEFS.click;
  try {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.frequency.value = def.freq;
    g.gain.value = 0.03;
    o.connect(g);
    g.connect(destination);
    o.start();
    g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + def.duration);
    o.stop(ctx.currentTime + def.duration);
  } catch (err) {
    // 오디오는 부가 기능 — 실패해도 게임에 영향 없음
  }
}
