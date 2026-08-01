# TASKS — 4-Hour Build Plan (team Doomsday)

Ordered so that the 75 rubric points (search, performance, deployment) are protected first. Roles: **Sayn** (retrieval + abstention + API), **teammate 2** (UI), **Joy** (seed + Supabase schema), **Rahin** (docs/diagram/pitch, runs in parallel).

## 0:00–0:15 — Read & assign
- [ ] Whole team reads `puku.md` + this file.
- [ ] Confirm Supabase project + Gemini key ready; paste keys into `.env.local` (never committed).
- [ ] Assign roles above.

## 0:15–0:30 — Scaffold & safety net
- [ ] `npx create-next-app@latest . --tailwind --typescript --app`
- [ ] Add `.gitignore` (`.env*.local`, `node_modules`, `.next`, `.puku/`, `.vercel`) **before first commit**.
- [ ] `git init`, first commit, push to a **new** GitHub repo.
- [ ] Connect repo to Vercel, set env vars, do one throwaway deploy to confirm env wiring.

## 0:30–1:00 — Data layer (Joy)
- [ ] Run `create extension vector;` + all tables from `docs/DATA_MODEL.md`.
- [ ] Write `scripts/seed.ts`: parse the 8 contracts into clauses (section + type + text), load 7 standards, compute embeddings once, insert everything.
- [ ] Run seed. Verify row counts: 8 contracts, ~35 clauses, 7 standards.

## 0:30–1:15 — Retrieval + abstention gate (Sayn, in parallel)
- [ ] `lib/gemini.ts` — embed() + generate() wrappers.
- [ ] `lib/retrieval.ts` — clause-type detection (Step A), abstention gate (Step B), ranked retrieval (Step C). See `docs/AI_INTEGRATION.md`.
- [ ] Unit-check the gate against the 3 MI cases *before* wiring the LLM.

## 1:15–2:00 — Comparison + API (Sayn)
- [ ] `lib/compare.ts` — standard lookup (Step D) + Gemini risk judgment (Step E), strict JSON + fail-safe parse.
- [ ] `lib/cache.ts` — hash lookup / store.
- [ ] `app/api/review/route.ts` — orchestrate the full flow, insert a `reviews` row, return the assembled result.
- [ ] `app/api/health/route.ts` — returns `{status:"ok"}`.

## 1:00–2:15 — UI (teammate 2, in parallel)
- [ ] Contract selector (dropdown C-001…C-008).
- [ ] Question box: preset dropdown from `public_test_questions.json` + free-text input.
- [ ] Result card matching problem-statement §6: Clause Type, Risk Level (colored badge), Contract Clause, Company Standard, Reason, Source, "Human Review Required" banner.
- [ ] Human-review actions: Approve / Reject / Mark for review / Add feedback → PATCH the review row's status.
- [ ] Persistent disclaimer: "Assistant only — not legal advice. A human makes the final decision."

## 2:15–2:45 — Integration pass
- [ ] Wire UI → `/api/review` → result card end to end.
- [ ] Run all 12 public questions; confirm sensible risk + evidence.
- [ ] Run all 3 MI cases; confirm `Not Enough Information`.

## 2:45–3:15 — Harden (bottom rubric bolt-ons)
- [ ] Cache verified (second identical query is instant).
- [ ] `try/catch` fallbacks on Gemini + Supabase confirmed (kill network briefly, app should degrade to "Not Enough Information", not crash).
- [ ] One basic test (e.g. gate returns abstain for C-004 renewal) — enough for the deployment rubric.
- [ ] Structured `console.log` per request (contract_id, clause_type, risk, latency ms).

## 3:15–3:45 — Deploy & freeze
- [ ] Final push → Vercel production deploy.
- [ ] Smoke-test the **deployed URL** (not localhost) with 2–3 questions + 1 MI case.
- [ ] Freeze the repo. Note the live URL for the demo.

## 3:45–4:00 — Pitch prep (Rahin has been drafting since 0:30)
- [ ] Confirm demo script (see below) runs on the live URL.
- [ ] Lock the 7 answers for problem-statement §9.

## Demo script (2 min, on the live URL)
1. PQ-01 (C-001 auto-renewal) → **High Risk**, show evidence. "60 days > standard's 30-day max."
2. PQ-05 (C-003 stored-data encryption) → risk + evidence. "Standard requires encryption at rest; clause says it's not required."
3. **MI-01 (C-004 renewal)** → **Not Enough Information**. "No renewal clause exists — we abstain, we don't invent." ← the money moment.
4. Take a human-review action on one result (Approve).
5. One line on cost + one on latency number.

## Cut list (if time runs short — never cut from search/deploy)
- Drop free-text questions, keep the preset dropdown.
- Drop Add-feedback, keep Approve/Reject/Mark.
- Drop the cache (it's a talking point, not a demo blocker).
- Never drop: abstention gate, evidence display, live deploy.
