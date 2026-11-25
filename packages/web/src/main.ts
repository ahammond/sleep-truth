import Holidays from "date-holidays";
import type { Palette } from "@sleep-truth/core";
import { renderReport, type Settings } from "./app.ts";
import "./print.css";

// Every interactive element lives in index.html inside <header class="controls no-print">.
// This file only wires them up; it adds sheets and <option>s, never controls.

const STORE = "sleep-truth.settings";
const DEFAULTS: Settings = { region: { country: "CA", state: "BC" }, palette: "mono" };

function $<T extends HTMLElement>(id: string): T {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el as T;
}

const fileInput = $<HTMLInputElement>("file");
const fromInput = $<HTMLInputElement>("from");
const toInput = $<HTMLInputElement>("to");
const countrySel = $<HTMLSelectElement>("country");
const stateSel = $<HTMLSelectElement>("state");
const printBtn = $<HTMLButtonElement>("print");
const errorBox = $<HTMLDivElement>("error");
const emptyNote = $<HTMLParagraphElement>("empty");
const sheets = $<HTMLElement>("sheets");
const paletteInputs = [...document.querySelectorAll<HTMLInputElement>('input[name="palette"]')];

const holidays = new Holidays();

/** Settings persist; health data never does. */
function loadSettings(): Settings {
  try {
    const raw = localStorage.getItem(STORE);
    if (!raw) return { ...DEFAULTS };
    const s = JSON.parse(raw) as Partial<Settings>;
    return {
      region: s.region && typeof s.region.country === "string" ? s.region : DEFAULTS.region,
      palette: s.palette === "color" ? "color" : "mono",
    };
  } catch {
    return { ...DEFAULTS };
  }
}

function saveSettings(s: Settings): void {
  try {
    localStorage.setItem(STORE, JSON.stringify({ region: s.region, palette: s.palette }));
  } catch {
    // Private mode or file:// without storage: settings just do not persist.
  }
}

let settings = loadSettings();
let fileText: string | null = null;

function fillOptions(sel: HTMLSelectElement, entries: Record<string, string> | undefined, selected?: string): void {
  sel.replaceChildren();
  const list = Object.entries(entries ?? {}).sort((a, b) => a[1].localeCompare(b[1]));
  if (sel === stateSel) {
    const none = document.createElement("option");
    none.value = "";
    none.textContent = list.length ? "Whole country" : "—";
    sel.append(none);
  }
  for (const [code, name] of list) {
    const opt = document.createElement("option");
    opt.value = code;
    opt.textContent = name;
    sel.append(opt);
  }
  sel.value = selected ?? "";
  sel.disabled = sel === stateSel && list.length === 0;
}

function fillRegion(): void {
  fillOptions(countrySel, holidays.getCountries("en"), settings.region.country);
  fillOptions(stateSel, holidays.getStates(settings.region.country, "en") || undefined, settings.region.state ?? "");
}

function showError(msg: string | undefined): void {
  errorBox.hidden = !msg;
  errorBox.textContent = msg ?? "";
}

function render(): void {
  if (fileText === null) return;
  const report = renderReport(fileText, {
    ...settings,
    from: fromInput.value || undefined,
    to: toInput.value || undefined,
  });
  showError(report.error);
  if (!fromInput.value) fromInput.value = report.range.from;
  if (!toInput.value) toInput.value = report.range.to;
  sheets.replaceChildren(
    ...report.pages.map((svg) => {
      const div = document.createElement("div");
      div.className = "sheet";
      // The SVG is built by renderPage from escaped text and numbers only.
      div.innerHTML = svg;
      return div;
    }),
  );
  emptyNote.hidden = report.pages.length > 0;
  printBtn.disabled = report.pages.length === 0;
}

function loadFile(file: File): void {
  const reader = new FileReader();
  reader.onload = () => {
    fileText = String(reader.result ?? "");
    fromInput.value = "";
    toInput.value = "";
    render();
  };
  reader.onerror = () => showError("Could not read that file.");
  reader.readAsText(file);
}

fileInput.addEventListener("change", () => {
  const f = fileInput.files?.[0];
  if (f) loadFile(f);
});

document.addEventListener("dragover", (e) => {
  e.preventDefault();
  document.body.classList.add("dragging");
});
document.addEventListener("dragleave", (e) => {
  if (e.target === document.documentElement || e.relatedTarget === null) document.body.classList.remove("dragging");
});
document.addEventListener("drop", (e) => {
  e.preventDefault();
  document.body.classList.remove("dragging");
  const f = e.dataTransfer?.files[0];
  if (f) loadFile(f);
});

fromInput.addEventListener("change", render);
toInput.addEventListener("change", render);

countrySel.addEventListener("change", () => {
  settings = { ...settings, region: { country: countrySel.value } };
  fillRegion();
  saveSettings(settings);
  render();
});

stateSel.addEventListener("change", () => {
  settings = { ...settings, region: { country: settings.region.country, ...(stateSel.value ? { state: stateSel.value } : {}) } };
  saveSettings(settings);
  render();
});

for (const input of paletteInputs) {
  input.checked = input.value === settings.palette;
  input.addEventListener("change", () => {
    if (!input.checked) return;
    settings = { ...settings, palette: input.value as Palette };
    saveSettings(settings);
    render();
  });
}

printBtn.addEventListener("click", () => window.print());

fillRegion();
