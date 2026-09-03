import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect } from '@playwright/test';

// 화면 문구의 어휘는 하나여야 한다. 같은 것을 단계·임무·퀘스트로 번갈아 부르면 학생이
// 서로 다른 것으로 읽는다. 퀘스트는 "퀘스트", 시간 단위는 "일"이다.
// - `n단계`  : 퀘스트 번호를 뜻하는 옛 표기(퀘스트 창의 LEVEL n / N만 예외로 남긴다)
// - `임무`   : 퀘스트의 옛 이름
// - `게임일` : "일"과 같은 뜻인데 단위만 달라 보인다
// 시설 강화 레벨을 뜻하는 "레벨"·"Lv."은 퀘스트와 다른 개념이라 금지 목록에 없다.
const BANNED = [
  { label: 'n단계(퀘스트 번호 옛 표기)', pattern: /\d+\s*단계/ },
  { label: '임무(퀘스트 옛 이름)', pattern: /임무/ },
  { label: '게임일(일과 중복되는 단위)', pattern: /게임일/ },
];

// 정당한 예외만 적는다 — 파일과 이유를 함께. (예: 단계가 시설 강화 레벨을 뜻하는 문구.)
// 지금은 예외가 없다.
const ALLOWED = [];

const srcRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../src');

async function collectJsFiles(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async (entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectJsFiles(full);
    return entry.isFile() && entry.name.endsWith('.js') ? [full] : [];
  }));
  return nested.flat();
}

async function copyFiles() {
  const uiFiles = await collectJsFiles(path.join(srcRoot, 'ui'));
  const coreFiles = await collectJsFiles(path.join(srcRoot, 'core'));
  return [...uiFiles, ...coreFiles.filter((file) => file.endsWith('Definitions.js'))];
}

test('UI and definition copy uses one word per concept', async () => {
  const files = await copyFiles();
  expect(files.length).toBeGreaterThan(10);

  const offenders = [];
  for (const file of files) {
    const relative = path.relative(srcRoot, file);
    const lines = (await readFile(file, 'utf8')).split('\n');
    lines.forEach((line, index) => {
      BANNED.forEach(({ label, pattern }) => {
        if (!pattern.test(line)) return;
        const offender = `${relative}:${index + 1} [${label}] ${line.trim()}`;
        if (ALLOWED.some((allowed) => offender.includes(allowed))) return;
        offenders.push(offender);
      });
    });
  }

  expect(offenders).toEqual([]);
});
