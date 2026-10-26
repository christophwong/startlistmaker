#!/usr/bin/env node
/**
 * Makes a shareable sample from a real Google Form export.
 *
 *   node scripts/anonymize.mjs <real.csv> <out.csv> [seed] [--fix-typos]
 *
 * --fix-typos corrects known header typos ("Dicipline") as if the form had
 * been fixed, so a demo sample maps without manual column picking.
 *
 * Names, emails, emergency contacts, timestamps and PB dates are replaced.
 * Countries are remapped, and AP / PB / dive times are jittered a little.
 * Header quirks, empty cells and value formats ("0:01:35", "22.8",
 * trailing spaces) are kept so the sample exercises the real import.
 * Fails if any name or email from the source survives in the output.
 *
 * Keep the real export outside the repo (see .gitignore).
 */
import fs from "node:fs";
import Papa from "papaparse";

const args = process.argv.slice(2);
const fixTypos = args.includes("--fix-typos");
const [input, output, seedArg = "7"] = args.filter((a) => !a.startsWith("--"));
if (!input || !output) {
  console.error("usage: node scripts/anonymize.mjs <real.csv> <out.csv> [seed] [--fix-typos]");
  process.exit(2);
}

// mulberry32: small, seeded, and good enough to spread picks evenly.
let seed = Number(seedArg) || 7;
const rand = () => {
  let t = (seed = (seed + 0x6d2b79f5) | 0);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
};
const pick = (list) => list[Math.floor(rand() * list.length)];
const jitter = (n) => Math.round((rand() * 2 - 1) * n);

const FEMALE = ["Mara", "Ines", "Lena", "Sana", "Noor", "Ada", "Yuki", "Iris", "Priya", "Hana", "Tess", "Clara", "Elsa", "Nia", "Wren"];
const MALE = ["Rowan", "Theo", "Kai", "Owen", "Felix", "Ezra", "Milo", "Jonah", "Luca", "Silas", "Ravi", "Mateo", "Arlo", "Hugo", "Lior"];
const FIRST = [...FEMALE, ...MALE];
const LAST = ["Pike", "Delgado", "Marsh", "Okafor", "Brandt", "Lindqvist", "Haddad", "Moreau", "Tanaka", "Quinn", "Varga", "Ferreira", "Novak", "Achebe", "Sorensen", "Ibarra", "Kowal", "Reyes", "Abara", "Holt", "Castell", "Nakamura", "Ortiz", "Petrov", "Strand", "Mbeki", "Larsen", "Duval", "Oyelaran", "Weiss"];
const COUNTRIES = ["Canada", "USA", "Mexico", "Japan", "Germany", "New Zealand", "Brazil", "Norway", "France", "Korea"];

const text = fs.readFileSync(input, "utf8").replace(/^﻿/, "");
const { data } = Papa.parse(text, { skipEmptyLines: false });
const [rawHeaders, ...rows] = data;
const headers = fixTypos ? rawHeaders.map((h) => h.replace(/\bDicipline\b/g, "Discipline")) : rawHeaders;

const is = (re) => headers.map((h, i) => (re.test(h) ? i : -1)).filter((i) => i >= 0);
const col = {
  timestamp: is(/timestamp/i),
  email: is(/e-?mail/i),
  first: is(/first\s*name|given/i),
  last: is(/last\s*name|surname|family/i),
  full: is(/^\s*(full\s*)?name\s*$|^athlete\s*name/i),
  emergency: is(/emergency|contact|phone/i),
  date: is(/\bdate\b/i),
  diveTime: is(/time/i).filter((i) => !/timestamp/i.test(headers[i])),
  perf: is(/personal best|\bpb\b|announce|\bap\b/i).filter((i) => !/date|condition/i.test(headers[i])),
  country: is(/country|nationality/i),
  gender: is(/gender|sex/i),
};

