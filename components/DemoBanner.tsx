import { DEMO_DATA_BANNER } from "@/lib/contracts";

export function DemoBanner({ isDemo }: { isDemo: boolean }) {
  if (!isDemo) return null;
  return (
    <div
      className="demo-banner"
      role="status"
      aria-label={DEMO_DATA_BANNER}
      data-testid="demo-data-banner"
    >
      {DEMO_DATA_BANNER}
    </div>
  );
}
