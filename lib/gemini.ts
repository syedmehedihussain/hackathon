// lib/gemini.ts — Gemini wrappers.
// - embed(): text-embedding-004 → 768-dim vector
// - generateJSON(): gemini-flash-latest → strict JSON object
//
// All calls are wrapped in try/catch; callers decide the fallback. The system
// MUST NOT crash on a Gemini failure — see ARCHITECTURE.md failure modes.

const EMBED_MODEL = "text-embedding-004";
const GEN_MODEL = "gemini-flash-latest";

function apiKey(): string {
  const k = process.env.GEMINI_API_KEY;
  if (!k) throw new Error("GEMINI_API_KEY is missing from env.");
  return k;
}

async function postJSON(url: string, body: unknown): Promise<any> {
  const r = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": apiKey(),
    },
    body: JSON.stringify(body),
  });
  if (!r.ok) {
    const txt = await r.text().catch(() => "");
    throw new Error(`Gemini ${r.status}: ${txt.slice(0, 300)}`);
  }
  return r.json();
}

/** Embed a single string → 768-dim number[]. Returns null on failure (caller falls back). */
export async function embed(text: string): Promise<number[] | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${EMBED_MODEL}:embedContent?key=${encodeURIComponent(apiKey())}`;
    const body = {
      model: `models/${EMBED_MODEL}`,
      content: { parts: [{ text }] },
    };
    const direct = `https://generativelanguage.googleapis.com/v1beta/${EMBED_MODEL}:embedContent`;
    const r = await fetch(direct, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`embed ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    const values = j?.embedding?.values;
    if (!Array.isArray(values)) throw new Error("embed: missing embedding.values");
    return values as number[];
  } catch (e) {
    console.warn("[gemini] embed failed:", (e as Error).message);
    return null;
  }
}

/** Embed many texts sequentially (rate-friendly). Returns array aligned with input; null for failures. */
export async function embedBatch(texts: string[]): Promise<(number[] | null)[]> {
  const out: (number[] | null)[] = [];
  for (const t of texts) {
    out.push(await embed(t));
  }
  return out;
}

/**
 * Strict JSON generation. Sends system+user, expects ONLY a JSON object back.
 * Returns parsed object on success, null on any failure (caller falls back to NEI).
 */
export async function generateJSON(system: string, user: string): Promise<any | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json",
      },
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`gen ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (typeof raw !== "string") throw new Error("gen: no text in candidates");
    // Some responses include code fences despite responseMimeType — strip them.
    const cleaned = raw
      .trim()
      .replace(/^```json\s*/i, "")
      .replace(/^```\s*/i, "")
      .replace(/```$/i, "")
      .trim();
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("[gemini] generateJSON failed:", (e as Error).message);
    return null;
  }
}

/** Plain generation (no JSON constraint). Returns string or null. */
export async function generateText(system: string, user: string): Promise<string | null> {
  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/${GEN_MODEL}:generateContent`;
    const body = {
      systemInstruction: { parts: [{ text: system }] },
      contents: [{ role: "user", parts: [{ text: user }] }],
      generationConfig: { temperature: 0.1 },
    };
    const r = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey() },
      body: JSON.stringify(body),
    });
    if (!r.ok) {
      const txt = await r.text().catch(() => "");
      throw new Error(`gen ${r.status}: ${txt.slice(0, 200)}`);
    }
    const j = await r.json();
    const raw = j?.candidates?.[0]?.content?.parts?.[0]?.text;
    return typeof raw === "string" ? raw : null;
  } catch (e) {
    console.warn("[gemini] generateText failed:", (e as Error).message);
    return null;
  }
}