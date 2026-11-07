"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

export type ShowRawContextValue = {
  showRaw: boolean;
  setShowRaw: (v: boolean) => void;
};

const ShowRawContext = createContext<ShowRawContextValue | null>(null);

export function MetricShowRawProvider({ children }: { children: ReactNode }) {
  const [showRaw, setShowRawState] = useState(false);
  const setShowRaw = useCallback((v: boolean) => {
    setShowRawState(v);
  }, []);
  const value = useMemo(() => ({ showRaw, setShowRaw }), [showRaw, setShowRaw]);
  return <ShowRawContext.Provider value={value}>{children}</ShowRawContext.Provider>;
}

export function useMetricShowRaw(): ShowRawContextValue {
  const ctx = useContext(ShowRawContext);
  if (!ctx) {
    return { showRaw: false, setShowRaw: () => {} };
  }
  return ctx;
}
