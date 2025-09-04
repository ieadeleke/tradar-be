import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const S3_BUCKET = process.env.S3_BUCKET;
const S3_REGION = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION;
const S3_PUBLIC_BASE = process.env.S3_PUBLIC_BASE; // optional CDN/base URL

let s3Client = null;
if (S3_BUCKET && S3_REGION) {
  s3Client = new S3Client({ region: S3_REGION });
}

export function isS3Enabled() {
  return !!s3Client;
}

export async function s3Upload({ key, body, contentType }) {
  if (!isS3Enabled()) throw new Error("S3 not configured");
  const cmd = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key, Body: body, ContentType: contentType });
  await s3Client.send(cmd);
  return { bucket: S3_BUCKET, key };
}

export async function s3PresignedGetUrl(key, expiresIn = 3600) {
  if (!isS3Enabled()) return null;
  const cmd = new PutObjectCommand({ Bucket: S3_BUCKET, Key: key });
  // Note: to presign GET we need GetObjectCommand, not PutObjectCommand
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const getCmd = new GetObjectCommand({ Bucket: S3_BUCKET, Key: key });
  return await getSignedUrl(s3Client, getCmd, { expiresIn });
}

export function s3PublicUrl(key) {
  if (S3_PUBLIC_BASE) {
    return `${S3_PUBLIC_BASE.replace(/\/$/, "")}/${key}`;
  }
  return null;
}

