/**
 * Leadership PDF writer (PDF 1.4) with embedded Inter (TrueType / Identity-H).
 * Supports text, Charlotte Green bars with CI whiskers, demo watermark + banner, footer.
 */

import { interRegular, interSemiBold, stringWidthPdfUnits, type LoadedTtf } from "@/lib/exports/ttfFont";

export type PdfTextBlock = {
  title?: string;
  lines: string[];
  /** Optional horizontal bar: rate 0-1 with optional CI whisker. */
  bar?: { rate: number | null; ciLow: number | null; ciHigh: number | null };
  /** Keep title + lines + byline on one page (analyst note). */
  keepTogether?: boolean;
};

export type PdfBuildOpts = {
  blocks: PdfTextBlock[];
  watermark?: string | null;
  /** Top banner (demo only). */
  banner?: string | null;
  brand?: string;
  /** Draw Scout binoculars mark from public/brand geometry next to the brand word. */
  brandLogo?: boolean;
  footerDate?: string;
  /** Charlotte Green headings/bars; Niner Gold decoration only. */
  headingRgb?: [number, number, number];
  accentRgb?: [number, number, number];
};

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN = 48;
const LINE_H = 14;
const TITLE_SIZE = 15;
const BODY_SIZE = 10;
const BANNER_SIZE = 9;
const FOOTER_SIZE = 8;
const CHARLOTTE_GREEN: [number, number, number] = [0 / 255, 80 / 255, 53 / 255];
const NINER_GOLD: [number, number, number] = [164 / 255, 150 / 255, 101 / 255];