// One fake identity per real athlete: same email or same name = same person.
const people = new Map();
const used = new Set();
function person(key, gender) {
  if (!people.has(key)) {
    const first = /^\s*f/i.test(gender) ? FEMALE : /^\s*m/i.test(gender) ? MALE : FIRST;
    let name;
    do name = `${pick(first)} ${pick(LAST)}`;
    while (used.has(name));
    used.add(name);
    people.set(key, { name, email: `athlete${String(people.size + 1).padStart(2, "0")}@example.com` });
  }
  return people.get(key);
}
const countries = new Map();
const country = (raw) => {
  const key = raw.trim().toLowerCase();
  if (!key) return raw;
  if (!countries.has(key)) countries.set(key, COUNTRIES[countries.size % COUNTRIES.length]);
  const fake = countries.get(key);
  // Keep the typing style: ALL CAPS and trailing spaces are real-world quirks.
  return (raw === raw.toUpperCase() && raw.length > 3 ? fake.toUpperCase() : fake) + raw.slice(raw.trimEnd().length);
};
const perf = (raw) => {
  const m = raw.match(/^(\s*)(\d+(?:\.\d+)?)(.*)$/);
  if (!m) return raw;
  const n = Math.max(1, Number(m[2]) + jitter(3));
  return m[1] + (m[2].includes(".") ? (n + 0.5).toFixed(1) : String(Math.round(n))) + m[3];
};
const time = (raw) => {
  const m = raw.match(/^(\s*)(?:(\d+):)?(\d{1,2}):(\d{2})(\s*)$/);
  if (!m) return raw;
  const total = Math.max(15, Number(m[2] ?? 0) * 3600 + Number(m[3]) * 60 + Number(m[4]) + jitter(10));
  const mm = Math.floor(total / 60), ss = String(total % 60).padStart(2, "0");
  return m[1] + (m[2] !== undefined ? `0:${String(mm).padStart(2, "0")}:${ss}` : `${mm}:${ss}`) + m[5];
};

const sourceNames = new Set();
const sourceEmails = new Set();
const out = rows.map((row, r) => {
  if (!row.some((c) => String(c).trim())) return row;
  const get = (cols) => cols.map((i) => row[i] ?? "").join(" ").trim();
  const email = get(col.email).toLowerCase();
  const name = (get(col.full) || `${get(col.first)} ${get(col.last)}`).trim();
  if (email) sourceEmails.add(email);
  for (const w of name.split(/[^\p{L}]+/u)) if (w.length >= 3) sourceNames.add(w.toLowerCase());
  const p = person(email || name.toLowerCase(), get(col.gender));
  const [first, ...rest] = p.name.split(" ");

  return row.map((cell, i) => {
    const v = String(cell ?? "");
    if (col.timestamp.includes(i)) return v ? `8/${(r % 3) + 28}/2026 ${8 + (r % 10)}:${String((r * 7) % 60).padStart(2, "0")}:00` : v;
    if (col.email.includes(i)) return v ? p.email : v;
    if (col.full.includes(i)) return v ? (v === v.toUpperCase() ? p.name.toUpperCase() : p.name) + v.slice(v.trimEnd().length) : v;
    if (col.first.includes(i)) return v ? first : v;
    if (col.last.includes(i)) return v ? rest.join(" ") : v;
    if (col.emergency.includes(i)) return v ? (/phone/i.test(headers[i]) ? `+1 555 01${String(r).padStart(2, "0")}` : `Contact ${rest.join(" ")}`) : v;
    if (col.date.includes(i)) return v ? `${1 + Math.floor(rand() * 8)}/${1 + Math.floor(rand() * 28)}/2026` : v;
    if (col.country.includes(i)) return country(v);
    if (col.diveTime.includes(i)) return time(v);
    if (col.perf.includes(i)) return /:/.test(v) ? time(v) : perf(v);
    return v;
  });
});

const csv = Papa.unparse([headers, ...out], { newline: "\n" }) + "\n";

// Leak check: no source email or name word (3+ letters) may survive,
// except words that are also part of the fake vocabulary.
const fake = new Set([...FIRST, ...LAST].map((w) => w.toLowerCase()));
const words = new Set(
  out.flat().join(" ").toLowerCase().split(/[^\p{L}@.\d]+/u).filter(Boolean),
);
const leaks = [
  ...[...sourceEmails].filter((e) => csv.toLowerCase().includes(e)),
  ...[...sourceNames].filter((w) => words.has(w) && !fake.has(w)),
];
if (leaks.length) {
  console.error(`Refusing to write: ${leaks.length} source name/email value(s) still present.`);
  process.exit(1);
}
fs.writeFileSync(output, csv);
console.log(`Wrote ${output}: ${out.length} rows, ${people.size} athletes.`);
