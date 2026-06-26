import type { Request, Response } from "express";
import { fromNodeHeaders } from "better-auth/node";

import { auth } from "@repo/auth";

import type { ContextUser } from "./context";

export async function resolveSessionUser(
  req: Request,
  res?: Response,
): Promise<ContextUser | null> {
  const session = await auth.api.getSession({
    headers: fromNodeHeaders(req.headers),
  });

  if (!session?.user) return null;

  const user: ContextUser = {
    id: session.user.id,
    email: session.user.email,
    fullName: session.user.name,
    displayName: session.user.name,
    emailVerified: session.user.emailVerified,
    profileImageUrl: session.user.image ?? null,
  };

  if (res && !res.headersSent) {
    const headerId = req.headers["x-request-id"];
    if (typeof headerId === "string" && headerId.trim()) {
      res.setHeader("x-request-id", headerId.trim());
    }
  }

  return user;
}
