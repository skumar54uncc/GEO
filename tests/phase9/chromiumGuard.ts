import { chromium, type Browser, type LaunchOptions } from "playwright";

/**
 * Launch Chromium for Playwright journeys.
 * When CI=true, launch failures must throw (fail the job), never soft-skip the suite.
 */
export async function launchChromiumOrFailInCi(opts: LaunchOptions = {}): Promise<Browser> {
  try {
    return await chromium.launch({ headless: true, ...opts });
  } catch (err) {
    const detail = err instanceof Error ? err.message : String(err);
    if (process.env.CI) {
      throw new Error(
        `Chromium must launch when CI=true (journeys must fail, not skip). Launch error: ${detail}`,
      );
    }
    throw err;
  }
}
