/**
 * What this file does:
 * Wraps password hashing and comparison for the login flow.
 * What calls it:
 * src/services/auth-service.ts and prisma/seed.ts.
 * What it calls:
 * bcryptjs.
 * One thing a junior engineer would likely get wrong:
 * Comparing plaintext passwords directly or using an insecure hashing algorithm.
 */
import "server-only";
import bcrypt from "bcryptjs";

const SALT_ROUNDS = 10;

export async function hashPassword(password: string) {
  return bcrypt.hash(password, SALT_ROUNDS);
}

export async function verifyPassword(password: string, passwordHash: string) {
  return bcrypt.compare(password, passwordHash);
}

