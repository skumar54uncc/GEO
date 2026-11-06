import { z } from "zod";

export const DEMO_ORG_NAME = "Demo University" as const;
export const DEMO_DATA_BANNER = "DEMO DATA, not real results" as const;

const exportBaseSchema = z.object({
  format: z.enum(["pdf", "csv"]),
  organizationId: z.uuid(),
  organizationName: z.string().trim().min(1),
  generatedAt: z.iso.datetime(),
});

const demoExportMetadataSchema = exportBaseSchema
  .extend({
    dataKind: z.literal("demo"),
    organizationName: z.literal(DEMO_ORG_NAME),
    banner: z.literal(DEMO_DATA_BANNER),
  })
  .strict();

const realExportMetadataSchema = exportBaseSchema
  .extend({
    dataKind: z.literal("real"),
    banner: z.null(),
  })
  .strict()
  .refine(({ organizationName }) => organizationName !== DEMO_ORG_NAME, {
    message: "Demo University exports must use demo metadata and banner",
    path: ["organizationName"],
  });

export const exportMetadataSchema = z.discriminatedUnion("dataKind", [
  demoExportMetadataSchema,
  realExportMetadataSchema,
]);

export type ExportMetadata = z.infer<typeof exportMetadataSchema>;
