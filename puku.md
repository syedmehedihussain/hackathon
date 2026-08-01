# puku.md — Agent Instructions for ClauseGuard

> Read this file before writing any code in this repo. It defines what we're building, the rules that must never be broken, and the conventions to follow.

## What this project is

**ClauseGuard** — an AI-powered contract review assistant built for the Intra-IUB AI Hackathon 2026 final round (team **Doomsday**). It reads a contract, finds the relevant clause for a question, retrieves the matching company standard, compares them, and returns a **risk level + plain-language reason + evidence**, always flagged for human review.

The build window is **4 hours**. The judging principle is: *the simplest reliable solution beats an unnecessarily complex one.* Do not add features that aren't in `docs/TASKS.md`.

## The six rules that must NEVER be broken

These come straight from the problem statement's "Important Rules" and are the difference between winning and losing this hackathon:

1. **Never claim the system gives legal advice.** UI must say "assistant" / "requires human review" everywhere a result appears.
2. **Never invent a clause, standard, or legal rule.** Every fact shown must come from seeded data.
3. **Every risk result must show evidence** — the exact contract clause text, the matching standard text, and the source id.
4. **Use only provided/approved data** — the 8 contracts and 7 standards in `/data`. No outside knowledge.
5. **Mark uncertain results clearly** — when a clause type is absent from a contract, return exactly `Not Enough Information` with the message *"Not enough information to make a reliable assessment."*
6. **Keep a human in the loop** — every result carries Approve / Reject / Mark for review actions.

## The single most important piece of logic: the abstention gate

Most teams will let the LLM decide everything and it will hallucinate a clause that isn't there. **We do not.**

The flow is: `question → determine clause_type → check whether the contract actually contains a clause of that type → ONLY IF it does, call the LLM to judge risk.`

The presence check is **deterministic and happens before any risk judgment**. If the target clause type is not present in the selected contract (no clause row of that type / similarity below threshold), we return `Not Enough Information` **without ever asking the LLM to assess risk.** The LLM is never given the chance to fabricate. This is tested directly by the three cases in `data/missing_information_cases.json` (C-004 has no auto-renewal, C-007 has no termination, C-008 has no liability cap) — all three must abstain.

## Tech stack (fixed — do not swap)

- **Next.js 14 (App Router) + TypeScript + Tailwind** — frontend + API routes
- **Supabase** (Postgres + `pgvector`) — stores contracts, clauses, standards, reviews, cache
- **Google Gemini** — `text-embedding-004` for embeddings, `gemini-flash-latest` for comparison/risk judgment (free tier)
- **Vercel** — deployment

Everything is chosen to run at **$0** (free tiers). Keep it that way.

## Coding conventions

- All secrets come from `.env.local` (see `.env.example`). **Never hardcode a key. Never paste a key into a committed file.** `.env.local`, `.env`, and `.puku/` are gitignored — verify before every commit.
- LLM must return **strict JSON** matching the schema in `docs/AI_INTEGRATION.md`. Always `try/catch` the parse; on failure, fall back to `Not Enough Information`, never crash.
- Every API response includes `evidence` (clause text + standard text + source ids). A response without evidence is a bug.
- Risk labels are exactly these four strings: `Low Risk`, `Medium Risk`, `High Risk`, `Not Enough Information`. No other values.
- Wrap every external call (Gemini, Supabase) in `try/catch` with a sensible fallback. One failed call must not kill the app (resilience = rubric points).

## File / folder map

```
/data                     # the provided dataset (contracts, standards, questions, MI cases) — source of truth
/lib
  supabase.ts             # Supabase client
  gemini.ts               # embedding + generation wrappers
  retrieval.ts            # clause-type detection + abstention gate + ranking
  compare.ts              # standard lookup + LLM risk judgment (strict JSON)
  cache.ts                # query cache helpers
/app
  page.tsx                # contract selector + question box + result card
  api/review/route.ts     # the one endpoint: question in → result out
  api/health/route.ts     # health check
/scripts
  seed.ts                 # loads /data into Supabase, computes embeddings once
/docs                     # all the docs listed below
```

## Where to read next

- `docs/PRD.md` — what we're building and the acceptance checklist
- `docs/ARCHITECTURE.md` — how the pieces fit + the rubric mapping
- `docs/DATA_MODEL.md` — Supabase schema + SQL
- `docs/AI_INTEGRATION.md` — the exact prompts + JSON schema + abstention gate spec
- `docs/TASKS.md` — the ordered 4-hour build plan
- `docs/DECISIONS.md` — why we chose what we chose (for the pitch Q&A)
