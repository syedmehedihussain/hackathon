// scripts/embed-types.ts
// Populate ONLY the clause_type_embeddings table (7 embed calls, idempotent).
// Use this to (re)populate type embeddings without a full reseed — handy when
// the Gemini free-tier quota is tight. Run with: npm run embed:types
// Requires the clause_type_embeddings table (see docs/schema.sql).

import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
dotenv.config();
// Node < 22 has no global WebSocket; supabase-js needs one. Polyfill for scripts.
import WebSocket from "ws";
if (typeof (globalThis as any).WebSocket === "undefined") {
  (globalThis as any).WebSocket = WebSocket;
}
import { createClient } from "@supabase/supabase-js";
import { embed } from "../lib/gemini";
import { CLAUSE_TYPES, CLAUSE_TYPE_DESCRIPTIONS } from "../lib/retrieval";

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Missing Supabase env vars.");
  if (!process.env.GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY.");

  const sb = createClient(url, key, { auth: { persistSession: false } });

  const rows: { clause_type: string; embedding: number[] }[] = [];
  for (const t of CLAUSE_TYPES) {
    const v = await embed(CLAUSE_TYPE_DESCRIPTIONS[t]);
    if (!v) throw new Error(`Failed to embed clause-type description ${t}`);
    rows.push({ clause_type: t, embedding: v });
    process.stdout.write(".");
  }
  process.stdout.write("\n");

  // upsert on the clause_type primary key — safe to re-run.
  const { error } = await sb.from("clause_type_embeddings").upsert(rows);
  if (error) throw new Error(`clause_type_embeddings upsert: ${error.message}`);

  const { count } = await sb
    .from("clause_type_embeddings")
    .select("*", { count: "exact", head: true });
  console.log(`Done. clause_type_embeddings=${count}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
