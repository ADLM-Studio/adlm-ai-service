// Units for bill matching. A bill line may only be priced by a rate in the same
// unit: m2 work is never priced from an m3 rate, and a sum is never priced from
// a measured rate. Bills write units every way ("Sq.m", "m²", "No.", "Nr",
// "Cu.m", "L.S"), so both sides are reduced to one family before comparing.
// Same families as the bill reader in QUIV, HERON and RateGen (ClientBillUnits).

const FAMILIES = {
  m: ["m", "lm", "linm", "lin m", "l.m", "rm", "rmt", "mtr", "mtrs", "metre", "metres", "meter", "meters", "lin", "linear m", "run m", "r.m"],
  m2: ["m2", "m²", "sqm", "sq m", "sq.m", "sqmt", "sqmtr", "sm", "squarem", "square metre", "square meter", "sqmetre", "m^2", "m 2"],
  m3: ["m3", "m³", "cum", "cu m", "cu.m", "cumt", "cubm", "cubic metre", "cubic meter", "m^3", "m 3"],
  nr: ["nr", "no", "nos", "no.", "number", "numbers", "each", "ea", "pcs", "pc", "piece", "pieces", "pt", "pts", "point", "points", "n0", "nº"],
  kg: ["kg", "kgs", "kilogram", "kilogramme", "kilo", "kilos"],
  t: ["t", "tonne", "tonnes", "ton", "tons", "mt", "metric ton", "tne"],
  item: ["item", "items", "itm"],
  sum: ["sum", "sums", "ls", "l.s", "l/s", "lsum", "lumpsum", "lump sum", "ps", "p.s", "psum", "prov", "prov sum", "provisional", "provisional sum", "pc sum"],
  "%": ["%", "percent", "pct"],
  hr: ["hr", "hrs", "hour", "hours"],
  day: ["day", "days", "dy"],
};

const key = (u) => String(u || "").trim().toLowerCase().replace(/[\s.]+/g, "");

const LOOKUP = new Map();
for (const [canon, spellings] of Object.entries(FAMILIES)) {
  LOOKUP.set(canon, canon);
  for (const s of spellings) LOOKUP.set(key(s), canon);
}

/** The unit's family ("Sq.m" -> "m2"), or "" when it is not a unit we know. */
export function canonicalUnit(unit) {
  return LOOKUP.get(key(unit)) || "";
}

/** True only when both units are known and of the same family. */
export function unitsMatch(rowUnit, rateUnit) {
  const a = canonicalUnit(rowUnit);
  const b = canonicalUnit(rateUnit);
  return a !== "" && a === b;
}
