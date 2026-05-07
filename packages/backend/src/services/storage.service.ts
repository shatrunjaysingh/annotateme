/**
 * Storage Service — uses local disk by default, S3 when env vars are configured.
 *
 * Local mode:  AWS_ACCESS_KEY_ID is not set  → files stored under UPLOAD_DIR / EXPORT_DIR
 * S3 mode:     AWS_ACCESS_KEY_ID + AWS_S3_BUCKET are set → files stored in S3 bucket
 */

import fs from "fs";
import path from "path";
import { S3Service } from "./s3.service";

const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(process.cwd(), "uploads");
const EXPORT_DIR = process.env.EXPORT_DIR || path.join(process.cwd(), "exports");

[UPLOAD_DIR, EXPORT_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
});

function isS3Configured(): boolean {
  return !!(
    process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_S3_BUCKET
  );
}

function getS3Service(): S3Service {
  return new S3Service({
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
    region: process.env.AWS_REGION || "us-east-1",
    bucket: process.env.AWS_S3_BUCKET!,
    endpoint: process.env.AWS_ENDPOINT,
  });
}

export interface UploadResult {
  key: string;
  url: string;
  isLocal: boolean;
}

/**
 * Upload a file buffer. Returns a key (local path or S3 key) and a URL.
 */
export async function uploadFile(
  buffer: Buffer,
  originalName: string,
  subfolder: string,
  contentType: string = "application/octet-stream"
): Promise<UploadResult> {
  const safeName = `${Date.now()}-${path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  if (isS3Configured()) {
    const s3 = getS3Service();
    const key = await s3.uploadFile(buffer, safeName, subfolder, contentType);
    const url = `/api/import-export/download?key=${encodeURIComponent(key)}&storage=s3`;
    return { key, url, isLocal: false };
  }

  const destDir = path.join(UPLOAD_DIR, subfolder);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const filePath = path.join(destDir, safeName);
  fs.writeFileSync(filePath, buffer);
  const key = path.join("uploads", subfolder, safeName);
  const url = `/${key}`;
  return { key, url, isLocal: true };
}

/**
 * Save an export file (annotation JSON/CSV). Returns a direct download URL.
 */
export async function saveExport(
  buffer: Buffer,
  filename: string,
  projectId: string,
  format: string,
  tenantId?: string
): Promise<{ key: string; downloadUrl: string; isLocal: boolean }> {
  const safeName = `${Date.now()}-${filename.replace(/[^a-zA-Z0-9._-]/g, "_")}`;

  if (isS3Configured()) {
    const s3 = getS3Service();
    const key = await s3.uploadAnnotationSet(buffer, safeName, projectId, format, tenantId);
    const downloadUrl = await s3.getSignedDownloadUrl(key, 86400);
    return { key, downloadUrl, isLocal: false };
  }

  const destDir = tenantId
    ? path.join(EXPORT_DIR, tenantId, projectId)
    : path.join(EXPORT_DIR, projectId);
  if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });

  const filePath = path.join(destDir, safeName);
  fs.writeFileSync(filePath, buffer);
  const key = path.relative(process.cwd(), filePath);
  const downloadUrl = `/api/import-export/local-download?file=${encodeURIComponent(key)}`;
  return { key, downloadUrl, isLocal: true };
}

/**
 * Get a signed/local download URL for a previously stored key.
 */
export async function getDownloadUrl(key: string, isLocal: boolean): Promise<string> {
  if (!isLocal && isS3Configured()) {
    const s3 = getS3Service();
    return s3.getSignedDownloadUrl(key, 3600);
  }
  return `/${key}`;
}

/**
 * Delete a file by key.
 */
export async function deleteFile(key: string, isLocal: boolean): Promise<void> {
  if (!isLocal && isS3Configured()) {
    const s3 = getS3Service();
    await s3.deleteFile(key);
    return;
  }
  const filePath = path.join(process.cwd(), key);
  if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
}

export const storageMode = (): "s3" | "local" => (isS3Configured() ? "s3" : "local");
