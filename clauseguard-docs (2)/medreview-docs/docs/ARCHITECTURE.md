# Architecture — ClauseGuard

## High-level flow

```
Reviewer (browser)
      │  selects contract + question
      ▼
POST /api/review
      │
      ├─ 1. cache lookup  (hash of contract_id + question) ──── hit ──► return cached result
      │
      ├─ 2. detect clause_type   (lib/retrieval.ts)
      │        embed question → compare to the 7 clause-type descriptions → best match
      │
      ├─ 3. ABSTENTION GATE  (lib/retrieval.ts)
      │        does this contract contain a clause of that type?
      │        (filter clauses by contract_id + type; check top similarity ≥ threshold)
      │        └─ NO  ──► return "Not Enough Information"  (LLM never called)
      │        └─ YES ──► continue
      │
      ├─ 4. retrieve best-matching clause  (embedding similarity, ranked)
      │
      ├─ 5. retrieve matching company standard by category
      │
      ├─ 6. compare  (lib/compare.ts → Gemini Flash, strict JSON)
      │        returns { risk_level, reason }
      │
      ├─ 7. assemble result { risk_level, reason, evidence:{clause, standard, sources} }
      │
      ├─ 8. write to cache + insert a review row (status = pending_review)
      │
      ▼
Result card + human-review actions (Approve / Reject / Mark for review)
```

## Components

| Layer | Tech | Responsibility |
|---|---|---|
| UI | Next.js + Tailwind | contract picker, question box, result card, review actions |
| API | Next.js route `/api/review` | orchestrates the flow above |
| Retrieval | `pgvector` + `lib/retrieval.ts` | clause-type detection, abstention gate, ranked clause retrieval |
| Judgment | Gemini Flash + `lib/compare.ts` | clause-vs-standard comparison, strict-JSON risk output |
| Storage | Supabase Postgres | contracts, clauses, standards, reviews, cache |
| Deploy | Vercel | live URL, env-var secrets |

## Why this shape

The dataset is tiny and clean (8 contracts, ~35 clauses, 7 standards). That means:
- **Embeddings are computed once at seed time**, not per request — retrieval is a fast vector lookup.
- **The abstention gate is deterministic** — presence of a clause type is a data fact, not an LLM guess. The LLM is only ever invoked on clauses that provably exist, so it cannot fabricate one.
- **Only one LLM call per uncached request** (the comparison) — cheap, fast, and easy to reason about.

## How each piece maps to the scoring rubric

| Category (pts) | Where it lives |
|---|---|
| **Search Quality & Relevance (30)** | `lib/retrieval.ts` — semantic clause-type detection + ranked embedding retrieval, and the abstention gate (correct retrieval *and* correct refusal). Ranking = cosine similarity, filtered by clause type; explainable. |
| **Performance (25)** | `lib/cache.ts` (query cache), precomputed embeddings at seed, `ivfflat` index on the vector column, single LLM call. Demo number: ~1–2 s cold, ~50 ms cached. |
| **Deployment & Architecture (20)** | Vercel live URL, secrets in env vars, `/api/health` endpoint, one basic test. Kept minimal per problem-statement §10. |
| **Cost (15)** | Gemini Flash + `text-embedding-004` free tier, embeddings computed once, query cache avoids repeat LLM calls. Mostly a talking point. |
| **Observability & Resilience (10)** | structured `console` logs per request, `/api/health`, `try/catch` fallback to `Not Enough Information` on any failure. |
| **Innovation (5)** | the deterministic abstention gate as a safety feature — one clever, well-explained twist. |
| **Presentation & Docs (5)** | this `docs/` folder + README + architecture diagram + clean 2-min demo. |

Categories 1+2+3 = 75 pts and are protected first. The bottom four are intentionally minimal.

## Failure modes & fallbacks (resilience)

- Gemini timeout / bad JSON → catch → return `Not Enough Information` (never crash, never fabricate).
- Supabase error → catch → user-facing "temporary issue, try again," logged.
- Empty/garbage question → clause-type detection low-confidence → abstain.
