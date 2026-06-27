import type { Request, Response } from "express";
import { z } from "zod";

import { logger } from "@repo/logger";
import { db } from "@repo/database";
import { ingestFeatureRequest } from "@repo/services/feature-intake";

const intakeBodySchema = z.object({
  organizationId: z.string().min(1).optional(),
  projectId: z.string().min(1).optional(),
  title: z.string().min(3),
  rawRequest: z.string().min(10),
  source: z.enum(["email", "support_ticket", "customer_call", "api", "manual"]).default("api"),
  externalId: z.string().optional(),
  channelMeta: z.record(z.string(), z.unknown()).optional(),
  runTriage: z.boolean().optional(),
});

async function resolveIntakeTarget(body: z.infer<typeof intakeBodySchema>) {
  if (body.organizationId && body.projectId) {
    return { organizationId: body.organizationId, projectId: body.projectId };
  }

  const orgId = process.env.SHIPFLOW_INTAKE_ORG_ID?.trim();
  const projectId = process.env.SHIPFLOW_INTAKE_PROJECT_ID?.trim();
  if (orgId && projectId) {
    return { organizationId: orgId, projectId };
  }

  const project = await db.query.projects.findFirst({
    orderBy: (p, { asc }) => [asc(p.createdAt)],
  });
  if (!project) {
    throw new Error("No workspace project found. Run pnpm db:seed or pass organizationId + projectId.");
  }

  return { organizationId: project.organizationId, projectId: project.id };
}

function resolveIntakeSecret(req: Request) {
  const header = req.headers["x-shipflow-intake-secret"];
  if (typeof header === "string" && header.trim()) return header.trim();

  const auth = req.headers.authorization;
  if (auth?.startsWith("Bearer ")) return auth.slice(7).trim();
  return null;
}

export async function handleIntakeWebhook(req: Request, res: Response) {
  const expected = process.env.SHIPFLOW_INTAKE_WEBHOOK_SECRET?.trim();
  if (!expected) {
    return res.status(503).json({
      error: "Intake webhook is not configured. Set SHIPFLOW_INTAKE_WEBHOOK_SECRET in .env",
    });
  }

  const provided = resolveIntakeSecret(req);
  if (!provided || provided !== expected) {
    return res.status(401).json({ error: "Invalid intake webhook secret" });
  }

  try {
    const body = intakeBodySchema.parse(req.body);
    const target = await resolveIntakeTarget(body);
    const result = await ingestFeatureRequest({
      organizationId: target.organizationId,
      projectId: target.projectId,
      title: body.title,
      rawRequest: body.rawRequest,
      source: body.source,
      externalId: body.externalId,
      channelMeta: body.channelMeta,
      runTriage: body.runTriage,
    });

    logger.info("Feature intake webhook processed", {
      featureId: result.feature.id,
      source: body.source,
      educated: result.educated,
    });

    return res.status(201).json({
      ok: true,
      featureId: result.feature.id,
      status: result.feature.status,
      educated: result.educated,
      education: result.education,
      triage: result.triage,
    });
  } catch (error) {
    logger.error("Intake webhook failed", {
      message: error instanceof Error ? error.message : String(error),
    });
    return res.status(400).json({
      error: error instanceof Error ? error.message : "Invalid intake payload",
    });
  }
}
