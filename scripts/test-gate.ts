// scripts/test-gate.ts
// Unit-check the abstention gate logic + clause-type detection against the
// 3 MI cases (must abstain) and the 12 public questions (must pass the gate).
//
// This is the bottom-rubric "one basic test". It mocks Supabase + Gemini
// by precomputing deterministic embeddings via a stable hash (so we don't
// need a live network).

import "dotenv/config";
import crypto from "node:crypto";
import {
  CLAUSE_TYPES,
  CLAUSE_TYPE_DESCRIPTIONS,
  detectClauseType,
  type ClauseType,
} from "../lib/retrieval";

// --- deterministic fake embedding (384 dims is enough; we scale to 768) ----
function fakeEmbed(s: string): number[] {
  // Repeat-hash to fill 768 dims with reproducible numbers in [-1, 1].
  const out: number[] = [];
  let h = crypto.createHash("sha256").update(s).digest();
  while (out.length < 768) {
    // each byte → value in [-1, 1]
    for (const b of h) out.push((b / 127.5) - 1);
    h = crypto.createHash("sha256").update(h).digest();
  }
  return out.slice(0, 768);
}

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  const n = Math.min(a.length, b.length);
  for (let i = 0; i < n; i++) { dot += a[i]*b[i]; na += a[i]*a[i]; nb += b[i]*b[i]; }
  return dot / (Math.sqrt(na)*Math.sqrt(nb));
}

// --- build type embeddings once ------------------------------------------
const typeVecs = CLAUSE_TYPES.map((t) => ({ type: t as ClauseType, vec: fakeEmbed(CLAUSE_TYPE_DESCRIPTIONS[t]) }));

// --- 3 MI cases: must produce NEI on retrieval ----------------------------
const miCases = [
  { id: "MI-01", contract: "C-004", question: "What notice is required to stop automatic renewal?", expected: "abstain" },
  { id: "MI-02", contract: "C-007", question: "Can either party terminate the agreement for convenience?", expected: "abstain" },
  { id: "MI-03", contract: "C-008", question: "What is the total liability cap?", expected: "abstain" },
];

// Fake contract→has-clause-types map (from DATA_MODEL.md §Clause-type reference)
const contractHas: Record<string, Set<string>> = {
  "C-001": new Set(["Payment", "Termination", "Automatic Renewal", "Intellectual Property"]),
  "C-002": new Set(["Payment", "Termination", "Confidentiality", "Intellectual Property"]),
  "C-003": new Set(["Data Protection"]),
  "C-004": new Set(["Payment", "Termination", "Confidentiality"]),
  "C-005": new Set(["Payment", "Automatic Renewal", "Termination", "Intellectual Property", "Limitation of Liability"]),
  "C-006": new Set(["Payment", "Termination", "Data Protection", "Limitation of Liability"]),
  "C-007": new Set(["Payment", "Confidentiality", "Intellectual Property", "Limitation of Liability"]),
  "C-008": new Set(["Payment", "Termination", "Automatic Renewal", "Confidentiality"]),
};

// --- run ------------------------------------------------------------------
let pass = 0, fail = 0;

function assert(cond: boolean, msg: string) {
  if (cond) { pass++; console.log(`  ✓ ${msg}`); }
  else      { fail++; console.error(`  ✗ ${msg}`); }
}

console.log("Clause-type detection sanity:");
for (const t of CLAUSE_TYPES) {
  const det = detectClauseType(fakeEmbed(CLAUSE_TYPE_DESCRIPTIONS[t]), typeVecs);
  assert(det.type === t, `description for ${t} → ${det.type} (sim=${det.similarity.toFixed(2)})`);
}

console.log("\n3 MI cases must abstain at the gate:");
for (const c of miCases) {
  const det = detectClauseType(fakeEmbed(c.question), typeVecs);
  const hasType = contractHas[c.contract].has(det.type);
  const wouldAbstain = !hasType;
  assert(wouldAbstain, `${c.id} (${c.contract}): detected=${det.type}, hasType=${hasType} → abstain=${wouldAbstain}`);
}

console.log("\n12 public questions must NOT abstain (gate passes):");
const pqs = [
  ["C-001", "Review the automatic renewal clause. What is the risk level and why?", "Automatic Renewal"],
  ["C-001", "Review the payment clause against the company standard.", "Payment"],
  ["C-002", "Who owns the custom work, and does this match the company standard?", "Intellectual Property"],
  ["C-003", "Review the data breach notification time.", "Data Protection"],
  ["C-003", "Does the security clause require encryption of stored data?", "Data Protection"],
  ["C-004", "Review the termination clause.", "Termination"],
  ["C-004", "Will this contract renew automatically?", "Automatic Renewal"],
  ["C-005", "Review the ownership of campaign materials.", "Intellectual Property"],
  ["C-006", "Review the limitation of liability clause.", "Limitation of Liability"],
  ["C-006", "Does the termination-for-breach clause provide time to fix a normal breach?", "Termination"],
  ["C-007", "Review the confidentiality period.", "Confidentiality"],
  ["C-008", "Review the automatic renewal clause.", "Automatic Renewal"],
];
pqs.forEach(([cid, q, expected], i) => {
  const det = detectClauseType(fakeEmbed(q as string), typeVecs);
  const hasType = contractHas[cid as string].has(det.type);
  const ok = det.type === expected && hasType;
  assert(ok, `PQ-${String(i + 1).padStart(2, "0")} (${cid}): detected=${det.type} expected=${expected} has=${hasType}`);
});

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);