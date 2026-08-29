let nodes = null;

// 저볼륨 앰비언트 드론 — 기본값은 꺼짐(선택적). 교실에서 소리가 부담스러우면 켜지 않아도 된다.
export function startAmbient(ctx, destination) {
  if (nodes) return;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.connect(destination);
  const oscs = [110, 165, 220].map((freq) => {
    const o = ctx.createOscillator();
    o.type = 'sine';
    o.frequency.value = freq;
    o.connect(gain);
    o.start();
    return o;
  });
  gain.gain.linearRampToValueAtTime(0.025, ctx.currentTime + 1.2);
  nodes = { gain, oscs };
}

export function stopAmbient() {
  if (!nodes) return;
  const { gain, oscs } = nodes;
  const ctx = gain.context;
  gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.6);
  setTimeout(() => {
    oscs.forEach((o) => {
      try {
        o.stop();
      } catch (err) {
        // already stopped
      }
    });
  }, 700);
  nodes = null;
}
