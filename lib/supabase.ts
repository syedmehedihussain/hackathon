// lib/supabase.ts — Supabase clients (service role for server; anon for client UI reads).
// All secrets come from process.env; never hardcode.

import { createClient, SupabaseClient } from "@supabase/supabase-js";

export type ClauseRow = {
  id: string;
  contract_id: string;
  section: string | null;
  clause_type: string;
  clause_text: string;
  embedding: number[] | null;
};

export type StandardRow = {
  id: string;
  category: string;
  standard_text: string;
};

let _admin: SupabaseClient | null = null;
let _publicClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (_admin) return _admin;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase env vars missing (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY).");
  }
  _admin = createClient(url, key, { auth: { persistSession: false } });
  return _admin;
}

export function getSupabasePublic(): SupabaseClient {
  if (_publicClient) return _publicClient;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error("Supabase public env vars missing (NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY).");
  }
  _publicClient = createClient(url, key, { auth: { persistSession: false } });
  return _publicClient;
}