import { type NextRequest, NextResponse } from "next/server";

import { appendProxiedSetCookies } from "~/lib/proxied-set-cookie";

const API_BASE = process.env.API_INTERNAL_URL ?? "http://localhost:8000";

export const maxDuration = 60;

function buildUpstreamHeaders(request: NextRequest): Headers {
  const headers = new Headers();
  const contentType = request.headers.get("content-type");
  if (contentType) headers.set("content-type", contentType);
  const cookie = request.headers.get("cookie");
  if (cookie) headers.set("cookie", cookie);
  const origin = request.headers.get("origin");
  if (origin) headers.set("origin", origin);
  const referer = request.headers.get("referer");
  if (referer) headers.set("referer", referer);
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) headers.set("x-forwarded-for", forwardedFor);
  const realIp = request.headers.get("x-real-ip");
  if (realIp) headers.set("x-real-ip", realIp);
  headers.set("x-app-csrf", "1");
  headers.set("accept-encoding", "identity");
  return headers;
}

/** Proxy SSE agent chat so Railway sees the real client IP for per-user rate limits. */
export async function POST(request: NextRequest) {
  const headers = buildUpstreamHeaders(request);
  const body = await request.arrayBuffer();

  let upstream: Response;
  try {
    upstream = await fetch(`${API_BASE}/agent/stream`, {
      method: "POST",
      headers,
      body,
      redirect: "manual",
      cache: "no-store",
      signal: request.signal,
    });
  } catch {
    return NextResponse.json(
      { error: "API is waking up — please try again in a few seconds." },
      { status: 503 },
    );
  }

  if (!upstream.ok || !upstream.body) {
    const text = await upstream.text();
    try {
      return NextResponse.json(JSON.parse(text) as unknown, { status: upstream.status });
    } catch {
      return new NextResponse(text, { status: upstream.status });
    }
  }

  const responseHeaders = new Headers();
  responseHeaders.set(
    "content-type",
    upstream.headers.get("content-type") ?? "text/event-stream",
  );
  responseHeaders.set("cache-control", "no-cache, no-transform");
  responseHeaders.set("connection", "keep-alive");
  const traceId = upstream.headers.get("x-trace-id");
  if (traceId) responseHeaders.set("x-trace-id", traceId);

  const response = new NextResponse(upstream.body, {
    status: upstream.status,
    headers: responseHeaders,
  });
  response.headers.set("cache-control", "no-store, no-transform");
  response.headers.delete("content-encoding");
  appendProxiedSetCookies(response.headers, upstream.headers);
  return response;
}
