"use client";

import { useEffect, useMemo, useState } from "react";

// --- types ---------------------------------------------------------------

type RiskLabel =
  | "Low Risk"
  | "Medium Risk"
  | "High Risk"
  | "Not Enough Information";

type ReviewResult = {
  contract_id: string;
  clause_type: string;
  risk_level: RiskLabel;
  reason: string;
  suggested_action?: string;
  detection_similarity?: number;
  clause_similarity?: number;
  note?: string;
  evidence: {
    contract_clause: { section: string | null; text: string } | null;
    company_standard: { id: string; text: string } | null;
    source: string | null;
  };
  requires_human_review: boolean;
  cached?: boolean;
};

type PresetQuestion = { id: string; contract_id: string; question: string };
type ContractMeta = { id: string; title: string };

// --- constants -----------------------------------------------------------

const CONTRACTS: ContractMeta[] = [
  { id: "C-001", title: "BrightDesk SaaS Subscription" },
  { id: "C-002", title: "NovaStaff Professional Services" },
  { id: "C-003", title: "CloudMinds Data Processing Addendum" },
  { id: "C-004", title: "EventPro Partnership Agreement" },
  { id: "C-005", title: "MarketLoop Marketing Services" },
  { id: "C-006", title: "SecureLink Vendor Agreement" },
  { id: "C-007", title: "Freelance Development Agreement" },
  { id: "C-008", title: "Regional Distribution Agreement" },
];

// --- helpers -------------------------------------------------------------

function badgeClass(risk: RiskLabel): string {
  switch (risk) {
    case "Low Risk":
      return "bg-emerald-50 text-emerald-700 border-emerald-200";
    case "Medium Risk":
      return "bg-amber-50 text-amber-800 border-amber-200";
    case "High Risk":
      return "bg-rose-50 text-rose-700 border-rose-200";
    default:
      return "bg-slate-50 text-slate-700 border-slate-200";
  }
}

// --- the page ------------------------------------------------------------

export default function Page() {
  const [contractId, setContractId] = useState<string>("C-001");
  const [presets, setPresets] = useState<PresetQuestion[]>([]);
  const [presetId, setPresetId] = useState<string>("");
  const [question, setQuestion] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionMsg, setActionMsg] = useState<string | null>(null);

  // load preset questions once
  useEffect(() => {
    fetch("/api/presets")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: PresetQuestion[]) => {
        setPresets(data);
        if (data.length > 0) {
          setPresetId(data[0].id);
          setQuestion(data[0].question);
        }
      })
      .catch(() => setPresets([]));
  }, []);

  const filteredPresets = useMemo(
    () => presets.filter((p) => p.contract_id === contractId),
    [presets, contractId],
  );

  // when contract changes, auto-pick the first matching preset
  useEffect(() => {
    const first = filteredPresets[0];
    if (first) {
      setPresetId(first.id);
      setQuestion(first.question);
    } else {
      setPresetId("");
      setQuestion("");
    }
  }, [contractId, filteredPresets]);

  function onPresetChange(id: string) {
    setPresetId(id);
    const p = presets.find((x) => x.id === id);
    if (p) setQuestion(p.question);
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setActionMsg(null);
    setResult(null);
    try {
      const r = await fetch("/api/review", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contract_id: contractId, question }),
      });
      if (!r.ok) {
        const txt = await r.text();
        throw new Error(txt || `HTTP ${r.status}`);
      }
      const data = (await r.json()) as ReviewResult;
      setResult(data);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function act(action: "approve" | "reject" | "flag" | "feedback", feedback?: string) {
    if (!result) return;
    setActionMsg(null);
    try {
      const r = await fetch("/api/review-action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contract_id: result.contract_id,
          question,
          action,
          feedback,
        }),
      });
      if (!r.ok) throw new Error(await r.text());
      const j = await r.json();
      setActionMsg(j?.review?.status ? `Saved: ${j.review.status}` : "Saved");
    } catch (e) {
      setActionMsg(`Failed: ${(e as Error).message}`);
    }
  }

  return (
    <div className="space-y-6">
      {/* disclaimer */}
      <div className="rounded-md border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        <strong>Assistant only.</strong> ClauseGuard is not legal advice. A human reviewer makes the final decision.
        Every result requires human review before being acted on.
      </div>

      {/* controls */}
      <form
        onSubmit={onSubmit}
        className="grid gap-4 rounded-lg border border-rule bg-white p-5 shadow-sm"
      >
        <div className="grid gap-2">
          <label htmlFor="contract" className="text-sm font-medium">Contract</label>
          <select
            id="contract"
            className="rounded-md border border-rule px-3 py-2 text-sm"
            value={contractId}
            onChange={(e) => setContractId(e.target.value)}
          >
            {CONTRACTS.map((c) => (
              <option key={c.id} value={c.id}>
                {c.id} — {c.title}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label htmlFor="preset" className="text-sm font-medium">Preset question</label>
          <select
            id="preset"
            className="rounded-md border border-rule px-3 py-2 text-sm"
            value={presetId}
            onChange={(e) => onPresetChange(e.target.value)}
            disabled={filteredPresets.length === 0}
          >
            {filteredPresets.length === 0 && (
              <option value="">— no presets for this contract —</option>
            )}
            {filteredPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.id} — {p.question}
              </option>
            ))}
          </select>
        </div>

        <div className="grid gap-2">
          <label htmlFor="q" className="text-sm font-medium">Or write your own question</label>
          <textarea
            id="q"
            rows={2}
            maxLength={500}
            className="rounded-md border border-rule px-3 py-2 text-sm"
            placeholder="e.g. What notice is required to stop automatic renewal?"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
          />
          {question.trim().length > 0 && question.trim().length < 5 && (
            <span className="text-xs text-muted">Enter a fuller question (at least 5 characters).</span>
          )}
        </div>

        <div className="flex items-center gap-3">
          <button
            type="submit"
            disabled={busy || !contractId || question.trim().length < 5}
            className="rounded-md bg-ink px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-90 disabled:opacity-40"
          >
            {busy ? "Reviewing…" : "Run review"}
          </button>
          {result?.cached && (
            <span className="text-xs text-muted">cached response</span>
          )}
        </div>

        {error && (
          <div className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800">
            {error}
          </div>
        )}
      </form>

      {/* result */}
      {result && <ResultCard result={result} question={question} onAction={act} actionMsg={actionMsg} />}
    </div>
  );
}

