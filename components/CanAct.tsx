"use client";

import type { ReactNode } from "react";
import type { Role } from "@/lib/auth/roles";
import { canMutate } from "@/lib/ui/rbac";

export { canMutate, canApproveSpend } from "@/lib/ui/rbac";

export function OperatorOnly({
  role,
  children,
  fallback = null,
}: {
  role: Role | null | undefined;
  children: ReactNode;
  fallback?: ReactNode;
}) {
  if (!canMutate(role)) return <>{fallback}</>;
  return <>{children}</>;
}
