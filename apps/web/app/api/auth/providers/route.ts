import { NextResponse } from "next/server";

import { getEnabledAuthProviders } from "@repo/auth";

export async function GET() {
  return NextResponse.json(getEnabledAuthProviders(), {
    headers: { "Cache-Control": "no-store" },
  });
}
