import http from "node:http";
import path from "node:path";
import dotenv from "dotenv";

// Always load monorepo root .env (even if dev was started without dotenv-cli).
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const PORT = Number(process.env.PORT ?? 8000);

function writeJson(res: http.ServerResponse, status: number, body: unknown) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

async function bootstrap() {
  let expressHandler: http.RequestListener | null = null;
  let shuttingDown = false;

  const server = http.createServer((req, res) => {
    const path = req.url?.split("?")[0] ?? "/";

    if (path === "/health" || path === "/") {
      writeJson(res, 200, {
        healthy: true,
        ready: Boolean(expressHandler),
        message: expressHandler ? "App API is healthy" : "App API is starting",
      });
      return;
    }

    if (!expressHandler) {
      writeJson(res, 503, { error: "App API is starting" });
      return;
    }

    expressHandler(req, res);
  });

  await new Promise<void>((resolve, reject) => {
    server.once("error", reject);
    server.listen(PORT, "0.0.0.0", () => resolve());
  });

  const { logger } = await import("@repo/logger");
  logger.info(`http server is running on 0.0.0.0:${PORT}`);

  try {
    const { shouldRunMigrationsOnBoot } = await import("@repo/services/runtime-env");
    if (shouldRunMigrationsOnBoot()) {
      const { runMigrations } = await import("./migrate");
      await runMigrations();
      logger.info("Database schema patches applied");
    } else {
      logger.info("Skipping boot migrations (RUN_MIGRATIONS_ON_BOOT=false)");
    }
  } catch (err) {
    logger.error("Database migration failed", { err });
    const nodeEnv = process.env.NODE_ENV ?? "development";
    if (["production", "prod"].includes(nodeEnv)) {
      process.exit(1);
    }
  }

  try {
    const { app } = await import("./server");
    expressHandler = app;
    const { isOpenAiConfigured } = await import("@repo/services/ai/openai");
    logger.info("Express application loaded", {
      openaiConfigured: isOpenAiConfigured(),
    });
    if (!isOpenAiConfigured()) {
      logger.warn("OPENAI_API_KEY is not set — Qship Agent will be disabled until you add it to .env and restart");
    }

    if (process.env.DEMO_LOGIN_ENABLED === "true") {
      try {
        const { isDemoModeEnabled } = await import("@repo/services/runtime-env");
        if (isDemoModeEnabled()) {
          const { ensureDemoWorkflowReady } = await import("@repo/services/demo-bootstrap");
          const { backfilled } = await ensureDemoWorkflowReady();
          if (backfilled > 0) {
            logger.info("Demo workflow bootstrap applied", { backfilled });
          }
        }
      } catch (err) {
        logger.warn("Demo workflow bootstrap skipped", {
          message: err instanceof Error ? err.message : String(err),
        });
      }
    }

    const { startGithubWebhookOutboxProcessor } = await import(
      "@repo/services/github/webhook-outbox-scheduler"
    );
    startGithubWebhookOutboxProcessor();
  } catch (err) {
    logger.error("Failed to load Express application", {
      err,
      message: err instanceof Error ? err.message : String(err),
      stack: err instanceof Error ? err.stack : undefined,
      cause: err instanceof Error ? err.cause : undefined,
    });
  }

  const shutdown = (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    void (async () => {
      const { logger } = await import("@repo/logger");
      logger.info(`Received ${signal} — shutting down gracefully`);
      server.close(() => {
        logger.info("HTTP server closed");
        process.exit(0);
      });
      setTimeout(() => {
        logger.error("Forced shutdown after timeout");
        process.exit(1);
      }, 10_000).unref();
    })();
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

bootstrap().catch((err) => {
  console.error("Fatal bootstrap error", err);
  process.exit(1);
});
