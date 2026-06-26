import type { CreateExpressContextOptions } from "@trpc/server/adapters/express";
import { fromNodeHeaders } from "better-auth/node";
import crypto from "node:crypto";

import { auth } from "@repo/auth";

export type ContextUser = {
  id: string;
  email: string;
  fullName: string;
  displayName: string;
  emailVerified: boolean;
  profileImageUrl: string | null;
};

export async function createContext({ req, res }: CreateExpressContextOptions) {
  const headerId = req.headers["x-request-id"];
  const requestId =
    (typeof headerId === "string" && headerId.trim()) || crypto.randomUUID().slice(0, 12);
  res.setHeader("x-request-id", requestId);

  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  const user: ContextUser | null = session?.user
    ? {
        id: session.user.id,
        email: session.user.email,
        fullName: session.user.name,
        displayName: session.user.name,
        emailVerified: session.user.emailVerified,
        profileImageUrl: session.user.image ?? null,
      }
    : null;

  return { req, res, user, session, requestId };
}

export type Context = Awaited<ReturnType<typeof createContext>>;
