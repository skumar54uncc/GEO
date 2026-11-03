import { countWords } from "./extract";

export type RenderVerdict = {
  mode: "static" | "js";
  rawWords: number;
  renderedWords: number;
  /** Share of the rendered page's distinct words that already appear in the raw HTML text. */
  overlap: number;
};

/** Below this many rendered words a page is too short to call JS dependent. */
export const MIN_RENDERED_WORDS = 50;
/** A page is JS rendered when the raw HTML holds less than half of what the browser shows. */
export const JS_THRESHOLD = 0.5;

function vocabulary(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []) as string[]);
}

export function detectRenderMode(rawText: string, renderedText: string): RenderVerdict {
  const rawWords = countWords(rawText);
  const renderedWords = countWords(renderedText);
  const rendered = vocabulary(renderedText);
  const raw = vocabulary(rawText);
  let shared = 0;
  rendered.forEach((w) => {
    if (raw.has(w)) shared++;
  });
  const overlap = rendered.size ? shared / rendered.size : 1;
  const js =
    renderedWords >= MIN_RENDERED_WORDS && (rawWords < renderedWords * JS_THRESHOLD || overlap < JS_THRESHOLD);
  return { mode: js ? "js" : "static", rawWords, renderedWords, overlap: Math.round(overlap * 1000) / 1000 };
}
