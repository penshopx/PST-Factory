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

export function resolvePrivateObjectPath(objectPath: string) {
  const privateObjectDir = process.env.PRIVATE_OBJECT_DIR;
  if (!privateObjectDir) throw new Error("Document storage is not configured");
  const match = /^\/objects\/uploads\/([0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i.exec(objectPath);
  if (!match) throw new Error("Document object path is invalid");
  return `${privateObjectDir}/uploads/${match[1]}`;
}

export async function signObjectUrl(fullPath: string, method: "PUT" | "GET" | "DELETE") {
  const { bucketName, objectName } = parseObjectPath(fullPath);
  const response = await fetch(`${sidecarEndpoint}/object-storage/signed-object-url`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      bucket_name: bucketName,
      object_name: objectName,
      method,
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

export async function deleteObject(fullPath: string) {
  const objectURL = await signObjectUrl(fullPath, "DELETE");
  const response = await fetch(objectURL, {
    method: "DELETE",
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok && response.status !== 404) {
    throw new Error(`App Storage delete failed with status ${response.status}`);
  }
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
    const uploadURL = await signObjectUrl(resolvePrivateObjectPath(objectPath), "PUT");
    res.json(RequestUploadUrlResponse.parse({ uploadURL, objectPath }));
  } catch (error) {
    req.log.error({ err: error }, "Failed to create document upload URL");
    res.status(500).json({ error: "Failed to prepare document upload" });
  }
});

export default router;