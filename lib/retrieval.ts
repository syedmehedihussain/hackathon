// lib/retrieval.ts
// Implements Steps A, B, C from docs/AI_INTEGRATION.md:
//   A. detect clause_type  (semantic match against 7 type descriptions)
//   B. THE ABSTENTION GATE (deterministic, before any risk LLM call)
//   C. ranked clause retrieval (cosine similarity, restricted to type)
//
// The gate is the safety guarantee. If candidateClauses is empty OR top similarity
// is below THRESHOLD, we return NEI and the LLM is NEVER called.

import { getSupabaseAdmin, type ClauseRow } from "./supabase";
import { embed } from "./gemini";

// --- clause-type taxonomy ---------------------------------------------------

export const CLAUSE_TYPES = [
  "Payment",
  "Termination",
  "Data Protection",
  "Confidentiality",
  "Automatic Renewal",
  "Intellectual Property",
  "Limitation of Liability",
] as const;

export type ClauseType = (typeof CLAUSE_TYPES)[number];

// Short descriptions used to embed the *question* and compare to each type.
// Stable, hand-written, one canonical sentence per type.
export const CLAUSE_TYPE_DESCRIPTIONS: Record<ClauseType, string> = {
  Payment:
    "Invoice payment deadlines, late fees, when money is due, billing terms.",
  Termination:
    "Ending the agreement, notice periods, termination for convenience or breach, cure periods.",
  "Data Protection":
    "Personal data use, encryption, data breach notification, subprocessors, deletion, return of data.",
  Confidentiality:
    "Confidential information, non-disclosure, how long the confidentiality duty lasts.",
  "Automatic Renewal":
    "Whether the agreement renews automatically, how long the renewal term is, notice to stop renewal.",
  "Intellectual Property":
    "Who owns the deliverables, licences, ownership of work product, vendor tools.",
  "Limitation of Liability":
    "Caps on liability, what the cap does or does not cover, exclusions.",
};

// Similarity floor for both type detection AND the abstention gate.
const THRESHOLD = 0.45; // tuned down a bit — many public questions are paraphrased.

// --- vector math -----------------------------------------------------------

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

// --- Step A: detect clause type --------------------------------------------

let _typeEmbeddingCache: { type: ClauseType; vec: number[] }[] | null = null;

/** Embed all 7 type descriptions and cache. Returns null on total Gemini failure. */
export async function getTypeEmbeddings(): Promise<{ type: ClauseType; vec: number[] }[] | null> {
  if (_typeEmbeddingCache) return _typeEmbeddingCache;
  const out: { type: ClauseType; vec: number[] }[] = [];
  for (const t of CLAUSE_TYPES) {
    const v = await embed(CLAUSE_TYPE_DESCRIPTIONS[t]);
    if (!v) return null; // any failure → caller can decide to abstain or fall back
    out.push({ type: t, vec: v });
  }
  _typeEmbeddingCache = out;
  return out;
}

export type TypeDetection = {
  type: ClauseType;
  similarity: number;
  confidence: "ok" | "low";
};

/** Pick the best clause type for a question embedding. */
export function detectClauseType(
  questionVec: number[],
  typeVecs: { type: ClauseType; vec: number[] }[],
): TypeDetection {
  let best: TypeDetection = { type: "Payment", similarity: -1, confidence: "low" };
  for (const { type, vec } of typeVecs) {
    const s = cosine(questionVec, vec);
    if (s > best.similarity) best = { type, similarity: s, confidence: s >= THRESHOLD ? "ok" : "low" };
  }
  return best;
}

// --- Step B + C: clause retrieval with the abstention gate ------------------

export type RetrievalHit = {
  clause: ClauseRow;
  similarity: number;
};

export type RetrievalResult =
  | { ok: true; hit: RetrievalHit }
  | { ok: false; reason: "no_candidates" | "below_threshold"; clauseType: ClauseType };

/**
 * Pull candidate clauses of `clauseType` for `contractId`, then rank by cosine
 * similarity to `questionVec`. Returns either a hit OR an abstention signal.
 */
export async function retrieveClause(
  contractId: string,
  clauseType: ClauseType,
  questionVec: number[],
): Promise<RetrievalResult> {
  const sb = getSupabaseAdmin();
  const { data, error } = await sb
    .from("clauses")
    .select("id, contract_id, section, clause_type, clause_text, embedding")
    .eq("contract_id", contractId)
    .eq("clause_type", clauseType);
  if (error) {
    console.warn("[retrieval] supabase error:", error.message);
    return { ok: false, reason: "no_candidates", clauseType };
  }
  const rows = (data ?? []) as ClauseRow[];
  if (rows.length === 0) {
    return { ok: false, reason: "no_candidates", clauseType };
  }
  let best: RetrievalHit | null = null;
  for (const r of rows) {
    if (!r.embedding) continue;
    const s = cosine(questionVec, r.embedding);
    if (!best || s > best.similarity) best = { clause: r, similarity: s };
  }
  if (!best) return { ok: false, reason: "no_candidates", clauseType };
  if (best.similarity < THRESHOLD) {
    return { ok: false, reason: "below_threshold", clauseType };
  }
  return { ok: true, hit: best };
}

// --- one-shot entry point used by /api/review ------------------------------

export type RetrievalOutcome =
  | {
      ok: true;
      clauseType: ClauseType;
      detection: TypeDetection;
      hit: RetrievalHit;
    }
  | {
      ok: false;
      clauseType: ClauseType;
      detection: TypeDetection;
      reason: "low_type_confidence" | "no_candidates" | "below_threshold";
    };

/**
 * Step A → Step B/C combined. Returns either a hit (proceed to comparison) or
 * an abstention signal (LLM is never called).
 */
export async function detectAndRetrieve(
  contractId: string,
  question: string,
): Promise<RetrievalOutcome> {
  const typeVecs = await getTypeEmbeddings();
  if (!typeVecs) {
    // No embeddings at all → treat as low confidence.
    return {
      ok: false,
      clauseType: "Payment",
      detection: { type: "Payment", similarity: 0, confidence: "low" },
      reason: "low_type_confidence",
    };
  }
  const qVec = await embed(question);
  if (!qVec) {
    return {
      ok: false,
      clauseType: "Payment",
      detection: { type: "Payment", similarity: 0, confidence: "low" },
      reason: "low_type_confidence",
    };
  }
  const detection = detectClauseType(qVec, typeVecs);
  if (detection.confidence === "low") {
    return { ok: false, clauseType: detection.type, detection, reason: "low_type_confidence" };
  }
  const res = await retrieveClause(contractId, detection.type, qVec);
  if (!res.ok) {
    return { ok: false, clauseType: res.clauseType, detection, reason: res.reason };
  }
  return { ok: true, clauseType: detection.type, detection, hit: res.hit };
}