# Sleep Truth
## Vision & Market Requirements Document (v0.1 — Draft)

---

## 1. Vision Statement

Consumer sleep wearables collect clinically relevant data but present it through a lens of relative optimization ("better than your baseline") rather than absolute clinical relevance ("is this normal, and should a doctor see it"). This project exists to close that gap: an open source, self-hosted tool that pulls raw data from consumer sleep wearables (starting with Oura) and turns it into the metrics, trends, and reports a clinician actually needs — without requiring the user to trust a third party with their health data.

The long-term ambition is not to build a company. It's to prove the pattern is valuable enough that a device maker (Oura or otherwise) adopts it natively, so that anyone with disordered sleep — not just people willing to run a script — gets access to clinically honest data about their own body.

---

## 2. Origin / Problem Statement

Consumer sleep-tracking apps are built for and marketed to an already-healthy population optimizing for marginal gains. Their scoring models are typically **personalized against a rolling baseline** rather than benchmarked against clinical thresholds. The practical effect: someone with genuinely poor, fragmented sleep can see months of "good" scores, because the app is only measuring "better or worse than your own recent average," not "healthy or unhealthy by any external standard."

This is actively unhelpful — arguably harmful — for the population who needs it most: people with suspected sleep disorders who need concrete, exportable data to bring to a doctor. Today, the best consumer wearables offer is a static, non-customizable PDF "Shareable Report" with no clinical framing, no thresholds, and no way to see the metrics that actually matter for diagnosis (sleep efficiency vs. the 85% clinical marker, WASO, latency variance, fragmentation counts, regularity).

The people this serves are not the wearable industry's target market. They're not optimizing — they're trying to figure out what's wrong.

---

## 3. Goals

- Give individuals a clear, honest, clinically-framed view of their own sleep data, sourced from wearables they already own.
- Produce a doctor-ready export (PDF/CSV) that surfaces the metrics clinicians actually use, with reference thresholds shown — not proprietary scores.
- Do this with an architecture so cheap to run that cost is never a barrier to adoption (target: single-digit dollars per year, self-hosted).
- Build something a device manufacturer could plausibly fold into their own product, because it's well-scoped, well-licensed, and clearly beneficial to their users — even if it never happens.
- Keep the project maintainable by one person in their spare time without turning into an operational burden.

## 4. Non-Goals

- **Not a product or business.** No hosted service, no accounts, no monetization.
- **Not a diagnostic tool.** It surfaces data and reference ranges; it does not diagnose, and will say so prominently.
- **Not multi-tenant, ever, in its core form.** No shared infrastructure that touches more than one person's health data. This is the load-bearing decision that keeps the project out of HIPAA/data-processor territory (see §7).
- **Not a replacement for clinical sleep studies** (polysomnography). It's a bridge — better data for the conversation that leads to a proper workup, not a substitute for one.

---

## 5. Target Users

| Persona | Need |
|---|---|
| **Primary: the person with unexplained bad sleep** | Owns a wearable, suspects something is wrong, gets no useful signal from the stock app, wants something concrete for a doctor's appointment. |
| **Secondary: the technically capable self-hoster** | Wants to own their health data pipeline, comfortable running a script/cron job/small cloud resource. |
| **Tertiary (aspirational): a device manufacturer's clinical/data team** | Looking for a well-scoped reference implementation of clinically-honest reporting that could inform or become a native feature. |

Notably, the primary persona is *not* necessarily technical. This creates tension with the self-hosted architecture (see §9, Risks) that the project needs to resolve deliberately rather than ignore.

---

## 6. Guiding Principles

1. **Clinical honesty over gamification.** Show the number and the reference range. No streaks, no badges, no "readiness score" abstractions that hide the underlying data.
2. **Privacy by architecture, not by policy.** Single-tenant by design — each user's data lives in storage they own, under credentials they control. The project never has a backend that sees anyone's data. This is a technical guarantee, not a promise in a privacy policy.
3. **Radical cost accessibility.** If it costs real money to run, it's only available to people who can afford it — which undermines the entire purpose. Target architecture cost: a few dollars a year, ideally within free tiers.
4. **Legible to clinicians.** Reports should look and read like something a sleep doctor is used to reviewing, not a consumer dashboard export.
5. **Optimized for adoption, not attribution.** If a company the size of Oura wants to take these ideas — or the code — and build it into their product, that's a win condition, not a threat. See license discussion below.

---

## 7. License Recommendation

**Recommendation: MIT or Apache 2.0 (permissive), not a copyleft license (GPL/AGPL).**

This is a deliberate reversal of the instinct a lot of health-data-privacy-minded projects have toward copyleft. The reasoning:

