# Local models prompt

When: only after Phase 3 is done and the gold set (`gold_labels`, 200 hand labeled draws) exists. Run in the GEO repo, fresh chat, plan mode.

---

Read `docs/SPEC.md`, `docs/ARCHITECTURE.md` (sections 0, 3.7, 10, 13, 14), `docs/PROVIDERS.md` section 4, and `lib/judge/`.

Goal: use local models where they are provably as good, and nowhere else.

## 1. Embeddings (Ollama)

- Add an embeddings provider interface with an Ollama implementation. Model name in env (`EMBEDDING_MODEL`), dimension recorded with every vector.
- Used for prompt dedupe (Phase 4), page matching (Phase 7), clustering.
- Store `embedding_model` and `embedding_dim` with each vector. Changing models triggers a re-embed job, never mixing models in one similarity search.
- Tests: deterministic output for the same input, dimension check, re-embed job.

## 2. Local judge candidate

- Add a judge provider option for an Ollama model, behind the existing judge contract (strict JSON, one repair call, raw output stored).
- Run it on the full gold set. Report precision and recall for mention detection (including "Charlotte" city traps), citation domain agreement, and claim verdict agreement, each with n.
- Gate: precision and recall ≥ 0.95 on mentions and ≥ 0.95 domain agreement. If it fails any bar, it stays disabled and Fireworks stays the judge. Write the results to `docs/EVALS.md`.
- A judge change bumps `judge_prompt_version` or `judge_model` and never overwrites earlier `judge_runs`.

## Do not

- Use a local model to produce any answer labeled ChatGPT, Gemini, Claude, Perplexity, AI Overview, or AI Mode.
- Let the writer model judge.
- Enable the local judge without a passing gate.
