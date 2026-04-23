---
name: benchmark-skill
description: "Methodology for designing and executing deterministic, high-signal benchmarks for AI pipelines such as RAG, memory, and agent tasks. Use when creating evaluation harnesses, comparing before/after changes, measuring whether a change actually improved things, reconciling conflicting benchmark artifacts, or interpreting results that need proof: 'is this actually resolved', 'how do I prove this is fixed', 'did my fix actually work', 'what counts as confirmed vs smoke-tested', 'is this healthy or just live', 'does adding new domains break comparability', 'is prod actually using the benchmarked path', 'how confident should I be'. Also use for prompts like 'how should I measure this', 'create an eval', 'benchmark this', 'run the eval', 'accuracy dropped', 'latency is too high', 'compare these two approaches', 'set up a test harness', 'what does healthy mean here', or 'why are these results inconsistent'."
---

# Benchmark Methodology

Design and execute benchmarks that actually tell you something useful.

## Gotchas

- **Subprocess spawning adds 500-700ms** to every Python benchmark run. If your "latency" numbers include cold process startup, you're measuring infrastructure, not your algorithm. Use warm daemons or long-running processes for accurate timing.
- **Always separate internal time from total time.** Log both. If total is 950ms but internal is 250ms, the bottleneck is infrastructure — no amount of algorithm tuning will help.
- **LLM-as-a-judge introduces variance.** If the output is objectively verifiable (does the retrieved text contain the expected token?), use deterministic substring/regex matching. Reserve LLM judging for genuinely subjective outputs.
- **Change one variable at a time.** When you change the embedding model AND the threshold AND the reranker in one pass, you cannot attribute the result. This wastes runs.
- **Distractor-free benchmarks are meaningless.** Testing retrieval against only correct facts tells you nothing about precision. Inject noise at a 5:1 ratio minimum.
- **Generic benchmark datasets (MMLU, etc.) are useless for system-specific tuning.** Build a small (50-100 item) dataset from real production data — actual paths, config IDs, real queries users type.
- **Developers type lazy queries.** "where is bun installed" not "Could you please locate the executable file for bun?" Generate eval queries that match real usage.
- **Beware the corridor problem.** Sometimes two metrics (accuracy vs latency) are coupled so tightly that tuning one degrades the other. If you're stuck, the fix is usually architectural (eliminate a bottleneck) not parametric (fiddle thresholds).
- **Moving baselines are lethal.** If you replace your eval set midstream, you cannot compare before/after. Freeze an adjudicated sample before the first major iteration and version any later replacements explicitly.
- **Unversioned benchmark artifacts become fiction fast.** Save the eval-set version, candidate-set fingerprint, domain count, model, threshold mode, runtime path, and consumer contract alongside every result. If two result files do not record the same benchmark universe, treat them as different experiments.
- **Convenience outputs are disposable.** A file like `benchmark_results.json` is a convenience surface, not the historical record. Treat durable per-run artifacts as the source of truth and cite them in reports.
- **Production-path drift invalidates benchmark claims.** If the benchmark harness uses one threshold, domain index, retrieval path, or consumer contract while production uses another, you benchmarked a cousin, not the system. Verify parity before publishing conclusions.
- **Consumer-contract drift is benchmark drift.** `top-1 /route` and `top-k /route_multi` are different runtime contracts. Do not claim multi-domain support from a benchmark if the live consumers still call the single-domain endpoint.
- **Synthetic harnesses are not live-path proof.** A prompt-budget simulator or local assembly model can provide sizing evidence, but it does not validate the deployed consumer path unless it exercises the real integration logic.
- **Expanding systems change the denominator.** Adding new domains, tenants, or routing candidates is normal, but it changes the candidate universe. Do not present cross-run percentages as directly comparable unless the benchmark manifest proves the same universe, or you intentionally report a fixed frozen subset.
- **Labeled coverage and candidate coverage are different facts.** If the live candidate universe is 14 domains but the adjudicated positives still cover only the historical 11 domains, report both numbers explicitly. Do not imply full 14-domain labeled coverage.
- **Track decision-layer quality separately from extraction quality.** A pipeline can extract facts well and still route them badly. Measure routing precision independently from extraction recall.
- **Track in-scope routing separately from out-of-scope rejection.** A cosine router may rank in-scope domains well and still fail to reject generation/explanation queries. Measure intent gating as its own layer; do not bury it inside one blended accuracy number.
- **Acceptance gates need stop conditions.** Good thresholds are not enough. Set a time budget or max-iteration cap before you begin, and stop to document why if you hit it without clearing the gates.
- **Benchmark phases must stay homogeneous.** If later phases run under a different eval set, candidate universe, runtime path, consumer contract, threshold family, or deployment assumption, that is a new benchmark series, not the same leaderboard continued.
- **Keep a benchmark ledger, not just result files.** Every run should be reproducible from a manifest plus durable artifact path. Do not rely on remembered tables, overwritten convenience JSON, or markdown summaries as the historical record.
- **Local-model benchmarks must respect hardware limits.** On constrained local hardware, never run more than one model-heavy benchmark/server/parity Python process at a time. Concurrency can force swap, distort latency, and invalidate comparisons.
- **Do not benchmark two cold starts when one warm path is the question.** Parity scripts and runtime evaluators should be split into explicit sequential phases when they would otherwise load multiple copies of the same local model.
- **Model-size sweeps still need fixed assumptions.** When comparing `4B` vs `2B` vs `0.6B`, keep corpus text, threshold policy, candidate universe, and runtime path fixed, and record the model size in every artifact.
- **Support tooling can drift from the thing it explains.** Debug/explain helpers, parity scripts, and harnesses often lag the production logic. Review them explicitly; a stale helper can make a strong benchmark look more validated than it is.
- **Prose is not evidence.** A phase log, markdown summary, or table in a plan file may be useful context, but it is not a benchmark artifact. If a claim is not backed by a versioned structured result, treat it as provisional.
- **Decision-grade recommendations need paired benefit and cost metrics.** If you recommend a policy like multi-domain routing, the saved artifact must include both the upside metric (ambiguous recall, both-hit rate) and the downside metric (over-injection, prompt-budget pressure, FPR impact).

