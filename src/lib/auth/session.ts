/**
 * What this file does:
 * Creates, verifies, and clears the signed session cookie used by API handlers and server components.
 * What calls it:
 * src/services/auth-service.ts, src/lib/http/route-helpers.ts, and layout/page server components.
 * What it calls:
 * jose for JWT signing plus cookies() from next/headers.
 * One thing a junior engineer would likely get wrong:
 * Trusting role claims from the cookie forever instead of reloading the user for authoritative permissions.
 */
import "server-only";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { AppError } from "@/lib/http/errors";
import { userRepository } from "@/repositories/user-repository";
import type { RouteActor } from "@/types/workflow";

const SESSION_COOKIE_NAME = "workflow_session";
const SESSION_DURATION_SECONDS = 60 * 60 * 8;

type SessionPayload = {
  sub: string;
  email: string;
};

function getSessionSecret() {
  const value = process.env.SESSION_SECRET;

  if (!value) {
    throw new Error("SESSION_SECRET is required.");
  }

  return new TextEncoder().encode(value);
}

export async function createSessionCookie(user: { id: string; email: string }) {
  const token = await new SignJWT({ email: user.email })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DURATION_SECONDS}s`)
    .sign(getSessionSecret());

  const cookieStore = await cookies();
  cookieStore.set(SESSION_COOKIE_NAME, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: SESSION_DURATION_SECONDS,
  });
}

export async function clearSessionCookie() {
  const cookieStore = await cookies();
  cookieStore.delete(SESSION_COOKIE_NAME);
}

export async function getSessionActor(): Promise<RouteActor | null> {
  const cookieStore = await cookies();
  const token = cookieStore.get(SESSION_COOKIE_NAME)?.value;

  if (!token) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(token, getSessionSecret());
    const session = payload as SessionPayload;
    // SENIOR NOTE: the cookie proves identity, but the database still owns the current role and account state.
    const user = await userRepository.findById(session.sub);

    if (!user) {
      return null;
    }

    return {
      userId: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
    };
  } catch {
    return null;
  }
}

export async function requireSessionActor() {
  const actor = await getSessionActor();

  if (!actor) {
    throw new AppError("Authentication required.", 401, "UNAUTHENTICATED");
  }

  return actor;
}

