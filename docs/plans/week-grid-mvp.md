# Week-grid MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Print Oura nights as a monotone week grid (Sun to Sat, week by week, one local-clock axis) from a static page fed by a data file that a CLI exports.

**Architecture:** pnpm workspace with three packages. `core` is pure TypeScript: Oura docs to a nights file, nights file to a page model, page model to SVG. `web` is a single-file static page that loads a nights file and prints. `cli` logs in to Oura, caches raw sleep documents, and exports the nights file.

**Tech Stack:** TypeScript 7, Node 26 LTS (via `mise.toml`), pnpm 12, Vitest 5, Vite 8 with `vite-plugin-singlefile` 2, `date-holidays` 3. No UI framework. CLI args via `node:util` `parseArgs`; HTTP via global `fetch`; OAuth callback via `node:http`.

**Spec:** [`docs/design/week-grid-mvp.md`](../design/week-grid-mvp.md). Mockup: [`docs/design/week-grid-mockup.html`](../design/week-grid-mockup.html).

## Global Constraints

- Commit straight to `main`, conventional commit messages (see `AGENTS.md`).
- `pnpm-workspace.yaml` sets `minimumReleaseAge: 20160` (14 days). Add no dependency beyond the stack above without asking.
- Never commit real health data. All fixtures are synthetic.
- The web page makes no network requests. CSP `connect-src 'none'`.
- Every rendered page includes this exact footer text: `Not a diagnostic tool. Shows data recorded by a consumer wearable; stages are Oura's estimates, not polysomnography.`
- Paper: US Letter landscape, two Sun-to-Sat weeks per page.
- Time window per row: 20:00 on the evening's date to 12:00 the next day, local clock (960 minutes).
- Stage order top to bottom: Awake, REM, Light, Deep. Fills: Awake `#ffffff` with `#000` outline, REM `#cfcfcf`, Light `#8c8c8c`, Deep `#2b2b2b`.
- Two palettes: `mono` (the default, for print) and `color` (screen). In `mono` every colour in rendered SVG is a gray (`#rrggbb` with r = g = b), `none`, or `url(#hatch)`. `color` changes stage fills only: Awake `#f6b26b`, REM `#7fc8f8`, Light `#3d85c6`, Deep `#1c2e6b`. Height still carries the stage in both.
- Print shows only the sheets. Every interactive element (file picker, drop zone, range, region, palette toggle, Print button, error banner) is hidden in print.
- Holiday region default: `CA` / `BC`. Holidays of `type === "public"` only.
- Every Oura request sends `User-Agent: sleep-truth/0.1`.
- Tokens file mode `0600`. Config under `$XDG_CONFIG_HOME/sleep-truth` (default `~/.config/sleep-truth`); cache under `$XDG_DATA_HOME/sleep-truth` (default `~/.local/share/sleep-truth`).

## Review Focus

1. **Null or empty stage strings, and zero-length periods.** Oura's sandbox returns `sleep_phase_30_sec: null` and `bedtime_start == bedtime_end`. Expected: fall back to `sleep_phase_5_min` (each char expanded to 10 epochs); if both are null, or the period has zero length, drop it and count it in `skipped`. Never crash, never draw garbage. Tests in Task 2.
2. **Movement string length differs from stage string.** Expected: movement is padded with `0` or truncated to the stage length. Test in Task 2.
3. **A period crossing the window edge** (asleep before 20:00, or past noon). Expected: drawn clipped; totals still use Oura's full values. Test in Task 3.
4. **A date range starting mid-week or with missing nights.** Expected: full Sun-to-Sat weeks with empty `no data` rows; never a shifted column. Test in Task 3.
5. **Oura revising a recent night, and paging.** Expected: re-sync overwrites the cached doc by `id`, and every `next_token` page is fetched. Test in Task 7.
6. **Something interactive leaks into print,** such as a control added by `main.ts` at runtime outside the header. Expected: only sheets print, in either palette. Test in Task 6.

Known gap, not a bug to fix here: `date-holidays` 3.39 lacks BC's National Day for Truth and Reconciliation (Sep 30).

---

### Task 1: Workspace and the nights-file contract

