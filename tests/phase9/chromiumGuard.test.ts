import { afterEach, describe, expect, it, vi } from "vitest";

describe("M5: Chromium CI guard", () => {
  const prevCi = process.env.CI;

  afterEach(() => {
    if (prevCi === undefined) delete process.env.CI;
    else process.env.CI = prevCi;
    vi.resetModules();
  });

  it("when CI=true, a launch failure throws a hard error (does not soft-skip)", async () => {
    process.env.CI = "true";
    vi.doMock("playwright", () => ({
      chromium: {
        launch: vi.fn(async () => {
          throw new Error("Executable doesn't exist");
        }),
      },
    }));
    const { launchChromiumOrFailInCi } = await import("./chromiumGuard");
    await expect(launchChromiumOrFailInCi()).rejects.toThrow(/CI=true/);
    await expect(launchChromiumOrFailInCi()).rejects.toThrow(/must fail, not skip/);
  });

  it("when CI is unset, launch failures rethrow the original error", async () => {
    delete process.env.CI;
    vi.doMock("playwright", () => ({
      chromium: {
        launch: vi.fn(async () => {
          throw new Error("Executable doesn't exist");
        }),
      },
    }));
    const { launchChromiumOrFailInCi } = await import("./chromiumGuard");
    await expect(launchChromiumOrFailInCi()).rejects.toThrow(/Executable doesn't exist/);
  });
});
