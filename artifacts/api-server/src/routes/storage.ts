import { randomUUID } from "node:crypto";
import { Router, type IRouter } from "express";
import {
  RequestUploadUrlBody,
  RequestUploadUrlResponse,
} from "@workspace/api-zod";

const router: IRouter = Router();
const sidecarEndpoint = "http://127.0.0.1:1106";

function parseObjectPath(path: string) {
  const parts = `/${path}`.replace(/\/+/g, "/").split("/").filter(Boolean);
  if (parts.length < 2) {
    throw new Error("PRIVATE_OBJECT_DIR is invalid");
  }
  return {
    bucketName: parts[0],
    objectName: parts.slice(1).join("/"),
  };
}

async function signUploadUrl(fullPath: string) {
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const response = await fetch(`${sidecarEndpoint}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method: "PUT",
      expires_at: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`App Storage signing failed with status ${response.status}`);
  }
  const result = await response.json() as { signed_url?: string };
  if (!result.signed_url) {
    throw new Error("App Storage did not return a signed URL");
  }
  return result.signed_url;
}

router.post("/storage/uploads/request-url", async (req, res): Promise<void> => {
  const body = RequestUploadUrlBody.safeParse(req.body);
  if (!body.success) {
    res.status(400).json({ error: body.error.message });
    return;
  }
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) {
    res.status(503).json({ error: "Document storage is not configured" });
    return;
  }
  try {
    const objectId = randomUUID();
    const objectPath = `/objects/uploads/${objectId}`;
    const uploadURL = await signUploadUrl(`${privateObjectDir}/uploads/${objectId}`);
    res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to create document upload URL");
    res.status(500).json({ error: "Failed to prepare document upload" });
  }
});

export default router;