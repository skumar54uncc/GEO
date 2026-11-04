/**
 * Replace high-entropy tokens in capture fixtures with obvious placeholders so scanners
 * (GitGuardian, etc.) do not treat documented sample responses as leaked secrets.
 * Structure and fields the parsers need are kept; only opaque token strings are swapped.
 */
import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "tests/fixtures/capture");

/** Long base64url / hex blobs that look like secrets but are page tokens, tracking ids, etc. */
const TOKENISH =
  /\b(?:eyJ[A-Za-z0-9_-]{20,}={0,2}|[A-Za-z0-9_-]{48,}={0,2}|[a-f0-9]{40,}|ANd9Gc[A-Za-z0-9_-]{20,}|Eqgf[A-Za-z0-9+/=]{20,})\b/g;

const KEYS_TO_BLANK = new Set([
  "page_token",
  "next_page_token",
  "serpapi_ai_overview_link",
  "serpapi_link",
  "serpapi_pagination",
  "id_to_token_map",
  "data_cid",
  "encrypted_docid",
  "im_token",
]);

function redactValue(key: string | null, value: unknown): unknown {
  if (typeof value === "string") {
    if (key && KEYS_TO_BLANK.has(key)) {
      if (value.startsWith("http")) return "https://example.test/redacted";
      return "REDACTED_FIXTURE_TOKEN";
    }
    if (value.includes("serpapi.com/searches/")) {
      return value.replace(/serpapi\.com\/searches\/[^/]+\/[a-f0-9]+/g, "serpapi.com/searches/REDACTED/REDACTED");
    }
    if (TOKENISH.test(value)) {
      TOKENISH.lastIndex = 0;
      return value.replace(TOKENISH, "REDACTED_FIXTURE_TOKEN");
    }
    return value;
  }
  if (Array.isArray(value)) return value.map((v) => redactValue(null, v));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) out[k] = redactValue(k, v);
    return out;
  }
  return value;
}

function main() {
  for (const name of fs.readdirSync(DIR).filter((f) => f.endsWith(".json"))) {
    const file = path.join(DIR, name);
    const raw = JSON.parse(fs.readFileSync(file, "utf8"));
    const next = redactValue(null, raw);
    fs.writeFileSync(file, `${JSON.stringify(next, null, 2)}\n`);
    console.log("redacted", name);
  }
}

main();
