/** Lightweight SSE heartbeat — prevents 404 console noise from useSyncEvents. */
export const dynamic = "force-dynamic";

export async function GET() {
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode("event: ready\ndata: {}\n\n"));

      const interval = setInterval(() => {
        controller.enqueue(encoder.encode(": ping\n\n"));
      }, 30_000);

      // Close after 5 min; client reconnects automatically.
      setTimeout(() => {
        clearInterval(interval);
        controller.close();
      }, 5 * 60_000);
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
