"use client";

import { useCallback, useEffect, useState } from "react";
import { api, Message, SitePicker, useSites } from "@/components/site/client";
import { Button } from "@/components/ui/button";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";

type BotView = {
  by_bot: Array<{ bot: string; n: number; paths: number; first: string; last: string; operator: string | null; category: string | null; function: string | null }>;
  by_path: Array<{ bot: string; host: string | null; path: string; n: number; ok: number }>;
  imports: Array<{ id: string; file_name: string | null; file_sha256: string; format: string; lines_total: number; lines_unparsed: number; bot_lines: number; created_at: string }>;
};
type HostOpt = { host: string; included: boolean };

export default function BotsPage() {
  const { sites, siteId, setSiteId, error } = useSites();
  const [data, setData] = useState<BotView | null>(null);
  const [hosts, setHosts] = useState<HostOpt[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [format, setFormat] = useState("auto");
  const [defaultHost, setDefaultHost] = useState("");
  const [botFilter, setBotFilter] = useState("");
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  const load = useCallback(async () => {
    if (!siteId) return;
    const [v, s] = await Promise.all([api<BotView>(`/api/sites/${siteId}/bots`), api<{ hosts: HostOpt[] }>(`/api/sites/${siteId}`)]);
    setData(v);
    setHosts(s.hosts.filter((h) => h.included));
  }, [siteId]);

  useEffect(() => {
    void load().catch((err) => setMsg({ tone: "error", text: String(err) }));
  }, [load]);

  const upload = async () => {
    if (!file || !siteId) return;
    const form = new FormData();
    form.set("file", file);
    form.set("format", format);
    if (defaultHost) form.set("default_host", defaultHost);
    try {
      const res = await api<{ import: { already_imported: boolean; bot_lines: number; lines_total: number; lines_unparsed: number; format: string; note: string | null } }>(`/api/sites/${siteId}/bots`, { method: "POST", body: form });
      const i = res.import;
      setMsg({
        tone: "ok",
        text: i.already_imported
          ? "This file was imported before; nothing was added."
          : `${i.format}: ${i.lines_total} lines, ${i.bot_lines} AI bot hits stored, ${i.lines_unparsed} lines not understood.${i.note ? ` ${i.note}` : ""}`,
      });
      await load();
    } catch (err) {
      setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) });
    }
  };

  const paths = (data?.by_path ?? []).filter((p) => !botFilter || p.bot === botFilter);

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="max-w-3xl space-y-1">
          <h2 className="font-serif text-2xl font-semibold text-uncc-ink">AI bot hits</h2>
          <p className="text-sm leading-6 text-uncc-ink/75">
            Upload a server or CDN access log. The file is hashed and parsed on this Mac; only lines from known AI user agents are kept, and no
            visitor IP addresses or query strings are stored. A user agent is what the client claims to be; it is not verified.
          </p>
        </div>
        {sites ? <SitePicker sites={sites} siteId={siteId} onChange={setSiteId} /> : null}
      </div>
      {error ? <p className="text-sm text-red-700">{error}</p> : null}
      <Message msg={msg} />
      {siteId ? (
        <Card>
          <CardHeader>
            <CardTitle>Upload a log</CardTitle>
            <CardDescription>Apache or nginx combined format (common format has no user agent), or Cloudflare Logpush JSON, one record per line.</CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap items-end gap-4 text-sm">
            <div className="space-y-1">
              <Label htmlFor="log-file">Log file</Label>
              <input id="log-file" type="file" onChange={(e) => setFile(e.target.files?.[0] ?? null)} className="block text-sm" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="log-format">Format</Label>
              <select id="log-format" className="h-9 rounded border border-uncc-rule bg-white px-2" value={format} onChange={(e) => setFormat(e.target.value)}>
                <option value="auto">Detect</option>
                <option value="combined">Combined</option>
                <option value="common">Common</option>
                <option value="cloudflare_json">Cloudflare JSON</option>
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="log-host">Host, when the log has none</Label>
              <select id="log-host" className="h-9 rounded border border-uncc-rule bg-white px-2" value={defaultHost} onChange={(e) => setDefaultHost(e.target.value)}>
                <option value="">Unknown</option>
                {hosts.map((h) => (
                  <option key={h.host} value={h.host}>
                    {h.host}
                  </option>
                ))}
              </select>
            </div>
            <Button onClick={upload} disabled={!file}>
              Import
            </Button>
          </CardContent>
        </Card>
      ) : null}

      {data ? (
        <>
          <Card>
            <CardHeader>
              <CardTitle>By bot</CardTitle>
              <CardDescription>Counts are hits in the uploaded logs, which cover only the period and hosts those files cover.</CardDescription>
            </CardHeader>
            <CardContent className="overflow-auto">
              {data.by_bot.length ? (
                <table className="w-full text-left text-sm">
                  <thead className="text-xs uppercase tracking-wide text-uncc-ink/60">
                    <tr>
                      <th className="py-1">Bot</th>
                      <th>Operator</th>
                      <th>Purpose</th>
                      <th className="text-right">Hits</th>
                      <th className="text-right">Distinct paths</th>
                      <th>First seen</th>
                      <th>Last seen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.by_bot.map((b) => (
                      <tr key={b.bot} className="cursor-pointer border-t border-uncc-rule/60 hover:bg-uncc-paper" onClick={() => setBotFilter(botFilter === b.bot ? "" : b.bot)}>
                        <td className="py-1 font-medium">
                          {b.bot} {botFilter === b.bot ? <Badge tone="green">filtered</Badge> : null}
                        </td>
                        <td>{b.operator ?? "unknown"}</td>
                        <td>{b.category ? <Badge>{b.category.replace("_", " ")}</Badge> : <span className="text-xs text-uncc-ink/60">{b.function ?? "unknown"}</span>}</td>
                        <td className="text-right tabular-nums">{b.n}</td>
                        <td className="text-right tabular-nums">{b.paths}</td>
                        <td className="text-xs">{new Date(b.first).toLocaleString()}</td>
                        <td className="text-xs">{new Date(b.last).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              ) : (
                <p className="text-sm text-uncc-ink/60">No AI bot hits yet.</p>
              )}
            </CardContent>
          </Card>
          {paths.length ? (
            <Card>
              <CardHeader>
                <CardTitle>By path{botFilter ? ` · ${botFilter}` : ""}</CardTitle>
              </CardHeader>
              <CardContent className="max-h-[32rem] overflow-auto">
                <table className="w-full text-left text-sm">
                  <thead className="sticky top-0 bg-white text-xs uppercase tracking-wide text-uncc-ink/60">
                    <tr>
                      <th className="py-1">Bot</th>
                      <th>Host</th>
                      <th>Path</th>
                      <th className="text-right">Hits</th>
                      <th className="text-right">2xx</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paths.map((p, i) => (
                      <tr key={i} className="border-t border-uncc-rule/60">
                        <td className="py-1">{p.bot}</td>
                        <td className="font-mono text-xs">{p.host ?? "unknown"}</td>
                        <td className="break-all font-mono text-xs">{p.path}</td>
                        <td className="text-right tabular-nums">{p.n}</td>
                        <td className="text-right tabular-nums">{p.ok}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          ) : null}
          {data.imports.length ? (
            <Card>
              <CardHeader>
                <CardTitle>Imports</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-1 text-xs">
                  {data.imports.map((i) => (
                    <li key={i.id}>
                      {new Date(i.created_at).toLocaleString()} · {i.file_name ?? "file"} · {i.format} · {i.lines_total} lines · {i.bot_lines} bot hits ·{" "}
                      <span className="font-mono">{i.file_sha256.slice(0, 12)}…</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </>
      ) : null}
    </div>
  );
}
