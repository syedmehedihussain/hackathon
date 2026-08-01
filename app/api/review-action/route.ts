// app/api/review-action/route.ts
// Human-in-the-loop: Approve / Reject / Mark for review / Add feedback.
// PATCHes the most recent matching reviews row.

import { NextRequest, NextResponse } from "next/server";
import { getSupabaseAdmin } from "@/lib/supabase";

export const runtime = "nodejs";

type Body = {
  contract_id?: string;
  question?: string;
  action?: "approve" | "reject" | "flag" | "feedback";
  feedback?: string;
};

const STATUS: Record<NonNullable<Body["action"]>, string> = {
  approve: "approved",
  reject: "rejected",
  flag: "flagged",
  feedback: "pending_review",
};

export async function POST(req: NextRequest) {
  let body: Body = {};
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const { contract_id, question, action, feedback } = body;
  if (!contract_id || !question || !action) {
    return NextResponse.json({ error: "contract_id, question, action are required" }, { status: 400 });
  }
  if (!(action in STATUS)) {
    return NextResponse.json({ error: "invalid action" }, { status: 400 });
  }

  const sb = getSupabaseAdmin();
  // Pick the most recent matching row.
  const { data: rows, error: selErr } = await sb
    .from("reviews")
    .select("id")
    .eq("contract_id", contract_id)
    .eq("question", question)
    .order("created_at", { ascending: false })
    .limit(1);
  if (selErr) return NextResponse.json({ error: selErr.message }, { status: 500 });
  if (!rows || rows.length === 0) {
    return NextResponse.json({ error: "no matching review row" }, { status: 404 });
  }
  const id = rows[0].id;
  const update: Record<string, unknown> = { status: STATUS[action] };
  if (action === "feedback") update.feedback = feedback ?? "";
  const { data, error } = await sb.from("reviews").update(update).eq("id", id).select("id, status, feedback").maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, review: data });
}