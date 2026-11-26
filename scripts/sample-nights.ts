// Writes a synthetic nights file to stdout, for print checks and screenshots.
// Never real data: every night comes from a seeded generator.
//   mise exec -- node scripts/sample-nights.ts > /tmp/sample.nights.json
import { parseNightsFile, type NightsFile, type Period } from "../packages/core/src/index.ts";
import { period } from "../packages/core/test/helpers/period.ts";
import { synthNight } from "../packages/core/test/helpers/synth.ts";

const FIRST = "2026-11-01";
const periods: Period[] = [];
for (let i = 0; i < 28; i++) {
  if (i === 5) continue; // one night with no data
  const evening = new Date(Date.parse(`${FIRST}T00:00:00Z`) + i * 86_400_000).toISOString().slice(0, 10);
  const offset = i >= 16 && i < 20 ? "-05:00" : "-08:00"; // a four-night trip east
  const p = period({ id: `sample:${i}`, start: `${evening}T22:${String(10 + i).padStart(2, "0")}:00${offset}`, ...synthNight(500 + i, 7 + (i % 4) * 0.4) });
  periods.push(i === 9 ? { ...p, native_epoch_seconds: 300 } : p); // one night from 5-minute stages
}
const file: NightsFile = { schema: "sleep-truth/nights", version: 1, source: { device: "oura", exported_at: "2026-11-29T12:00:00Z" }, periods };
process.stdout.write(JSON.stringify(parseNightsFile(file), null, 2) + "\n");
