import assert from "node:assert/strict";
import test from "node:test";
import { extractPlanningDocument } from "./document-extraction";

test("extracts and normalizes UTF-8 TXT documents", async () => {
  assert.equal(
    await extractPlanningDocument("notes.txt", Buffer.from("Baris satu\r\nBaris dua")),
    "Baris satu\nBaris dua",
  );
});

test("rejects binary content disguised as TXT", async () => {
  await assert.rejects(
    extractPlanningDocument("notes.txt", Buffer.from([0, 0, 1, 2, 3])),
    /binary data/,
  );
});

test("rejects spoofed PDF, DOCX, and DOC signatures", async () => {
  await assert.rejects(extractPlanningDocument("fake.pdf", Buffer.from("not pdf")), /PDF signature/);
  await assert.rejects(extractPlanningDocument("fake.docx", Buffer.from("not zip")), /DOCX signature/);
  await assert.rejects(extractPlanningDocument("fake.doc", Buffer.from("not ole")), /DOC signature/);
});