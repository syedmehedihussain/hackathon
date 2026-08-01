// lib/compare.ts — Step D (standard lookup) + Step E (Gemini risk judgment).
//
// The model only ever receives TWO texts it must compare. It cannot invent a
// clause because retrieval already gated it (see lib/retrieval.ts).
//
// Malformed output fails safe → NEI. We never crash and never fabricate.

import { getSupabaseAdmin } from "./supabase";
import { generateJSON } from "./gemini";

export type RiskLabel =
  | "Low Risk"
  | "Medium Risk"
  | "High Risk"
  | "Not Enough Information";

export const ALLOWED_RISK: RiskLabel[] = [
  "Low Risk",
  "Medium Risk",
  "High Risk",
  "Not Enough Information",
];

function isRisk(x: unknown): x is RiskLabel {
  return typeof x === "string" && (ALLOWED_RISK as string[]).includes(x);
}

export type StandardRow = {
  id: string;
  category: string;
  standard_text: string;
};

export async function getStandard(category: string): Promise<StandardRow | null> {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("standards")
      .select("id, category, standard_text")
      .eq("category", category)
      .maybeSingle();
    if (error) {
      console.warn("[compare] standard lookup error:", error.message);
      return null;
    }
    return data ?? null;
  } catch (e) {
    console.warn("[compare] standard lookup failed:", (e as Error).message);
    return null;
  }
}

const SYSTEM_PROMPT = `You are a contract-review assistant helping a human reviewer. You are NOT a lawyer and you do NOT give legal advice. A human makes the final decision.

You will be given ONE contract clause and ONE company standard. Compare only these two texts. Do not use any outside knowledge. Do not invent terms that are not present.

Decide a risk level from exactly these four values:
- "Low Risk"    — the clause matches or is stricter/safer than the standard.
- "Medium Risk" — the clause differs from the standard in a way worth a reviewer's attention but is not severe.
- "High Risk"   — the clause clearly conflicts with or is materially worse than the standard.
- "Not Enough Information" — the clause does not actually address what the standard covers.

Give a short, plain-language reason (1–2 sentences) that a non-lawyer can understand, referring to the concrete difference (e.g. notice periods, timeframes, ownership).

Respond with ONLY this JSON, no markdown, no backticks:
{"risk_level": "<one of the four>", "reason": "<short reason>"}`;

function buildUserMessage(args: {
  contractId: string;
  section: string | null;
  clauseType: string;
  clauseText: string;
  standardId: string;
  category: string;
  standardText: string;
}): string {
  return `CONTRACT CLAUSE (from ${args.contractId}, section ${args.section ?? "?"}, type ${args.clauseType}):
"""${args.clauseText}"""

COMPANY STANDARD (${args.standardId}, category ${args.category}):
"""${args.standardText}"""`;
}

export type CompareOutcome = {
  risk_level: RiskLabel;
  reason: string;
};

/**
 * Compare one clause against one standard with Gemini Flash. Returns strict-JSON
 * verdict or fails safe to NEI on any error (caller must NOT crash).
 */
export async function compareClauseToStandard(args: {
  contractId: string;
  section: string | null;
  clauseType: string;
  clauseText: string;
  standardId: string;
  category: string;
  standardText: string;
}): Promise<CompareOutcome> {
  const user = buildUserMessage(args);
  const parsed = await generateJSON(SYSTEM_PROMPT, user);
  if (!parsed || typeof parsed !== "object") {
    return {
      risk_level: "Not Enough Information",
      reason: "Not enough information to make a reliable assessment.",
    };
  }
  const rl = (parsed as any).risk_level;
  const reason = (parsed as any).reason;
  if (!isRisk(rl) || typeof reason !== "string") {
    return {
      risk_level: "Not Enough Information",
      reason: "Not enough information to make a reliable assessment.",
    };
  }
  return { risk_level: rl, reason: reason.slice(0, 400) };
}