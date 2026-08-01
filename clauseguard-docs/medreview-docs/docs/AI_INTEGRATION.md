# AI Integration — ClauseGuard

Two Gemini calls total in the system, and only one runs per uncached request.

- **Embeddings:** `text-embedding-004` (768-dim). Used at seed time for all clauses + standards, and once per request to embed the question. Free tier.
- **Comparison / risk judgment:** `gemini-flash-latest`. Used only *after* the abstention gate passes. Free tier.

Confirm the exact model strings/endpoints when you're online — Gemini names drift.

---

## Step A — clause-type detection (retrieval, not generation)

Embed the question and compare (cosine) against 7 short clause-type descriptions. Pick the top match. No LLM generation needed — this is pure vector similarity, which keeps it fast and non-hallucinatory.

Clause-type descriptions to embed once (store alongside standards or as constants):

- **Payment** — invoice payment deadlines, late fees, when money is due
- **Termination** — ending the agreement, notice periods, cure periods for breach
- **Data Protection** — personal data use, encryption, breach notification, subprocessors, deletion
- **Confidentiality** — protecting confidential information, how long the duty lasts
- **Automatic Renewal** — whether/how the agreement renews, notice to stop renewal
- **Intellectual Property** — who owns the work/deliverables, licences
- **Limitation of Liability** — caps on liability, what the cap does/doesn't cover

If the question's top clause-type similarity is below a confidence floor, treat as low-confidence → abstain.

---

## Step B — THE ABSTENTION GATE (deterministic, before any risk LLM call)

```
detectedType = clause type from Step A
candidateClauses = clauses WHERE contract_id = selected AND clause_type = detectedType
topSim = max cosine(question_embedding, candidate.embedding) over candidateClauses

IF candidateClauses is empty  OR  topSim < THRESHOLD:
    return {
      risk_level: "Not Enough Information",
      reason: "Not enough information to make a reliable assessment.",
      evidence: { note: "No <detectedType> clause found in <contract_id>.",
                  contract_id, clause_type: detectedType }
    }
    # ← LLM is NEVER called. No fabrication possible.
ELSE:
    proceed to Step C with the top-ranked clause
```

Start with `THRESHOLD ≈ 0.55` and tune against the 12 public questions + 3 MI cases. The MI cases (C-004 renewal, C-007 termination, C-008 liability) have **no clause row of that type at all**, so `candidateClauses` is empty and they abstain regardless of threshold — that's the safety guarantee.

---

## Step C — ranked clause retrieval

Among `candidateClauses`, rank by cosine similarity and take the top one as the evidence clause. Ranking signal is explainable: **semantic similarity to the question, restricted to the correct clause type.** (Type filter first, similarity second — this is the "clear, explainable reason for ranking order" the rubric asks for.)

---

## Step D — standard lookup

`standard = standards WHERE category = detectedType` (exactly one per category). Deterministic join, no LLM.

---

## Step E — comparison / risk judgment (the one generation call)

Send Gemini Flash the clause text and the standard text and ask for a strict-JSON verdict. **The model only judges risk between two texts it is given — it is never asked to recall or supply facts.**

### System / instruction prompt

```
You are a contract-review assistant helping a human reviewer. You are NOT a lawyer and you do NOT give legal advice. A human makes the final decision.

You will be given ONE contract clause and ONE company standard. Compare only these two texts. Do not use any outside knowledge. Do not invent terms that are not present.

Decide a risk level from exactly these four values:
- "Low Risk"    — the clause matches or is stricter/safer than the standard.
- "Medium Risk" — the clause differs from the standard in a way worth a reviewer's attention but is not severe.
- "High Risk"   — the clause clearly conflicts with or is materially worse than the standard.
- "Not Enough Information" — the clause does not actually address what the standard covers.

Give a short, plain-language reason (1–2 sentences) that a non-lawyer can understand, referring to the concrete difference (e.g. notice periods, timeframes, ownership).

Respond with ONLY this JSON, no markdown, no backticks:
{"risk_level": "<one of the four>", "reason": "<short reason>"}
```

### User message

```
CONTRACT CLAUSE (from <contract_id>, section <section>, type <clause_type>):
"""<clause_text>"""

COMPANY STANDARD (<standard_id>, category <category>):
"""<standard_text>"""
```

### Parsing (in `lib/compare.ts`)

- Strip any accidental ```json fences, `JSON.parse` inside `try/catch`.
- Validate `risk_level` ∈ the four allowed strings. If invalid or parse fails → return `Not Enough Information` (fail safe, never fabricate).

---

## Final assembled result (what the API returns)

```json
{
  "contract_id": "C-001",
  "clause_type": "Automatic Renewal",
  "risk_level": "High Risk",
  "reason": "The contract requires 60 days notice to stop renewal, which is more than the company standard's maximum of 30 days.",
  "evidence": {
    "contract_clause": { "section": "7.1", "text": "The Agreement automatically renews ..." },
    "company_standard": { "id": "STD-REN-01", "text": "An automatic renewal period must not be longer than 12 months ..." },
    "source": "C-001 §7.1 vs STD-REN-01"
  },
  "requires_human_review": true
}
```

Every result carries `evidence` and `requires_human_review: true`. A result missing either is a bug.

## Anti-hallucination summary (say this in the pitch)

1. The LLM never *retrieves* — retrieval is vector search over seeded data only.
2. The LLM is never called for clause types the contract doesn't contain (deterministic gate).
3. The LLM only *compares two provided texts* and returns a label — it can't add facts.
4. Any malformed model output fails safe to `Not Enough Information`.
5. Every shown fact traces to a source id.
