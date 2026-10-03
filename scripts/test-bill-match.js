// Feature test: bill match against a bill-shaped sample — model routing,
// caching, quota, audit and metering. Run AFTER test-meter.js passes. This calls
// Bedrock and spends credit; run it by hand, not in CI.
//
//   node scripts/test-bill-match.js
//
// The rows are written in the shape of live Nigerian bills (items under a
// section and heading trail, one elliptical continuation); no client bill is
// committed here because this repository is public. The candidates are rates
// the way RateGen sends them: its own all-in rates, already narrowed by wording.
import "dotenv/config";
import mongoose from "mongoose";
import { connectAiDb } from "../src/db/connect.js";
import { billMatch } from "../src/services/billMatchService.js";
import { AiUsageEvent } from "../src/models/index.js";

const rows = [
  { id: "1:12", section: "BLOCKWORK", headings: ["Sandcrete blocks to NIS 87 in cement and sand (1:6) mortar"], description: "225mm hollow block walls", unit: "m2" },
  { id: "1:13", section: "BLOCKWORK", headings: ["Sandcrete blocks to NIS 87 in cement and sand (1:6) mortar"], description: "150mm ditto", unit: "Sq.m", continuesFrom: "225mm hollow block walls" },
  { id: "1:20", section: "CONCRETE WORK", headings: ["Plain in-situ concrete (1:2:4) - 19mm aggregate"], description: "Column bases", unit: "m³" },
  { id: "1:21", section: "CONCRETE WORK", headings: [], description: "Provisional sum for testing of concrete cubes", unit: "Sum" },
  { id: "1:30", section: "FINISHINGS", headings: ["Cement and sand (1:3) render"], description: "12mm thick to walls", unit: "m2" },
];
const candidates = [
  { id: "bw-225-16", name: "225mm blockwall in cement and sand mortar (1:6)", unit: "m2", trade: "Block Works", rate: 23500 },
  { id: "bw-150-16", name: "150mm blockwall in cement and sand mortar (1:6)", unit: "m2", trade: "Block Works", rate: 18200 },
  { id: "bw-225-14", name: "225mm blockwall in cement and sand mortar (1:4)", unit: "m2", trade: "Block Works", rate: 24800 },
  { id: "c-124-fdn", name: "Concrete (1:2:4) grade 20 in foundation or slab", unit: "m3", trade: "Concrete", rate: 132700 },
  { id: "c-136-fdn", name: "Concrete (1:3:6) grade 15 in foundation or slab", unit: "m3", trade: "Concrete", rate: 118300 },
  { id: "f-13-12", name: "Cement and sand (1:3) render to wall 12mm thick", unit: "m2", trade: "Finishes", rate: 4500 },
  { id: "f-14-12", name: "Cement and sand (1:4) render to wall 12mm thick", unit: "m2", trade: "Finishes", rate: 4300 },
];
// What a careful QS would pick; 1:21 is a sum and must stay unmatched.
const expected = { "1:12": "bw-225-16", "1:13": "bw-150-16", "1:20": "c-124-fdn", "1:30": "f-13-12" };

await connectAiDb();
const started = Date.now();
const res = await billMatch({ tenantId: "bill-match-test", product: "rategen", rows, candidates });
console.log(`Answered in ${Date.now() - started}ms (cached: ${!!res.cached})\n`);

const got = Object.fromEntries((res.result?.matches || []).map((m) => [m.rowId, m]));
let wrong = 0;
for (const r of rows) {
  const m = got[r.id];
  const want = expected[r.id] || null;
  const ok = (m?.candidateId || null) === want;
  if (!ok) wrong++;
  console.log(`${ok ? "ok  " : "MISS"} ${r.id} ${r.description} -> ${m ? `${m.candidateName} (${m.confidence})` : "unmatched"}${ok ? "" : `  [expected ${want || "unmatched"}]`}`);
}

const event = await AiUsageEvent.findOne({ tenantId: "bill-match-test" }).sort({ createdAt: -1 }).lean();
if (event) console.log(`\nMetered: ${event.units.inputTokens} in / ${event.units.outputTokens} out, $${event.estimatedCostUsd}`);
console.log(wrong ? `\nBILL MATCH TEST: ${wrong} row(s) differ from the expected pick` : "\nBILL MATCH TEST: PASS");
await mongoose.disconnect();
process.exit(wrong ? 1 : 0);
