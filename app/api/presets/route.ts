import { NextResponse } from "next/server";
import { promises as fs } from "node:fs";
import path from "node:path";

export const runtime = "nodejs";

type Preset = { id: string; contract_id: string; question: string };

let cache: Preset[] | null = null;

export async function GET() {
  if (!cache) {
    const p = path.join(process.cwd(), "data", "public_test_questions.json");
    const raw = await fs.readFile(p, "utf8");
    cache = JSON.parse(raw) as Preset[];
  }
  return NextResponse.json(cache);
}