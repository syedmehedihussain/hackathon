-- ClauseGuard schema — run this in the Supabase SQL editor before npm run seed

create extension if not exists vector;

-- contracts
create table if not exists contracts (
  id            text primary key,
  title         text not null,
  parties       text,
  full_text     text not null,
  dataset_note  text,
  created_at    timestamptz default now()
);

-- clauses (parsed from contracts)
create table if not exists clauses (
  id            uuid primary key default gen_random_uuid(),
  contract_id   text references contracts(id) on delete cascade,
  section       text,
  clause_type   text not null,
  clause_text   text not null,
  embedding     vector(768)
);

create index if not exists clauses_contract_idx on clauses(contract_id);
create index if not exists clauses_type_idx     on clauses(clause_type);
create index if not exists clauses_embed_idx    on clauses using ivfflat (embedding vector_cosine_ops) with (lists = 10);

-- standards
create table if not exists standards (
  id            text primary key,
  category      text not null,
  standard_text text not null,
  embedding     vector(768)
);

-- reviews (audit trail + human-in-the-loop)
create table if not exists reviews (
  id                uuid primary key default gen_random_uuid(),
  contract_id       text references contracts(id) on delete set null,
  question          text not null,
  clause_type       text,
  risk_level        text not null,
  reason            text,
  evidence_clause_id uuid references clauses(id) on delete set null,
  standard_id       text references standards(id) on delete set null,
  status            text default 'pending_review',
  feedback          text,
  created_at        timestamptz default now()
);

-- query cache
create table if not exists query_cache (
  query_hash   text primary key,
  contract_id  text,
  question     text,
  result_json  jsonb not null,
  created_at   timestamptz default now()
);