import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import * as trpcExpress from "@trpc/server/adapters/express";
import { generateOpenApiDocument, createOpenApiExpressMiddleware } from "trpc-to-openapi";

import { logger } from "@repo/logger";
import { isOpenAiConfigured } from "@repo/services/ai/openai";
import { ensureDemoWorkflowReady } from "@repo/services/demo-bootstrap";
import { ensureShipflowAgentServices } from "@repo/services/ensure-agent-services";
import { getSlackIntegrationStatus } from "@repo/services/slack";
import { getShipDeployIntegrationStatus } from "@repo/services/ship-deploy";
import { serverRouter, openApiRouter, createContext } from "@repo/trpc/server";

ensureShipflowAgentServices();

import { env } from "./env";
import { handleGithubWebhook } from "./github-webhook";
import { handleIntakeWebhook } from "./routes/intake-webhook";
import { handleRazorpayWebhook } from "@repo/services/billing/webhook";
import { mcpRouter } from "./routes/mcp";
import { agentStreamRouter } from "./routes/agent-stream";
import { inngestServe } from "./routes/inngest";
import { enrichShipflowOpenApi, type OpenApiDocumentWithPaths } from "./openapi-enrichment";
import { apiReference } from "@scalar/express-api-reference";
import {
  agentRateLimiter,
  authRateLimiter,
  errorHandlerMiddleware,
  globalRateLimiter,
  notFoundMiddleware,
  requestIdMiddleware,
  trpcRateLimiter,
  trustedOriginMiddleware,
} from "./middleware";

export const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
  }),
);

app.use(
  cors({
    origin: env.CLIENT_URL,
    credentials: true,
  }),
);

app.use(requestIdMiddleware);
app.use(cookieParser());
app.use(globalRateLimiter);

app.post(
  "/webhooks/github",
  express.raw({ type: "application/json" }),
  (req, res) => {
    void handleGithubWebhook(req, res);
  },
);

app.post(
  "/webhooks/razorpay",
  express.raw({ type: "application/json" }),
  (req, res) => {
    void handleRazorpayWebhook(req, res);
  },
);

app.use(express.json({ limit: "256kb" }));

// CSRF + trusted-origin guard for mutating requests (webhooks exempt).
app.use(trustedOriginMiddleware);

app.post(
  "/webhooks/intake",
  (req, res) => {
    void handleIntakeWebhook(req, res);
  },
);

app.get("/", (_req, res) => {
  return res.json({ message: "API is running" });
});

app.get("/health", async (_req, res) => {
  const checkDatabase = process.env.HEALTH_CHECK_DATABASE !== "false";
  try {
    if (checkDatabase && process.env.DATABASE_URL) {
      const { pingDatabase } = await import("@repo/database/health");
      await pingDatabase();
    }
    return res.json({
      message: "API is healthy",
      healthy: true,
      openaiConfigured: isOpenAiConfigured(),
      slack: getSlackIntegrationStatus(),
      ...(checkDatabase && process.env.DATABASE_URL ? { database: "ok" as const } : {}),
    });
  } catch (error) {
    logger.error("Health check failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(503).json({
      message: "API is unhealthy",
      healthy: false,
      database: "error",
    });
  }
});

app.get("/ready", async (_req, res) => {
  try {
    if (!process.env.DATABASE_URL) {
      return res.status(503).json({ ready: false, reason: "DATABASE_URL not configured" });
    }
    const { pingDatabase } = await import("@repo/database/health");
    await pingDatabase();
    return res.json({
      ready: true,
      database: "ok",
      slack: getSlackIntegrationStatus(),
    });
  } catch (error) {
    logger.error("Readiness check failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(503).json({ ready: false, database: "error" });
  }
});

app.get("/integrations/slack", (_req, res) => {
  return res.json(getSlackIntegrationStatus());
});

app.get("/integrations/ship", (_req, res) => {
  return res.json(getShipDeployIntegrationStatus());
});

function buildOpenApiDocument(): OpenApiDocumentWithPaths {
  const document = generateOpenApiDocument(openApiRouter, {
    title: "Qship API",
    version: "1.0.0",
    baseUrl: env.BASE_URL.concat("/api"),
  }) as OpenApiDocumentWithPaths;

  return enrichShipflowOpenApi(document, {
    clientUrl: env.CLIENT_URL,
    baseUrl: env.BASE_URL,
  });
}

let cachedOpenApiDocument: OpenApiDocumentWithPaths | null = null;

function getOpenApiDocument(): OpenApiDocumentWithPaths {
  if (!cachedOpenApiDocument) {
    cachedOpenApiDocument = buildOpenApiDocument();
  }
  return cachedOpenApiDocument;
}

app.get("/openapi.json", (_req, res) => {
  return res.json(getOpenApiDocument());
});

if (env.PUBLIC_OPENAPI_DOCS === "true") {
  app.use(
    "/docs",
    apiReference({
      url: "/openapi.json",
      theme: "purple",
      metaData: { title: "Qship API — Scalar Docs" },
    }),
  );
}

try {
  app.use(
    "/api",
    authRateLimiter,
    createOpenApiExpressMiddleware({
      router: serverRouter,
      createContext,
    }),
  );
} catch (error) {
  logger.warn("OpenAPI REST bridge disabled — tRPC still available at /trpc", {
    message: error instanceof Error ? error.message : String(error),
  });
}

app.use(
  "/trpc",
  trpcRateLimiter,
  trpcExpress.createExpressMiddleware({
    router: serverRouter,
    createContext,
  }),
);

app.use("/mcp", agentRateLimiter, mcpRouter);
app.use("/agent/stream", agentStreamRouter);
app.use("/api/inngest", inngestServe);

app.use(notFoundMiddleware);
app.use(errorHandlerMiddleware);

export default app;