## Workflow

1. **Freeze the benchmark manifest** — record eval-set version, holdout version, candidate-set hash, domain count, model, threshold mode, runtime path, consumer contract, and whether the harness matches the production code path
2. **Define the evidence target up front** — decide which claims this run is meant to support: smoke-level, regression-level, or decision-grade
3. **Inspect the live path before drawing architecture conclusions** — trace benchmark harness, daemon/server, and real consumers so you know whether you are measuring router core, deployed runtime, or live consumer behavior
4. **Establish baseline** — run the deterministic harness, capture accuracy (H@1/H@k as needed), FPR, and p50/p95 latency
5. **Plan the iteration** — identify one variable to change
6. **Execute** — change exactly that one variable
7. **Save versioned artifacts immediately** — write results to a run-specific file or series-specific directory before any later phase can overwrite them
8. **Verify** — rerun the benchmark and compare only against runs with the same manifest; if the universe changed, label the result as a new series
9. **Validate support tooling fidelity** — check that explain/debug helpers, parity scripts, and budget harnesses still match the code path being benchmarked
10. **Check host capacity before local runs** — if the benchmark uses local models, confirm no overlapping heavy benchmark processes are running and serialize server/parity/offline runs
11. **Lock or rollback** — if accuracy improves without breaching latency SLA, lock it. If latency spikes, isolate the bottleneck before continuing
12. **Publish by evidence tier** — separate router-core, deployed-runtime, and live-consumer-path evidence rather than collapsing them into one claim

## Claim tiers

Use these tiers deliberately:

- **Smoke-level** — a fast sanity check. Good for "still runs" or "consistent with healthy." Not enough for architecture decisions.
- **Regression-level** — reruns a known benchmark path against a frozen manifest. Good for before/after validation when the universe is unchanged.
- **Decision-grade** — sufficient to support a production recommendation. Requires versioned structured artifacts, synchronized writeups, explicit production-parity status, explicit consumer-contract status, and complete upside/downside metrics for the proposed change.

If a benchmark summary includes a production recommendation, default to requiring decision-grade evidence.

## Evidence calibration

Claims must match the evidence that backs them. Use this vocabulary:

