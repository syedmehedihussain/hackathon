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

Also give a short, plain-language "suggested_action" describing one concrete next step a human reviewer can take to address the issue — for example: "Ask the counterparty to add a 30-day notice clause", "Request a 12-month liability cap with carve-outs for data breach and IP infringement", "Negotiate the late-fee cap down to 1% per month or less". This is a suggestion for the human reviewer to consider, not legal advice. If risk_level is "Low Risk" or "Not Enough Information", suggest "No action needed." — do not invent action items for clauses that are safe or missing.

Respond with ONLY this JSON, no markdown, no backticks:
{"risk_level": "<one of the four>", "reason": "<short reason>", "suggested_action": "<short concrete next step>"}`;

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
  suggested_action: string;
};

const NO_ACTION = "No action needed.";

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
      suggested_action: NO_ACTION,
    };
  }
  const rl = (parsed as any).risk_level;
  const reason = (parsed as any).reason;
  const action = (parsed as any).suggested_action;
  if (!isRisk(rl) || typeof reason !== "string") {
    return {
      risk_level: "Not Enough Information",
      reason: "Not enough information to make a reliable assessment.",
      suggested_action: NO_ACTION,
    };
  }
  // Validate suggested_action shape. If missing/bad, pick a safe default by risk.
  let safeAction = NO_ACTION;
  if (typeof action === "string") {
    const trimmed = action.trim();
    if (trimmed.length > 0 && trimmed.length <= 400) safeAction = trimmed;
    else if (trimmed.length > 400) safeAction = trimmed.slice(0, 400);
  } else if (rl === "Medium Risk" || rl === "High Risk") {
    safeAction = "Review this clause with the human reviewer and consider negotiating the differing terms.";
  }
  return { risk_level: rl, reason: reason.slice(0, 400), suggested_action: safeAction };
}