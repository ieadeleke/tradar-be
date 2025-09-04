import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const REGION = process.env.AWS_REGION;
const s3 = new S3Client({ region: REGION, credentials: {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
}});

export async function presignPutUrl({ Bucket, Key, ContentType, expiresIn = 900 }) {
  const command = new PutObjectCommand({ Bucket, Key, ContentType });
  const uploadUrl = await getSignedUrl(s3, command, { expiresIn });
  return uploadUrl;
}

export default s3;

