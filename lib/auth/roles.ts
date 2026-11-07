/** Client-safe role ordering (avoid importing `lib/auth` server module in "use client" components). */

export type Role = "admin" | "editor" | "viewer";

const RANK: Record<Role, number> = { viewer: 0, editor: 1, admin: 2 };

export function roleAtLeast(role: Role, required: Role): boolean {
  return RANK[role] >= RANK[required];
}
