/** A sleep stage per 30-second epoch: Wake, REM, Light, Deep. */
export type Stage = "W" | "R" | "L" | "D";

/** Movement per epoch: none, restless, tossing, active. */
export type MovementLevel = "0" | "1" | "2" | "3";

export interface Period {
  id: string;
  /** ISO 8601 with offset, the wearable's local clock at bedtime. */
  start: string;
  /** ISO 8601 with offset. */
  end: string;
  source_type: string;
  epoch_seconds: 30;
  /** Set when the device recorded coarser stages that were repeated to fill 30-second epochs. */
  native_epoch_seconds?: number;
  /** One letter per epoch, from `WRLD`. */
  stages: string;
  /** One digit per epoch, from `0123`; same length as `stages`. */
  movement: string;
  totals: { asleep_s: number; in_bed_s: number };
}

export interface NightsFile {
  schema: "sleep-truth/nights";
  version: 1;
  source: { device: string; exported_at: string };
  periods: Period[];
}

export class NightsFileError extends Error {
  override name = "NightsFileError";
}

const ISO_WITH_OFFSET = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(Z|[+-]\d{2}:\d{2})$/;

/** Offset of an ISO timestamp in minutes east of UTC, e.g. -420 for -07:00. */
export function offsetMinutes(iso: string): number {
  const m = ISO_WITH_OFFSET.exec(iso);
  if (!m) throw new NightsFileError(`timestamp has no offset: ${iso}`);
  const tz = m[1]!;
  if (tz === "Z") return 0;
  const sign = tz.startsWith("-") ? -1 : 1;
  return sign * (Number(tz.slice(1, 3)) * 60 + Number(tz.slice(4, 6)));
}

function isObject(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

function fail(field: string, why: string): never {
  throw new NightsFileError(`${field}: ${why}`);
}

function str(o: Record<string, unknown>, key: string, path: string): string {
  const v = o[key];
  if (typeof v !== "string") fail(`${path}${key}`, "expected a string");
  return v;
}

function isoField(o: Record<string, unknown>, key: string, path: string): string {
  const v = str(o, key, path);
  if (!ISO_WITH_OFFSET.test(v) || Number.isNaN(Date.parse(v))) {
    fail(`${path}${key}`, "expected an ISO timestamp with offset");
  }
  return v;
}

function seconds(o: Record<string, unknown>, key: string, path: string): number {
  const v = o[key];
  if (typeof v !== "number" || !Number.isFinite(v) || v < 0) {
    fail(`${path}${key}`, "expected a non-negative number");
  }
  return v;
}

function parsePeriod(input: unknown, i: number): Period {
  const path = `periods[${i}].`;
  if (!isObject(input)) fail(`periods[${i}]`, "expected an object");
  const id = str(input, "id", path);
  const start = isoField(input, "start", path);
  const end = isoField(input, "end", path);
  const source_type = str(input, "source_type", path);
  if (input.epoch_seconds !== 30) fail(`${path}epoch_seconds`, "expected 30");
  const stages = str(input, "stages", path);
  if (!/^[WRLD]*$/.test(stages)) fail(`${path}stages`, "expected only W, R, L, D");
  const movement = str(input, "movement", path);
  if (!/^[0-3]*$/.test(movement)) fail(`${path}movement`, "expected only 0-3");
  if (movement.length !== stages.length) fail(`${path}movement`, "length differs from stages");
  const native = input.native_epoch_seconds;
  if (native !== undefined && !(typeof native === "number" && Number.isInteger(native) && native > 30 && native % 30 === 0)) {
    fail(`${path}native_epoch_seconds`, "expected a multiple of 30 above 30");
  }
  const totals = input.totals;
  if (!isObject(totals)) fail(`${path}totals`, "expected an object");
  const tpath = `${path}totals.`;
  return {
    id,
    start,
    end,
    source_type,
    epoch_seconds: 30,
    ...(native === undefined ? {} : { native_epoch_seconds: native }),
    stages,
    movement,
    totals: { asleep_s: seconds(totals, "asleep_s", tpath), in_bed_s: seconds(totals, "in_bed_s", tpath) },
  };
}

/** Validate untrusted JSON as a nights file. Throws NightsFileError naming the first bad field. */
export function parseNightsFile(input: unknown): NightsFile {
  if (!isObject(input)) fail("file", "expected a JSON object");
  if (input.schema !== "sleep-truth/nights") fail("schema", 'expected "sleep-truth/nights"');
  if (typeof input.version === "number" && input.version > 1) {
    fail("version", `this file is from a newer Sleep Truth (version ${input.version}). This page reads version 1. Use a newer copy of the page`);
  }
  if (input.version !== 1) fail("version", "expected 1");
  const source = input.source;
  if (!isObject(source)) fail("source", "expected an object");
  const device = str(source, "device", "source.");
  const exported_at = str(source, "exported_at", "source.");
  if (!Array.isArray(input.periods)) fail("periods", "expected an array");
  return {
    schema: "sleep-truth/nights",
    version: 1,
    source: { device, exported_at },
    periods: input.periods.map(parsePeriod),
  };
}
