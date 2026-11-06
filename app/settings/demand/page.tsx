"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { api, Message } from "@/components/site/client";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import type { DemandConnectionStatus } from "@/lib/demand/types";

export default function DemandConnectionsPage() {
  const [connections, setConnections] = useState<DemandConnectionStatus[] | null>(null);
  const [msg, setMsg] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    void api<{ connections: DemandConnectionStatus[] }>("/api/demand/connections")
      .then((body) => setConnections(body.connections))
      .catch((err) => setMsg({ tone: "error", text: err instanceof Error ? err.message : String(err) }));
  }, []);

  return (
    <div className="space-y-6">
      <div className="max-w-3xl space-y-1">
        <p className="text-sm">
          <Link href="/settings" className="text-uncc-green underline">
            Settings
          </Link>
        </p>
        <h2 className="font-serif text-2xl font-semibold text-uncc-ink">Demand connections</h2>
        <p className="text-sm leading-6 text-uncc-ink/75">
          Phase 4 demand adapters. Keys are read from <code>.env.local</code> and never shown here. Live paid calls are not
          enabled in this build; missing access shows <strong>not connected</strong>. Demand figures are never labeled as AI
          search volume.
        </p>
      </div>
      <Message msg={msg} />
      {!connections ? (
        <p className="text-sm text-uncc-ink/60">Loading connection status…</p>
      ) : (
        connections.map((c) => (
          <Card key={c.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {c.label}
                <Badge tone={c.connected ? "green" : "gold"}>{c.status === "not_connected" ? "not connected" : "connected"}</Badge>
              </CardTitle>
              <CardDescription>
                source <code>{c.source}</code> · provider <code>{c.provider}</code> · mode {c.mode}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-uncc-ink/80">
              <p>{c.note}</p>
              {!c.connected && c.missing.length > 0 ? (
                <p>
                  Missing: <code>{c.missing.join(", ")}</code>
                </p>
              ) : null}
            </CardContent>
          </Card>
        ))
      )}
    </div>
  );
}