- **The stated goal is corporate adoption, including by a for-profit device maker.** AGPL in particular is specifically designed to make that kind of adoption costly — it requires derivative works, including SaaS usage, to also be open-sourced. A company like Oura's legal team would very likely reject AGPL code outright. GPL is friendlier but still creates friction around linking/derivative-work boundaries that a corporate legal review will flag and slow down.
- **Permissive licensing directly serves the mission, not just the ego.** The goal explicitly stated is "help people, don't care if Oura profits." A permissive license is the license that says that most literally: it removes every legal reason for a company to say no.
- **Apache 2.0 vs. MIT**: Apache 2.0 adds an explicit patent grant and contribution terms, which matters more once multiple contributors are involved and mildly protects the project (and downstream users) from patent claims — relevant here because "sleep metric algorithms" is a space with existing patents (Oura and others hold some). MIT is simpler and slightly more recognizable. **Apache 2.0 is the stronger default** given the domain, but either is defensible; what should be avoided is copyleft.
- **A permissive license doesn't prevent credit or a "give back" culture** — that's a community-norms question (CONTRIBUTING.md, README framing), not a license enforcement question. Trying to force attribution or reciprocity through the license itself is exactly the mechanism that would deter the adoption the project wants.

---

## 8. High-Level Requirements

### Functional
- Ingest raw sleep, HRV, heart rate, temperature, and readiness-contributor data from the Oura API v2 on a recurring schedule.
- Store data in a format that supports multi-month/year longitudinal queries without a running server.
- Compute and surface clinically-referenced metrics: sleep efficiency, WASO, sleep onset latency (mean + variance), awakening/fragmentation count, bedtime/wake-time regularity, HRV and RHR trends.
- Generate a doctor-facing export (PDF and/or CSV) covering a selectable date range, with reference thresholds annotated.
- Provide a simple local dashboard/CLI for trend visualization (secondary priority to the doctor export).
- Explicit, visible disclaimer: not a diagnostic tool; data is for informational/clinical-conversation purposes.

### Non-Functional
- **Cost**: near-zero marginal cost to run for a single user (target: within free tiers of chosen cloud services, or low single-digit dollars/year if not).
- **Privacy**: no telemetry, no phone-home, no third-party analytics, no shared backend of any kind.
- **Portability**: runs on commodity infrastructure (a $5/mo VPS, a free-tier serverless account, or fully local); no vendor lock-in to a specific cloud.
- **Extensibility**: data model and ingestion layer should be structured so other wearables (Whoop, Garmin, Apple Watch) could plug in later without a redesign, even though Oura is the v1 focus.
- **Low maintenance burden**: minimal moving parts, favor boring/stable technology over cutting-edge.

---

## 9. Risks & Open Questions

- **Accessibility vs. self-hosting tension**: the people who most need this tool are the least likely to be comfortable deploying infrastructure. A one-click deploy path (e.g., a Fly.io/Render template, or a well-documented Docker Compose) should be treated as a v1 priority, not a stretch goal — otherwise the project only serves the technical persona and misses the primary one.
- **Oura API terms of service**: needs review to confirm personal-use API access and redistribution of a client against their API doesn't violate their developer terms. Worth checking early, before architecture is finalized.
- **Clinical accuracy risk**: reference thresholds (e.g., 85% sleep efficiency) need to be sourced from legitimate sleep medicine literature, cited in-repo, and reviewed if possible by an actual clinician or at minimum cross-checked against multiple sources — getting this wrong undermines the entire premise of "clinically honest."
- **Scope creep toward multi-tenant**: any future contributor or user request for a "hosted version" or "shared dashboard" needs to be treated as an explicit non-goal violation and pushed back on, not quietly accommodated.
- **Patent landscape**: sleep-staging and readiness-scoring algorithms are a somewhat patent-dense space (Oura holds several). The project should stick to descriptive/statistical metrics (efficiency, WASO, variance) rather than attempting to reverse-engineer or reproduce any proprietary scoring algorithm.

---

## 10. Why This Could Matter to Oura Specifically

Not a dependency for success, but worth stating as the aspirational path: Oura's own public positioning has shifted toward clinical/medical credibility (physician-shareable reports, perimenopause and cycle tracking features aimed at real health conditions, women's health research partnerships). A well-executed, clinically-grounded reporting layer — proven out in the open, with real user feedback, under a license their legal team can say yes to without a fight — is a low-risk way for them to see a fully-formed feature request rather than a raw idea. The project doesn't need Oura's permission or participation to succeed on its own terms; adoption is upside, not the definition of success.

---

## 11. Definition of Success

In rough priority order:
1. The maintainer's own doctor conversation is measurably better because of data this tool produced.
2. At least a handful of other people with real sleep issues use it and report it helped their own clinical conversations.
3. The project is legible and trustworthy enough that a stranger with health anxiety would feel safe running it.
4. (Aspirational, not required) Someone at a wearable company notices.
