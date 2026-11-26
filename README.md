# Sleep Truth

**Clinically honest sleep reporting from the wearable you already own.**

Sleep Truth is an open source, self-hosted tool that pulls raw data from consumer
sleep wearables (starting with Oura) and turns it into the metrics, trends, and
doctor-ready reports a clinician actually needs — without asking you to trust a
third party with your health data.

> **Status: design stage.** This repository currently contains the project's
> [vision and market requirements document](vision-mrd.md). No code has shipped yet.
> The README below describes what the project is building and the principles it is
> committed to, so you can judge whether it's worth watching — or contributing to —
> before a line of code exists.

---

## ⚠️ Not a diagnostic tool

Sleep Truth surfaces data and published reference ranges. It does **not** diagnose
sleep disorders, and it is not a substitute for a clinical sleep study
(polysomnography). It exists to make the conversation with your doctor better —
to be the bridge to a proper workup, not a replacement for one. Every report it
generates carries this disclaimer.

---

## Why this exists

Consumer sleep apps are built for healthy people optimizing for marginal gains.
Their scores are **personalized against your own rolling baseline** — they answer
"are you sleeping better or worse than your recent average?", never "is this sleep
healthy by any external standard?"

The practical effect: someone with genuinely poor, fragmented sleep can see months
of "good" scores, because the app is grading on a curve of their own bad nights.
For the people who need the data most — people with suspected sleep disorders
trying to figure out what's wrong — this is actively unhelpful. The best the stock
apps offer a doctor is a static PDF with proprietary scores, no clinical framing,
and none of the metrics that matter for diagnosis.

Sleep Truth shows the number and the reference range, sourced from sleep-medicine
literature and cited in this repository. No streaks, no badges, no readiness
abstractions.

## What it will do

- **Ingest** raw sleep, HRV, heart rate, and temperature data from the Oura API v2
  on a schedule, into storage you own.
- **Compute clinically-referenced metrics**, each annotated with its published
  reference threshold and a citation:
  - Sleep efficiency (vs. the ~85% clinical marker)
  - Wake after sleep onset (WASO)
  - Sleep onset latency — mean and night-to-night variance
  - Awakening / fragmentation counts
  - Bedtime and wake-time regularity
  - HRV and resting heart rate trends
- **Export a doctor-facing report** (PDF/CSV) for a date range you choose,
  formatted to read like something a sleep clinician is used to reviewing — not a
  consumer dashboard screenshot.
- **Show trends locally** via a simple dashboard/CLI (secondary to the export).

Oura is the v1 focus, but the data model and ingestion layer are designed so other
wearables (Whoop, Garmin, Apple Watch) can plug in later without a redesign.

## What it deliberately is not

These are load-bearing non-goals, not gaps waiting for a contributor:

- **Not a product or hosted service.** No accounts, no monetization, no SaaS.
- **Not multi-tenant, ever.** There is no shared backend that touches more than one
  person's health data — which is what keeps the project (and you) out of
  HIPAA/data-processor territory.
- **Not a diagnostic tool.** See the disclaimer above.
- **Not a reimplementation of proprietary scoring.** Sleep-scoring algorithms are a
  patent-dense space; this project sticks to descriptive, statistical metrics from
  the clinical literature.

Requests for a "hosted version" or "shared dashboard" will be declined, kindly and
firmly.

## Principles

1. **Clinical honesty over gamification.** The number and the reference range,
   every time.
2. **Privacy by architecture, not by policy.** Single-tenant by design: your data
   lives in storage you own, under credentials you control. There is no backend
   that could see your data even if it wanted to. This is a technical guarantee,
   not a promise in a privacy policy — and it's verifiable, because the code is
   open.
3. **Radical cost accessibility.** Target running cost is single-digit dollars per
   year, ideally within cloud free tiers or fully local. If it costs real money,
   it only serves people who can afford it, which defeats the purpose.
4. **Legible to clinicians.** Reports should look like something a sleep doctor
   reviews, not a wellness app export.
5. **Optimized for adoption, not attribution.** If a device maker takes these
   ideas — or this code — and builds them into their product natively, that is the
   win condition. That's why the license is permissive.

## Who it's for

- **Primarily:** people with unexplained bad sleep who own a wearable, get no
  useful signal from the stock app, and want something concrete to bring to a
  doctor's appointment. This persona is *not* assumed to be technical — which is
  why a one-click deploy path is a v1 priority, not a stretch goal.
- **Secondarily:** self-hosters who want to own their health data pipeline.
- **Aspirationally:** the clinical/data team at a wearable company looking for a
  well-scoped, well-licensed reference implementation of clinically honest
  reporting.

## Roadmap to v1

- [ ] Verify Oura API v2 terms permit this use (before finalizing architecture)
- [ ] Source and cite every clinical threshold from sleep-medicine literature
- [ ] Ingestion pipeline: Oura API v2 → user-owned storage, serverless/cron-friendly
- [ ] Metric computation layer
- [ ] Doctor-facing PDF/CSV export with annotated reference ranges
- [ ] One-click deploy path (documented Docker Compose and/or free-tier template)
- [ ] Local trend dashboard/CLI

The full reasoning behind these choices — including the risks the project is
tracking — lives in the [vision & MRD](vision-mrd.md).

## Try it: the week-grid printout

Needs [mise](https://mise.jdx.dev). It installs the pinned Node and pnpm.

1. Register an Oura API application at
   <https://developer.ouraring.com/applications>. Set the redirect URI to
   `http://localhost:8765/callback`, and tick the `daily` scope.
2. Write `~/.config/sleep-truth/config.json`:
   `{ "client_id": "…", "client_secret": "…" }`
3. Install and build: `mise exec -- pnpm install`, then
   `mise exec -- pnpm -C packages/web build`. Put the command on your PATH:
   `ln -sf "$PWD/bin/sleep-truth" ~/.local/bin/sleep-truth`.
4. Log in and fetch: `sleep-truth login`, then `sleep-truth sync`. The first sync fetches a
   year; add `--since YYYY-MM-DD` to fetch less. If the browser cannot
   reach the callback, use `login --paste` and paste the redirected URL.
5. Export: `sleep-truth export --from 2026-11-01 --to 2026-11-28 -o ~/sleep.nights.json`.
   Keep the file outside the repo.
6. Open `packages/web/dist/index.html` in a browser and load the file. Pick
   *Printable* or *Colour*, then Print. Choose US Letter, landscape.
7. Remove local Oura data and Sleep Truth access with
   `sleep-truth forget`. Delete exported nights
   files yourself.

The page reads the file in the browser and sends nothing anywhere. Raw Oura
data is cached in `~/.local/share/sleep-truth/`.

## License

[Apache 2.0](LICENSE). Permissive licensing is deliberate: the project's stated goal
is that a device manufacturer could adopt this work with nothing standing in the
way, and Apache 2.0's explicit patent grant matters in a domain where sleep-metric
algorithms carry existing patents. See [§7 of the MRD](vision-mrd.md#7-license-recommendation)
for the full reasoning.

## Contributing

The project is maintained by one person in their spare time and optimizes for low
maintenance burden and boring, stable technology. Contributions are welcome,
especially from anyone with clinical sleep-medicine background who can
review the reference thresholds. Contributions that move the project toward
multi-tenancy or hosted operation will be declined per the non-goals above.
See [CONTRIBUTING.md](CONTRIBUTING.md) to get set up.
