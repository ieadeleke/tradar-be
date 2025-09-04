import crypto from "crypto";

const KEY_HEX = '9f1c3e4b7a2d6f8b0e1c2d3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b';
if (!KEY_HEX || KEY_HEX.length !== 64) {
  throw new Error("MASTER_ENC_KEY_HEX must be 32 bytes (64 hex chars)");
}
const KEY = Buffer.from(KEY_HEX, "hex");

export function encryptSecret(plain) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", KEY, iv);
  const ciphertext = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    ct: ciphertext.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
  };
}

export function decryptSecret({ ct, iv, tag }) {
  const decipher = crypto.createDecipheriv("aes-256-gcm", KEY, Buffer.from(iv, "base64"));
  decipher.setAuthTag(Buffer.from(tag, "base64"));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(ct, "base64")),
    decipher.final(),
  ]);
  return plain.toString("utf8");
}
