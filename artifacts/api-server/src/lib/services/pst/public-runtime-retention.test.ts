import assert from "node:assert/strict";
import test from "node:test";
import {
  publicRuntimeSessionRetentionCutoff,
  publicRuntimeSessionRetentionDays,
} from "./public-runtime-retention";

test("public runtime retention uses a stable thirty-day cutoff", () => {
  const now = new Date("2026-09-06T12:00:00.000Z");
  assert.equal(publicRuntimeSessionRetentionDays, 30);
  assert.equal(
    publicRuntimeSessionRetentionCutoff(now).toISOString(),
    "2026-08-07T12:00:00.000Z",
  );
});