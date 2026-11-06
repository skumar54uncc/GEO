import { DEMO_DATA_BANNER } from "@/lib/contracts";

export function DemoBanner({ isDemo }: { isDemo: boolean }) {
  if (!isDemo) return null;
  return (
    <div className="demo-banner" role="status">
      {DEMO_DATA_BANNER}
    </div>
  );
}
