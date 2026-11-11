/**
 * Minimal TrueType loader for embedding Inter in leadership PDFs (Identity-H / CIDFontType2).
 * No new dependencies — parses cmap (format 4/12) and hmtx only.
 */

import fs from "fs";
import path from "path";

export type LoadedTtf = {
  bytes: Buffer;
  unitsPerEm: number;
  ascent: number;
  descent: number;
  italicAngle: number;
  bbox: [number, number, number, number];
  postScriptName: string;
  /** Unicode code point → glyph id */
  cmap: Map<number, number>;
  /** glyph id → advance width in font units */
  advances: Map<number, number>;
  numGlyphs: number;
};

function readU16(buf: Buffer, off: number): number {
  return buf.readUInt16BE(off);
}
function readI16(buf: Buffer, off: number): number {
  return buf.readInt16BE(off);
}
function readU32(buf: Buffer, off: number): number {
  return buf.readUInt32BE(off);
}

function tableDir(buf: Buffer): Map<string, { offset: number; length: number }> {
  const numTables = readU16(buf, 4);
  const out = new Map<string, { offset: number; length: number }>();
  for (let i = 0; i < numTables; i++) {
    const o = 12 + i * 16;
    const tag = buf.subarray(o, o + 4).toString("ascii");
    out.set(tag, { offset: readU32(buf, o + 8), length: readU32(buf, o + 12) });
  }
  return out;
}

function parseCmap(buf: Buffer, offset: number, length: number): Map<number, number> {
  const cmap = buf.subarray(offset, offset + length);
  const numTables = readU16(cmap, 2);
  let best: Buffer | null = null;
  let bestScore = -1;
  for (let i = 0; i < numTables; i++) {
    const platformID = readU16(cmap, 4 + i * 8);
    const encodingID = readU16(cmap, 4 + i * 8 + 2);
    const subOffset = readU32(cmap, 4 + i * 8 + 4);
    const format = readU16(cmap, subOffset);
    let score = 0;
    if (platformID === 3 && encodingID === 10 && format === 12) score = 40;
    else if (platformID === 3 && encodingID === 1 && format === 4) score = 30;
    else if (platformID === 0 && format === 12) score = 25;
    else if (platformID === 0 && format === 4) score = 20;
    if (score > bestScore) {
      bestScore = score;
      best = cmap.subarray(subOffset);
    }
  }
  const map = new Map<number, number>();
  if (!best) return map;
  const format = readU16(best, 0);
  if (format === 4) {
    const segCount = readU16(best, 6) / 2;
    const endCountOff = 14;
    const startCountOff = endCountOff + 2 * segCount + 2;
    const idDeltaOff = startCountOff + 2 * segCount;
    const idRangeOffsetOff = idDeltaOff + 2 * segCount;
    for (let i = 0; i < segCount; i++) {
      const end = readU16(best, endCountOff + 2 * i);
      const start = readU16(best, startCountOff + 2 * i);
      const idDelta = readI16(best, idDeltaOff + 2 * i);
      const idRangeOffset = readU16(best, idRangeOffsetOff + 2 * i);
      for (let c = start; c <= end; c++) {
        let gid: number;
        if (idRangeOffset === 0) gid = (c + idDelta) & 0xffff;
        else {
          const glyphIndexOffset = idRangeOffsetOff + 2 * i + idRangeOffset + 2 * (c - start);
          const glyphId = readU16(best, glyphIndexOffset);
          gid = glyphId === 0 ? 0 : (glyphId + idDelta) & 0xffff;
        }
        if (gid) map.set(c, gid);
      }
    }
  } else if (format === 12) {
    const nGroups = readU32(best, 12);
    for (let i = 0; i < nGroups; i++) {
      const o = 16 + i * 12;
      const startChar = readU32(best, o);
      const endChar = readU32(best, o + 4);
      let startGlyph = readU32(best, o + 8);
      for (let c = startChar; c <= endChar; c++) {
        map.set(c, startGlyph++);
      }
    }
  }
  return map;
}

