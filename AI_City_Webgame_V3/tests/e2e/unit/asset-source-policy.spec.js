import { test, expect } from '@playwright/test';
import {
  assertAllowedSource,
  extractOfficialDownloadUrl,
} from '../../../scripts/fetch-3d-assets.mjs';

test('accepts only approved official CC0 sources', () => {
  expect(assertAllowedSource({
    creator: 'Kenney',
    officialPage: 'https://kenney.nl/assets/hexagon-kit',
    license: 'CC0-1.0',
  })).toBe(true);

  expect(() => assertAllowedSource({
    creator: 'Unknown',
    officialPage: 'https://sketchfab.com/models/example',
    license: 'CC-BY-4.0',
  })).toThrow(/source|license/i);
});

test('extracts only a zip linked by the official Kenney page', () => {
  const html = '<a href="/media/pages/assets/hexagon-kit/hash/kenney_hexagon-kit.zip">Continue without donating...</a>';
  expect(extractOfficialDownloadUrl({
    creator: 'Kenney',
    officialPage: 'https://kenney.nl/assets/hexagon-kit',
    license: 'CC0-1.0',
  }, html)).toBe('https://kenney.nl/media/pages/assets/hexagon-kit/hash/kenney_hexagon-kit.zip');
});

test('Quaternius requires an explicitly labelled download anchor', () => {
  const html = [
    '<a href="https://quaternius.com/packs/index.html">Packs</a>',
    '<a href="https://linked-host.example/official-file.zip"><img alt="Download" /></a>',
  ].join('');
  expect(extractOfficialDownloadUrl({
    creator: 'Quaternius',
    officialPage: 'https://quaternius.com/packs/example.html',
    license: 'CC0-1.0',
  }, html)).toBe('https://linked-host.example/official-file.zip');
});

test('does not treat arbitrary navigation as a Quaternius download', () => {
  const html = '<a href="https://quaternius.com/packs/index.html">Packs</a>';
  expect(extractOfficialDownloadUrl({
    creator: 'Quaternius',
    officialPage: 'https://quaternius.com/packs/example.html',
    license: 'CC0-1.0',
  }, html)).toBeNull();
});

test('ignores the Quaternius inline modal and resolves its explicit Download button target', () => {
  const html = [
    '<a href="#inline" class="download">Download</a>',
    '<button onclick="window.open(\'https://drive.google.com/drive/folders/official-id?usp=sharing\',\'_blank\');">Download</button>',
  ].join('');
  expect(extractOfficialDownloadUrl({
    creator: 'Quaternius',
    officialPage: 'https://quaternius.com/packs/example.html',
    license: 'CC0-1.0',
  }, html)).toBe('https://drive.google.com/drive/folders/official-id?usp=sharing');
});
