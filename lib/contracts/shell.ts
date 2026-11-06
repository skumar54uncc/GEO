import { z } from "zod";

const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export type OrganizationTheme = {
  primary: string;
  accent: string;
  sansFont: string;
  serifFont: string;
};

export const DEFAULT_ORG_THEME: OrganizationTheme = {
  primary: "#005035",
  accent: "#A49665",
  sansFont: 'Arial, "Arial Narrow", system-ui, sans-serif',
  serifFont: 'Cambria, Georgia, "Times New Roman", serif',
};

export const organizationThemeSchema = z
  .object({
    primary: z.string().regex(HEX_COLOR).optional(),
    accent: z.string().regex(HEX_COLOR).optional(),
    sansFont: z.string().trim().min(1).max(200).optional(),
    serifFont: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export function safeOrganizationTheme(value: unknown): OrganizationTheme {
  const parsed = organizationThemeSchema.safeParse(value);
  return { ...DEFAULT_ORG_THEME, ...(parsed.success ? parsed.data : {}) };
}
