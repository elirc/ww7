/**
 * What this file does:
 * Defines the Zod boundary for authentication requests.
 * What calls it:
 * src/app/api/auth/login/route.ts.
 * What it calls:
 * zod.
 * One thing a junior engineer would likely get wrong:
 * Letting empty strings or malformed emails through and hoping downstream auth code handles it.
 */
import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});

export type LoginInput = z.infer<typeof loginSchema>;

