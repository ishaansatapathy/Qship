import { type NextRequest, NextResponse } from "next/server";

import { auth } from "@repo/auth";

function demoErrorRedirect(request: NextRequest, message: string) {
  const signInUrl = new URL("/sign-in", request.url);
  signInUrl.searchParams.set("error", message);
  return NextResponse.redirect(signInUrl);
}

export async function GET(request: NextRequest) {
  if (process.env.DEMO_LOGIN_ENABLED !== "true") {
    return demoErrorRedirect(request, "Demo login is not enabled.");
  }

  const nextParam = request.nextUrl.searchParams.get("next");
  const nextPath = nextParam?.startsWith("/") ? nextParam : "/brief";

  const email = process.env.DEMO_USER_EMAIL ?? process.env.SEED_USER_EMAIL ?? "demo@qship.dev";
  const password =
    process.env.DEMO_USER_PASSWORD ?? process.env.SEED_DEMO_PASSWORD ?? "DemoPass123!";

  try {
    const result = await auth.api.signInEmail({
      body: { email, password },
      headers: request.headers,
      asResponse: true,
    });

    if (!result.ok) {
      return demoErrorRedirect(
        request,
        "Demo login failed. Run pnpm db:seed, then try again.",
      );
    }

    const dashboardUrl = new URL(nextPath, request.url);
    const response = NextResponse.redirect(dashboardUrl);

    for (const cookie of result.headers.getSetCookie?.() ?? []) {
      response.headers.append("set-cookie", cookie);
    }

    return response;
  } catch {
    return demoErrorRedirect(request, "Demo login unavailable.");
  }
}