function pdfEscapeLiteral(s: string): string {
  return s.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

/** UTF-16BE hex string for Identity-H Tj (CIDs = Unicode code units, no BOM). */
function utf16Hex(text: string): string {
  const body = Buffer.from(text, "utf16le");
  const be = Buffer.alloc(body.length);
  for (let i = 0; i < body.length; i += 2) {
    be[i] = body[i + 1]!;
    be[i + 1] = body[i]!;
  }
  return `<${be.toString("hex")}>`;
}

function wrapLine(font: LoadedTtf, text: string, fontSize: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  if (!words.length) return [""];
  const lines: string[] = [];
  let cur = words[0]!;
  for (let i = 1; i < words.length; i++) {
    const w = words[i]!;
    const trial = `${cur} ${w}`;
    if (stringWidthPdfUnits(font, trial, fontSize) <= maxWidth) cur = trial;
    else {
      lines.push(cur);
      cur = w;
    }
  }
  lines.push(cur);
  return lines;
}

type PageOps = string[];

function rgbOp(rgb: [number, number, number]): string {
  return `${rgb[0].toFixed(3)} ${rgb[1].toFixed(3)} ${rgb[2].toFixed(3)} rg`;
}

function textOp(fontRef: string, size: number, x: number, y: number, text: string, fill: string): string {
  return ["BT", fill, `/${fontRef} ${size} Tf`, `${x.toFixed(1)} ${y.toFixed(1)} Td`, `${utf16Hex(text)} Tj`, "ET"].join("\n");
}

/** Watermark scaled so the full string fits inside the page at ~-30°. */
function watermarkOps(label: string, font: LoadedTtf): string {
  const angle = (-30 * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  // Max size so rotated width/height stay inside margins.
  const maxW = PAGE_W - 2 * MARGIN;
  const maxH = PAGE_H - 2 * MARGIN;
  let size = 36;
  while (size > 10) {
    const w = stringWidthPdfUnits(font, label, size);
    const rotW = Math.abs(w * cos) + Math.abs(size * sin);
    const rotH = Math.abs(w * sin) + Math.abs(size * cos);
    if (rotW <= maxW && rotH <= maxH) break;
    size -= 1;
  }
  const cx = PAGE_W / 2;
  const cy = PAGE_H / 2;
  return [
    "q",
    "0.82 g",
    `${cos.toFixed(4)} ${sin.toFixed(4)} ${(-sin).toFixed(4)} ${cos.toFixed(4)} ${cx.toFixed(1)} ${cy.toFixed(1)} cm`,
    "BT",
    `/F1 ${size} Tf`,
    `${(-stringWidthPdfUnits(font, label, size) / 2).toFixed(1)} ${(-size / 3).toFixed(1)} Td`,
    `${utf16Hex(label)} Tj`,
    "ET",
    "Q",
  ].join("\n");
}

/** Scout binoculars mark (geometry from public/brand/mark.svg), origin at lower-left of 64×64 box. */
function scoutLogoOps(x: number, y: number, size: number, green: [number, number, number], gold: [number, number, number]): string {
  const s = size / 64;
  const tx = (px: number, py: number) => `${(x + px * s).toFixed(2)} ${(y + py * s).toFixed(2)}`;
  const circle = (cx: number, cy: number, r: number) => {
    const k = 0.5522847498 * r;
    const c0 = tx(cx + r, cy);
    return [
      `${tx(cx + r, cy)} m`,
      `${tx(cx + r, cy + k)} ${tx(cx + k, cy + r)} ${tx(cx, cy + r)} c`,
      `${tx(cx - k, cy + r)} ${tx(cx - r, cy + k)} ${tx(cx - r, cy)} c`,
      `${tx(cx - r, cy - k)} ${tx(cx - k, cy - r)} ${tx(cx, cy - r)} c`,
      `${tx(cx + k, cy - r)} ${tx(cx + r, cy - k)} ${c0} c`,
    ].join(" ");
  };
  const rect = (px: number, py: number, w: number, h: number) =>
    `${(x + px * s).toFixed(2)} ${(y + py * s).toFixed(2)} ${(w * s).toFixed(2)} ${(h * s).toFixed(2)} re`;
  return [
    "q",
    rgbOp(green),
    `${rect(11, 38, 14, 14)} f`,
    `${rect(39, 38, 14, 14)} f`,
    `${rect(24, 30, 16, 10)} f`,
    `${circle(18, 25, 14)} f`,
    `${circle(46, 25, 14)} f`,
    "1 1 1 rg",
    `${circle(18, 25, 8.5)} f`,
    `${circle(46, 25, 8.5)} f`,
    rgbOp(gold),
    `${circle(18, 25, 5)} f`,
    `${circle(46, 25, 5)} f`,
    "1 1 1 rg",
    `${circle(20.2, 27.4, 1.7)} f`,
    `${circle(48.2, 27.4, 1.7)} f`,
    "Q",
  ].join("\n");
}

function barOps(
  x: number,
  y: number,
  width: number,
  rate: number | null,
  ciLow: number | null,
  ciHigh: number | null,
  green: [number, number, number],
  gold: [number, number, number],
): string {
  const h = 8;
  const ops: string[] = [];
  // Track
  ops.push("q", "0.92 g", `${x} ${y} ${width} ${h} re f`, "Q");
  // Gold track edge (decoration only)
  ops.push("q", rgbOp(gold), `${x} ${y} ${width} 0.6 re f`, "Q");
  if (rate != null && rate >= 0) {
    const rw = Math.max(0, Math.min(1, rate)) * width;
    ops.push("q", rgbOp(green), `${x} ${y} ${rw.toFixed(1)} ${h} re f`, "Q");
  }
  if (ciLow != null && ciHigh != null) {
    const x0 = x + Math.max(0, Math.min(1, ciLow)) * width;
    const x1 = x + Math.max(0, Math.min(1, ciHigh)) * width;
    const mid = y + h / 2;
    ops.push(
      "q",
      "0.2 g",
      "1 w",
      `${x0.toFixed(1)} ${mid.toFixed(1)} m ${x1.toFixed(1)} ${mid.toFixed(1)} l S`,
      `${x0.toFixed(1)} ${(mid - 3).toFixed(1)} m ${x0.toFixed(1)} ${(mid + 3).toFixed(1)} l S`,
      `${x1.toFixed(1)} ${(mid - 3).toFixed(1)} m ${x1.toFixed(1)} ${(mid + 3).toFixed(1)} l S`,
      "Q",
    );
  }
  return ops.join("\n");
}

function layoutPages(opts: PdfBuildOpts, regular: LoadedTtf, bold: LoadedTtf): PageOps[] {
  const headingRgb = opts.headingRgb ?? CHARLOTTE_GREEN;
  const accentRgb = opts.accentRgb ?? NINER_GOLD;
  const maxTextW = PAGE_W - 2 * MARGIN;
  const pages: PageOps[] = [];
  let ops: string[] = [];
  let y = PAGE_H - MARGIN;
  let pageIndex = 0;

  const startPage = () => {
    ops = [];
    y = PAGE_H - MARGIN;
    if (opts.watermark) ops.push(watermarkOps(opts.watermark, regular));
    if (opts.banner) {
      const bannerLines = wrapLine(regular, opts.banner, BANNER_SIZE, maxTextW);
      const bannerH = bannerLines.length * 12 + 14;
      // Banner band stays above the brand title with a clear gap (no overlap).
      ops.push("q", "0.96 0.94 0.88 rg", `${MARGIN - 8} ${y - bannerH} ${maxTextW + 16} ${bannerH} re f`, "Q");
      let by = y - 10;
      for (const line of bannerLines) {
        ops.push(textOp("F2", BANNER_SIZE, MARGIN, by, line, "0 g"));
        by -= 12;
      }
      y = y - bannerH - 16;
    }
    if (opts.brand) {
      const logoSize = 22;
      if (opts.brandLogo !== false) {
        ops.push(scoutLogoOps(MARGIN, y - 4, logoSize, headingRgb, accentRgb));
        ops.push(textOp("F2", 18, MARGIN + logoSize + 8, y, opts.brand, rgbOp(headingRgb)));
      } else {
        ops.push(textOp("F2", 18, MARGIN, y, opts.brand, rgbOp(headingRgb)));
      }
      y -= 26;
      // Gold underline decoration (not text)
      ops.push("q", rgbOp(accentRgb), `${MARGIN} ${y + 10} 80 2 re f`, "Q");
      y -= 10;
    }
  };

  const footer = (pageOps: string[], pageNum: number, total: number) => {
    const date = opts.footerDate ?? new Date().toISOString().slice(0, 10);
    const left = `Scout · ${date}`;
    const right = `Page ${pageNum} of ${total}`;
    pageOps.push(textOp("F1", FOOTER_SIZE, MARGIN, 28, left, "0.35 g"));
    const rw = stringWidthPdfUnits(regular, right, FOOTER_SIZE);
    pageOps.push(textOp("F1", FOOTER_SIZE, PAGE_W - MARGIN - rw, 28, right, "0.35 g"));
  };

  const flush = () => {
    pages.push(ops);
    pageIndex++;
    startPage();
  };

  const ensure = (need: number) => {
    if (y - need < MARGIN + 36) flush();
  };

  startPage();

  for (const block of opts.blocks) {
    const wrapped = block.lines.flatMap((raw) => wrapLine(regular, raw, BODY_SIZE, maxTextW));
    const blockNeed =
      (block.title ? TITLE_SIZE + 6 : 0) + wrapped.length * LINE_H + (block.bar ? 20 : 0) + 6;
    if (block.keepTogether) ensure(blockNeed);
    if (block.title) {
      ensure(LINE_H * 3);
      ops.push(textOp("F2", TITLE_SIZE, MARGIN, y, block.title, rgbOp(headingRgb)));
      y -= TITLE_SIZE + 6;
    }
    for (const line of wrapped) {
      if (!block.keepTogether) ensure(LINE_H);
      ops.push(textOp("F1", BODY_SIZE, MARGIN, y, line, "0 g"));
      y -= LINE_H;
    }
    if (block.bar) {
      if (!block.keepTogether) ensure(20);
      ops.push(barOps(MARGIN, y - 4, maxTextW * 0.7, block.bar.rate, block.bar.ciLow, block.bar.ciHigh, headingRgb, accentRgb));
      y -= 18;
    }
    y -= 6;
  }

  if (ops.length || pages.length === 0) {
    pages.push(ops);
  }

  // Add footers with known page count
  const total = pages.length;
  for (let i = 0; i < pages.length; i++) {
    footer(pages[i]!, i + 1, total);
  }
  return pages;
}

type FontPack = {
  type0Id: number;
  fontFileId: number;
  fontBytes: Buffer;
  cidMapId: number;
  cidToGid: Buffer;
};

function registerFont(add: (body: string) => number, font: LoadedTtf): FontPack {
  const fontFileId = add("FONTFILE_PLACEHOLDER");
  const descriptorId = add(
    `<< /Type /FontDescriptor /FontName /${font.postScriptName} /Flags 32 /FontBBox [${font.bbox.join(" ")}] /ItalicAngle ${font.italicAngle} /Ascent ${font.ascent} /Descent ${font.descent} /CapHeight ${Math.abs(font.ascent)} /StemV 80 /FontFile2 ${fontFileId} 0 R >>`,
  );
  const cidToGid = Buffer.alloc(65536 * 2);
  for (const [cp, gid] of font.cmap) {
    if (cp > 0xffff) continue;
    cidToGid.writeUInt16BE(gid & 0xffff, cp * 2);
  }
  const cidMapId = add("CIDMAP_PLACEHOLDER");
  const dw = Math.round(((font.advances.get(0) ?? font.unitsPerEm) * 1000) / font.unitsPerEm);
  const wParts: string[] = [];
  for (let cp = 32; cp < 256; cp++) {
    const gid = font.cmap.get(cp);
    if (gid == null) continue;
    wParts.push(`${cp} [${Math.round(((font.advances.get(gid) ?? 0) * 1000) / font.unitsPerEm)}]`);
  }
  for (const cp of [0x2022, 0x2013, 0x2014, 0x00a0]) {
    const gid = font.cmap.get(cp);
    if (gid == null) continue;
    wParts.push(`${cp} [${Math.round(((font.advances.get(gid) ?? 0) * 1000) / font.unitsPerEm)}]`);
  }
  const cidFontId = add(
    `<< /Type /Font /Subtype /CIDFontType2 /BaseFont /${font.postScriptName} /CIDSystemInfo << /Registry (Adobe) /Ordering (Identity) /Supplement 0 >> /FontDescriptor ${descriptorId} 0 R /DW ${dw} /W [ ${wParts.join(" ")} ] /CIDToGIDMap ${cidMapId} 0 R >>`,
  );
  const bf: string[] = [];
  for (let cp = 32; cp < 256; cp++) {
    if (!font.cmap.has(cp)) continue;
    bf.push(`<${cp.toString(16).padStart(4, "0")}> <${cp.toString(16).padStart(4, "0")}>`);
  }
  for (const cp of [0x2022, 0x2013, 0x2014]) {
    if (!font.cmap.has(cp)) continue;
    bf.push(`<${cp.toString(16).padStart(4, "0")}> <${cp.toString(16).padStart(4, "0")}>`);
  }
  const cmapStream = `/CIDInit /ProcSet findresource begin
12 dict begin
begincmap
/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def
/CMapName /Adobe-Identity-UCS def
/CMapType 2 def
1 begincodespacerange
<0000> <FFFF>
endcodespacerange
${bf.length} beginbfchar
${bf.join("\n")}
endbfchar
endcmap
CMapName currentdict /CMap defineresource pop
end
end`;
  const toUnicodeId = add(`<< /Length ${Buffer.byteLength(cmapStream, "utf8")} >>\nstream\n${cmapStream}\nendstream`);
  const type0Id = add(
    `<< /Type /Font /Subtype /Type0 /BaseFont /${font.postScriptName} /Encoding /Identity-H /DescendantFonts [${cidFontId} 0 R] /ToUnicode ${toUnicodeId} 0 R >>`,
  );
  return { type0Id, fontFileId, fontBytes: font.bytes, cidMapId, cidToGid };
}

function encodePdf(pages: PageOps[], regular: LoadedTtf, bold: LoadedTtf): Uint8Array {
  const objects: Array<string | Buffer> = [];
  const add = (body: string | Buffer) => {
    objects.push(body);
    return objects.length;
  };

  const reg = registerFont(add, regular);
  const bol = registerFont(add, bold);

  // Fill placeholders with real streams
  objects[reg.fontFileId - 1] = Buffer.concat([
    Buffer.from(`<< /Length ${reg.fontBytes.length} /Length1 ${reg.fontBytes.length} >>\nstream\n`),
    reg.fontBytes,
    Buffer.from("\nendstream"),
  ]);
  objects[reg.cidMapId - 1] = Buffer.concat([
    Buffer.from(`<< /Length ${reg.cidToGid.length} >>\nstream\n`),
    reg.cidToGid,
    Buffer.from("\nendstream"),
  ]);
  objects[bol.fontFileId - 1] = Buffer.concat([
    Buffer.from(`<< /Length ${bol.fontBytes.length} /Length1 ${bol.fontBytes.length} >>\nstream\n`),
    bol.fontBytes,
    Buffer.from("\nendstream"),
  ]);
  objects[bol.cidMapId - 1] = Buffer.concat([
    Buffer.from(`<< /Length ${bol.cidToGid.length} >>\nstream\n`),
    bol.cidToGid,
    Buffer.from("\nendstream"),
  ]);

  const contentIds: number[] = [];
  for (const ops of pages) {
    const stream = Buffer.from(ops.join("\n"), "utf8");
    contentIds.push(
      add(Buffer.concat([Buffer.from(`<< /Length ${stream.length} >>\nstream\n`), stream, Buffer.from("\nendstream")])),
    );
  }

  const pageIds: number[] = [];
  for (const contentId of contentIds) {
    pageIds.push(add("PAGE_PLACEHOLDER"));
  }
  const kids = pageIds.map((id) => `${id} 0 R`).join(" ");
  const pagesId = add(`<< /Type /Pages /Kids [ ${kids} ] /Count ${pageIds.length} >>`);
  for (let i = 0; i < pageIds.length; i++) {
    const id = pageIds[i]!;
    const contentId = contentIds[i]!;
    objects[id - 1] =
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${contentId} 0 R /Resources << /Font << /F1 ${reg.type0Id} 0 R /F2 ${bol.type0Id} 0 R >> >> >>`;
  }
  const catalogId = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);

  const chunks: Buffer[] = [Buffer.from("%PDF-1.4\n")];
  const offsets: number[] = [0];
  let offset = chunks[0]!.length;
  for (let i = 0; i < objects.length; i++) {
    offsets.push(offset);
    const body = objects[i]!;
    const header = Buffer.from(`${i + 1} 0 obj\n`);
    const footer = Buffer.from("\nendobj\n");
    const bodyBuf = typeof body === "string" ? Buffer.from(body, "utf8") : body;
    chunks.push(header, bodyBuf, footer);
    offset += header.length + bodyBuf.length + footer.length;
  }
  const xrefStart = offset;
  let xref = `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i++) {
    xref += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  xref += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`;
  chunks.push(Buffer.from(xref, "utf8"));
  return new Uint8Array(Buffer.concat(chunks));
}

/** Build a multi-page PDF with embedded Inter. */
export function buildSimplePdf(opts: PdfBuildOpts): Uint8Array {
  const regular = interRegular();
  const bold = interSemiBold();
  const pages = layoutPages(opts, regular, bold);
  return encodePdf(pages, regular, bold);
}

/** Exported for tests: decode Identity-H `<hex> Tj` strings only (ignore font binary). */
export function extractPdfStrings(bytes: Uint8Array): string {
  const raw = Buffer.from(bytes).toString("latin1");
  const parts: string[] = [];
  const re = /<([0-9a-fA-F]+)>\s*Tj/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(raw))) {
    const hex = m[1]!;
    if (hex.length < 4 || hex.length % 2) continue;
    try {
      const buf = Buffer.from(hex, "hex");
      if (buf.length % 2 !== 0) continue;
      const copy = Buffer.from(buf);
      for (let i = 0; i < copy.length; i += 2) {
        const a = copy[i]!;
        copy[i] = copy[i + 1]!;
        copy[i + 1] = a;
      }
      parts.push(copy.toString("utf16le"));
    } catch {
      /* ignore */
    }
  }
  return parts.join("\n");
}

export { pdfEscapeLiteral, CHARLOTTE_GREEN, NINER_GOLD };
