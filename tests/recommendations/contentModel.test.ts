import { afterEach, describe, expect, it } from "vitest";
import { contentModel, judgeModel, WriterModelConfigError } from "@/lib/fireworks";

const ORIGINAL = {
  JUDGE_MODEL: process.env.JUDGE_MODEL,
  CONTENT_MODEL: process.env.CONTENT_MODEL,
};

afterEach(() => {
  if (ORIGINAL.JUDGE_MODEL === undefined) delete process.env.JUDGE_MODEL;
  else process.env.JUDGE_MODEL = ORIGINAL.JUDGE_MODEL;
  if (ORIGINAL.CONTENT_MODEL === undefined) delete process.env.CONTENT_MODEL;
  else process.env.CONTENT_MODEL = ORIGINAL.CONTENT_MODEL;
});

describe("contentModel writer vs judge separation", () => {
  it("returns CONTENT_MODEL when it differs from JUDGE_MODEL", () => {
    process.env.JUDGE_MODEL = "accounts/fireworks/models/judge-only";
    process.env.CONTENT_MODEL = "accounts/fireworks/models/writer-only";
    expect(judgeModel()).toBe("accounts/fireworks/models/judge-only");
    expect(contentModel()).toBe("accounts/fireworks/models/writer-only");
    expect(contentModel()).not.toBe(judgeModel());
  });

  it("refuses when CONTENT_MODEL is missing (no silent JUDGE_MODEL fallback)", () => {
    process.env.JUDGE_MODEL = "accounts/fireworks/models/judge-only";
    delete process.env.CONTENT_MODEL;
    expect(() => contentModel()).toThrow(WriterModelConfigError);
    expect(() => contentModel()).toThrow(/CONTENT_MODEL is required/);
  });

  it("refuses when CONTENT_MODEL equals JUDGE_MODEL", () => {
    process.env.JUDGE_MODEL = "accounts/fireworks/models/same-model";
    process.env.CONTENT_MODEL = "accounts/fireworks/models/same-model";
    expect(() => contentModel()).toThrow(WriterModelConfigError);
    expect(() => contentModel()).toThrow(/must differ from JUDGE_MODEL/);
  });

  it("refuses when CONTENT_MODEL equals the default judge fallback", () => {
    delete process.env.JUDGE_MODEL;
    process.env.CONTENT_MODEL = "accounts/fireworks/models/deepseek-v4-pro";
    expect(judgeModel()).toBe("accounts/fireworks/models/deepseek-v4-pro");
    expect(() => contentModel()).toThrow(WriterModelConfigError);
  });
});
