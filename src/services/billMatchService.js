// Bill match: price a client's bill of quantities from the user's own rates.
//
// RateGen reads a bill (any firm's Excel layout) and sends its measured items in
// batches, each with the section and heading trail it sits under, and a short
// list of candidate rates per batch, chosen on the desktop from the user's
// RateGen library by wording and unit. The model only picks which candidate is
// the same work; it never writes a rate. A match in another unit is dropped
// here whatever the model says, and doubtful lines come back unmatched, for the
// QS to price by hand.
//
// Unlike /budget-match (labour rows against labour rates), the rows here are
// complete bill items and the candidates complete all-in rates.
import { runFeature } from "./featurePipeline.js";
import { invokeJson } from "../clients/bedrock.js";
import { pickModel } from "../governance/modelRouter.js";
import { unitsMatch } from "./billMatchUnits.js";

export const MAX_ROWS = 120;
export const MAX_CANDIDATES = 400;

export async function billMatch({ tenantId, product, rows, candidates }) {
  const inRows = (rows || []).slice(0, MAX_ROWS).map((r) => ({
    id: String(r.id),
    description: String(r.description || "").slice(0, 300),
    unit: String(r.unit || "").trim(),
    section: String(r.section || "").slice(0, 120),
    headings: (Array.isArray(r.headings) ? r.headings : []).slice(-3).map((h) => String(h || "").slice(0, 160)),
    continuesFrom: String(r.continuesFrom || "").slice(0, 300),
  }));
  const inCands = (candidates || []).slice(0, MAX_CANDIDATES).map((c) => ({
    id: String(c.id),
    name: String(c.name || "").slice(0, 250),
    unit: String(c.unit || "").trim(),
    trade: String(c.trade || "").slice(0, 40),
    rate: Number(c.rate) || 0,
  }));
  const candById = new Map(inCands.map((c) => [c.id, c]));

  return runFeature({
    tenantId,
    product,
    feature: "billMatch",
    input: {
      rows: inRows.map((r) => `${r.section}|${r.headings.join(">")}|${r.continuesFrom}|${r.description}|${r.unit}`.toLowerCase()),
      cands: inCands.map((c) => `${c.id}|${c.unit}|${c.rate}`),
    },
    compute: async () => {
      const { modelId } = pickModel("classification");
      const { json } = await invokeJson(
        { tenantId, product, feature: "billMatch", operation: "match" },
        {
          modelId,
          maxTokens: 6000,
          system: SYSTEM_PROMPT,
          // The model never needs a price to judge "same work": rates stay out of the prompt.
          user: JSON.stringify({
            rows: inRows,
            candidates: inCands.map(({ id, name, unit, trade }) => ({ id, name, unit, trade })),
          }),
        }
      );

      const byRow = new Map(inRows.map((r) => [r.id, r]));
      const seen = new Set();
      const matches = [];
      for (const m of json.matches || []) {
        const row = byRow.get(String(m.rowId));
        const cand = candById.get(String(m.candidateId));
        if (!row || !cand || seen.has(row.id)) continue; // invented id or a second answer for a row
        if (!unitsMatch(row.unit, cand.unit)) continue; // never price across units
        const confidence = Math.min(1, Math.max(0, Number(m.confidence) || 0));
        if (confidence < 0.6) continue;
        seen.add(row.id);
        matches.push({
          rowId: row.id,
          candidateId: cand.id,
          candidateName: cand.name,
          unit: cand.unit,
          rate: cand.rate,
          confidence,
          reason: String(m.reason || "").slice(0, 160),
        });
      }
      return {
        model: modelId,
        confidence: json.confidence ?? 0.7,
        result: {
          matches,
          unmatched: inRows.filter((r) => !seen.has(r.id)).map((r) => r.id),
        },
      };
    },
  });
}

const SYSTEM_PROMPT = `You price a client's bill of quantities for a Nigerian quantity surveyor by matching each bill item to one of the surveyor's own all-in rates.

You are given:
- "rows": bill items, each { id, description, unit, section, headings, continuesFrom }. Bills are written elliptically: the work is described by the section (trade), the heading lines above the item (material, mix, specification) and the item text together. "continuesFrom" is the item a lower-case or "Ditto" line continues.
- "candidates": the ONLY rates you may use, each { id, name, unit, trade }.

Rules:
- Read each row as its full description: section + headings + continuesFrom + description.
- A match must be the SAME work in the SAME unit: same material and specification (mix ratio, grade, thickness, size, gauge) where the row states one. "225mm sandcrete block walling in cement mortar (1:6)" in m2 matches a 225mm blockwall rate in m2, not a 150mm one.
- Never match across units (m2 work is never an m3 rate; a sum or item is never a measured rate).
- When the row states a specification the candidate contradicts, do not match. When the row is less specific than the candidate, match only if the candidate is the usual choice for that work, and lower the confidence.
- Only return matches you are reasonably sure of; leave doubtful rows out. confidence per match: 0.9+ same work and specification, 0.75-0.89 same work with a minor wording or specification gap, below 0.75 do not return it.
- One candidate per row at most. A candidate may serve many rows.
- rowId and candidateId must be copied EXACTLY from the input. Never invent ids or rates.

Return JSON:
{"matches":[{"rowId":"...","candidateId":"...","confidence":0.0,"reason":"<10 words max>"}],"confidence":0.0}`;
