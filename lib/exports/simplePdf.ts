/**
 * Minimal PDF writer (PDF 1.4) for leadership exports.
 * Supports multi-page text + a fixed watermark drawn on every page.
 */

export type PdfTextBlock = {
  title?: string;
  lines: string[];
};

const PAGE_W = 612; // US Letter
const PAGE_H = 792;
const MARGIN = 48;
const LINE_H = 14;
const TITLE_SIZE = 16;
const BODY_SIZE = 11;
const WATERMARK_SIZE = 48;

function pdfEscape(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function wrapLine(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    if (`${cur} ${w}`.length <= maxChars) cur = `${cur} ${w}`;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  lines.push(cur);
  return lines;
}

type PageOps = string[];

function watermarkOps(label: string): string {
  const t = pdfEscape(label);
  // Centered, rotated ~-30 degrees, low gray.
  return [
    "q",
    "0.85 g",
    "1 0 0 1 180 360 cm",
    "0.866 -0.5 0.5 0.866 0 0 cm",
    "BT",
    `/F1 ${WATERMARK_SIZE} Tf`,
    `0 0 Td (${t}) Tj`,
    "ET",
    "Q",
  ].join("\n");
}

function layoutPages(blocks: PdfTextBlock[], watermark: string | null): PageOps[] {
  const maxChars = 88;
  const pages: PageOps[] = [];
  let ops: string[] = [];
  let y = PAGE_H - MARGIN;

  const flush = () => {
    if (watermark) ops.unshift(watermarkOps(watermark));
    pages.push(ops);
    ops = [];
    y = PAGE_H - MARGIN;
  };

  const ensure = (need: number) => {
    if (y - need < MARGIN) flush();
  };

  for (const block of blocks) {
    if (block.title) {
      ensure(LINE_H * 2);
      ops.push("BT", `/F1 ${TITLE_SIZE} Tf`, `0 g`, `${MARGIN} ${y} Td (${pdfEscape(block.title)}) Tj`, "ET");
      y -= TITLE_SIZE + 8;
    }
    for (const raw of block.lines) {
      for (const line of wrapLine(raw, maxChars)) {
        ensure(LINE_H);
        ops.push("BT", `/F1 ${BODY_SIZE} Tf`, `0 g`, `${MARGIN} ${y} Td (${pdfEscape(line)}) Tj`, "ET");
        y -= LINE_H;
      }
    }
    y -= 8;
  }
  if (ops.length || pages.length === 0) flush();
  return pages;
}

function encodePdf(pages: PageOps[]): Uint8Array {
  const objects: string[] = [];
  const add = (body: string) => {
    objects.push(body);
    return objects.length; // 1-based object id
  };

  const fontId = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  const contentIds: number[] = [];
  for (const ops of pages) {
    const stream = ops.join("\n");
    contentIds.push(
      add(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`),
    );
  }

  const pageIds: number[] = [];
  for (const contentId of contentIds) {
    pageIds.push(
      add(
        `<< /Type /Page /Parent 0 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`,
      ),
    );
  }

  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const pagesId = add(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`);

  // Patch Parent refs (object bodies stored as strings — rebuild page objects with real parent).
  for (let i = 0; i < pageIds.length; i++) {
    const id = pageIds[i]!;
    const contentId = contentIds[i]!;
    objects[id - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${fontId} 0 R >> >> >>`;
  }

  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  let out = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (let i = 0; i < objects.length; i++) {
    offsets.push(Buffer.byteLength(out, "utf8"));
    out += `${i + 1} 0 obj\n${objects[i]}\nendobj\n`;
  }
  const xrefStart = Buffer.byteLength(out, "utf8");
  out += `xref\n0 ${objects.length + 1}\n`;
  out += "0000000000 65535 f \n";
  for (let i = 1; i <= objects.length; i++) {
    out += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  return new Uint8Array(Buffer.from(out, "utf8"));
}

/** Build a multi-page PDF. Watermark (e.g. DEMO DATA) is painted on every page. */
export function buildSimplePdf(opts: {
  blocks: PdfTextBlock[];
  watermark?: string | null;
}): Uint8Array {
  const pages = layoutPages(opts.blocks, opts.watermark ?? null);
  return encodePdf(pages);
}