function parseName(buf: Buffer, offset: number, length: number): string {
  const name = buf.subarray(offset, offset + length);
  const count = readU16(name, 2);
  const stringOffset = readU16(name, 4);
  for (let i = 0; i < count; i++) {
    const rec = 6 + i * 12;
    const nameID = readU16(name, rec + 6);
    if (nameID !== 6) continue; // PostScript name
    const len = readU16(name, rec + 8);
    const off = readU16(name, rec + 10);
    const platformID = readU16(name, rec);
    const bytes = name.subarray(stringOffset + off, stringOffset + off + len);
    if (platformID === 3) return bytes.toString("utf16le").replace(/\0/g, "");
    return bytes.toString("ascii").replace(/\0/g, "");
  }
  return "EmbeddedFont";
}

export function loadTtf(filePath: string): LoadedTtf {
  const bytes = fs.readFileSync(filePath);
  const tables = tableDir(bytes);
  const head = tables.get("head");
  const hhea = tables.get("hhea");
  const maxp = tables.get("maxp");
  const hmtx = tables.get("hmtx");
  const cmap = tables.get("cmap");
  const name = tables.get("name");
  if (!head || !hhea || !maxp || !hmtx || !cmap || !name) throw new Error(`TTF missing tables: ${filePath}`);

  const unitsPerEm = readU16(bytes, head.offset + 18);
  const xMin = readI16(bytes, head.offset + 36);
  const yMin = readI16(bytes, head.offset + 38);
  const xMax = readI16(bytes, head.offset + 40);
  const yMax = readI16(bytes, head.offset + 42);
  const ascent = readI16(bytes, hhea.offset + 4);
  const descent = readI16(bytes, hhea.offset + 6);
  const numberOfHMetrics = readU16(bytes, hhea.offset + 34);
  const numGlyphs = readU16(bytes, maxp.offset + 4);
  const cmapMap = parseCmap(bytes, cmap.offset, cmap.length);
  const advances = new Map<number, number>();
  for (let i = 0; i < numberOfHMetrics; i++) {
    advances.set(i, readU16(bytes, hmtx.offset + i * 4));
  }
  const lastAdv = advances.get(numberOfHMetrics - 1) ?? 0;
  for (let i = numberOfHMetrics; i < numGlyphs; i++) advances.set(i, lastAdv);

  // italicAngle from post if present
  let italicAngle = 0;
  const post = tables.get("post");
  if (post) italicAngle = bytes.readInt32BE(post.offset + 4) / 65536;

  return {
    bytes,
    unitsPerEm,
    ascent,
    descent,
    italicAngle,
    bbox: [xMin, yMin, xMax, yMax],
    postScriptName: parseName(bytes, name.offset, name.length).replace(/\s+/g, "") || "Inter",
    cmap: cmapMap,
    advances,
    numGlyphs,
  };
}

const fontCache = new Map<string, LoadedTtf>();

export function interRegular(): LoadedTtf {
  const p = path.join(process.cwd(), "assets/fonts/Inter-Regular.ttf");
  let f = fontCache.get(p);
  if (!f) {
    f = loadTtf(p);
    fontCache.set(p, f);
  }
  return f;
}

export function interSemiBold(): LoadedTtf {
  const p = path.join(process.cwd(), "assets/fonts/Inter-SemiBold.ttf");
  let f = fontCache.get(p);
  if (!f) {
    f = loadTtf(p);
    fontCache.set(p, f);
  }
  return f;
}

/** PDF glyph width in thousandths of an em for a Unicode code point. */
export function pdfWidth(font: LoadedTtf, codePoint: number): number {
  const gid = font.cmap.get(codePoint) ?? 0;
  const adv = font.advances.get(gid) ?? 0;
  return Math.round((adv * 1000) / font.unitsPerEm);
}

export function stringWidthPdfUnits(font: LoadedTtf, text: string, fontSize: number): number {
  let w = 0;
  for (const ch of text) {
    w += pdfWidth(font, ch.codePointAt(0)!);
  }
  return (w * fontSize) / 1000;
}
