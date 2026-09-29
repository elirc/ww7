/**
 * What this file does:
 * Exposes a shared Prisma client for repositories and worker services.
 * What calls it:
 * Repository modules in src/repositories and worker/service modules in src/services.
 * What it calls:
 * The generated PrismaClient constructor from @prisma/client.
 * One thing a junior engineer would likely get wrong:
 * Creating a new Prisma client per request, which leaks connections under load and in local hot reload.
 */
import "server-only";
import { PrismaClient } from "@prisma/client";

declare global {
  var __workflowPrisma__: PrismaClient | undefined;
}

export const prisma =
  global.__workflowPrisma__ ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") {
  global.__workflowPrisma__ = prisma;
}

