import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';
import { ICON_NAMES, hasIcon } from '../../../src/ui/Modal.js';
import { RESEARCH } from '../../../src/core/ResearchDefinitions.js';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

// `icon:` 필드에는 lucide 이름이 아니라 화면에 그대로 찍는 이모지도 들어간다
// (FACILITIES/보고서 등급 등). 이 값들은 SVG로 치환되지 않으므로 대조에서 제외한다.
const NON_LUCIDE_ICON_VALUES = new Set([
  '☀️', '⚛️', '🌊', '🌬️', '🌳', '🏆', '🏢', '🏭', '💧', '🔋', '🔥', '🖥️', '🥇', '🧭',
]);

// 레지스트리 자신은 건너뛴다 — 주석이 data-lucide="..." 같은 예시 문구를 담고 있어
// 스캔 대상이 되면 그 예시가 아이콘 이름으로 잡힌다.
const REGISTRY_FILE = path.join(projectRoot, 'src/ui/Modal.js');

async function collectSourceFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectSourceFiles(full);
    return entry.isFile() && full.endsWith('.js') && full !== REGISTRY_FILE ? [full] : [];
  }));
  return files.flat();
}

function iconReferences(source, file) {
  const found = [];
  for (const match of source.matchAll(/data-lucide=(?:"([^"${}]+)"|'([^'${}]+)')/g)) {
    found.push({ name: match[1] ?? match[2], file, kind: 'data-lucide' });
  }
  for (const match of source.matchAll(/\bicon:\s*'([^']+)'/g)) {
    found.push({ name: match[1], file, kind: 'icon field' });
  }
  return found;
}

test('every lucide name used in markup or definitions is registered in Modal.js', async () => {
  const files = [
    path.join(projectRoot, 'index.html'),
    ...(await collectSourceFiles(path.join(projectRoot, 'src'))),
  ];
  const references = [];
  for (const file of files) {
    references.push(...iconReferences(await readFile(file, 'utf8'), path.relative(projectRoot, file)));
  }
  // 위치 인자로 아이콘을 넘기는 정의 파일은 정규식으로 잡히지 않으므로 값에서 직접 읽는다.
  Object.values(RESEARCH).forEach((item) => {
    references.push({ name: item.icon, file: 'src/core/ResearchDefinitions.js', kind: 'RESEARCH.icon' });
  });

  expect(references.length).toBeGreaterThan(30);
  const missing = references
    .filter(({ name }) => !NON_LUCIDE_ICON_VALUES.has(name) && !hasIcon(name))
    .map(({ name, file, kind }) => `${name} (${kind} in ${file})`);
  expect(missing).toEqual([]);
});

test('ICON_NAMES lists the registry in the kebab-case form lucide resolves', () => {
  expect(ICON_NAMES.length).toBeGreaterThan(40);
  expect(ICON_NAMES.filter((name) => !hasIcon(name))).toEqual([]);
  expect(ICON_NAMES).toContain('building-2');
  expect(ICON_NAMES).toContain('chart-no-axes-combined');
  expect(hasIcon('not-a-real-icon')).toBe(false);
});