**Files:**
- Create: `mise.toml`, `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `.gitignore`, `vitest.config.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`, `packages/core/src/nights.ts`
- Test: `packages/core/test/nights.test.ts`

**Interfaces:**
- Produces (in `@sleep-truth/core`):
  - `type Stage = "W" | "R" | "L" | "D"`
  - `type MovementLevel = "0" | "1" | "2" | "3"` (none, restless, tossing, active)
  - `interface Period { id: string; start: string; end: string; source_type: string; epoch_seconds: 30; stages: string; movement: string; totals: { asleep_s: number; in_bed_s: number } }` (`start`/`end` are ISO with offset)
  - `interface NightsFile { schema: "sleep-truth/nights"; version: 1; source: { device: string; exported_at: string }; periods: Period[] }`
  - `parseNightsFile(input: unknown): NightsFile` throws `NightsFileError` (message names the first bad field)
  - `offsetMinutes(iso: string): number` (e.g. `-420` for `-07:00`)

- [ ] **Step 1:** Scaffold. `mise.toml` pins `node = "26"` and `pnpm = "12"`. Root `package.json` is private, `"type": "module"`, scripts `test` (`vitest run`), `build` (`pnpm -r build`), `typecheck` (`tsc -b`). `pnpm-workspace.yaml` lists `packages/*` and `minimumReleaseAge: 20160`. `.gitignore`: `node_modules/`, `dist/`, `.superpowers/`, `*.nights.json`. Run `pnpm install`. Expected: lockfile written, no errors.
- [ ] **Step 2: Write the failing tests** in `nights.test.ts`:
  - `parses a valid file` round-trips a one-period file.
  - `rejects wrong schema` expects `NightsFileError` with `/schema/`.
  - `rejects stages with letters outside WRLD` expects `/stages/`.
  - `rejects movement length != stages length` expects `/movement/`.
  - `offsetMinutes("2026-11-18T22:41:00-07:00") === -420`, `offsetMinutes("2026-11-18T22:41:00+05:30") === 330`, `offsetMinutes("2026-11-18T22:41:00Z") === 0`.
- [ ] **Step 3:** Run `pnpm test`. Expected: FAIL, module not found.
- [ ] **Step 4:** Implement `nights.ts` and re-export from `index.ts`. Hand-written validation, no schema library.
- [ ] **Step 5:** Run `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 6:** Commit `feat(core): workspace and nights-file contract`.

### Task 2: Normalise Oura sleep documents

**Files:**
- Create: `packages/core/src/oura.ts`
- Create: `packages/core/test/helpers/oura-doc.ts` (synthetic fixture builder)
- Test: `packages/core/test/oura.test.ts`

**Interfaces:**
- Consumes: `Period`, `NightsFile` from Task 1.
- Produces:
  - `interface OuraSleepDoc` with the fields used: `id`, `type`, `bedtime_start`, `bedtime_end`, `sleep_phase_30_sec: string | null`, `sleep_phase_5_min: string | null`, `movement_30_sec: string | null`, `total_sleep_duration: number | null`, `time_in_bed: number`.
  - `normalizeOura(docs: OuraSleepDoc[], exportedAt: Date): { file: NightsFile; skipped: number }`
  - Test helper `ouraDoc(p: { id?: string; type?: string; start: string; stages: string; movement?: string; asleepS?: number }): OuraSleepDoc`, where `stages` uses Oura digits (`1` deep, `2` light, `3` REM, `4` awake) and `bedtime_end` = start + 30 s × length.

- [ ] **Step 1: Write the failing tests:**
  - `maps Oura digits`: phase `"4213"` gives stages `"WLDR"`; movement `"1234"` gives `"0123"`.
  - `drops deleted and rest`: input types `deleted`, `rest`, `long_sleep` gives one period, `skipped === 0` (drops are not skips).
  - `keeps source_type verbatim` for `late_nap`.
  - `falls back to 5-minute phases`: 30 s null, 5 min `"42"` gives stages of `"W".repeat(10) + "L".repeat(10)`.
  - `skips periods with no phases` and `skips zero-length periods`: `skipped === 1` each.
  - `pads short movement with 0` and `truncates long movement`.
  - `totals come from Oura`: `asleep_s === total_sleep_duration`, `in_bed_s === time_in_bed`; null `total_sleep_duration` gives the count of non-`W` epochs × 30.
  - `dedupes by id, last wins`.
  - `id is prefixed`: `"oura:" + doc.id`.
  - `sorts periods by start`.
- [ ] **Step 2:** Run `pnpm test -- oura`. Expected: FAIL.
- [ ] **Step 3:** Implement `normalizeOura` in `oura.ts`. `start`/`end` keep Oura's strings unchanged.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): normalise Oura sleep documents`.

### Task 3: Rows, weeks and pages

**Files:**
- Create: `packages/core/src/layout.ts`
- Create: `packages/core/test/helpers/period.ts` (builds `Period` from `{ start, stages }` in our letters)
- Test: `packages/core/test/layout.test.ts`

**Interfaces:**
- Consumes: `Period`, `offsetMinutes`.
- Produces:
  - `type ISODate = string` (`YYYY-MM-DD`)
  - `interface Segment { stage: Stage; from: number; to: number }` (minutes from 20:00, clipped to `[0, 960]`)
  - `interface MoveRun { level: 1 | 2 | 3; from: number; to: number }`
  - `interface PlacedPeriod { period: Period; segments: Segment[]; moves: MoveRun[] }`
  - `interface Row { evening: ISODate; weekday: number (0 = Sun); offset: number | null; placed: PlacedPeriod[]; naps: number; asleep_s: number; in_bed_s: number }`
  - `interface Week { sunday: ISODate; rows: Row[] }` (always 7 rows)
  - `interface Page { weeks: Week[] }` (1 or 2 weeks)
  - `buildRows(periods: Period[], from: ISODate, to: ISODate): Row[]`
  - `groupWeeks(rows: Row[]): Week[]`, `paginate(weeks: Week[], perPage = 2): Page[]`

Placement algorithm (the spec fixes this; tests below pin it):

```
local(t) = UTC ms of t + offsetMinutes(period.start) * 60000   // naive wall clock on the START offset
for evening E in { date(local(start)) - 1 day, date(local(start)) }:
    window(E) = [E 20:00, E+1 12:00] in naive ms
    overlap(E) = |[local(start), local(start) + stages.length*30s] ∩ window(E)|
pick E with largest overlap > 0; ties go to the later E
if no overlap: nap; counted on row date(local(start)) if local hour >= 12, else date - 1
```

Row `offset` = start offset of its longest placed period; `null` when empty. Row totals sum Oura totals over placed periods. Segments and moves merge consecutive equal epochs into runs.

- [ ] **Step 1: Write the failing tests:**
  - `normal night`: start `2026-11-18T22:41:00-07:00`, lands on evening `2026-11-18`, first segment `from === 161`.
  - `after-midnight start belongs to previous evening`: start `2026-11-19T01:10:00-07:00` gives evening `2026-11-18`.
  - `split night`: two periods 22:00–02:00 and 02:40–06:30 land on one row, `placed.length === 2`, totals summed.
  - `afternoon nap is counted, not drawn`: 14:00–14:40 on `2026-11-19` gives row `2026-11-19` with `naps === 1`, `placed.length === 0`.
  - `clips at window edge`: start 19:30 gives first segment `from === 0`; `in_bed_s` unchanged.
  - `offset follows longest period`: 7 h at `-07:00` plus 1 h at `-05:00` gives `offset === -420`.
  - `missing nights and partial weeks`: from `2026-11-11` (Wed) to `2026-11-17` (Tue) gives 2 weeks, Sundays `2026-11-08` and `2026-11-15`, 14 rows, rows outside the range and nights with no data have `placed.length === 0`.
  - `paginate`: 3 weeks gives pages of 2 and 1.
  - `merges runs`: stages `"LLLDD"` gives 2 segments; movement `"00120"` gives 2 move runs.
- [ ] **Step 2:** Run `pnpm test -- layout`. Expected: FAIL.
- [ ] **Step 3:** Implement `layout.ts`. Date arithmetic on naive UTC-ms values only; never use the host time zone.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS. Also run `TZ=Asia/Kolkata pnpm test`. Expected: PASS (no host-zone leakage).
- [ ] **Step 5:** Commit `feat(core): place periods into rows, weeks and pages`.

### Task 4: Markers: time zones and holidays

**Files:**
- Create: `packages/core/src/markers.ts`
- Test: `packages/core/test/markers.test.ts`
- Modify: `packages/core/package.json` (add `date-holidays@^3.39.2`)

**Interfaces:**
- Consumes: `Row`, `ISODate`.
- Produces:
  - `interface Region { country: string; state?: string }`
  - `interface RowMarkers { holidayName?: string; hatch: Array<{ from: number; to: number }>; tzChange?: { from: number; to: number }; away?: number }` (offsets in minutes; `away` set when `offset !== home`)
  - `homeOffset(rows: Row[]): number | null` (most common non-null offset; ties to the earliest)
  - `holidayMap(region: Region, years: number[]): Map<ISODate, string>` (public only, keyed by `holiday.date.slice(0, 10)`)
  - `markRows(rows: Row[], holidays: Map<ISODate, string>): RowMarkers[]` (same order as `rows`)

Rules: `holidayName` when the row's evening date is a holiday. `hatch` covers `[0, 240]` when the evening date is a holiday and `[240, 960]` when the next date is; the two merge to `[0, 960]`. `tzChange` when the row's offset differs from the previous non-null row's offset, or when a placed period's start and end offsets differ (then `from`/`to` are that period's start and end offsets).

- [ ] **Step 1: Write the failing tests:**
  - `BC holidays 2026` contains `2026-11-11 → "Remembrance Day"` and has no `2026-11-12`.
  - `Remembrance Day hatches two rows`: row `2026-11-10` gets `hatch [[240, 960]]`, row `2026-11-11` gets `[[0, 240]]` and `holidayName "Remembrance Day"`.
  - `tz change`: rows at -420, -420, -300, -300 give `tzChange {from:-420,to:-300}` on row 3 only; `away === -300` on rows 3 and 4.
  - `empty rows do not break tz detection`: -420, null, -300 flags the third row.
  - `DST inside a period`: start `-08:00`, end `-07:00` flags `tzChange {from:-480,to:-420}`.
- [ ] **Step 2:** Run `pnpm test -- markers`. Expected: FAIL.
- [ ] **Step 3:** Implement `markers.ts`.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(core): time zone and holiday markers`.

### Task 5: Render a page to SVG

**Files:**
- Create: `packages/core/src/render.ts`
- Test: `packages/core/test/render.test.ts`, snapshots in `packages/core/test/__snapshots__/`

**Interfaces:**
- Consumes: `Page`, `RowMarkers`, `homeOffset` results.
- Produces: `renderPage(page: Page, markers: Map<ISODate, RowMarkers>, ctx: { title: string; pageNo: number; pageCount: number; home: number | null; palette?: "mono" | "color" }): string` (`palette` defaults to `mono`). Returns one `<svg viewBox="0 0 1100 850">` document.

Port the drawing from `docs/design/week-grid-mockup.html` style A: layout constants, legend, week header with hour labels every 2 h, heavier midnight line, stage blocks with vertical connectors, movement runs as rects under the stages (heights 3 / 5.5 / 8 for levels 1 / 2 / 3), gutter weekday and date, `◆ name`, `✈ UTC-7 → UTC-5` plus dashed rule, `local UTC-5` for away rows, `no data` for empty rows, `+N nap` and `7h12 / 8h49` in the right column, footer disclaimer and `Page N of M`. Offsets format as `UTC-7`, `UTC+5:30`. All text is escaped.

- [ ] **Step 1: Write the failing tests** (a fixture page built with Task 3/4 helpers):
  - `contains the disclaimer` (exact Global Constraints text) and `Page 1 of 1`.
  - `only grays`: in `mono`, every `fill="…"` and `stroke="…"` value matches `/^(none|url\(#hatch\)|#([0-9a-f]{2})\1\1)$/i`.
  - `color palette`: in `color`, the four stage fills appear and the layout (every non-colour attribute) equals the `mono` output.
  - `draws 14 row labels` for a two-week page, including `Fri` and `Nov 13`.
  - `shows totals` `7h12 / 8h49` for a row with `asleep_s 25920`, `in_bed_s 31740`.
  - `shows markers`: `◆ Remembrance Day`, `✈ UTC-7 → UTC-5`, `local UTC-5`, `no data`, `+1 nap`.
  - `escapes text`: a holiday name `A<B` renders as `A&lt;B`.
  - Snapshot of the full SVG.
- [ ] **Step 2:** Run `pnpm test -- render`. Expected: FAIL.
- [ ] **Step 3:** Implement `render.ts`.
- [ ] **Step 4:** Run `pnpm test`. Expected: PASS. Write the snapshot SVG to `/tmp/sleep-truth-render.svg` from a test-only script and look at it in a browser next to the mockup. Expected: same layout as style A.
- [ ] **Step 5:** Commit `feat(core): render a week-grid page to SVG`.

### Task 6: The web page

**Files:**
- Create: `packages/web/package.json`, `packages/web/vite.config.ts`, `packages/web/index.html`, `packages/web/src/main.ts`, `packages/web/src/app.ts`, `packages/web/src/print.css`
- Test: `packages/web/test/app.test.ts`, `packages/web/test/build.test.ts`

**Interfaces:**
- Consumes: `parseNightsFile`, `buildRows`, `groupWeeks`, `paginate`, `homeOffset`, `holidayMap`, `markRows`, `renderPage`.
- Produces:
  - `interface Settings { from?: ISODate; to?: ISODate; region: Region; palette: "mono" | "color" }` (default `mono`)
  - `renderReport(fileText: string, settings: Settings): { pages: string[]; range: { from: ISODate; to: ISODate }; error?: string }` in `app.ts` (pure; `main.ts` wires the DOM)

Behaviour: file picker and drag-and-drop read the file with `FileReader`; nothing else touches the data. Range defaults to the first and last evening in the file. Region select lists `date-holidays` countries, then states for the chosen country; default `CA`/`BC`. Settings (not data) persist in `localStorage` key `sleep-truth.settings`. A palette toggle switches `mono` / `color` and re-renders; print uses the palette on screen, so `mono` is the default. A Print button calls `window.print()`. Errors from `parseNightsFile` show in the page. `index.html` carries `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; connect-src 'none'">`. `print.css`: `@page { size: letter landscape; margin: 0.35in }`, one `.sheet` per page with `break-after: page`. All interactive elements sit inside one `<header class="controls no-print">`, plus the error banner (`.no-print`); `@media print { .no-print { display: none !important } }`. Vite builds with `viteSingleFile()` to `packages/web/dist/index.html`.

- [ ] **Step 1: Write the failing tests:**
  - `renderReport` on a two-week fixture file gives 1 page; on a three-week file gives 2.
  - `bad file gives an error, no throw`: `"{}"` sets `error` matching `/schema/`.
  - `range filter`: `to` before the last night drops later weeks.
  - `palette`: `palette: "color"` pages contain `#3d85c6`; `mono` pages do not.
  - `build.test.ts` (runs after `pnpm -C packages/web build`): `dist/` holds exactly `index.html`; it has no `src="http`, `href="http`, or `<script src=`; it contains `connect-src 'none'`.
  - `print hides controls`: in `index.html`, every `<input`, `<button`, `<select` and `<label` sits inside `<header class="controls no-print">`; the built CSS has a `@media print` rule hiding `.no-print`.
- [ ] **Step 2:** Run `pnpm test -- web`. Expected: FAIL.
- [ ] **Step 3:** Implement `app.ts`, `main.ts`, `index.html`, `print.css`, `vite.config.ts`. Add `build` script `vite build`.
- [ ] **Step 4:** Run `pnpm -C packages/web build && pnpm test`. Expected: PASS.
- [ ] **Step 5:** Manual check. Open `packages/web/dist/index.html` from `file://` in Chrome, load a fixture nights file, open print preview. Expected: Letter landscape, two weeks per sheet, readable with "Black and white" selected, and no controls on the sheet. Toggle `color` and the screen re-renders in colour. DevTools Network tab shows no requests after load.
- [ ] **Step 6:** Commit `feat(web): single-file page that loads a nights file and prints`.

### Task 7: CLI: login, sync, export

**Files:**
- Create: `packages/cli/package.json` (bin `sleep-truth`), `packages/cli/src/main.ts`, `packages/cli/src/paths.ts`, `packages/cli/src/auth.ts`, `packages/cli/src/oura-client.ts`, `packages/cli/src/cache.ts`, `packages/cli/src/export.ts`
- Test: `packages/cli/test/auth.test.ts`, `packages/cli/test/oura-client.test.ts`, `packages/cli/test/cache.test.ts`, `packages/cli/test/export.test.ts`

**Interfaces:**
- Consumes: `normalizeOura`, `OuraSleepDoc`, `NightsFile`.
- Produces:
  - `paths(env = process.env): { config: string; tokens: string; cacheDir: string }` (`config.json`, `tokens.json`, `oura/sleep/` under the XDG roots in Global Constraints)
  - `interface Config { client_id: string; client_secret: string; redirect_port: number }` (default port `8765`)
  - `interface Tokens { access_token: string; refresh_token: string; expires_at: number }` (epoch ms)
  - `authorizeUrl(cfg: Config, state: string, challenge: string): string` targeting `https://cloud.ouraring.com/oauth/authorize` with `response_type=code`, `redirect_uri=http://localhost:<port>/callback`, `scope=daily`, `code_challenge_method=S256`
  - `exchangeCode(cfg, code, verifier, fetchFn = fetch): Promise<Tokens>` and `refresh(cfg, tokens, fetchFn = fetch): Promise<Tokens>`, both POST form-encoded to `https://api.ouraring.com/oauth/token`
  - `class OuraClient { constructor(getToken: () => Promise<string>, fetchFn = fetch); listSleep(start: ISODate, end: ISODate): Promise<OuraSleepDoc[]> }` against `https://api.ouraring.com/v2/usercollection/sleep`
  - `writeDocs(cacheDir, docs): Promise<number>` (one file per `id`, overwrite) and `readDocs(cacheDir): Promise<OuraSleepDoc[]>`
  - `exportNights(docs, from: ISODate, to: ISODate, now: Date): { file: NightsFile; skipped: number }` (keeps periods whose `eveningOf` falls in `[from, to]`; validates its output with `parseNightsFile`)

Commands: `sleep-truth login [--paste]`, `sleep-truth sync [--since YYYY-MM-DD]`, `sleep-truth export --from YYYY-MM-DD --to YYYY-MM-DD -o FILE`. `login` starts a server on `127.0.0.1:<port>`, opens the URL with macOS `open` (prints it too), checks `state`, exchanges the code, writes tokens with mode `0600`. `--paste` skips the server and reads the redirected URL from stdin (fallback for R2). `sync` default `--since`: newest cached `day` minus 3 days, or 365 days ago on first run; end is today. Tokens refresh when `expires_at` is under 5 minutes away or on a 401 (once), and the rotated refresh token is saved before use. On 429, wait `Retry-After` seconds (default 30), at most 3 retries, then fail with a clear message. `export` prints `exported N periods (skipped M) to FILE`.

- [ ] **Step 0 (Andrew, manual):** Register an Oura API Application at `https://cloud.ouraring.com/oauth/applications` with redirect URI `http://localhost:8765/callback`. Record whether Oura accepts it (R2). Put the client id and secret in `~/.config/sleep-truth/config.json`. Task 7's tests do not need this; Task 8 does.
- [ ] **Step 1: Write the failing tests** (all with a stub `fetchFn`; no live calls):
  - `authorizeUrl` includes every parameter above, URL-encoded.
  - `exchangeCode` posts `grant_type=authorization_code`, `code`, `code_verifier`, `redirect_uri`, `client_id`, `client_secret`; sets `expires_at = now + expires_in*1000`.
  - `refresh` posts `grant_type=refresh_token` and returns the new refresh token.
  - `listSleep follows next_token` across 3 pages and sends `User-Agent: sleep-truth/0.1` and `Authorization: Bearer …` on each.
  - `listSleep retries on 429` honouring `Retry-After: 0`, and fails after 3.
  - `writeDocs overwrites by id`: writing a revised doc leaves one file with the new content.
  - `paths honours XDG vars` and defaults to `~/.config` / `~/.local/share`.
  - `exportNights filters by range` and returns a file `parseNightsFile` accepts.
  - `tokens file is 0600` after a write.
- [ ] **Step 2:** Run `pnpm test -- cli`. Expected: FAIL.
- [ ] **Step 3:** Implement the modules and `main.ts` with `parseArgs`. Run the CLI with `node --experimental-strip-types` or a `tsc` build; pick one and make `pnpm -C packages/cli start -- <args>` work.
- [ ] **Step 4:** Run `pnpm test && pnpm typecheck`. Expected: PASS.
- [ ] **Step 5:** Commit `feat(cli): Oura login, sync and nights export`.

### Task 8: First real printout (local only)

**Files:**
- Modify: `docs/design/week-grid-mvp.md` (§6, record R1 and R2 outcomes as facts)
- Modify: `README.md` (a short "Try it" section: register app, login, sync, export, open page, print)

- [ ] **Step 1:** Run `sleep-truth login`, then `sleep-truth sync`, then `sleep-truth export --from <4 weeks ago> --to <today> -o ~/sleep-truth.nights.json`. Expected: a file with one period per night or more. Nothing written inside the repo.
- [ ] **Step 2:** Open `packages/web/dist/index.html`, load the file, print to PDF and on paper in black and white. Andrew compares one night against the Oura app. Expected: same shape and the same asleep / in-bed figures.
- [ ] **Step 3 (R1 probe):** `curl -s -X OPTIONS https://api.ouraring.com/v2/usercollection/sleep -H 'Origin: http://localhost:8765' -H 'Access-Control-Request-Method: GET' -H 'Access-Control-Request-Headers: authorization' -D -` now that the app exists with that redirect URI. Record the status and any `access-control-allow-origin` in the design doc.
- [ ] **Step 4:** Update `README.md` and the design doc. Commit `docs: first real printout, R1/R2 results, try-it steps`.
