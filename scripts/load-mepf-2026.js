// More Mechanical, Electrical, Plumbing and Fire rates for RateGen, from priced bills.
//
//   node scripts/load-mepf-2026.js materials            dry run
//   node scripts/load-mepf-2026.js materials --apply    writes the zone rows
//   node scripts/materialise-states.js --apply          adds the 37 state copies
//   node scripts/load-mepf-2026.js items                dry run, prices every item
//   node scripts/load-mepf-2026.js items --apply        writes the build-ups
//
// SOURCES, ALL REAL PRICED BILLS, LOADED UNFACTORED
//   AUD  Auditorium MEP bill, QS Tomiwa, Jan 2026 (Sheet1). Installed rates:
//        the bill prices supply, fix, test and commission, so no labour line.
//   GGT  Ground Gateway (GGT) priced BOQ Rev A, Bill No.4 Electrical, Feb 2026:
//        only the lightning-protection and fence parts not already loaded.
//
// LEFT OUT, ON PURPOSE
// - Anything already in the library under the same name (the loader skips it).
// - Items the library already has in another form (AUD's 35mm2 4c PVC/PVC cable
//   at 13,720/m beside the library's 49,275 GGT row; the generic smoke detector,
//   sounder and control panel; the 2HP split AC): a second, different price for
//   the same thing is how a QS picks the wrong one.
// - Lines the bill prices twice (AUD's 20mm PPR bend at 550 and at 1,900).
// - An obvious error: a 900 x 900 x 3mm copper earth plate at 5,000.
// - Lot and sum lines with no measurable unit.
// - The Residential Development MEP bill (dated Oct 2025): its prices sit at
//   about half the Auditorium's for the same work (Grade 15 concrete 76,000
//   against 125,000/m3, rebar 950,000 against 1,695,000/t), an older price basis
//   under a newer date.
//
// NO DUCTWORK, SPRINKLER, FIRE PUMP OR LIFT RATES: no priced source exists on
// this machine (searched 3 Oct 2026). Mechanical and Fire stay thin until one does.
import "dotenv/config";
import { MongoClient } from "mongodb";
import { config } from "../src/config/index.js";
import { webDb } from "./lib/webdb.js";

const MODE = process.argv[2];
const APPLY = process.argv.includes("--apply");
if (MODE !== "materials" && MODE !== "items") {
  console.error("usage: node scripts/load-mepf-2026.js materials|items [--apply]");
  process.exit(2);
}

// Same zone factors and rounding as load-rategen-catalog.js and load-mep-plumbing.js.
const ZONE_FACTORS = {
  south_west: 1.0, north_central: 1.0204, north_east: 1.0612,
  south_east: 1.0714, north_west: 1.0918, south_south: 1.125,
};
const round = (v) => {
  if (!v) return 0;
  if (v < 1_000) return Math.round(v / 5) * 5;
  if (v < 100_000) return Math.round(v / 50) * 50;
  return Math.round(v / 500) * 500;
};

const E = (g) => `MEP - Electrical - ${g} (installed)`;
const P = (g) => `MEP - Plumbing - ${g} (installed)`;

