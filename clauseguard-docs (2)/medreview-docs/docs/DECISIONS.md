# Decisions — ClauseGuard

Short rationales for the choices judges are likely to probe (problem-statement §9). Each is a ready answer.

## D-1: Type-filtered vector retrieval, not pure keyword search
**Why:** questions are phrased in human language ("Will this contract renew automatically?") and won't keyword-match clause text. Embeddings capture intent. We filter by detected clause type first, then rank by similarity — so retrieval is both relevant *and* explainable. Keyword search alone would miss paraphrased questions and can't express "how relevant."

## D-2: Deterministic abstention gate before any LLM risk call
**Why:** the biggest failure risk in this problem is inventing a clause that isn't there. We make "does this clause type exist in this contract?" a **data check**, not an LLM judgment. The model is only ever invoked on clauses that provably exist, so it structurally cannot fabricate one. This is how we guarantee the three missing-information cases abstain. *(This is also our Innovation-category story.)*

## D-3: LLM compares two given texts only — never retrieves or recalls
**Why:** anti-hallucination. Retrieval is vector search over seeded data; the LLM receives exactly one clause and one standard and returns a label + reason. It has no room to add facts. Malformed output fails safe to "Not Enough Information."

## D-4: Embeddings computed once at seed time
**Why:** performance + cost. The dataset is fixed and tiny, so we pay the embedding cost once, not per request. Requests do one question-embed + one vector lookup + (maybe) one Flash call.

## D-5: Query cache keyed on (contract, question)
**Why:** performance + cost. Repeated/demo queries return in ~50 ms and cost nothing. Simple sha256 hash → jsonb result.

## D-6: Supabase (Postgres + pgvector), not a separate vector DB
**Why:** one free service gives us relational storage *and* vector search *and* an audit table for human review. No extra infra, no extra cost, less to wire in 4 hours.

## D-7: Gemini Flash + text-embedding-004 on the free tier
**Why:** $0 cost, fast, good enough for short clause comparison. Cost optimization = free-tier model + cache + compute-once embeddings.

## D-8: RLS/auth left off for the demo
**Why:** data is fictional and §10 says no complex auth. *For production* we'd enable Row Level Security scoping contracts per organization, and encrypt contract text at rest — that's our answer to "how would private contracts be protected."

## D-9: Kept the bottom-four rubric categories minimal
**Why:** the judging principle rewards the simplest reliable solution and §10 explicitly says CI/CD, dashboards, and enterprise security aren't required. We spend the time on retrieval quality, speed, and a clean live deploy (75 of 100 pts) and bolt on a health check, logs, and fallbacks for the rest.

---

## Prepared answers to §9 "What you need to explain"

- **How it works:** select contract + question → detect clause type → check the clause exists → retrieve clause + standard → Flash compares → risk + reason + evidence → human review.
- **How we find the right clause:** semantic (embedding) search filtered to the detected clause type, ranked by similarity.
- **How we compare:** Flash judges one clause against one standard, returns one of four risk labels with a plain reason.
- **How we prevent made-up answers:** deterministic abstention gate (D-2), LLM never retrieves (D-3), fail-safe parsing, evidence for every result.
- **Scaling to more contracts:** same pipeline; seed more contracts, embeddings scale linearly, add an ANN index (already using ivfflat). Nothing changes structurally.
- **Protecting private contracts:** RLS per org, encryption at rest, no third-party data sharing, keys in env vars (D-8).
- **What we'd improve with time:** clause-level highlighting in the source text, multi-clause questions, confidence scores shown to the reviewer, an eval harness over the full question set.
