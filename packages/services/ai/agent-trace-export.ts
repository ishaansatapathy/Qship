import { logger } from "@repo/logger";

import type { AgentTrace } from "./agent-trace";

function traceIdToOtlpHex(traceId: string): string {
  return traceId.replace(/-/g, "").padEnd(32, "0").slice(0, 32);
}

function spanToOtlp(traceIdHex: string, name: string, durationMs: number, ok?: boolean) {
  const endNs = BigInt(Date.now()) * 1_000_000n;
  const startNs = endNs - BigInt(Math.max(durationMs, 1)) * 1_000_000n;
  return {
    traceId: traceIdHex,
    spanId: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
    name,
    kind: 1,
    startTimeUnixNano: startNs.toString(),
    endTimeUnixNano: endNs.toString(),
    status: { code: ok === false ? 2 : 1 },
  };
}

export type AgentTraceExportPayload = {
  traceId: string;
  serviceName: string;
  spans: Array<{ name: string; durationMs: number; ok?: boolean }>;
} & Record<string, unknown>;

export function buildAgentTraceExport(trace: AgentTrace, meta?: Record<string, unknown>): AgentTraceExportPayload {
  const payload = trace.toLogPayload();
  return {
    traceId: payload.traceId,
    serviceName: "shipflow-agent",
    spans: payload.spans.map((span) => ({
      name: span.name,
      durationMs: span.durationMs,
      ok: span.ok,
    })),
    ...meta,
  };
}

/** Structured OTel-compatible export — logs always; optional OTLP POST when configured. */
export async function exportAgentTrace(trace: AgentTrace, meta?: Record<string, unknown>): Promise<void> {
  const exportPayload = buildAgentTraceExport(trace, meta);
  const traceIdHex = traceIdToOtlpHex(exportPayload.traceId);

  const otlpBody = {
    resourceSpans: [
      {
        resource: {
          attributes: [{ key: "service.name", value: { stringValue: exportPayload.serviceName } }],
        },
        scopeSpans: [
          {
            scope: { name: "shipflow-agent" },
            spans: exportPayload.spans.map((span) =>
              spanToOtlp(traceIdHex, span.name, span.durationMs, span.ok),
            ),
          },
        ],
      },
    ],
  };

  logger.info("agent.trace.export", { ...exportPayload, otlp: otlpBody });

  const endpoint = process.env.OTEL_EXPORTER_OTLP_ENDPOINT?.trim();
  if (!endpoint) return;

  try {
    await fetch(`${endpoint.replace(/\/$/, "")}/v1/traces`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(otlpBody),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (error) {
    logger.warn("agent.trace.export.failed", {
      traceId: exportPayload.traceId,
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
