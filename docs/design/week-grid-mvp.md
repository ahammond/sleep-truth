# Week-grid sleep printout: MVP design

Status: approved. Scope: first shippable slice of Sleep Truth.
Companion docs: `README.md`, `vision-mrd.md` (principles, non-goals).

## 1. Intent

Andrew wears an Oura ring and is working with a sleep doctor. He wants a
printout that shows every night as an Oura-style hypnogram, stacked
Sunday to Saturday and then week by week, all on one local-clock axis,
so weekly patterns jump out on paper.

The long-term goal is bigger: hand the tool to the doctor, who shares it
with other sleep doctors and with patients who are not technical. This
iteration serves Andrew only, but every structural choice must keep two
later paths open:

- **Hosted path:** the doctor gives a patient a link; the patient logs in
  to Oura in the page and prints. No server ever holds health data.
- **App path:** a small desktop app with the same page inside, if the
  browser cannot call Oura directly (see §6, risk R1).

## 2. Goals, non-goals, anti-goals

Goals (this iteration):

- Pull Andrew's sleep data from the Oura API v2 and keep it on his disk.
- Render a printable, monotone-friendly week grid from that data.
- Mark public holidays and time zone changes on the grid.
- Split the work so the presentation layer is a static web page (SPA)
  and data sourcing is a command-line tool (CLI), joined by a data file.

Non-goals (this iteration; most are later iterations):

- Hosting the SPA anywhere, in-browser Oura login, a desktop app.
- Clinical metrics (efficiency, WASO, latency variance, regularity).
- CSV or spreadsheet export for the doctor.
- Personal day flags, Oura tags, calendar integration.
- A4 paper, other wearables, colour themes beyond the two palettes.

Anti-goals (would make it a failure even if it works):

- Any upload of health data, telemetry, analytics, CDN fetches, or other
  network traffic from the SPA.
- Any encoding that only colour can carry. The printout must read
  correctly on a cheap black-and-white laser printer.
- Reproducing Oura scores or any proprietary scoring.
- Missing the "not a diagnostic tool" disclaimer on any printed page.

## 3. Constraints and facts (verified 2026-11-24)

- Oura personal access tokens were retired in December 2025. Access needs
  a registered OAuth app ("API Application"). An app serves at most 10
  users until Oura approves it.
- The authorization-code flow requires the client secret at the token
  exchange, even with PKCE. Refresh tokens are single-use and rotate.
- A "client-side only" flow exists (`response_type=token`): no secret,
  30-day token, no refresh. That is the flow a distributed SPA would use.
- `api.ouraring.com` rejects CORS preflights from every origin tried
  (`localhost`, a `github.io` origin, `cloud.ouraring.com`) with
  `400 Disallowed CORS origin`. Some origin allowlist exists; how an
  origin gets on it is unknown.
- Every request must send a `User-Agent` header.
- Sleep documents (`GET /v2/usercollection/sleep`, `start_date` /
  `end_date`, paginated by `next_token`) carry per period:
  - `bedtime_start`, `bedtime_end`: ISO timestamps with local UTC offset.
  - `day`: the date Oura assigns the sleep to (the morning date).
  - `type`: `long_sleep`, `sleep`, `late_nap`, `rest`, `deleted`.
  - `sleep_phase_30_sec`: one char per 30 s; `1` deep, `2` light,
    `3` REM, `4` awake.
  - `movement_30_sec`: one char per 30 s; `1` none, `2` restless,
    `3` tossing and turning, `4` active.
  - Totals: `total_sleep_duration`, `time_in_bed`, and others.
- Oura's own app shows only the four stages and the movement strip seen
  in the Oura app's sleep "Details" view.
- Vision principles bind: single-tenant, no shared backend, near-zero
  cost, boring technology, one maintainer.

## 4. Approaches considered

1. **Python CLI that fetches and writes a PDF.** Best charting and
   holiday libraries. Rejected: nothing carries into a browser or app for
   non-technical patients; it would be rewritten.
