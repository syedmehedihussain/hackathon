// lib/cache.ts — sha256(contract_id + normalized question) → cached result.
// Cost + latency: repeat queries return ~50ms.

import crypto from "node:crypto";
import { getSupabaseAdmin } from "./supabase";

export function hashQuery(contractId: string, question: string): string {
  const norm = question.trim().toLowerCase().replace(/\s+/g, " ");
  return crypto.createHash("sha256").update(`${contractId}|${norm}`).digest("hex");
}

export async function getCached(hash: string): Promise<any | null> {
  try {
    const sb = getSupabaseAdmin();
    const { data, error } = await sb
      .from("query_cache")
      .select("result_json")
      .eq("query_hash", hash)
      .maybeSingle();
    if (error) {
      console.warn("[cache] read error:", error.message);
      return null;
    }
    return data?.result_json ?? null;
  } catch (e) {
    console.warn("[cache] read failed:", (e as Error).message);
    return null;
  }
}

export async function setCached(
  hash: string,
  contractId: string,
  question: string,
  result: unknown,
): Promise<void> {
  try {
    const sb = getSupabaseAdmin();
    const { error } = await sb.from("query_cache").upsert({
      query_hash: hash,
      contract_id: contractId,
      question,
      result_json: result,
    });
    if (error) console.warn("[cache] write error:", error.message);
  } catch (e) {
    console.warn("[cache] write failed:", (e as Error).message);
  }
}