function ResultCard({
  result,
  question,
  onAction,
  actionMsg,
}: {
  result: ReviewResult;
  question: string;
  onAction: (a: "approve" | "reject" | "flag" | "feedback", feedback?: string) => void;
  actionMsg: string | null;
}) {
  const [feedback, setFeedback] = useState("");

  return (
    <section className="rounded-lg border border-rule bg-white p-5 shadow-sm space-y-4">
      <header className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Review result</h2>
        <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium ${badgeClass(result.risk_level)}`}>
          {result.risk_level}
        </span>
        <span className="text-xs text-muted">
          Clause type: <span className="font-mono">{result.clause_type}</span>
        </span>
        {typeof result.clause_similarity === "number" && (
          <span className="text-xs text-muted">
            similarity {(result.clause_similarity * 100).toFixed(0)}%
          </span>
        )}
      </header>

      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
        <strong>Human review required.</strong> This is an assistant output, not a decision.
      </div>

      <div>
        <h3 className="text-sm font-semibold text-muted">Reason</h3>
        <p className="mt-1 text-sm leading-relaxed">{result.reason}</p>
        {result.note && (
          <p className="mt-2 text-xs text-muted">{result.note}</p>
        )}
      </div>

      {result.suggested_action && result.suggested_action !== "No action needed." && (
        <div className="rounded-md border border-sky-200 bg-sky-50 px-3 py-2 text-sm text-sky-900">
          <h3 className="text-xs font-semibold uppercase tracking-wide">Suggested next step</h3>
          <p className="mt-1 leading-relaxed">{result.suggested_action}</p>
          <p className="mt-1 text-xs text-sky-800/80">
            A suggestion for the human reviewer to consider — not legal advice.
          </p>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="rounded-md border border-rule p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Contract clause
          </h3>
          {result.evidence.contract_clause ? (
            <>
              <p className="mt-1 text-xs text-muted">
                §{result.evidence.contract_clause.section ?? "?"} — {result.contract_id}
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                {result.evidence.contract_clause.text}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm italic text-muted">
              No matching clause found in this contract.
            </p>
          )}
        </div>
        <div className="rounded-md border border-rule p-4">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-muted">
            Company standard
          </h3>
          {result.evidence.company_standard ? (
            <>
              <p className="mt-1 text-xs text-muted">
                {result.evidence.company_standard.id} — {result.clause_type}
              </p>
              <p className="mt-2 text-sm leading-relaxed">
                {result.evidence.company_standard.text}
              </p>
            </>
          ) : (
            <p className="mt-2 text-sm italic text-muted">No standard loaded.</p>
          )}
        </div>
      </div>

      <p className="text-xs text-muted">
        Source: <span className="font-mono">{result.evidence.source ?? "—"}</span>
      </p>

      {/* human review actions */}
      <div className="border-t border-rule pt-4">
        <h3 className="text-sm font-semibold">Human review actions</h3>
        <p className="text-xs text-muted">
          Question: <span className="italic">"{question}"</span>
        </p>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <button
            onClick={() => onAction("approve")}
            className="rounded-md border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-sm font-medium text-emerald-800 hover:bg-emerald-100"
          >
            Approve
          </button>
          <button
            onClick={() => onAction("reject")}
            className="rounded-md border border-rose-300 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100"
          >
            Reject
          </button>
          <button
            onClick={() => onAction("flag")}
            className="rounded-md border border-amber-300 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-800 hover:bg-amber-100"
          >
            Mark for review
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <input
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder="Add feedback…"
            className="flex-1 rounded-md border border-rule px-3 py-1.5 text-sm"
          />
          <button
            onClick={() => { onAction("feedback", feedback); setFeedback(""); }}
            className="rounded-md border border-rule bg-white px-3 py-1.5 text-sm hover:bg-slate-50"
          >
            Save feedback
          </button>
        </div>
        {actionMsg && <p className="mt-2 text-xs text-muted">{actionMsg}</p>}
      </div>
    </section>
  );
}