2. **TypeScript CLI plus core, writing a report page to print.** Works,
   but ties presentation to the CLI. Option 3 is the same core with the
   seam in a better place.
3. **SPA for presentation, CLI for sourcing, joined by a data file.
   (Chosen; Andrew's proposal.)** The SPA never needs credentials or the
   network in this iteration. Later, sourcing moves into the SPA (hosted
   path) or into a desktop shell (app path); the presentation is untouched
   either way. The data file also becomes a thing a patient can hand to a
   doctor, who opens it in the same page.
4. **Desktop app first.** Rejected for now: installers, code signing and
   update plumbing before we know they are needed.
5. **Hosted SPA with in-browser Oura login first.** Rejected for now:
   blocked on the CORS allowlist (R1) and Oura approval past 10 users.

## 5. Design

### 5.1 Shape

A pnpm workspace, TypeScript throughout, Node LTS pinned by the repo's
`mise.toml`.

```
packages/
  core/   pure functions, no I/O: Oura docs -> nights file -> page model -> SVG
  cli/    Oura OAuth, sync to a local cache, export the nights file
  web/    the SPA: load a nights file, render pages, print
```

`core` is shared by the CLI (normalisation at export) and the SPA
(layout and drawing). Because `core` holds the Oura-to-nights
normalisation, a later in-browser fetch reuses it unchanged.

### 5.2 The nights file (the contract)

One JSON file, versioned, device-neutral, so other wearables can export
into it later. Shape (field names are the builder's to refine):

```jsonc
{
  "schema": "sleep-truth/nights",
  "version": 1,
  "source": { "device": "oura", "exported_at": "2026-11-25T17:00:00Z" },
  "periods": [
    {
      "id": "oura:<document id>",
      "start": "2026-11-18T22:41:00-07:00",   // local time with offset
      "end":   "2026-11-19T06:30:00-07:00",
      "source_type": "long_sleep",             // Oura type, kept verbatim
      "epoch_seconds": 30,
      // "native_epoch_seconds": 300,         // optional: stages came from 5-minute data
      "stages":   "WWLLDDLR...",               // W awake, R REM, L light, D deep
      "movement": "0012300...",                // 0 none .. 3 active
      "totals": { "asleep_s": 25920, "in_bed_s": 31740 }
    }
  ]
}
```

- Oura `deleted` and `rest` periods are dropped at export. The other
  types (`long_sleep`, `sleep`, `late_nap`) are kept verbatim and do not
  drive drawing: Oura's `sleep` covers both short naps and the second
  half of a split night, so placement uses the time window only.
- The file holds periods, not "nights". Grouping into rows is a
  presentation decision made in `core` at render time, so the rule can
  change without re-exporting.
- Stage and movement letters are our own vocabulary, decoupled from
  Oura's digits.
- Totals come from Oura's fields, not recomputed, in this iteration. The
  one exception: when Oura's `total_sleep_duration` is null, asleep is the
  count of non-awake epochs times 30 seconds.
- When Oura has no 30-second phases, the converter repeats each 5-minute
  phase ten times and sets the optional `native_epoch_seconds: 300` on the
  period. The printout marks those rows `5-min stages`, and a line under
  the source line counts them on each page.

### 5.3 CLI

Commands (names are the builder's to refine):

- `sleep-truth login`: authorization-code flow against Andrew's own Oura
  app, with a loopback redirect (`http://localhost:<port>/callback`).
  Client id and secret come from a config file Andrew fills in once.
  Tokens are stored in the user config directory, mode `0600`.
- `sleep-truth sync [--since DATE]`: fetch sleep documents, store the raw
  JSON responses unmodified in a local cache, refreshing tokens as needed.
  Re-running is safe and incremental (re-fetch the last few days, because
  Oura revises recent nights).
- `sleep-truth export --from DATE --to DATE -o nights.json`: normalise the
  cached raw documents through `core` into a nights file.

Raw responses stay on disk so the normalisation can be re-run when the
nights format changes, without re-downloading.

Location of config, tokens and cache: platform-standard user directories
(builder's call; XDG on macOS is fine for Andrew).

### 5.4 SPA

- Built to a **single self-contained HTML file** (all script and style
  inlined). It opens from `file://`, can be emailed, and can later be
  hosted as-is on any static host.
- Loads a nights file by file picker or drag-and-drop. Reads it locally.
  Nothing leaves the browser.
- A strict Content-Security-Policy with `connect-src 'none'` enforces the
  no-network rule in this iteration.
- Controls: date range (defaults to the whole file), holiday region
  (defaults to Canada / British Columbia). Choices may persist in
  `localStorage`; health data does not.
- A palette toggle: printable (monotone, the default) or colour. Colour
  changes stage fills only; height still carries the stage. Print uses
  the palette on screen.
- Prints through the browser's print dialog. Print CSS sets US Letter
  landscape and one sheet per page. Every interactive element is hidden
  in print; only the sheets print.
- Plain TypeScript plus SVG, no UI framework. Vite builds it.

### 5.5 The printed page (approved by mockup)

Reference mockup: [`week-grid-mockup.html`](week-grid-mockup.html), made-up
data. Andrew picked drawing style A.

- **Paper:** US Letter landscape, two weeks per page.
- **Weeks:** Sunday-to-Saturday weeks, shown newest night first: the
  weeks and the days inside them both descend, so dates run without a
  break. The time zone boundary line sits below the changed row. A row is labelled by the **evening the
  night starts** ("Fri Nov 13" is Friday night). Missing nights show an
  empty row with "no data". Partial first and last weeks keep empty rows
  so columns stay aligned.
- **Time axis:** local clock, 8 PM to noon, identical for every row, with
  hour gridlines and a heavier midnight line. Hour labels on each week's
  header.
- **Row assignment:** a period belongs to the row of the evening whose
  8 PM-to-noon window it overlaps most, using the period's own local
  time, and is clipped to that window. Periods that overlap no window
  (afternoon naps between noon and 8 PM) are not drawn; the row of the
  evening that follows notes "+N nap" in its stats.
- **Several periods on one row** (a night split by a long wake, or a
  late nap) are drawn on the same row with a visible gap between them.
- **Stage drawing (style A):** four levels, Awake on top, then REM,
  Light, Deep. Filled blocks at the level's height: Awake white with a
  black outline, REM light gray, Light mid gray, Deep near black, with
  thin vertical connectors between consecutive blocks. Height carries the
  meaning; gray is reinforcement only.
- **Movement strip:** directly under the stages. One tick per 30 s epoch
  with movement, tick height and weight rising with level. Level `none`
  draws nothing.
- **Right column:** time asleep / time in bed, as `7h12 / 8h49`, summed
  over every period assigned to the row, using Oura's per-period totals
  even where the drawing is clipped. Periods that overlap no window are
  excluded and only counted in the "+N nap" note.
- **Holidays:** ◆ plus the holiday name in the row gutter, and light
  diagonal hatching over the exact local hours of the holiday across
  whichever rows they fall on (the morning of a holiday hatches the
  previous evening's row). The holiday's date runs midnight to midnight
  on each row's own local clock, so travel nights hatch the date as it
  was lived. Source: the `date-holidays` library, region configurable.
  A name too long for the gutter wraps to a second line when the row has
  no other note, and ends in … where it still does not fit.
- **Row offset:** a row's UTC offset is the start offset of its longest
  period. It drives the markers below. Each period is still drawn on its
  own local clock.
- **Time zone changes:** when a row's UTC offset differs from the
  previous row's, draw ✈ with `UTC-7 → UTC-5` in the gutter and a dashed
  rule below the row, between it and the earlier night. Rows whose offset
  differs from the most common offset in the range ("home") say
  `local UTC-5` in the gutter. The exception is a daylight-saving change:
  a run of rows one hour off home that reaches the first or last row with
  data gets the ✈ but no `local` label.
- **Header:** title with the date range, a one-line source note, and a
  legend for stages, movement, markers and holiday hatching.
- **Footer on every page:** the not-a-diagnostic-tool disclaimer and
  "Page N of M".

### 5.6 Testing

- Fixtures are **synthetic**, hand-authored to match the OpenAPI schema,
  and committed. Andrew's real data never goes into git; a local-only
  smoke test can run against his cache.
- `core` has unit tests driven by those fixtures, including: a
  normal night, a night split into two periods, a late nap, a time zone
  change, a DST change, a holiday, a missing night, a week boundary.
- Rendering has SVG snapshot tests per fixture.
- The CLI's HTTP and OAuth code is tested against recorded responses, not
  the live API.

## 6. Risks and open items

- **R1, CORS allowlist.** Decides hosted path versus app path later. Not
  on this iteration's critical path. Probed 2026-11-26 with the Sleep Truth
  app registered, its website `https://sleep-truth.agh1973.com` and both
  redirect URIs on file. A preflight to `/v2/usercollection/sleep` returns
  400 `Disallowed CORS origin` for both `http://localhost:8765` and
  `https://sleep-truth.agh1973.com`. Registering an origin does not open
  CORS. The browser still cannot call Oura, so the CLI stays.
- **R2, loopback redirect.** Oura accepts `http://localhost:8765/callback`
  as a redirect URI. `login` completed through the local callback on the
  first try. `https://sleep-truth.agh1973.com/callback/` is also registered.
  Setting `redirect_uri` to it in config.json makes `login` use paste mode
  through that page; the trailing slash matters, because the site
  redirects `/callback` to `/callback/` and drops the query string.
- **R3, Oura developer terms.** Read. The API Agreement (effective
  2026-06-08) needs a privacy policy, deletion on request, and retention no
  longer than necessary once other people authorize the app. The site's
  privacy policy and terms, and `sleep-truth forget`, answer those. Keeping
  each user on their own login, with no relay, keeps Sleep Truth outside the
  agreement's Aggregator definition.
- **R4, DST and offset changes inside one period.** The 30 s string is
  elapsed time. Plot each period on the clock of its start offset; mark
  the row with the time-change marker when start and end offsets differ.
- **R5, Oura approval past 10 users.** A governance question for the
  hosted path: whose Oura app patients log into. Later iteration.

## 7. Decided by Andrew

- SPA for presentation plus CLI for sourcing (approach 3).
- Four stages (Awake, REM, Light, Deep) with a movement strip below.
- Local clock time; mark time zone changes.
- Sunday-to-Saturday weeks, newest night first, so dates descend without a break.
- Markers for interesting days: public holidays only.
- Drawing style A (gray blocks).
- Direction: toward a tool a sleep doctor can share with other doctors
  and non-technical patients.

## 8. Builder's calls already made (correctable)

- TypeScript, pnpm workspace, Vite, no UI framework, Node via `mise`.
- Device-neutral nights file between CLI and SPA; rows grouped at render.
- Single-file SPA build with `connect-src 'none'`.
- 8 PM to noon window; rows labelled by evening; two weeks per page.
- BC holidays by default via `date-holidays`.
- Raw Oura responses cached unmodified.

- Build order: `core` and SPA first on synthetic fixtures; the CLI's live
  Oura steps (R2 check, then sync) once Andrew has registered his Oura app.
- Row placement by time window only; Oura `type` kept but not used.
- Row totals sum all periods on the row; longest period sets row offset.
- Holiday hatching follows each row's local clock.
- Synthetic, committed test fixtures; no real health data in git.

## 9. Left to the builder

Exact CLI command and flag names, config file format, cache layout,
field names inside the nights file, SVG dimensions and typography,
test runner, lint setup.
