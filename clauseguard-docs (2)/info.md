# CLAUDE.md — Project Instructions for AI Agent

## Context
4-hour hackathon. Team of 3: Mehdi (build/integrate, drives this agent), Joy
(test/debug), Rahin (docs/presentation). Problem statement is revealed at
hackathon start and pasted into this file's "Problem Statement" section below.

## Stack (fixed, do not suggest alternatives)
- Next.js (App Router) + TypeScript + Tailwind
- Supabase (Postgres + pgvector) for data + vector search
- Google Gemini: `text-embedding-004` for embeddings, `gemini-1.5-flash` for
  generation — chosen for free-tier cost, do not swap to a paid/heavier model
  without being asked
- Deployed on Vercel
- GitHub Actions for CI (lint + build)

## How to work with me (Mehdi)
- Make small, incremental changes. Never rewrite a whole file when a
  targeted edit will do — I need to know what changed and why.
- Always tell me what you're touching and what you're leaving untouched.
- When a decision is a judgment call (ranking weights, schema shape, scope
  cuts), give me 2-3 options with tradeoffs — don't just pick one silently.
- When a task is purely mechanical (write this function, generate this SQL,
  add this endpoint), just do it.
- If something might break existing working code, flag it before applying.
- Never invent scope beyond what I've asked for — smaller and working beats
  bigger and broken, every time today.

## Judging priorities — build in this order of weight, not build order
Point values below should directly drive where effort goes when time is short.

1. **Search Quality & Relevance (30 pts)** — top priority. Must use semantic
   search (embeddings) over plain keyword match. Ranking logic must be
   explainable in one sentence (e.g. "similarity + recency + popularity").
2. **Performance Engineering (25 pts)** — cache repeated queries, index DB
   columns used in lookups, keep response times reportable (aim sub-500ms).
3. **Deployment & Architecture (20 pts)** — must be actually deployed and
   live, CI passing, secrets in env vars never hardcoded, basic error
   handling so one failure doesn't crash the whole request.
4. **Financial & Cost Optimization (15 pts)** — free-tier models only,
   cache instead of re-calling AI APIs, be ready to state cost reasoning
   out loud in the demo.
5. **Observability & Resilience (10 pts)** — a `/api/health` endpoint,
   structured logs (query, latency, cache hit/miss), try/catch fallbacks
   instead of hard crashes.
6. **Innovation (5 pts)** — one clear creative twist, not several half-built
   ones. Low priority — don't spend build time here if 1-3 aren't solid yet.
7. **Presentation & Documentation (5 pts)** — mostly Rahin's track in
   parallel; agent should keep code readable and comment key decisions so
   docs can be written without re-reading everything.

## Never do these without explicit confirmation
- Don't run destructive DB operations (drop table, delete rows) — describe
  the SQL, let a human run it in Supabase SQL Editor.
- Don't commit or hardcode API keys/secrets — env vars only.
- Don't add new dependencies beyond the fixed stack without asking first —
  install time eats build time.
- Don't silently change the data schema once other teammates are building
  against it — flag it so Joy/Rahin know.

## Problem Statement
(Paste the real problem statement here the moment it's revealed. Everything
above still applies once it's filled in — this section is the only thing
that changes.)

## Current MVP Scope
(Fill in after the 20-minute team design sprint: one sentence describing
what you're building, plus an explicit list of what you're NOT building.)
