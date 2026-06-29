export type AgentTraceSpan = {
  name: string;
  durationMs: number;
  ok?: boolean;
  meta?: Record<string, unknown>;
};

export class AgentTrace {
  readonly traceId: string;
  private readonly spans: Array<{
    name: string;
    startedAt: number;
    endedAt?: number;
    meta?: Record<string, unknown>;
  }> = [];

  constructor(traceId = crypto.randomUUID()) {
    this.traceId = traceId;
  }

  startSpan(name: string, meta?: Record<string, unknown>) {
    this.spans.push({ name, startedAt: Date.now(), meta });
  }

  endSpan(name: string, meta?: Record<string, unknown>) {
    const span = [...this.spans].reverse().find((row) => row.name === name && !row.endedAt);
    if (!span) return;
    span.endedAt = Date.now();
    span.meta = { ...(span.meta ?? {}), ...(meta ?? {}) };
  }

  recordTool(name: string, startedAt: number, ok: boolean, meta?: Record<string, unknown>) {
    this.spans.push({
      name: `tool:${name}`,
      startedAt,
      endedAt: Date.now(),
      meta: { ok, ...(meta ?? {}) },
    });
  }

  toSpans(): AgentTraceSpan[] {
    return this.spans.map((span) => ({
      name: span.name,
      durationMs: (span.endedAt ?? Date.now()) - span.startedAt,
      ok: typeof span.meta?.ok === "boolean" ? span.meta.ok : undefined,
      meta: span.meta,
    }));
  }

  toLogPayload() {
    return {
      traceId: this.traceId,
      spans: this.toSpans(),
    };
  }
}
