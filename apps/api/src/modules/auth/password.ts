import argon2 from "argon2";

/**
 * Argon2id is used over bcrypt because it's the OWASP-recommended
 * default for new systems and is resistant to GPU-cracking in a way
 * bcrypt's fixed cost factor is not. Parameters below follow OWASP's
 * 2024 minimum recommendation for argon2id (19 MiB memory / 2 iterations
 * would be the absolute floor; we use a larger memory cost since this
 * runs on API servers, not resource-constrained devices).
 */
const HASH_OPTIONS = {
  type: argon2.argon2id,
  memoryCost: 2 ** 16, // 64 MiB
  timeCost: 3,
  parallelism: 1,
};

export async function hashPassword(plaintext: string): Promise<string> {
  return argon2.hash(plaintext, HASH_OPTIONS);
}

export async function verifyPassword(hash: string, plaintext: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plaintext);
  } catch {
    // Malformed hash, algorithm mismatch, etc. — treat as a failed verify
    // rather than letting the error surface (never leak why it failed).
    return false;
  }
}
