import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import * as trpcExpress from "@trpc/server/adapters/express";
import { generateOpenApiDocument, createOpenApiExpressMiddleware } from "trpc-to-openapi";

import { logger } from "@repo/logger";
import { ensureShipflowAgentServices } from "@repo/services/ensure-agent-services";
import { serverRouter, openApiRouter, createContext } from "@repo/trpc/server";

ensureShipflowAgentServices();

import { env } from "./env";
import { handleGithubWebhook } from "./github-webhook";
import { mcpRouter } from "./routes/mcp";
import { agentStreamRouter } from "./routes/agent-stream";
import { enrichShipflowOpenApi, type OpenApiDocumentWithPaths } from "./openapi-enrichment";

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

app.use(cookieParser());

app.post(
  "/webhooks/github",
  express.raw({ type: "application/json" }),
  (req, res) => {
    void handleGithubWebhook(req, res);
  },
);

app.use(express.json({ limit: "256kb" }));

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
    return res.json({ ready: true, database: "ok" });
  } catch (error) {
    logger.error("Readiness check failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(503).json({ ready: false, database: "error" });
  }
});

function buildOpenApiDocument(): OpenApiDocumentWithPaths {
  const document = generateOpenApiDocument(openApiRouter, {
    title: "ShipFlow API",
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

import("@scalar/express-api-reference")
  .then(({ apiReference }) => {
    app.use(
      "/docs",
      apiReference({
        url: "/openapi.json",
        theme: "purple",
        metaData: { title: "ShipFlow API — Scalar Docs" },
      }),
    );
  })
  .catch((error) => {
    logger.warn("API docs disabled", {
      message: error instanceof Error ? error.message : error,
    });
  });

app.use(
  "/api",
  createOpenApiExpressMiddleware({
    router: serverRouter,
    createContext,
  }),
);

app.use(
  "/trpc",
  trpcExpress.createExpressMiddleware({
    router: serverRouter,
    createContext,
  }),
);

app.use("/mcp", mcpRouter);
app.use("/agent/stream", agentStreamRouter);

export default app;
