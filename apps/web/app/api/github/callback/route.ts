import { NextResponse } from "next/server";
import { headers } from "next/headers";

import { auth } from "@repo/auth";
import { completeGithubInstallation } from "@repo/services/github";

export async function GET(request: Request) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) {
    return NextResponse.redirect(new URL("/sign-in?error=auth_required", request.url));
  }

  const url = new URL(request.url);
  const installationId = url.searchParams.get("installation_id");
  const state = url.searchParams.get("state");
  const setupAction = url.searchParams.get("setup_action");

  if (setupAction === "request" || !installationId) {
    return NextResponse.redirect(new URL("/settings?github=pending", request.url));
  }

  try {
    const result = await completeGithubInstallation({
      userId: session.user.id,
      installationId,
      state,
    });

    const redirectTo = result.returnTo.startsWith("/") ? result.returnTo : "/settings";
    return NextResponse.redirect(new URL(`${redirectTo}?github=connected`, request.url));
  } catch (error) {
    const message = error instanceof Error ? error.message : "github_connect_failed";
    return NextResponse.redirect(
      new URL(`/settings?error=${encodeURIComponent(message)}`, request.url),
    );
  }
}
