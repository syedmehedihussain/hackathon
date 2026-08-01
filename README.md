# ClauseGuard

An AI-powered **contract review assistant** that helps a human reviewer. It reads a contract, finds the relevant clause for a question, compares it against the company's approved standard, and returns a **risk level + plain-language reason + evidence** — and safely abstains ("Not enough information to make a reliable assessment") when a clause isn't present. A human always makes the final decision.

> Built for the Intra-IUB AI Hackathon 2026 final round — team **Doomsday**.
> **Not legal advice. An assistant only. A human reviewer makes the final decision.**

## What it does

1. Select a contract (C-001 … C-008)
2. Ask a question (preset or free-text)
3. System detects the clause type, checks it actually exists, retrieves the clause + matching standard
4. Gemini Flash compares them → **Low / Medium / High Risk** or **Not Enough Information**
5. Every result shows evidence (clause text, standard text, source) and requires human review

## Stack

Next.js 14 (App Router) · TypeScript · Tailwind · Supabase (Postgres + pgvector) · Google Gemini (`text-embedding-004` + `gemini-flash-latest`) · Vercel. Runs entirely on free tiers.

## Run locally

```bash
npm install
cp .env.example .env.local   # fill in your keys
# in Supabase SQL editor: create extension vector;  + tables from docs/DATA_MODEL.md
npm run seed                 # loads /data into Supabase, computes embeddings once
npm run dev
```

## Key design idea

A **deterministic abstention gate**: the system checks whether a clause type is actually present in the selected contract *before* the LLM is ever asked to judge risk. The model only compares texts it is given — it can never invent a clause. See `docs/AI_INTEGRATION.md`.

## Docs

- `puku.md` — agent/build instructions & the rules
- `docs/PRD.md` · `docs/ARCHITECTURE.md` · `docs/DATA_MODEL.md` · `docs/AI_INTEGRATION.md` · `docs/TASKS.md` · `docs/DECISIONS.md`

## Data

`/data` holds the provided dataset (8 contracts, 7 company standards, 12 test questions, 3 missing-information cases). All fictional.
