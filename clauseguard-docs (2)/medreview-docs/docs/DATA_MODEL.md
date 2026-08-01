# Data Model — ClauseGuard (Supabase / Postgres + pgvector)

Embeddings use Gemini `text-embedding-004` → **768 dimensions**.

## Enable the vector extension (run first)

```sql
create extension if not exists vector;
```

## Tables

### contracts
The 8 provided contract excerpts.

```sql
create table contracts (
  id            text primary key,          -- 'C-001' … 'C-008'
  title         text not null,
  parties       text,
  full_text     text not null,             -- the raw excerpt
  dataset_note  text,                       -- the "Dataset Note:" line (tells us what's absent)
  created_at    timestamptz default now()
);
```

### clauses
One row per clause parsed out of each contract. `clause_type` is the join key to standards.

```sql
create table clauses (
  id            uuid primary key default gen_random_uuid(),
  contract_id   text references contracts(id),
  section       text,                       -- e.g. '7.1'
  clause_type   text not null,              -- one of the 7 categories (see enum values below)
  clause_text   text not null,
  embedding     vector(768)
);

create index clauses_contract_idx on clauses(contract_id);
create index clauses_type_idx     on clauses(clause_type);
create index clauses_embed_idx    on clauses using ivfflat (embedding vector_cosine_ops) with (lists = 10);
```

**`clause_type` allowed values (must match standards.category exactly):**
`Payment`, `Termination`, `Data Protection`, `Confidentiality`, `Automatic Renewal`, `Intellectual Property`, `Limitation of Liability`

### standards
The 7 approved company standards.

```sql
create table standards (
  id            text primary key,           -- 'STD-PAY-01' …
  category      text not null,              -- matches clauses.clause_type
  standard_text text not null,
  embedding     vector(768)
);
```

### reviews
Every result produced, with its human-review status. This is the audit trail (evidence + human-in-the-loop).

```sql
create table reviews (
  id                uuid primary key default gen_random_uuid(),
  contract_id       text references contracts(id),
  question          text not null,
  clause_type       text,
  risk_level        text not null,          -- Low/Medium/High Risk | Not Enough Information
  reason            text,
  evidence_clause_id uuid references clauses(id),
  standard_id       text references standards(id),
  status            text default 'pending_review', -- pending_review | approved | rejected | flagged
  feedback          text,
  created_at        timestamptz default now()
);
```

### query_cache
Avoids recomputing identical (contract, question) pairs — performance + cost.

```sql
create table query_cache (
  query_hash   text primary key,            -- sha256(contract_id + '|' + normalized_question)
  contract_id  text,
  question     text,
  result_json  jsonb not null,
  created_at   timestamptz default now()
);
```

## RLS note

For a hackathon demo with no user accounts, you can keep RLS **off** on these tables (data is fictional, no auth required per §10). If a judge asks: "for production we'd enable Row Level Security and scope contracts per organization — see DECISIONS.md." Don't spend build time on it.

## What gets seeded

`scripts/seed.ts` loads `/data`:
- 8 contracts → `contracts`
- ~35 parsed clauses → `clauses` (with embeddings)
- 7 standards → `standards` (with embeddings)
- The `Dataset Note` lines are kept because they confirm which clause types are intentionally absent (the abstention test cases).

Embeddings are computed **once** during seed, never at request time.

## Clause-type reference table (which contract has what — for testing)

| Contract | Payment | Termination | Data Prot. | Confidentiality | Auto Renewal | IP | Liability |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| C-001 | ✓ | ✓ | — | — | ✓ | ✓ | — |
| C-002 | ✓ | ✓ | — | ✓ | **—** | ✓ | — |
| C-003 | — | — | ✓ | — | — | — | — |
| C-004 | ✓ | ✓ | — | ✓ | **—** | — | — |
| C-005 | ✓ | ✓ | — | — | ✓ | ✓ | ✓ |
| C-006 | ✓ | ✓ | ✓ | — | — | — | ✓ |
| C-007 | ✓ | **—** | — | ✓ | — | ✓ | ✓ |
| C-008 | ✓ | ✓ | — | ✓ | ✓ | — | **—** |

Bold **—** = the three official missing-information cases (MI-01 C-004 renewal, MI-02 C-007 termination, MI-03 C-008 liability). These are the abstention tests — make sure they return `Not Enough Information`.
