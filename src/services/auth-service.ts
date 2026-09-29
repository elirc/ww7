/**
 * What this file does:
 * Authenticates login requests and creates the signed session cookie.
 * What calls it:
 * src/app/api/auth/login/route.ts.
 * What it calls:
 * src/repositories/user-repository.ts, src/lib/auth/password.ts, and src/lib/auth/session.ts.
 * One thing a junior engineer would likely get wrong:
 * Returning success before verifying the password hash or normalizing the auth failure path.
 */
import "server-only";
import { AppError } from "@/lib/http/errors";
import { verifyPassword } from "@/lib/auth/password";
import { createSessionCookie } from "@/lib/auth/session";
import type { LoginInput } from "@/lib/validation/auth-schemas";
import { userRepository } from "@/repositories/user-repository";

export const authService = {
  async login(input: LoginInput) {
    const user = await userRepository.findByEmail(input.email);

    if (!user) {
      throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    // SENIOR NOTE: auth failures should stay indistinguishable to avoid turning login into an account-enumeration endpoint.
    const passwordMatches = await verifyPassword(input.password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError("Invalid email or password.", 401, "INVALID_CREDENTIALS");
    }

    await createSessionCookie({ id: user.id, email: user.email });

    return {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  },
};

