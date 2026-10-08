"use client";

import { useState } from "react";
import type { ContentBrief } from "@/lib/content";

export default function RecommendPage() {
  const [briefs, setBriefs] = useState<ContentBrief[] | null>(null);
  const [campaign, setCampaign] = useState<{ one_sentence?: string; why_now?: string; name?: string; source_url?: string; source_label?: string } | null>(null);
  const [usedModel, setUsedModel] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run() {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/recommend", { method: "POST" });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error || "failed");
        return;
      }
      setBriefs(json.briefs || []);
      setCampaign(json.campaign || null);
      setUsedModel(Boolean(json.used_model));
      if (json.error) setError(json.error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6">
      <p className="max-w-3xl text-sm leading-6 text-uncc-ink/80">
        Writing briefs for people who will actually commission the page. Each card is one measured miss: the question AI
        is already answering, who is winning, whether this is a ranking or citation problem, the fact to put in sentence
        one, the names to say, and where else to publish the same paragraph. Numbers come from the locked fact bank, not
        from the model inventing them.
      </p>
      <button type="button" disabled={busy} onClick={run} className="rounded bg-uncc-green px-4 py-2 text-sm text-white disabled:opacity-50">
        {busy ? "Building briefs…" : "Build briefs from stored gaps"}
      </button>
      {campaign ? (
        <section className="rounded border border-uncc-green bg-white p-5">
          <p className="text-xs uppercase tracking-[0.16em] text-uncc-green">{campaign.name}</p>
          <p className="mt-2 text-sm leading-6">{campaign.one_sentence}</p>
          <p className="mt-2 text-sm leading-6 text-uncc-ink/80">{campaign.why_now}</p>
        </section>
      ) : null}
      {error ? <p className="text-sm text-red-800">{error}</p> : null}

      {briefs && briefs.length === 0 ? (
        <p className="text-sm text-uncc-ink/70">No losses stored yet. Fetch Google AIO, run Analyze, then come back.</p>
      ) : null}

      {briefs?.map((b) => (
        <article key={`${b.prompt_id}-${b.subtopic}-${b.diagnosis}`} className="rounded border border-uncc-rule bg-white p-6">
          <p className="text-xs uppercase tracking-[0.16em] text-uncc-green">
            {b.campaign_title ? `${b.campaign_title} · ` : ""}
            {b.audience} · {b.subtopic.replace(/_/g, " ")} · {b.diagnosis.replace(/_/g, " ")}
          </p>
          <h2 className="mt-2 font-serif text-2xl font-semibold leading-snug">{b.h1}</h2>
          <p className="mt-3 text-sm leading-6 text-uncc-ink/80">{b.diagnosis_plain}</p>

          <dl className="mt-5 grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-uncc-ink/50">Who is winning</dt>
              <dd className="mt-1">{b.who_is_winning.length ? b.who_is_winning.join(", ") : "No competitor names stored for this prompt yet."}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-uncc-ink/50">Search demand (0–100 index)</dt>
              <dd className="mt-1">
                {b.demand
                  ? `${b.demand.term}: US ${b.demand.us ?? "—"} · NC ${b.demand.nc ?? "—"} · SC ${b.demand.sc ?? "—"}${
                      b.demand.rising.length ? `. Rising: ${b.demand.rising.join(", ")}` : ""
                    }`
                  : "Fetch the Demand pack to attach Trends to this brief."}
              </dd>
            </div>
          </dl>

          <div className="mt-5 rounded bg-uncc-paper p-4">
            <p className="text-xs uppercase tracking-wide text-uncc-ink/50">Page to create</p>
            <p className="mt-1 text-sm">{b.page_to_create}</p>
            <p className="mt-3 text-xs uppercase tracking-wide text-uncc-ink/50">Lead with this fact</p>
            <p className="mt-1 text-sm leading-6">{b.lead_fact.text}</p>
            <p className="mt-1 text-xs">
              Source:{" "}
              <a className="text-uncc-green underline" href={b.lead_fact.source_url} target="_blank" rel="noreferrer">
                {b.lead_fact.source_label}
              </a>
            </p>
            <p className="mt-3 text-xs uppercase tracking-wide text-uncc-ink/50">Opening paragraph (handoff)</p>
            <p className="mt-1 text-sm leading-6">{b.lead_paragraph}</p>
          </div>

          <div className="mt-5 grid gap-4 md:grid-cols-2 text-sm">
            <div>
              <p className="text-xs uppercase tracking-wide text-uncc-ink/50">Say these names on the page</p>
              <p className="mt-1">{b.names_to_say.join(" · ")}</p>
              <p className="mt-4 text-xs uppercase tracking-wide text-uncc-ink/50">Also publish the same paragraph</p>
              <ul className="mt-1 list-disc pl-5">
                {b.also_publish.map((x) => (
                  <li key={x}>{x}</li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs uppercase tracking-wide text-uncc-ink/50">Outline</p>
              <ol className="mt-1 list-decimal pl-5">
                {b.outline.map((o) => (
                  <li key={o.heading} className="mb-2">
                    <span className="font-medium">{o.heading}</span>
                    <span className="block text-uncc-ink/60">{o.note}</span>
                  </li>
                ))}
              </ol>
            </div>
          </div>

          <p className="mt-5 text-sm leading-6">
            <span className="text-xs uppercase tracking-wide text-uncc-ink/50">Earned media · </span>
            {b.earned_media}
          </p>
          <p className="mt-2 text-xs text-uncc-ink/60">{b.schema_note}</p>
        </article>
      ))}
    </div>
  );
}
