import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { mkdir, readFile, rename, rm, writeFile } from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(SCRIPT_DIR);
const MANIFEST_PATH = join(PROJECT_ROOT, 'assets-source', 'manifest.json');
const ARCHIVE_DIR = join(PROJECT_ROOT, 'assets-source', 'archives');
const ACQUISITION_PATH = join(PROJECT_ROOT, 'assets-source', 'acquisition.json');
const MANUAL_PATH = join(PROJECT_ROOT, 'assets-source', 'MANUAL_DOWNLOADS.md');
const APPROVED_CREATORS = new Set(['Kenney', 'Quaternius']);
const APPROVED_LICENSES = new Set(['CC0-1.0']);

export function assertAllowedSource(source) {
  const page = new URL(source.officialPage);
  const officialHost = source.creator === 'Kenney'
    ? /(^|\.)kenney\.nl$/
    : /(^|\.)quaternius\.com$/;
  if (!APPROVED_CREATORS.has(source.creator)
    || !APPROVED_LICENSES.has(source.license)
    || page.protocol !== 'https:'
    || !officialHost.test(page.hostname)) {
    throw new Error(`Disallowed asset source or license: ${source.id || source.officialPage}`);
  }
  return true;
}

function parseAnchors(html, baseUrl) {
  return [...html.matchAll(/<a\b([^>]*)href=["']([^"']+)["']([^>]*)>([\s\S]*?)<\/a>/gi)]
    .flatMap((match) => {
      try {
        return [{
          url: new URL(match[2], baseUrl),
          label: `${match[1]} ${match[3]} ${match[4]}`,
        }];
      } catch {
        return [];
      }
    });
}

function parseDownloadButtons(html) {
  return [...html.matchAll(/<button\b([^>]*)>([\s\S]*?)<\/button>/gi)]
    .flatMap((match) => {
      const raw = `${match[1]} ${match[2]}`;
      const target = raw.match(/window\.open\(\s*['"](https:[^'"]+)['"]/i)?.[1];
      if (!target) return [];
      return [{ url: new URL(target), label: raw }];
    });
}

export function extractOfficialDownloadUrl(source, html) {
  assertAllowedSource(source);
  const anchors = parseAnchors(html, source.officialPage);
  if (source.creator === 'Kenney') {
    return anchors.find(({ url }) => (
      /(^|\.)kenney\.nl$/.test(url.hostname)
      && url.pathname.toLowerCase().endsWith('.zip')
    ))?.url.href || null;
  }
  const candidates = [...parseDownloadButtons(html), ...anchors];
  const officialPage = new URL(source.officialPage);
  return candidates.find(({ url, label }) => (
    url.protocol === 'https:'
    && /download/i.test(label)
    && !/patreon|discord/i.test(url.hostname)
    && !(url.origin === officialPage.origin && url.pathname === officialPage.pathname && url.hash)
  ))?.url.href || null;
}

export function sha256File(path) {
  return new Promise((resolve, reject) => {
    const hash = createHash('sha256');
    const stream = createReadStream(path);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

function argumentsFor(argv) {
  const result = { dryRun: false, sourceId: null };
  argv.forEach((arg, index) => {
    if (arg === '--dry-run') result.dryRun = true;
    if (arg === '--source') result.sourceId = argv[index + 1] || null;
  });
  return result;
}

async function fetchText(url) {
  const response = await fetch(url, {
    headers: { 'user-agent': 'AI-City-Asset-Audit/1.0 (+local educational webgame)' },
  });
  if (!response.ok) throw new Error(`Official page returned HTTP ${response.status}`);
  return response.text();
}

function safeArchiveName(source, resolvedUrl) {
  const urlName = basename(new URL(resolvedUrl).pathname);
  return urlName.toLowerCase().endsWith('.zip') ? `${source.id}-${urlName}` : `${source.id}.zip`;
}

async function downloadArchive(source, anchorUrl) {
  const response = await fetch(anchorUrl, {
    redirect: 'follow',
    headers: { 'user-agent': 'AI-City-Asset-Audit/1.0 (+local educational webgame)' },
  });
  if (!response.ok) throw new Error(`Archive returned HTTP ${response.status}`);
  if (new URL(response.url).protocol !== 'https:') throw new Error('Archive redirect left HTTPS');
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length < 4 || bytes[0] !== 0x50 || bytes[1] !== 0x4b) {
    throw new Error(`Official link did not return a ZIP archive (${response.headers.get('content-type') || 'unknown content type'})`);
  }
  await mkdir(ARCHIVE_DIR, { recursive: true });
  const filename = safeArchiveName(source, response.url);
  const destination = join(ARCHIVE_DIR, filename);
  const temporary = `${destination}.partial`;
  await writeFile(temporary, bytes);
  await rename(temporary, destination);
  return {
    anchorUrl,
    finalUrl: response.url,
    archive: `assets-source/archives/${filename}`,
    bytes: bytes.length,
    sha256: await sha256File(destination),
  };
}

function manualMarkdown(items) {
  const intro = '# Manual 3D Asset Downloads\n\nOnly download these files from the listed official page. Do not substitute another source.\n';
  if (!items.length) return `${intro}\nNo manual downloads are currently required.\n`;
  return `${intro}\n${items.map((item) => (
    `## ${item.pack}\n\n- Creator: ${item.creator}\n- Official page: ${item.officialPage}\n- License: ${item.license}\n- Reason: ${item.reason}\n`
  )).join('\n')}`;
}

export async function run(argv = process.argv.slice(2)) {
  const args = argumentsFor(argv);
  const manifest = JSON.parse(await readFile(MANIFEST_PATH, 'utf8'));
  const sources = args.sourceId
    ? manifest.sources.filter((source) => source.id === args.sourceId)
    : manifest.sources;
  if (!sources.length) throw new Error(`Unknown source: ${args.sourceId}`);

  const acquired = [];
  const manual = [];
  for (const source of sources) {
    assertAllowedSource(source);
    try {
      const html = await fetchText(source.officialPage);
      const anchorUrl = extractOfficialDownloadUrl(source, html);
      if (!anchorUrl) throw new Error('No explicitly linked official download was found');
      if (args.dryRun) {
        acquired.push({ id: source.id, officialPage: source.officialPage, anchorUrl, dryRun: true });
      } else {
        acquired.push({ id: source.id, officialPage: source.officialPage, ...(await downloadArchive(source, anchorUrl)) });
      }
    } catch (error) {
      manual.push({ ...source, reason: error.message });
    }
  }

  if (!args.dryRun) {
    await writeFile(ACQUISITION_PATH, `${JSON.stringify({ acquiredAt: manifest.downloadedAt, acquired }, null, 2)}\n`);
    await writeFile(MANUAL_PATH, manualMarkdown(manual));
  }
  for (const item of acquired) console.log(`${item.id}: ${item.anchorUrl}${item.dryRun ? ' (dry run)' : ''}`);
  for (const item of manual) console.log(`${item.id}: manual download required — ${item.reason}`);
  return { acquired, manual };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run().catch(async (error) => {
    await rm(join(ARCHIVE_DIR, '.partial'), { force: true }).catch(() => {});
    console.error(error.message);
    process.exitCode = 1;
  });
}
