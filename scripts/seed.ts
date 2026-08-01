// scripts/seed.ts
// Loads /data into Supabase, computes embeddings once, inserts everything.
// Run with: npm run seed (requires .env.local with Supabase + Gemini keys).

import "dotenv/config";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";
import { embed } from "../lib/gemini";

type RawContract = {
  id: string;
  title: string;
  parties: string;
  raw: string;
  clauses: { section: string; type: string; text: string }[];
  dataset_note?: string;
};

type Standard = { id: string; category: string; standard: string };

const ROOT = path.resolve(process.cwd(), "data");

// --- 1. parse contracts ---------------------------------------------------

const SECTION_TO_TYPE: Record<string, string> = {
  "2.1": "Payment",
  "2.2": "Data Protection",
  "3.1": "Payment",
  "3.2": "Payment",
  "4.1": "Data Protection",
  "4.3": "Automatic Renewal",
  "5.1": "Confidentiality",
  "5.2": "Termination",
  "5.2 Breach Notice": "Data Protection",
  "6.1": "Termination",
  "6.2": "Termination",
  "7.1": "Automatic Renewal",
  "7.1 Intellectual Property": "Intellectual Property",
  "7.2 Termination for Breach": "Termination",
  "8.1": "Confidentiality",
  "8.1 Data Return and Deletion": "Data Protection",
  "9.1": "Confidentiality",
  "9.1 Data Protection": "Data Protection",
  "9.1 Limitation of Liability": "Limitation of Liability",
  "9.3 Limitation of Liability": "Limitation of Liability",
  "10.1": "Intellectual Property",
  "10.1 Liability": "Limitation of Liability",
  "11.1 Limitation of Liability": "Limitation of Liability",
  "2.1 Payment": "Payment",
};

// Fallback heuristic by section number (for sections not explicitly mapped).
function inferType(section: string): string {
  if (/Payment|Invoice|Fee/i.test(section)) return "Payment";
  if (/Termination|Breach|Cure/i.test(section)) return "Termination";
  if (/Renewal/i.test(section)) return "Automatic Renewal";
  if (/Confidential/i.test(section)) return "Confidentiality";
  if (/Data|Security|Breach|Subprocessor|Encryption/i.test(section)) return "Data Protection";
  if (/Intellectual Property|IP|Ownership/i.test(section)) return "Intellectual Property";
  if (/Liability|Limitation/i.test(section)) return "Limitation of Liability";
  return "Unknown";
}

async function loadContract(file: string): Promise<RawContract> {
  const raw = await fs.readFile(path.join(ROOT, "contracts", file), "utf8");
  const lines = raw.split(/\r?\n/);
  const id = (lines.find((l) => l.startsWith("Contract ID:")) ?? "").split(":")[1].trim();
  const title = (lines.find((l) => l.startsWith("Title:")) ?? "").split(":").slice(1).join(":").trim();
  const parties = (lines.find((l) => l.startsWith("Parties:")) ?? "").split(":").slice(1).join(":").trim();

  // Find Dataset Note index if present
  const noteIdx = lines.findIndex((l) => l.startsWith("Dataset Note:"));
  const dataset_note = noteIdx >= 0 ? lines.slice(noteIdx).join(" ").replace(/^Dataset Note:\s*/, "").trim() : undefined;
  const bodyLines = noteIdx >= 0 ? lines.slice(0, noteIdx) : lines;

  // Parse clauses: a section heading is "<number> <title>"
  const clauses: { section: string; type: string; text: string }[] = [];
  let current: { section: string; type: string; text: string[] } | null = null;
  for (const ln of bodyLines) {
    const trimmed = ln.trim();
    if (!trimmed) continue;
    // crude: starts with "X.Y" and is not body text — assume a heading
    const headingMatch = trimmed.match(/^(\d+\.\d+(\s+[A-Z][A-Za-z /]+)?)\s*$/);
    if (headingMatch && trimmed.length < 60) {
      if (current) clauses.push({ section: current.section, type: current.type, text: current.text.join(" ").trim() });
      const heading = headingMatch[1];
      current = { section: heading, type: SECTION_TO_TYPE[heading] ?? inferType(heading), text: [] };
    } else if (current) {
      current.text.push(trimmed);
    }
  }
  if (current) clauses.push({ section: current.section, type: current.type, text: current.text.join(" ").trim() });

  // Filter out header lines from clauses
  const cleaned = clauses.filter((c) => c.text.length > 0 && !c.text.startsWith("Contract ID") && !c.text.startsWith("Title:") && !c.text.startsWith("Parties:"));

  return { id, title, parties, raw, clauses: cleaned, dataset_note };
}