| Evidence | Correct language | Incorrect language |
|---|---|---|
| Smoke test passed (fast path, happy case) | "smoke-tested", "consistent with healthy" | "confirmed", "proven", "resolved" |
| Source code inspection | "code path suggests", "contract looks correct" | "contract confirmed", "runtime validated" |
| Throughput / queue movement | "pipeline is live", "liveness confirmed" | "semantically correct", "all invariants clean" |
| Error count stable | "no new errors observed" | "error-free", "fully resolved" |
| Original failure condition re-triggered and absent | "regression confirmed resolved" | — |
| Frozen baseline eval set | "benchmarked against frozen iteration-0 eval set" | "comparable improvement" without noting the benchmark source |
| Eval set replaced midstream | "results not comparable — eval set was replaced" | "accuracy improved" across different eval sets |
| Candidate set / domain universe changed | "results not directly comparable — candidate universe changed from N to M" | "same benchmark, better accuracy" |
| Benchmark path differs from production path | "benchmark reflects harness path; production parity not yet verified" | "production-ready" |
| Prose summary without matching artifact | "session notes claim X; durable artifact not found" | "benchmark confirmed X" |
| Synthetic budget harness only | "budget simulation suggests X" | "consumer path validated" |
| Live consumer still on top-1 `/route` | "multi-domain not yet live" | "multi-domain production-supported" |

A common misuse pattern in multi-path systems: a user-facing path (e.g., manual search) passes while a different code path (e.g., automated recall with a session-scoped filter) still fails. Because both paths share surface behavior, the passing smoke test looks like full coverage. It isn't. The paths are structurally different — one may pass while the other hits a missing index, wrong auth scope, or different adapter.

**Rule**: to call something "resolved", reproduce the original failure condition — not a related test that shares surface behavior — and observe no error.

## Benchmark manifest

Every saved result should carry enough metadata to explain itself later. At minimum record:

- eval-set version or frozen date
- holdout-set version or frozen date
- candidate-set fingerprint or hash
- number of candidates / domains
- labeled-domain coverage count if different from the candidate count
- retrieval path under test
- production path status: identical, similar-but-not-identical, or unknown
- consumer contract: endpoint, top-k policy, budget policy
- model name and version
- threshold mode: fixed value, formula, or none
- distractor definition version
- claim tier: smoke-level, regression-level, or decision-grade
- artifact role: baseline, ablation, holdout, policy-analysis, parity-check, prompt-budget, runtime-validation, etc.

If you cannot answer those questions from the result artifact, the artifact is incomplete.

Example result manifest:

```json
{
  "benchmark_series": "memory-router-current-world",
  "run_id": "2026-03-26_option-i-t0.3",
  "eval_set": {
    "version": "v3-dev",
    "frozen_date": "2026-03-25"
  },
  "holdout_set": {
    "version": "v2.0-holdout",
    "frozen_date": "2026-03-25"
  },
  "candidate_set": {
    "count": 14,
    "labeled_coverage_count": 11,
    "fingerprint": "sha256:replace-me",
    "source": "data/enriched_domain_index.json"
  },
  "retrieval_path": "bge-large semantic router",
  "production_parity": "similar-but-not-identical",
  "consumer_contract": {
    "endpoint": "/route",
    "top_k": 1,
    "budget_policy": "index-only fallback"
  },
  "claim_tier": "decision-grade",
  "artifact_role": "ablation",
  "model": {
    "name": "BAAI/bge-large-en-v1.5"
  },
  "threshold": {
    "mode": "formula",
    "value": 0.0894,
    "formula": "max(0.060, 1/N + 0.018)"
  },
  "distractors": {
    "version": "adversarial-v1"
  },
  "metrics": {
    "h1": 0.941,
    "fpr": 1.0,
    "p50_ms": 24.5,
    "p95_ms": 30.2
  }
}
```

The exact field names can vary. The important part is that a future reader can tell what was benchmarked, against which universe, under which runtime assumptions, and under which consumer contract without reverse-engineering the repo history.

## Benchmarking expanding systems

For systems like memory routing, policy engines, or agent tool selectors, expansion is expected. The right response is not "stop changing the system"; it is "preserve comparability deliberately."

Use one of these patterns:

1. **Frozen series** — keep a fixed adjudicated subset for before/after comparison across iterations
2. **Current-world series** — rerun against the latest candidate universe and label it as the current operational benchmark
3. **Bridged series** — report both numbers side by side when the system expanded and you need continuity plus realism

Do not silently overwrite an old result file after adding new domains or candidates and then cite the new number as if nothing changed.

## Benchmark series discipline

Treat a benchmark as a series only while all of the following stay fixed or intentionally bridged:

- eval set family
- holdout family
- candidate universe
- runtime path
- consumer contract
- threshold family

If any one changes, either:

- start a new series, or
- publish a bridged result set that shows old and new numbers separately

Never blend those runs into a single uninterrupted leaderboard.

## Production parity check

