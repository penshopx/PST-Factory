import assert from "node:assert/strict";
import test from "node:test";
import { resolvePrivateObjectPath } from "./storage";

test("resolves only canonical private upload UUID paths", () => {
  const previous = process.env.PRIVATE_OBJECT_DIR;
  process.env.PRIVATE_OBJECT_DIR = "/bucket/private";
  try {
    assert.equal(
      resolvePrivateObjectPath("/objects/uploads/123e4567-e89b-42d3-a456-426614174000"),
      "/bucket/private/uploads/123e4567-e89b-42d3-a456-426614174000",
    );
    assert.throws(() => resolvePrivateObjectPath("/objects/other/123e4567-e89b-42d3-a456-426614174000"));
    assert.throws(() => resolvePrivateObjectPath("/objects/uploads/../../public"));
    assert.throws(() => resolvePrivateObjectPath("/objects/uploads/not-a-uuid"));
  } finally {
    if (previous === undefined) delete process.env.PRIVATE_OBJECT_DIR;
    else process.env.PRIVATE_OBJECT_DIR = previous;
  }
});