// [name, unit, price (naira, south_west), category, source]
const ROWS = [
  // ── Electrical: distribution ──────────────────────────────────────────────
  ["Cut-out fuse, 200A (Stanley or equal)", "No.", 77000, E("Distribution"), "AUD r309"],
  ["Distribution board, 630A 10-way TPN, MCB type, complete", "No.", 315000, E("Distribution"), "AUD r320"],
  ["Distribution board, 500A 23-way TPN, MCB type, complete", "No.", 399000, E("Distribution"), "AUD r328"],
  ["Distribution board, 63A 8-way TPN, MCB type, complete", "No.", 196000, E("Distribution"), "AUD r322"],
  ["Distribution board, 45A 8-way TPN, MCB type, complete", "No.", 105000, E("Distribution"), "AUD r324"],
  ["Distribution board, 45A 4-way TPN, MCB type, complete", "No.", 67200, E("Distribution"), "AUD r326"],
  ["Main fuse board, 200A 3-way TPN", "No.", 196000, E("Distribution"), "AUD r330"],
  ["Circuit breaker, 63A", "No.", 25200, E("Distribution"), "AUD r332"],
  ["Isolator fuse switch (Stanley or equal)", "No.", 70000, E("Distribution"), "AUD r334"],
  ["Change-over switch, 200A TPN (Stanley or equal)", "No.", 697900, E("Distribution"), "AUD r336"],
  ["Surge arrester, 25kA, in distribution panel", "No.", 50000, E("Distribution"), "AUD r452"],
  // ── Electrical: cables and wiring ─────────────────────────────────────────
  ["4 core 10mm2 PVC/PVC copper cable with ECC", "m", 8400, E("Cables & Wiring"), "AUD r341"],
  ["1 core 1.5mm2 PVC single core cable", "m", 532, E("Cables & Wiring"), "AUD r350"],
  ["1 core 2.5mm2 PVC single core cable", "m", 3080, E("Cables & Wiring"), "AUD r352"],
  ["1 core 4mm2 PVC single core cable", "m", 4100, E("Cables & Wiring"), "AUD r354"],
  // ── Electrical: accessories ───────────────────────────────────────────────
  ["32A 1 way 1 gang switch", "No.", 10500, E("Accessories"), "AUD r372"],
  // ── Electrical: containment ───────────────────────────────────────────────
  ["25mm uPVC conduit (ebonite tube)", "m", 3500, E("Containment & Ducts"), "AUD r376"],
  ["25mm conduit accessories and boxes", "No.", 2430, E("Containment & Ducts"), "AUD r378"],
  ["uPVC adaptable box", "No.", 3780, E("Containment & Ducts"), "AUD r380"],
  // ── Electrical: luminaires ────────────────────────────────────────────────
  ["Recessed LED fitting, 10W", "No.", 4900, E("Luminaires"), "AUD r386"],
  ["LED step light, square, 3.8W", "No.", 21000, E("Luminaires"), "AUD r388"],
  ["LED wall light, 2 x 10W, IP65", "No.", 19600, E("Luminaires"), "AUD r390"],
  ["LED wall light, 12W, IP65", "No.", 21000, E("Luminaires"), "AUD r392"],
  ["LED recessed downlight, 15W, IP65", "No.", 19600, E("Luminaires"), "AUD r404"],
  ["Suspended linear LED light, 6000lm", "No.", 49000, E("Luminaires"), "AUD r398"],
  ["LED pendant light, 74W, 7800lm", "No.", 210000, E("Luminaires"), "AUD r402"],
  ["RGB stage light bar, 100W", "No.", 259000, E("Luminaires"), "AUD r400"],
  ["Motion sensor switch, ceiling mounted PIR, 360 degree", "No.", 105000, E("Luminaires"), "AUD r396"],
  // ── Electrical: security, sound ───────────────────────────────────────────
  ["CCTV dome camera", "No.", 322000, E("Security & Detection"), "AUD r414"],
  ["CCTV camera, outdoor, wall mounted", "No.", 490000, E("Security & Detection"), "AUD r416"],
  ["CCTV camera, indoor PTZ, wall mounted", "No.", 119000, E("Security & Detection"), "AUD r418"],
  ["Electric fence tube shield, 400mm, 3 wire, galvanised", "No.", 22275, E("Security & Detection"), "GGT r363"],
  ["Electric fence warning sign with wire clips", "No.", 20925, E("Security & Detection"), "GGT r366"],
  ["Electric fence compression strain insulator and hook", "No.", 7425, E("Security & Detection"), "GGT r367"],
  ["Compact array speaker, 750W", "No.", 182000, E("Sound & Public Address"), "AUD r421"],
  ["Ceiling speaker, 15W, 8 inch coaxial", "No.", 91000, E("Sound & Public Address"), "AUD r423"],
  ["Public address speaker", "No.", 277200, E("Sound & Public Address"), "AUD r425"],
  ["Multi-channel power amplifier", "No.", 693000, E("Sound & Public Address"), "AUD r427"],
  // ── Electrical: earthing and lightning protection ─────────────────────────
  ["Bare copper tape, 25 x 3mm", "m", 2000, E("Earthing & Lightning Protection"), "AUD r434"],
  ["Early streamer emission air terminal (Prevectron 2.25 or equal)", "No.", 600000, E("Earthing & Lightning Protection"), "AUD r436"],
  ["Earth rod, 1800 x 16mm", "No.", 20000, E("Earthing & Lightning Protection"), "AUD r440"],
  ["Bimetallic connector / test point", "No.", 15000, E("Earthing & Lightning Protection"), "AUD r442"],
  ["Screw down tape clamp, 25 x 3mm", "No.", 75000, E("Earthing & Lightning Protection"), "AUD r444"],
  ["Copper earth bar, six-way, 50 x 6mm, with insulators", "No.", 60000, E("Earthing & Lightning Protection"), "AUD r454"],
  ["Air terminal rod, stainless steel, 5500mm", "No.", 513000, E("Earthing & Lightning Protection"), "GGT r352"],
  ["Conductor holder, stainless steel, M8", "No.", 14175, E("Earthing & Lightning Protection"), "GGT r354"],
  ["Fixing clamp for tubes, 42mm", "No.", 10125, E("Earthing & Lightning Protection"), "GGT r355"],
  ["Earthing pipe clamp, 42mm", "No.", 7425, E("Earthing & Lightning Protection"), "GGT r356"],
  ["KS connector, stainless steel, 6-10mm round conductor", "No.", 29025, E("Earthing & Lightning Protection"), "GGT r357"],
  ["Parallel connector, copper", "No.", 14175, E("Earthing & Lightning Protection"), "GGT r358"],
  ["Mounting bracket, stainless steel, with cleat", "No.", 3780, E("Earthing & Lightning Protection"), "GGT r359"],
  ["Mechanical compression connector to earth grid", "No.", 6075, E("Earthing & Lightning Protection"), "GGT r346"],

  // ── Fire ──────────────────────────────────────────────────────────────────
  ["Manual call point (break glass)", "No.", 78300, "MEP - Fire - Protection & Alarm (installed)", "AUD r462"],
  ["Fire extinguisher, 6kg ABC dry powder", "No.", 67500, "MEP - Fire - Protection & Alarm (installed)", "AUD r468"],
  ["Fire extinguisher, 3kg CO2", "No.", 49950, "MEP - Fire - Protection & Alarm (installed)", "AUD r470"],

  // ── Mechanical ────────────────────────────────────────────────────────────
  ["Split unit air conditioner, 1.5HP, complete (LG or equal)", "No.", 567000, "MEP - Mechanical - Air Conditioning & Ventilation (installed)", "AUD r409"],

  // ── Plumbing ──────────────────────────────────────────────────────────────
  ["Water closet, close-coupled washdown, complete with fixings", "No.", 337500, P("Sanitary Ware"), "AUD r8"],
  ["Wash hand basin with half pedestal and mono basin mixer", "No.", 108000, P("Sanitary Ware"), "AUD r6"],
  ["PPR pressure pipe, PN10 to BS EN ISO 15874, 20mm", "m", 2700, P("Water Pipework"), "AUD r21"],
  ["PPR equal tee, 20mm", "No.", 700, P("Water Pipework Fittings"), "AUD r27"],
  ["PPR equal tee, 32mm", "No.", 550, P("Water Pipework Fittings"), "AUD r31"],
  ["PPR union connector, 20mm", "No.", 1900, P("Water Pipework Fittings"), "AUD r37"],
  ["PPR union connector, 32mm", "No.", 650, P("Water Pipework Fittings"), "AUD r39"],
  ["Stop valve, 20mm, chromium plated", "No.", 20500, P("Valves"), "AUD r35"],
  ["uPVC soil, waste and vent pipe, 150mm", "m", 4500, P("Soil, Waste & Vent"), "AUD r69"],
  ["uPVC soil, waste and vent pipe, 50mm", "m", 3500, P("Soil, Waste & Vent"), "AUD r73"],
  ["uPVC tee, 100mm", "No.", 1500, P("Soil, Waste & Vent"), "AUD r77"],
  ["uPVC soil bend, 75mm", "No.", 550, P("Soil, Waste & Vent"), "AUD r79"],
  ["uPVC soil tee, 75mm", "No.", 550, P("Soil, Waste & Vent"), "AUD r81"],
  ["uPVC bend, 50mm", "No.", 500, P("Soil, Waste & Vent"), "AUD r83"],
  ["uPVC tee, 50mm", "No.", 500, P("Soil, Waste & Vent"), "AUD r85"],
  ["uPVC reducer, 50 x 75mm", "No.", 1800, P("Soil, Waste & Vent"), "AUD r87"],
  ["uPVC rigid rainwater tee, 75mm", "No.", 1850, P("Rainwater"), "AUD r100"],
  ["PVC water storage tank, 5000 litres (GeePee or equal)", "No.", 472500, P("Water Storage & Pumps"), "AUD r129"],
  ["Water pump, 2HP", "No.", 490000, P("Water Storage & Pumps"), "AUD r135"],
];