async function loadStandards(): Promise<Standard[]> {
  const raw = await fs.readFile(path.join(ROOT, "company_standards.json"), "utf8");
  return JSON.parse(raw) as Standard[];
}

// --- 2. main --------------------------------------------------------------

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const gemini = process.env.GEMINI_API_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  if (!gemini) throw new Error("Missing GEMINI_API_KEY.");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const contractFiles = (await fs.readdir(path.join(ROOT, "contracts"))).filter((f) => f.endsWith(".txt")).sort();
  const contracts: RawContract[] = [];
  for (const f of contractFiles) contracts.push(await loadContract(f));
  const standards = await loadStandards();

  console.log(`Loaded ${contracts.length} contracts, ${standards.length} standards.`);

  // 3. wipe (idempotent re-seed)
  console.log("Wiping existing rows…");
  for (const tbl of ["query_cache", "reviews", "clauses", "standards", "contracts"]) {
    const { error } = await sb.from(tbl).delete().neq("id", "00000000-0000-0000-0000-000000000000");
    if (error && !error.message.includes("0 rows")) console.warn(`wipe ${tbl}: ${error.message}`);
  }

  // 4. contracts
  console.log("Inserting contracts…");
  const { error: cErr } = await sb.from("contracts").insert(
    contracts.map((c) => ({
      id: c.id,
      title: c.title,
      parties: c.parties,
      full_text: c.raw,
      dataset_note: c.dataset_note ?? null,
    })),
  );
  if (cErr) throw new Error(`contracts insert: ${cErr.message}`);

  // 5. standards (with embeddings)
  console.log("Embedding standards…");
  const stdRows: any[] = [];
  for (const s of standards) {
    const v = await embed(s.standard);
    if (!v) throw new Error(`Failed to embed standard ${s.id}`);
    stdRows.push({ id: s.id, category: s.category, standard_text: s.standard, embedding: v });
    process.stdout.write(".");
  }
  process.stdout.write("\n");
  const { error: sErr } = await sb.from("standards").insert(stdRows);
  if (sErr) throw new Error(`standards insert: ${sErr.message}`);

  // 6. clauses (with embeddings)
  console.log("Embedding clauses…");
  const clauseRows: any[] = [];
  for (const c of contracts) {
    for (const cl of c.clauses) {
      const v = await embed(cl.text);
      if (!v) throw new Error(`Failed to embed clause ${c.id} §${cl.section}`);
      clauseRows.push({
        contract_id: c.id,
        section: cl.section,
        clause_type: cl.type,
        clause_text: cl.text,
        embedding: v,
      });
      process.stdout.write(".");
    }
  }
  process.stdout.write("\n");
  // pgvector accepts number[] for the embedding column
  const { error: clErr } = await sb.from("clauses").insert(clauseRows);
  if (clErr) throw new Error(`clauses insert: ${clErr.message}`);

  // 7. summary
  const [{ count: cCount }, { count: clCount }, { count: sCount }] = await Promise.all([
    sb.from("contracts").select("*", { count: "exact", head: true }),
    sb.from("clauses").select("*", { count: "exact", head: true }),
    sb.from("standards").select("*", { count: "exact", head: true }),
  ]);
  console.log(`Done. contracts=${cCount} clauses=${clCount} standards=${sCount}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});