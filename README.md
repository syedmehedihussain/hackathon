# ClauseGuard

An AI-powered **contract review assistant** that helps a human reviewer. It reads a contract, finds the relevant clause for a question, compares it against the company's approved standard, and returns a **risk level + plain-language reason + a suggested next step + evidence** — and safely abstains ("Not enough information to make a reliable assessment") when a clause isn't present. A human always makes the final decision.

> Built for the Intra-IUB AI Hackathon 2026 final round — team **Doomsday**.
> **Not legal advice. An assistant only. A human reviewer makes the final decision.**

## What it does

1. Select a contract (C-001 … C-008)
2. Ask a question (preset or free-text)
3. System detects the clause type, checks it actually exists, retrieves the clause + matching standard
4. Gemini Flash compares them → **Low / Medium / High Risk** or **Not Enough Information**, with a short **suggested next step** for the reviewer
5. Every result shows evidence (clause text, standard text, source) and requires human review

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres + pgvector) · Google Gemini (`gemini-embedding-001` + `gemini-flash-latest`) · Vercel. Runs entirely on free tiers.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in your keys
# in Supabase SQL editor: create extension vector; + tables from docs/schema.sql
npm run seed                 # loads /data into Supabase, computes embeddings once
npm run dev
```

## Pipeline (request → response)

A single POST to `/api/review` runs this 8-step pipeline. Steps 2–4 are the **deterministic abstention gate** — they decide whether the LLM is ever called.

| # | Step | Module | What it does |
|---|---|---|---|
| 1 | Cache lookup | `lib/cache.ts` | sha256 of `contract_id + normalized question` → return cached result if present |
| 2 | Type detection | `lib/retrieval.ts` (Step A) | Embed the question; cosine-rank against the 7 precomputed clause-type descriptions in `clause_type_embeddings`; pick the best type. Below `TYPE_THRESHOLD` (0.55) → abstain. |
| 3 | **Abstention gate** | `lib/retrieval.ts` (Step B) | If the contract has **zero clauses** of the detected type, abstain — the LLM never runs. |
| 4 | Clause retrieval | `lib/retrieval.ts` (Step C) | Cosine-rank every clause of that type in the contract. If the top similarity is below `CLAUSE_THRESHOLD` (0.58), abstain. |
| 5 | Standard lookup | `lib/compare.ts` (Step D) | Fetch the matching row from `standards` by `category`. Missing standard → abstain. |
| 6 | Compare | `lib/compare.ts` (Step E) | Gemini Flash receives **only** the clause text + the standard text and returns strict JSON: `risk_level`, `reason`, `suggested_action`. Any failure or malformed output fails safe to NEI. |
| 7 | Assemble | `app/api/review/route.ts` | Build the result payload with `evidence` and `requires_human_review: true`. |
| 8 | Persist | `app/api/review/route.ts` | Write to `query_cache` and insert a `reviews` row (`status: pending_review`). |

## Architecture

```
                ┌──────────────────────────────┐
  POST          │  app/api/review/route.ts     │   single endpoint
  {contract_id, │  ─────────────────────────── │
   question}    │  1. cache  →  2-4. retrieval │   deterministic
                │      │            │          │   abstention gate
                │      ▼            ▼          │
                │  ┌──────┐    abstain (NEI)  │   LLM NEVER called
                │  │ hit? │──┐  return NEI    │   if gate fires
                │  └──────┘  │                │
                │            ▼                │
                │  5. standard lookup         │
                │            │                │
                │            ▼                │
                │  6. Gemini Flash compare    │   strict JSON
                │     {risk_level, reason,    │
                │      suggested_action}      │
                │            │                │
                │            ▼                │
                │  7. assemble + evidence     │
                │  8. cache + insert reviews  │
                └──────────────┬───────────────┘
                               │
                               ▼
                GET  /api/review-action        human reviewer
                     (approve / reject /       decides
                      flag / feedback)