const TAG = (src) => (src.startsWith("GGT") ? "mepf-bill-ggt-2026-02" : "mepf-bill-aud-2026-01");

if (MODE === "materials") {
  const client = new MongoClient(process.env.RATEGEN_MONGO_URI);
  await client.connect();
  const coll = client.db(config.rategenMasterDb).collection(config.rategenMatCollection);
  // Never overwrite a curated row: a name already in a zone is skipped, case-insensitively.
  const existing = new Set(
    (await coll.find({ state: { $exists: false } }, { projection: { _id: 0, MaterialName: 1, zone: 1 } }).toArray())
      .map((r) => `${String(r.MaterialName).toLowerCase()}|${r.zone}`)
  );
  const ops = [];
  const skipped = new Set();
  for (const zone of Object.keys(ZONE_FACTORS)) {
    for (const [name, unit, price, category, src] of ROWS) {
      if (existing.has(`${name.toLowerCase()}|${zone}`)) { skipped.add(name); continue; }
      ops.push({
        updateOne: {
          filter: { MaterialName: name, zone, state: { $exists: false } },
          update: {
            $setOnInsert: {
              MaterialName: name, MaterialUnit: unit,
              MaterialPrice: round(price * ZONE_FACTORS[zone]),
              MaterialCategory: category, zone,
              updatedAt: new Date().toISOString(), updatedBy: TAG(src), source: src,
            },
          },
          upsert: true,
        },
      });
    }
  }
  const by = {};
  for (const r of ROWS) { const d = r[3].split(" - ")[1]; by[d] = (by[d] || 0) + 1; }
  console.log(`${APPLY ? "APPLYING" : "DRY RUN (no writes, pass --apply)"} to ${config.rategenMasterDb}.${config.rategenMatCollection}`);
  console.log(`  rows defined: ${ROWS.length}  ${JSON.stringify(by)}`);
  console.log(`  zone inserts planned: ${ops.length}   names already present, skipped: ${skipped.size}`);
  [...skipped].forEach((n) => console.log(`    skipped: ${n}`));
  if (APPLY && ops.length) {
    const res = await coll.bulkWrite(ops, { ordered: false });
    console.log(`  upserted=${res.upsertedCount} matched=${res.matchedCount}`);
    console.log("  next: node scripts/materialise-states.js --apply");
  }
  await client.close();
} else {
  // One build-up per material: the bill rate is an installed rate, so no labour line.
  const ITEMS = ROWS.map(([name, unit]) => ({
    name: `${name}; supplied and installed`,
    outputUnit: unit,
    lines: [{ kind: "material", refName: name, description: name, unit, qtyPerUnit: 1, factor: 1 }],
  }));
  const rg = new MongoClient(process.env.RATEGEN_MONGO_URI);
  await rg.connect();
  const master = rg.db(config.rategenMasterDb);
  const lagos = Object.fromEntries((await master.collection(config.rategenMatCollection)
    .find({ state: "lagos", MaterialName: { $in: ROWS.map((r) => r[0]) } }, { projection: { _id: 0, MaterialName: 1, MaterialPrice: 1 } })
    .toArray()).map((r) => [r.MaterialName, r.MaterialPrice]));
  await rg.close();
  const missing = ROWS.filter((r) => !(r[0] in lagos)).map((r) => r[0]);
  if (missing.length) {
    console.error(`ABORT: ${missing.length} material(s) have no Lagos row yet. Run "materials --apply" and materialise-states.js first.`);
    missing.forEach((m) => console.error("  " + m));
    process.exit(1);
  }
  console.log(`${APPLY ? "APPLYING" : "DRY RUN (no writes)"}  ${ITEMS.length} build-ups into section "carbon"; every refName has a Lagos row`);
  for (const it of ITEMS) console.log(`  ${it.name.slice(0, 70).padEnd(70)} ${String(lagos[it.lines[0].refName]).padStart(9)} /${it.outputUnit}`);
  if (APPLY) {
    const web = new MongoClient(process.env.MONGO_URI);
    await web.connect();
    const items = webDb(web).collection("rategencomputeitems");
    const res = await items.bulkWrite(ITEMS.map((it) => ({
      updateOne: {
        filter: { section: "carbon", name: it.name },
        update: {
          $set: {
            section: "carbon", name: it.name, outputUnit: it.outputUnit,
            overheadPercentDefault: 10, profitPercentDefault: 25, enabled: true,
            notes: "MEPF from priced bills (Auditorium Jan 2026, GGT Feb 2026). Installed rates: no labour line.",
            lines: it.lines, updatedAt: new Date(),
          },
          $setOnInsert: { createdAt: new Date() },
        },
        upsert: true,
      },
    })), { ordered: false });
    console.log(`\nupserted ${res.upsertedCount}, modified ${res.modifiedCount}`);
    console.log("compute items in section carbon:", await items.countDocuments({ section: "carbon" }));
    await web.close();
  }
}