Before treating a benchmark as deployment evidence, verify:

- the same retrieval path is exercised in benchmark and production
- the same candidate corpus or index is loaded
- the same threshold logic is used
- the same model variant is used
- the same consumer endpoint and top-k contract are used
- the same warm/cold execution mode is represented in latency claims
- any helper used to explain or debug benchmark results still reflects the active decision logic
- any parity script uses the strongest available interface (for example raw `/embed`, not an older route proxy) once that interface exists

If parity is partial, say so plainly. "Benchmarked router core; production hook integration not yet validated" is a strong statement. "Production-ready" is not.

## Local hardware discipline

When benchmarking with local models or local servers:

- run one heavy Python/model process at a time
- prefer a single warm server reused sequentially over repeated cold starts
- split parity into staged runs if one script would load both local and server copies of a large model
- if swap occurs, treat latency data from that run as invalid

## Retrospective benchmark audit

Use this mode when a benchmark story already exists and you need to decide whether it is still trustworthy.

Audit in this order:

1. **Reconstruct intended methodology** — read the plan/spec first, then list the exact claims it was trying to prove
2. **Compare implementation to plan** — inspect the actual harness, retrievers, gates, parity scripts, budget harnesses, runtime server code, and live consumer hooks/extensions
3. **Compare artifacts to implementation** — verify that saved JSON outputs actually correspond to the active code path and benchmark universe
4. **Compare writeups to artifacts** — if markdown/report prose and structured artifacts disagree, mark the prose stale
5. **Re-run only what is needed** — rerun key baseline, ablation, holdout, parity, and runtime paths to answer the unresolved claims
6. **Classify support explicitly** — separate strongly supported, partially supported, and unsupported or overstated conclusions

During retrospective audits, assume drift until proven otherwise. Plans, phase logs, and remembered result tables are useful context, but they do not outrank code plus current structured artifacts.

## Decision-grade benchmark rules

Before publishing a production recommendation, require all of the following:

- versioned structured artifacts for the claimed result
- benchmark universe recorded in the artifact
- explicit production-parity status
- explicit consumer-contract status
- support tooling fidelity checked against the active code
- upside and downside metrics saved together for policy choices
- prose report synchronized to the current structured artifact

If any one of those is missing, downgrade the recommendation from decision-grade to partial support.

## Support artifact fidelity

Benchmark-side support tools often outlive the benchmark assumptions that created them. Review them explicitly:

- **Debug/explain helpers** — do they implement the same decision logic as the live gate or router?
- **Parity scripts** — do they use the current strongest parity surface, or an older proxy method?
- **Prompt-budget harnesses** — do they exercise the real consumer path, or only a synthetic approximation?
- **Published reports** — do markdown summaries still match the latest structured artifact?

If any of those drift, downgrade the claim. The benchmark may still be directionally useful, but it is no longer audit-grade.

## Building the eval harness

### Golden dataset
Use real data from the actual system. Real paths, real config values, real user queries. 50-100 high-quality positive items is the target.

### Synthetic queries
Generate 3-5 query variants per positive fact to test semantic robustness. Make them realistic and terse — the way a developer would actually type.

### Distractors
Inject plausible-but-wrong facts (similar paths, slightly wrong answers) to test precision. Aim for 5:1 noise-to-signal ratio.

### Deterministic judging
Check if retrieved text contains the exact expected token. Substring match or regex. Fast, cheap, repeatable, and eliminates grading variance.

### Ambiguous cases
When more than one answer is genuinely acceptable, encode that explicitly. Dual-label or top-k acceptance is fine, but document it and keep the strict score available so the benchmark does not hide ambiguity behind one flattering metric.

### Result publication
When you publish a benchmark summary, keep the narrative, saved JSON, and runtime configuration synchronized. If the writeup says 99.4% and the checked-in result artifact says 57.1%, the benchmark is no longer serving its job. The artifact wins unless you regenerate or replace it.

Never let a final report depend on a number that only exists in prose. If the recommendation matters, persist the metric in a versioned structured artifact first.

## Additional resources

For a real-world example of this methodology applied to a memory pipeline (achieving 100% accuracy at 682ms p50, beating a commercial API), see [references/mem0-case-study.md](references/mem0-case-study.md).

For a formal rubric tailored to mem0 validation, including what to test in a 15-minute pass versus an overnight audit, what evidence actually proves each claim, and which anti-patterns to avoid, see [references/mem0-rubric.md](references/mem0-rubric.md).
