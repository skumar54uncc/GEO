import { z } from "zod";

const httpUrlSchema = z.url().refine(
  (value) => {
    const protocol = new URL(value).protocol;
    return protocol === "http:" || protocol === "https:";
  },
  { message: "must be an HTTP(S) URL" },
);

export const citedFetchPolicySchema = z
  .object({
    projectName: z.string().trim().min(1),
    contactUrl: httpUrlSchema,
    userAgent: z.string().trim().min(1),
    respectRobotsTxt: z.literal(true),
    blockPrivateAddressesAfterDns: z.literal(true),
    followRedirectsWithSsrfChecks: z.literal(true),
    maxRedirects: z.number().int().min(0).max(5),
    maxBodyBytes: z.number().int().positive(),
    perHostDelayMs: z.number().int().positive(),
  })
  .strict()
  .superRefine(({ projectName, contactUrl, userAgent }, context) => {
    if (!userAgent.includes(projectName) || !userAgent.includes(contactUrl)) {
      context.addIssue({
        code: "custom",
        path: ["userAgent"],
        message: "User-Agent must identify the project and include its contact URL",
      });
    }
  });

/**
 * Third-party page exports carry only analysis features and the local raw-store
 * reference. The strict object deliberately has no HTML or full-text field.
 */
export const citedPageExportSchema = z
  .object({
    canonicalUrl: httpUrlSchema,
    fetchedAt: z.iso.datetime(),
    statusCode: z.number().int().min(100).max(599),
    title: z.string().nullable(),
    h1: z.string().nullable(),
    h2s: z.array(z.string()),
    publishedAt: z.iso.datetime().nullable(),
    updatedAt: z.iso.datetime().nullable(),
    wordCount: z.number().int().nonnegative(),
    schemaTypes: z.array(z.string()),
    contentType: z.enum([
      "ranking_list",
      "program_page",
      "news",
      "forum",
      "wikipedia",
      "government_data",
      "other",
    ]),
    textRef: z.string().trim().min(1),
  })
  .strict();

export type CitedFetchPolicy = z.infer<typeof citedFetchPolicySchema>;
export type CitedPageExport = z.infer<typeof citedPageExportSchema>;
