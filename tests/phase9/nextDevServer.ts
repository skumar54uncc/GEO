import { spawn, type ChildProcess } from "child_process";
import net from "net";

async function tryPort(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(false));
    srv.once("listening", () => {
      srv.close(() => resolve(true));
    });
    srv.listen(port, "127.0.0.1");
  });
}

/** Picks a free TCP port on 127.0.0.1. */
export async function pickFreePort(start = 3150): Promise<number> {
  for (let p = start; p < start + 200; p++) {
    if (await tryPort(p)) return p;
  }
  throw new Error("No free port found for Next dev server");
}

export type NextDevServer = { baseUrl: string; port: number; process: ChildProcess };

function nextEnv(port: number) {
  const databaseUrl = process.env.TEST_DATABASE_URL || process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error("TEST_DATABASE_URL or DATABASE_URL required for e2e Next server");
  return {
    ...process.env,
    PORT: String(port),
    APP_BIND_HOST: "127.0.0.1",
    HOSTNAME: "127.0.0.1",
    DATABASE_URL: databaseUrl,
    NODE_ENV: process.env.NODE_ENV || "development",
  };
}

async function waitReady(baseUrl: string, proc: ChildProcess, label: string): Promise<void> {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(baseUrl, { redirect: "manual" });
      if (res.status < 500) return;
    } catch {
      /* not ready */
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  proc.kill("SIGTERM");
  throw new Error(`${label} did not become ready on ${baseUrl}`);
}

/** Spawns `next dev` bound to 127.0.0.1; tears down via `stop()`. */
export async function startNextDev(): Promise<NextDevServer> {
  const port = await pickFreePort();
  const proc = spawn("npx", ["next", "dev", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env: nextEnv(port),
    stdio: ["ignore", "pipe", "pipe"],
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitReady(baseUrl, proc, "Next dev");
  return { baseUrl, port, process: proc };
}

/**
 * Production-like server for load-time gates (`next build` must already have run).
 * Avoids cold compile inflation from `next dev`.
 */
export async function startNextStart(): Promise<NextDevServer> {
  const port = await pickFreePort();
  const env: NodeJS.ProcessEnv = {
    ...nextEnv(port),
    NODE_ENV: "production",
  };
  // Passwordless login requires APP_BIND_HOST=127.0.0.1 even under production NODE_ENV for local gates.
  const proc = spawn("npx", ["next", "start", "-H", "127.0.0.1", "-p", String(port)], {
    cwd: process.cwd(),
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });
  const baseUrl = `http://127.0.0.1:${port}`;
  await waitReady(baseUrl, proc, "Next start");
  return { baseUrl, port, process: proc };
}

export function stopNextDev(s: NextDevServer | null): Promise<void> {
  if (!s) return Promise.resolve();
  const p = s.process;
  return new Promise((resolve) => {
    p.once("exit", () => resolve());
    p.kill("SIGTERM");
    setTimeout(() => {
      try {
        p.kill("SIGKILL");
      } catch {
        /* ignore */
      }
      resolve();
    }, 5000);
  });
}
