"use client";

import { useEffect, useState } from "react";
import type { AppConfig } from "@/lib/types";

export default function ConfigPage() {
  const [config, setConfig] = useState<AppConfig | null>(null);
  const [text, setText] = useState("");
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/config")
      .then((r) => r.json())
      .then((j) => {
        setConfig(j.config);
        setText(JSON.stringify(j.config, null, 2));
      });
  }, []);

  async function save() {
    try {
      const parsed = JSON.parse(text) as AppConfig;
      const json = await fetch("/api/config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(parsed),
      }).then((r) => r.json());
      setConfig(json.config);
      setText(JSON.stringify(json.config, null, 2));
      setStatus("Saved. Alias, competitor, subtopic, and asset lists now drive the judge and metrics.");
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Invalid JSON");
    }
  }

  if (!config) return <p className="text-uncc-ink/60">Loading config…</p>;

  return (
    <div className="space-y-4">
      <p className="max-w-3xl text-sm leading-6 text-uncc-ink/80">
        Single config row. The judge injects these lists on every call. Credit starting balance, remaining credits, and
        per-run cap live here too. Changing remaining credits does not rewrite history; it only gates future uncached SerpAPI calls.
      </p>
      <textarea className="h-[70vh] w-full rounded border border-uncc-rule bg-white p-3 font-mono text-xs" value={text} onChange={(e) => setText(e.target.value)} />
      <button type="button" onClick={save} className="rounded bg-uncc-green px-4 py-2 text-sm text-white">
        Save config
      </button>
      {status ? <p className="text-sm">{status}</p> : null}
    </div>
  );
}
