import crypto from "crypto";

export function createMemberId(name: string) {
  return crypto.createHash("sha256").update(name.trim().toLowerCase()).digest("hex").slice(0, 16);
}
