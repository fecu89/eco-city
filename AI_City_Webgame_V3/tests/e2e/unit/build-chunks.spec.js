import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// 학교망 첫 로딩 예산: 단일 1.25MB 청크를 three / chart / vendor / app으로 나눈 뒤,
// 어느 하나도 700kB를 넘지 않아야 한다(vite.config.js의 manualChunks).
const PROJECT_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const DIST_ASSETS = join(PROJECT_ROOT, 'dist', 'assets');
const MAX_CHUNK_BYTES = 700 * 1024;

let jsChunks = [];
let indexHtml = '';

test.beforeAll(() => {
  test.setTimeout(180000);
  execFileSync('npx', ['vite', 'build'], { cwd: PROJECT_ROOT, stdio: 'pipe' });
  jsChunks = readdirSync(DIST_ASSETS)
    .filter((name) => name.endsWith('.js'))
    .map((name) => ({ name, bytes: statSync(join(DIST_ASSETS, name)).size }));
  indexHtml = readFileSync(join(PROJECT_ROOT, 'dist', 'index.html'), 'utf8');
});

test('the production build splits vendors into separate chunks that each stay under the load budget', () => {
  expect(jsChunks.length).toBeGreaterThanOrEqual(3);
  expect(jsChunks.map(({ name }) => name.split('-')[0]).sort())
    .toEqual(expect.arrayContaining(['chart', 'three', 'vendor']));

  const largest = jsChunks.reduce((max, chunk) => (chunk.bytes > max.bytes ? chunk : max));
  expect(largest.bytes, `largest chunk ${largest.name} is ${largest.bytes} bytes`).toBeLessThan(MAX_CHUNK_BYTES);
});

test('the entry html loads more than one module chunk and defers chart.js to its dynamic import', () => {
  const referenced = [...indexHtml.matchAll(/(?:src|href)="\/assets\/([^"]+\.js)"/g)].map((match) => match[1]);
  expect(referenced.length).toBeGreaterThan(1);
  expect(referenced.some((name) => name.startsWith('three-'))).toBe(true);
  // chart.js는 도시 상태 패널을 열 때만 받아야 하므로 script/modulepreload 어디에도 없어야 한다.
  expect(referenced.filter((name) => name.startsWith('chart-'))).toEqual([]);
  expect(jsChunks.some(({ name }) => name.startsWith('chart-'))).toBe(true);
});
