/**
 * What this file does:
 * Encapsulates all user lookups used by auth and session resolution.
 * What calls it:
 * src/lib/auth/session.ts and src/services/auth-service.ts.
 * What it calls:
 * Prisma queries through src/lib/db.ts.
 * One thing a junior engineer would likely get wrong:
 * Returning more columns than needed, including password hashes, into unrelated layers.
 */
import "server-only";
import { prisma } from "@/lib/db";

export const userRepository = {
  findByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  findById(id: string) {
    return prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
      },
    });
  },
};

