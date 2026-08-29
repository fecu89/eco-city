export function initMobileNav(barEl, panelEl, evidenceBoxEl) {
  if (!barEl || !panelEl) return;
  const buttons = [...barEl.querySelectorAll('[data-open-panel]')];
  const sections = [...panelEl.querySelectorAll('[data-mobile-panel]')];
  const evidenceBtn = barEl.querySelector('#mobileEvidenceBtn');

  function sync() {
    if (evidenceBtn) evidenceBtn.style.opacity = evidenceBoxEl.classList.contains('hidden') ? '.35' : '1';
  }

  function openPanel(name, btn) {
    if (name === 'evidence' && evidenceBoxEl.classList.contains('hidden')) return;
    const same = panelEl.classList.contains('mobile-open') && btn.classList.contains('active');
    buttons.forEach((b) => b.classList.remove('active'));
    sections.forEach((s) => s.classList.remove('mobile-active'));
    if (same) {
      panelEl.classList.remove('mobile-open');
      return;
    }
    const target = sections.find((s) => s.dataset.mobilePanel === name);
    if (!target) return;
    target.classList.add('mobile-active');
    btn.classList.add('active');
    panelEl.classList.add('mobile-open');
    if (name === 'status') setTimeout(() => dispatchEvent(new Event('resize')), 60);
  }

  buttons.forEach((btn) => btn.addEventListener('click', () => openPanel(btn.dataset.openPanel, btn)));
  new MutationObserver(sync).observe(evidenceBoxEl, { attributes: true, attributeFilter: ['class'] });
  sync();
}
