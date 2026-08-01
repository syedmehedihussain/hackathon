# PRD — ClauseGuard

## Problem

Reviewing contracts is slow and risky clauses are easy to miss. An assistant that surfaces the relevant clause, compares it to the company's approved standard, and flags risk — with evidence and a human in the loop — saves reviewer time without ever making the final call.

## Who it's for

An internal contract reviewer at "Northstar Solutions Ltd." who has a set of approved company standards and needs to check incoming vendor/partner contracts against them.

## What it does (the required workflow)

1. Reviewer selects a contract (C-001 … C-008).
2. Reviewer picks a preset question or types one.
3. System determines which clause type the question is about.
4. System checks the contract actually contains that clause type — **abstains safely if not**.
5. System retrieves the matching company standard.
6. System compares clause vs. standard and assigns a risk level.
7. System explains the reason in plain language.
8. System shows evidence: contract clause text, standard text, and source ids.
9. Reviewer takes a human-review action: Approve / Reject / Mark for review / Add feedback.

## Supported clause types (all 7 — exceeds the "at least 3" requirement)

Payment, Termination, Data Protection, Confidentiality, Automatic Renewal, Intellectual Property, Limitation of Liability.

## Risk labels (exactly these)

`Low Risk` · `Medium Risk` · `High Risk` · `Not Enough Information`

## Acceptance checklist (maps to problem statement §8)

- [ ] Contract can be selected
- [ ] ≥3 clause types supported (we do all 7)
- [ ] Clause retrieval works
- [ ] Company-standard retrieval works
- [ ] Risk comparison produces a label + reason
- [ ] Evidence (clause + standard + source) shown on every result
- [ ] Human-review step present (Approve / Reject / Mark for review)
- [ ] The three missing-information cases (MI-01/02/03) all return `Not Enough Information`
- [ ] Live URL on Vercel, secrets in env vars
- [ ] "Assistant only / requires human review" disclaimer visible

## The 12 public questions must all produce a sensible result

PQ-01 … PQ-12 in `data/public_test_questions.json` are our demo script and smoke test. Every one should return a correct risk assessment with evidence. The three MI cases must abstain.

## Explicit non-goals (problem statement §10 — do NOT build)

No OCR, no fine-tuning, no auth system, no full CI/CD, no monitoring dashboards, no enterprise security, no "final legal advice." Building these loses time and, per the judging principle, loses points.

## Definition of done

All 12 public questions return correct risk + evidence; all 3 MI cases abstain; deployed live; disclaimer + human-review actions visible; a 2-minute demo runs clean on the deployed URL.
