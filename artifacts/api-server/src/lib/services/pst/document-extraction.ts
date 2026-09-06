import { extname } from "node:path";
import mammoth from "mammoth";
import WordExtractor from "word-extractor";
import { PDFParse } from "pdf-parse";

const maxExtractedCharacters = 100_000;
const oleSignature = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

function normalize(text: string) {
  const value = text.replace(/\0/g, "").replace(/\r\n?/g, "\n").trim();
  if (!value) throw new Error("Document does not contain readable text.");
  return value.slice(0, maxExtractedCharacters);
}

export async function extractPlanningDocument(name: string, data: Buffer) {
  const extension = extname(name).toLowerCase();
  if (extension === ".txt") {
    const nulRatio = data.length ? data.filter((byte) => byte === 0).length / data.length : 0;
    if (nulRatio > 0.01) throw new Error("TXT document appears to contain binary data.");
    return normalize(data.toString("utf8"));
  }
  if (extension === ".pdf") {
    if (!data.subarray(0, 5).equals(Buffer.from("%PDF-"))) {
      throw new Error("PDF signature is invalid.");
    }
    const parser = new PDFParse({ data });
    try {
      return normalize((await parser.getText()).text);
    } finally {
      await parser.destroy();
    }
  }
  if (extension === ".docx") {
    if (data[0] !== 0x50 || data[1] !== 0x4b) {
      throw new Error("DOCX signature is invalid.");
    }
    return normalize((await mammoth.extractRawText({ buffer: data })).value);
  }
  if (extension === ".doc") {
    if (!data.subarray(0, oleSignature.length).equals(oleSignature)) {
      throw new Error("DOC signature is invalid.");
    }
    const extractor = new WordExtractor();
    return normalize((await extractor.extract(data)).getBody());
  }
  throw new Error("Unsupported planning document format.");
}