```

**Why this shape.** The system is deliberately small — one endpoint, one orchestrator, three library modules. Every external call (Supabase, Gemini) is wrapped in try/catch; failures fail safe to NEI rather than crashing or fabricating. The model is only ever given two texts to compare, so it cannot invent a clause.

## Key decisions

- **Deterministic abstention gate (Steps 2–4).** Calibration note (in `lib/retrieval.ts`): on-topic questions score detector 0.60–0.87 / clause 0.65–0.79; off-topic queries ("hello", "who is joy", …) score ≤ ~0.51. The thresholds sit in the gap so off-topic queries abstain while every public test question still passes. Retune if the embedding model changes.
- **Precomputed type embeddings.** The 7 clause-type descriptions are embedded once at seed time and stored in `clause_type_embeddings`. Runtime reads them in one query — no 7-call Gemini cold start on first request.
- **Strict-JSON Gemini output.** `responseMimeType: "application/json"` plus a strip-code-fence fallback. Any parse failure or missing required field → NEI. Never crash, never fabricate.
- **Model only sees what it compares.** The prompt instructs the model to use only the clause + standard texts and gives no other context. Combined with the gate, this is what guarantees the model can never invent a clause that isn't actually present.
- **Suggested next step is a suggestion, not advice.** When risk is `Medium` or `High`, Gemini also returns `suggested_action`: a short concrete next step for the reviewer (e.g. *"Request a 12-month liability cap with carve-outs for data breach and IP infringement"*). On `Low Risk` and `Not Enough Information`, the model is explicitly told to return `"No action needed."` — no action items are invented for safe or missing clauses. The UI renders this under the reason with a *"suggestion for the human reviewer to consider — not legal advice"* disclaimer.
- **Human-in-the-loop is the contract.** Every result carries `requires_human_review: true`. `POST /api/review-action` lets a reviewer mark a row `approved`, `rejected`, or `flagged`, or attach `feedback`. The UI exposes Approve / Reject / Mark for review / Save feedback buttons.
- **Cache + audit trail.** Each call writes to `query_cache` (sha256 key → JSON result) and inserts a row in `reviews`. Repeated questions for the same contract return the cached verdict and skip Gemini.

## Suggested-action field (recent change)

`/api/review` now also returns a `suggested_action` string alongside `risk_level` and `reason`. It is rendered in the result card only when it is meaningful (not the `"No action needed."` default). Safe defaults:

- `Low Risk` → `"No action needed."`
- `Not Enough Information` → `"No action needed."`
- Gemini returns malformed/missing → NEI + `"No action needed."`
- Gemini returns Medium/High but omits `suggested_action` → generic fallback *"Review this clause with the human reviewer and consider negotiating the differing terms."*

**Follow-up (not yet done):** add a `suggested_action text` column to the `reviews` table in `docs/schema.sql` so the suggestion is persisted in the audit trail. The API already passes the field through to `insertReviewRow`, so the migration is a single `ALTER TABLE` plus rerunning the seeder is not required.

## Key files

- `app/api/review/route.ts` — the single endpoint, orchestrates the 8-step pipeline
- `app/api/review-action/route.ts` — human-in-the-loop approve/reject/flag/feedback
- `app/api/presets/route.ts` — preset questions for the demo
- `app/api/health/route.ts` — health check
- `app/page.tsx` — UI: contract picker, preset/free-text question, result card with risk + reason + suggested action + evidence + reviewer actions
- `lib/retrieval.ts` — Steps A, B, C (detect type, abstention gate, ranked retrieval)
- `lib/compare.ts` — Steps D, E (standard lookup + Gemini compare)
- `lib/gemini.ts` — `embed()` and `generateJSON()` wrappers, fail-safe on any error
- `lib/cache.ts` — sha256 cache key + `query_cache` read/write
- `lib/supabase.ts` — Supabase admin client (service role)
- `scripts/seed.ts` — load `/data` into Supabase, compute embeddings once
- `scripts/embed-types.ts` — populate `clause_type_embeddings` (one-time)
- `scripts/test-gate.ts` — exercise the abstention gate against the public questions
- `docs/schema.sql` — Postgres + pgvector schema

## Data

`/data` holds the provided dataset (8 contracts, 7 company standards, 12 test questions, 3 missing-information cases). All fictional.