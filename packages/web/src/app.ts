import {
  buildRows,
  eveningOf,
  formatRange,
  groupWeeks,
  holidayMap,
  homeOffset,
  markRows,
  NightsFileError,
  paginate,
  parseNightsFile,
  renderPage,
  type ISODate,
  type Palette,
  type Region,
  type RowMarkers,
} from "@sleep-truth/core";

export interface Settings {
  from?: ISODate;
  to?: ISODate;
  region: Region;
  palette: Palette;
}

export interface Report {
  pages: string[];
  range: { from: ISODate; to: ISODate };
  error?: string;
}

/** Pure: nights-file text plus settings to one SVG string per printed page. */
export function renderReport(fileText: string, settings: Settings): Report {
  const fail = (error: string): Report => ({
    pages: [],
    range: { from: settings.from ?? "", to: settings.to ?? "" },
    error,
  });
  let json: unknown;
  try {
    json = JSON.parse(fileText);
  } catch {
    return fail("This is not a JSON file.");
  }
  let file;
  try {
    file = parseNightsFile(json);
  } catch (e) {
    if (e instanceof NightsFileError) return fail(`Not a nights file: ${e.message}`);
    throw e;
  }
  if (file.periods.length === 0) return fail("The file has no nights.");
  const evenings = file.periods.map(eveningOf).sort();
  const from = settings.from ?? evenings[0]!;
  const to = settings.to ?? evenings.at(-1)!;
  if (from > to) return { ...fail(`The start date (${from}) must be on or before the end date (${to}).`), range: { from, to } };

  const rows = buildRows(file.periods, from, to);
  const years: number[] = [];
  for (let y = Number(rows[0]!.evening.slice(0, 4)); y <= Number(rows.at(-1)!.evening.slice(0, 4)) + 1; y++) years.push(y);
  const marks = markRows(rows, holidayMap(settings.region, years));
  const markers = new Map<ISODate, RowMarkers>(rows.map((r, i) => [r.evening, marks[i]!]));
  const home = homeOffset(rows);
  // Newest week first: the reader starts with now and goes back in time.
  const pages = paginate(groupWeeks(rows).reverse());
  const title = `Sleep, night by night · ${formatRange(from, to)}`;
  return {
    pages: pages.map((page, i) =>
      renderPage(page, markers, { title, pageNo: i + 1, pageCount: pages.length, home, palette: settings.palette }),
    ),
    range: { from, to },
  };
}
