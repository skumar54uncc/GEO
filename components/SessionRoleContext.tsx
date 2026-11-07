"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Role } from "@/lib/auth/roles";

const SessionRoleContext = createContext<Role | null>(null);

export function SessionRoleProvider({ role, children }: { role: Role | null; children: ReactNode }) {
  return <SessionRoleContext.Provider value={role}>{children}</SessionRoleContext.Provider>;
}

export function useSessionRole(): Role | null {
  return useContext(SessionRoleContext);
}
