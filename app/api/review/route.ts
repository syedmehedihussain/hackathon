// app/api/review/route.ts
// The single endpoint. question + contract_id in → assembled result out.
//
// Flow:
//   1. cache lookup (sha256 of contract_id + normalized question)
//   2. detect clause type (Step A)
//   3. ABSTENTION GATE (Step B) — return NEI without ever calling the LLM
//   4. ranked clause retrieval (Step C)
//   5. standard lookup (Step D)
//   6. compare with Gemini Flash (Step E)
//   7. assemble result { risk_level, reason, evidence }
//   8. write to cache + insert reviews row
//
// Every result carries `evidence` and `requires_human_review: true`.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";
import { detectAndRetrieve } from "@/lib/retrieval";
import { compareClauseToStandard, getStandard } from "@/lib/compare";
import { hashQuery, getCached, setCached } from "@/lib/cache";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Body = { contract_id?: string; question?: string };

function abstain(
  contractId: string,
  clauseType: string,
  reason: string,
  extra?: Record<string, unknown>,
) {
  return {
    contract_id: contractId,
    clause_type: clauseType,
    risk_level: "Not Enough Information" as const,
    reason: "Not enough information to make a reliable assessment.",
    note: reason,
    evidence: {
      contract_clause: null,
      company_standard: null,
      source: extra?.source ?? null,
    },
    requires_human_review: true,
    ...extra,
  };
}

export async function POST(req: NextRequest) {
  const t0 = Date.now();
  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const contractId = (body.contract_id ?? "").trim();
  const question = (body.question ?? "").trim();
  if (!contractId || !question) {
    return NextResponse.json({ error: "contract_id and question are required" }, { status: 400 });
  }

  // 1. cache
  const cacheKey = hashQuery(contractId, question);
  const cached = await getCached(cacheKey);
  if (cached) {
    console.log(JSON.stringify({ event: "review.cache_hit", contract_id: contractId, ms: Date.now() - t0 }));
    return NextResponse.json({ ...cached, cached: true });
  }

  try {
    // 2. detect type + 3. ABSTENTION GATE + 4. ranked retrieval
    const r = await detectAndRetrieve(contractId, question);

    if (!r.ok) {
      const result = abstain(
        contractId,
        r.clauseType,
        r.reason === "low_type_confidence"
          ? "Could not determine which clause type the question is about with enough confidence."
          : r.reason === "no_candidates"
            ? `No ${r.clauseType} clause found in ${contractId}.`
            : `Top ${r.clauseType} clause similarity was below the confidence threshold.`,
        { source: `${contractId} (no clause of type ${r.clauseType})` },
      );
      await Promise.all([
        setCached(cacheKey, contractId, question, result),
        insertReviewRow({
          contract_id: contractId,
          question,
          clause_type: r.clauseType,
          risk_level: result.risk_level,
          reason: result.reason,
          evidence_clause_id: null,
          standard_id: null,
        }),
      ]);
      console.log(JSON.stringify({ event: "review.abstain", contract_id: contractId, clause_type: r.clauseType, reason: r.reason, ms: Date.now() - t0 }));
      return NextResponse.json(result);
    }

    // 5. standard lookup (Step D)
    const standard = await getStandard(r.clauseType);
    if (!standard) {
      const result = abstain(
        contractId,
        r.clauseType,
        `No company standard registered for category "${r.clauseType}".`,
        { source: `${contractId} §${r.hit.clause.section ?? "?"} (no standard)` },
      );
      await Promise.all([
        setCached(cacheKey, contractId, question, result),
        insertReviewRow({
          contract_id: contractId,
          question,
          clause_type: r.clauseType,
          risk_level: result.risk_level,
          reason: result.reason,
          evidence_clause_id: r.hit.clause.id,
          standard_id: null,
        }),
      ]);
      return NextResponse.json(result);
    }

    // 6. compare with Gemini Flash (Step E) — strict JSON, fail-safe
    const verdict = await compareClauseToStandard({
      contractId,
      section: r.hit.clause.section,
      clauseType: r.clauseType,
      clauseText: r.hit.clause.clause_text,
      standardId: standard.id,
      category: standard.category,
      standardText: standard.standard_text,
    });

    // 7. assemble
    const result = {
      contract_id: contractId,
      clause_type: r.clauseType,
      risk_level: verdict.risk_level,
      reason: verdict.reason,
      detection_similarity: Number(r.detection.similarity.toFixed(3)),
      clause_similarity: Number(r.hit.similarity.toFixed(3)),
      evidence: {
        contract_clause: {
          section: r.hit.clause.section,
          text: r.hit.clause.clause_text,
        },
        company_standard: {
          id: standard.id,
          text: standard.standard_text,
        },
        source: `${contractId} §${r.hit.clause.section ?? "?"} vs ${standard.id}`,
      },
      requires_human_review: true,
    };

    // 8. cache + audit row
    await Promise.all([
      setCached(cacheKey, contractId, question, result),
      insertReviewRow({
        contract_id: contractId,
        question,
        clause_type: r.clauseType,
        risk_level: result.risk_level,
        reason: result.reason,
        evidence_clause_id: r.hit.clause.id,
        standard_id: standard.id,
      }),
    ]);

    console.log(JSON.stringify({
      event: "review.ok",
      contract_id: contractId,
      clause_type: r.clauseType,
      risk_level: result.risk_level,
      ms: Date.now() - t0,
    }));
    return NextResponse.json(result);
  } catch (e) {
    console.error("[review] unhandled error:", (e as Error).message);
    const result = abstain(
      contractId,
      "?",
      "Temporary issue, please try again.",
      { source: contractId, transient_error: true },
    );
    return NextResponse.json(result, { status: 200 }); // 200 + abstain > 500 crash
  }
}

async function insertReviewRow(row: {
  contract_id: string;
  question: string;
  clause_type: string;
  risk_level: string;
  reason: string;
  evidence_clause_id: string | null;
  standard_id: string | null;
}) {
  try {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("reviews").insert({
      ...row,
      status: "pending_review",
    });
    if (error) console.warn("[review] insert row error:", error.message);
  } catch (e) {
    console.warn("[review] insert row failed:", (e as Error).message);
  }
}