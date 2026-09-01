import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = dirname(SCRIPT_DIR);
const SOURCE_ROOT = join(PROJECT_ROOT, 'assets-source');
const PUBLIC_ROOT = join(PROJECT_ROOT, 'public', 'assets');
const MANUAL_ACQUISITION_PATH = join(SOURCE_ROOT, 'manual-acquisition.json');

export function mergeAcquisitions(...documents) {
  const byId = new Map();
  documents.forEach((document) => {
    (document?.acquired || []).forEach((item) => byId.set(item.id, item));
  });
  return [...byId.values()];
}

export function selectArchiveMembers(inventory, rules) {
  const selected = rules.map((rule) => {
    const candidates = inventory.filter((member) => {
      const lower = member.toLowerCase();
      const extension = lower.split('.').pop();
      return rule.formats.includes(extension)
        && rule.include.every((token) => lower.includes(token.toLowerCase()));
    });
    if (candidates.length !== 1) {
      throw new Error(`${rule.id}: expected one candidate, found ${candidates.length}: ${candidates.join(', ')}`);
    }
    return { id: rule.id, member: candidates[0] };
  });
  return { selected };
}

export function externalUrisFromGlb(bytes) {
  const buffer = Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes);
  if (buffer.length < 20 || buffer.readUInt32LE(0) !== 0x46546c67) return [];
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || jsonLength <= 0 || 20 + jsonLength > buffer.length) return [];
  const document = JSON.parse(buffer.subarray(20, 20 + jsonLength).toString('utf8').replace(/\0+$/g, '').trim());
  return [...(document.buffers || []), ...(document.images || [])]
    .map((resource) => resource.uri)
    .filter((uri) => typeof uri === 'string' && !uri.startsWith('data:'));
}

function safeRelativeUri(uri, modelId) {
  const decoded = decodeURIComponent(uri).replace(/\\/g, '/');
  if (decoded.startsWith('/') || decoded.split('/').includes('..') || /^[a-z]+:/i.test(decoded)) {
    throw new Error(`${modelId}: unsafe external GLB resource URI: ${uri}`);
  }
  return decoded;
}

function runUnzip(args, { encoding = null } = {}) {
  const result = spawnSync('unzip', args, { encoding, maxBuffer: 128 * 1024 * 1024 });
  if (result.status !== 0) {
    throw new Error(`unzip ${args.join(' ')} failed: ${String(result.stderr || '').trim()}`);
  }
  return result.stdout;
}

function archiveInventory(path) {
  return runUnzip(['-Z1', path], { encoding: 'utf8' }).split('\n').filter(Boolean);
}

function archiveMember(path, member) {
  return runUnzip(['-p', path, member]);
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

async function atomicWrite(path, bytes) {
  await mkdir(dirname(path), { recursive: true });
  const temporary = `${path}.partial`;
  await writeFile(temporary, bytes);
  await rename(temporary, path);
}

export function synthesizeLicenseNote(source) {
  return `${source.pack} — ${source.creator}\n`
    + `License: ${source.license}\n`
    + `Official page: ${source.officialPage}\n\n`
    + 'This archive did not bundle an original License.txt; this note was generated from '
    + 'assets-source/manifest.json at selection time based on user-provided attribution.\n';
}

export async function run() {
  const [selection, acquisition, manualAcquisition, manifest] = await Promise.all([
    readFile(join(SOURCE_ROOT, 'selection.json'), 'utf8').then(JSON.parse),
    readFile(join(SOURCE_ROOT, 'acquisition.json'), 'utf8').then(JSON.parse),
    readFile(MANUAL_ACQUISITION_PATH, 'utf8').then(JSON.parse).catch((error) => {
      if (error.code === 'ENOENT') return { acquired: [] };
      throw error;
    }),
    readFile(join(SOURCE_ROOT, 'manifest.json'), 'utf8').then(JSON.parse),
  ]);
  const acquisitions = mergeAcquisitions(acquisition, manualAcquisition);
  const archives = new Map(acquisitions.map((item) => [item.id, join(PROJECT_ROOT, item.archive)]));
  const sourceDefinitions = new Map(manifest.sources.map((source) => [source.id, source]));
  const inventories = new Map();
  const usedSources = new Set();
  const selected = [];

  for (const model of selection.models) {
    const archive = archives.get(model.source);
    if (!archive) throw new Error(`${model.id}: source archive is unavailable (${model.source})`);
    if (!inventories.has(archive)) inventories.set(archive, archiveInventory(archive));
    if (!inventories.get(archive).includes(model.member)) {
      throw new Error(`${model.id}: archive member does not exist: ${model.member}`);
    }
    const bytes = archiveMember(archive, model.member);
    const target = join(PUBLIC_ROOT, model.target);
    await atomicWrite(target, bytes);
    const sidecars = [];
    const originals = [];
    for (const member of model.sourceMembers || []) {
      if (!inventories.get(archive).includes(member)) {
        throw new Error(`${model.id}: original source member does not exist: ${member}`);
      }
      const originalBytes = archiveMember(archive, member);
      originals.push({ member, bytes: originalBytes.length, sha256: sha256(originalBytes) });
    }
    for (const uri of externalUrisFromGlb(bytes)) {
      const relative = safeRelativeUri(uri, model.id);
      const archivePath = join(dirname(model.member), relative);
      if (!inventories.get(archive).includes(archivePath)) {
        throw new Error(`${model.id}: referenced archive resource does not exist: ${archivePath}`);
      }
      const sidecarTarget = join(dirname(target), relative);
      const sidecarBytes = archiveMember(archive, archivePath);
      await atomicWrite(sidecarTarget, sidecarBytes);
      sidecars.push({ uri, bytes: sidecarBytes.length, sha256: sha256(sidecarBytes) });
    }
    usedSources.add(model.source);
    selected.push({
      ...model,
      bytes: bytes.length,
      sha256: sha256(bytes),
      runtimePath: `/assets/${model.target}`,
      sidecars,
      originals,
    });
  }

  await mkdir(join(SOURCE_ROOT, 'licenses'), { recursive: true });
  await mkdir(join(PUBLIC_ROOT, 'licenses'), { recursive: true });
  for (const sourceId of usedSources) {
    const archive = archives.get(sourceId);
    const licenseMember = inventories.get(archive).find((member) => /(^|\/)license\.txt$/i.test(member));
    // Kenney zips bundle an original License.txt; some other CC0 packs (e.g. itch.io "Bits"
    // series) ship without one. Synthesize one from the manifest instead of failing the build.
    const license = licenseMember
      ? archiveMember(archive, licenseMember)
      : Buffer.from(synthesizeLicenseNote(sourceDefinitions.get(sourceId)), 'utf8');
    await atomicWrite(join(SOURCE_ROOT, 'licenses', `${sourceId}-License.txt`), license);
    await atomicWrite(join(PUBLIC_ROOT, 'licenses', `${sourceId}-License.txt`), license);
  }

  const provenance = selected.map((item) => ({
    ...item,
    creator: sourceDefinitions.get(item.source).creator,
    pack: sourceDefinitions.get(item.source).pack,
    officialPage: sourceDefinitions.get(item.source).officialPage,
    license: sourceDefinitions.get(item.source).license,
  }));
  await writeFile(join(SOURCE_ROOT, 'selected.json'), `${JSON.stringify({ selectedAt: manifest.downloadedAt, models: provenance }, null, 2)}\n`);
  console.log(`Selected ${selected.length} GLBs (${selected.reduce((sum, item) => sum + item.bytes, 0)} bytes)`);
  return provenance;
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
