# Manual 3D Asset Downloads

Only download these files from the listed official page. Do not substitute another source.

No manual downloads are currently required. The user-provided Quaternius packages were verified,
curated, and recorded in `manual-acquisition.json` on 2026-08-30.

## `assets-source/archives/` is not tracked in git

Only `assets-source/archives/` is ignored — the downloaded source archives (~72MB: the original
`.zip` files and their extracted GLB trees), because `npm run assets:fetch` re-downloads them.

**Everything else under `assets-source/` is still tracked** — 51 files, 6,345,865 bytes (~6.1MB):

| path | files | bytes | what it is |
| --- | ---: | ---: | --- |
| `audio/` | 2 | 4,120,767 | `eco-city-original.mp3`, the pre-transcode master for `public/assets/eco-city.mp3`, plus the README recording the transcode command, sizes and SHA-256. |
| `legacy-city-kit-runtime-copy/` | 18 | 1,605,417 | Snapshot of the City Kit files as they sat in the runtime folder before the select/optimize pipeline existed. Nothing in `scripts/`, `src/`, or the `assets-source/*.json` references it. |
| `manual/` | 12 | 470,540 | User-provided Quaternius packages (`quaternius-farm`, `quaternius-space`) with their original `License.txt`. See the warning below. |
| root JSON + this file | 7 | 141,879 | `manifest.json`, `acquisition.json`, `selection.json`, `selected.json`, `manual-acquisition.json`, `ASSET_REPORT.json`, `MANUAL_DOWNLOADS.md`. |
| `licenses/` | 12 | 7,262 | Upstream license notes kept alongside the acquisition records. |

So the deployed output (`public/assets/`), the pipeline metadata, the audio master and the
irreplaceable `manual/` sources are all in git; only the re-fetchable archives are not.

### ⚠ `assets-source/manual/` cannot be recovered if deleted

`assets:fetch` cannot download these two packs — Quaternius' official pages had no resolvable
download link, which is exactly why they were handed over by the user and recorded in
`manual-acquisition.json` (2026-08-30) instead. There is no upstream to re-fetch from.

They are **not currently in the build**: `selection.json` has zero `quaternius` entries and
`src/assets/assetRegistry.js` no longer references `solar-small`, `solar-large` or `wind-turbine`
(the 40차 cleanup replaced those facilities with Kenney models), so deleting `manual/` would not
break `assets:select` today. That is precisely why it is easy to delete by mistake — and once gone,
the only copies of these CC0 source files disappear with it. Leave them tracked.

To re-create the archives on a fresh clone:

```bash
npm run assets:fetch        # downloads + extracts into assets-source/archives/ (--dry-run to preview)
npm run assets:select       # re-derives public/assets/ from the archives via selection.json
npm run assets:optimize     # meshopt pass over the selected GLBs
npm run assets:audit        # verifies every registry path exists
```

`npm run assets:fetch` is only needed when you have to re-derive or re-optimize models. Running
the game or the test suite does not require it — `public/assets/` is committed.
