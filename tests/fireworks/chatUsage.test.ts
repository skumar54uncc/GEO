import { afterEach, describe, expect, it, vi } from "vitest";
import { FIREWORKS_MAX_TOKENS, fireworksChat } from "@/lib/fireworks";

describe("fireworksChat usage and max_tokens", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.FIREWORKS_API_KEY;
  });

  it("returns usage.prompt_tokens and usage.completion_tokens from the response", async () => {
    process.env.FIREWORKS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"ok":true}' }, finish_reason: "stop" }],
            usage: { prompt_tokens: 321, completion_tokens: 44 },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const res = await fireworksChat({ model: "accounts/fireworks/models/test", system: "s", user: "u" });
    expect(res.ok).toBe(true);
    expect(res.promptTokens).toBe(321);
    expect(res.completionTokens).toBe(44);
    expect(res.hitTokenCeiling).toBe(false);
    const body = JSON.parse(String((vi.mocked(fetch).mock.calls[0][1] as RequestInit).body));
    expect(body.max_tokens).toBe(FIREWORKS_MAX_TOKENS);
  });

  it("treats finish_reason length as a ceiling error without retry", async () => {
    process.env.FIREWORKS_API_KEY = "test-key";
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        new Response(
          JSON.stringify({
            choices: [{ message: { content: '{"partial":' }, finish_reason: "length" }],
            usage: { prompt_tokens: 50, completion_tokens: FIREWORKS_MAX_TOKENS },
          }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        ),
      ),
    );
    const res = await fireworksChat({ model: "accounts/fireworks/models/test", system: "s", user: "u" });
    expect(res.ok).toBe(false);
    expect(res.hitTokenCeiling).toBe(true);
    expect(res.error).toMatch(/max_tokens ceiling/);
    expect(res.promptTokens).toBe(50);
    expect(res.completionTokens).toBe(FIREWORKS_MAX_TOKENS);
    expect(vi.mocked(fetch)).toHaveBeenCalledTimes(1);
  });
});
