"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LoadingState } from "@/components/PageStates";

/**
 * Legacy `/demand` → campaign Demand under Content intelligence.
 * Picks the first active campaign when available.
 */
export default function LegacyDemandRedirect() {
  const router = useRouter();
  const [msg, setMsg] = useState("Opening Demand…");

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/campaigns", { cache: "no-store" });
        const json = await res.json();
        const list = (json.campaigns ?? []) as Array<{ id: string; status: string }>;
        const first = list.find((c) => c.status === "active") ?? list[0];
        if (cancelled) return;
        if (first) {
          router.replace(`/campaigns/${first.id}/demand`);
          return;
        }
        setMsg("No campaign yet — open Campaigns to create one.");
        router.replace("/campaigns");
      } catch {
        if (!cancelled) router.replace("/campaigns");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [router]);

  return <LoadingState label={msg} />;
}
