"use client";

import { useSessionRole } from "@/components/SessionRoleContext";
import { useMetricShowRaw } from "@/components/metrics/ShowRawContext";

function canShowRawRole(role: ReturnType<typeof useSessionRole>): boolean {
  return role === "editor" || role === "admin";
}

export function ShowRawToggle() {
  const role = useSessionRole();
  if (!canShowRawRole(role)) return null;
  const { showRaw, setShowRaw } = useMetricShowRaw();
  return (
    <label
      className="inline-flex cursor-pointer items-center gap-2 text-[12.5px] text-scout-muted"
      data-testid="show-raw-values"
    >
      <input type="checkbox" className="rounded border-scout-border" checked={showRaw} onChange={(e) => setShowRaw(e.target.checked)} />
      Show raw
    </label>
  );
}
