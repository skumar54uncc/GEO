"use client";

import Image from "next/image";
import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const expired = params.get("expired") === "1";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, name }),
    });
    const json = await res.json();
    setBusy(false);
    if (!res.ok) {
      setError(json.error ?? "Sign in failed.");
      return;
    }
    const next = params.get("next");
    if (next && next.startsWith("/") && !next.startsWith("//")) {
      router.push(next);
      router.refresh();
      return;
    }
    const role = json.user?.role as "viewer" | "editor" | "admin" | undefined;
    let adminHome: "overview" | "visibility" | null = null;
    try {
      const pref = window.localStorage.getItem("scout_admin_home");
      if (pref === "overview" || pref === "visibility") adminHome = pref;
    } catch {
      /* ignore */
    }
    let campaignId: string | null = null;
    if (role === "editor" || (role === "admin" && adminHome === "visibility")) {
      try {
        const camps = await fetch("/api/campaigns", { cache: "no-store" });
        const campJson = await camps.json();
        campaignId = campJson.campaigns?.[0]?.id ?? null;
      } catch {
        campaignId = null;
      }
    }
    const { defaultLandingPath } = await import("@/lib/auth/landing");
    router.push(defaultLandingPath(role ?? "viewer", { adminHome, campaignId }));
    router.refresh();
  }

  return (
    <Card className="mx-auto mt-10 max-w-md">
      <CardHeader>
        <div className="mb-3 flex items-center gap-3">
          <Image src="/brand/logo.svg" alt="Scout" width={120} height={36} priority />
        </div>
        <CardTitle>Sign in · Scout</CardTitle>
        <CardDescription>
          Scouting what AI says about us. Local development login. There is no password, so this app only listens on
          loopback (127.0.0.1). If Chrome shows localhost, sign-in still works.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {expired ? (
          <p className="mb-4 border-l-4 border-scout-brand pl-3 text-sm text-scout-muted">
            Your local session expired. Sign in again to continue.
          </p>
        ) : null}
        <p className="mb-4 text-xs text-uncc-ink/70">
          Access is limited to organizations with an explicit membership for this email. Session and organization
          selector cookies are httpOnly and stay on this local app.
        </p>
        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="name">Name (optional)</Label>
            <Input id="name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {error ? (
            <p className="text-sm" style={{ color: "var(--status-decline-fg)" }} role="alert">
              {error}
            </p>
          ) : null}
          <Button type="submit" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
