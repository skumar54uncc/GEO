import type { Role } from "@/lib/auth/roles";

/** Leadership (viewer) must never see estimate / approve / edit / run controls. */
export function canMutate(role: Role | null | undefined): boolean {
  return role === "admin" || role === "editor";
}

export function canApproveSpend(role: Role | null | undefined): boolean {
  return role === "admin";
}
