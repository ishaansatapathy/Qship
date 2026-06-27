import { db, eq, sql } from "@repo/database";
import { featureRequests } from "@repo/database/schema";

import { isOpenAiConfigured } from "./ai/openai";
import { checkExistingCapability } from "./feature-education";
import { triageFeatureRequest } from "./feature-ai";
import {
  appendFeatureActivity,
  createFeatureRequest,
  getFeatureRequest,
  updateFeatureMetadata,
  updateFeatureStatus,
} from "./feature-request";

export type FeatureSource = "manual" | "email" | "support_ticket" | "customer_call" | "api";

export async function ingestFeatureRequest(input: {
  organizationId: string;
  projectId: string;
  title: string;
  rawRequest: string;
  source?: FeatureSource;
  createdByUserId?: string;
  externalId?: string;
  channelMeta?: Record<string, unknown>;
  runTriage?: boolean;
  skipDuplicateCheck?: boolean;
}) {
  let row = await createFeatureRequest({
    organizationId: input.organizationId,
    projectId: input.projectId,
    title: input.title,
    rawRequest: input.rawRequest,
    createdByUserId: input.createdByUserId,
    source: input.source ?? "manual",
  });

  if (input.externalId || input.channelMeta) {
    row = await updateFeatureMetadata(row.id, {
      intake: {
        externalId: input.externalId ?? null,
        channelMeta: input.channelMeta ?? null,
        receivedAt: new Date().toISOString(),
        source: input.source ?? "manual",
      },
    });
  }

  await appendFeatureActivity(row.id, {
    kind: "submitted",
    title: `Intake via ${input.source ?? "manual"}`,
    detail: row.title,
    actor: input.createdByUserId ? "user" : "system",
  });

  return processFeatureIntake({
    featureId: row.id,
    projectId: input.projectId,
    runTriage: input.runTriage,
    skipDuplicateCheck: input.skipDuplicateCheck,
  });
}

export async function processFeatureIntake(input: {
  featureId: string;
  projectId: string;
  runTriage?: boolean;
  skipDuplicateCheck?: boolean;
}) {
  const feature = await getFeatureRequest(input.featureId);

  if (!input.skipDuplicateCheck) {
    const education = await checkExistingCapability({
      projectId: input.projectId,
      title: feature.title,
      rawRequest: feature.rawRequest,
      excludeFeatureId: feature.id,
    });

    if (education.shouldEducate && education.matchedFeatureId) {
      await updateFeatureStatus(input.featureId, "duplicate_education");
      await updateFeatureMetadata(input.featureId, { education });
      await appendFeatureActivity(input.featureId, {
        kind: "education",
        title: "Existing capability detected",
        detail: education.matchedFeatureTitle ?? undefined,
        actor: "agent",
      });

      return {
        feature: await getFeatureRequest(input.featureId),
        educated: true as const,
        education,
        triage: null,
      };
    }
  }

  const shouldTriage = input.runTriage !== false && isOpenAiConfigured();
  if (!shouldTriage) {
    return {
      feature: await getFeatureRequest(input.featureId),
      educated: false as const,
      education: null,
      triage: null,
    };
  }

  const triage = await triageFeatureRequest({
    title: feature.title,
    rawRequest: feature.rawRequest,
  });
  const updated = await updateFeatureMetadata(input.featureId, { triage });
  await appendFeatureActivity(input.featureId, {
    kind: "triage",
    title: "AI triage completed",
    detail: triage.priority ? `Priority ${triage.priority}` : undefined,
    actor: "agent",
  });

  return {
    feature: updated,
    educated: false as const,
    education: null,
    triage,
  };
}

export async function getIntakeSummary(projectId: string) {
  const rows = await db
    .select({
      source: featureRequests.source,
      count: sql<number>`count(*)::int`,
    })
    .from(featureRequests)
    .where(eq(featureRequests.projectId, projectId))
    .groupBy(featureRequests.source);

  const bySource = Object.fromEntries(rows.map((r) => [r.source, r.count])) as Record<
    string,
    number
  >;

  return {
    total: rows.reduce((sum, r) => sum + r.count, 0),
    manual: bySource.manual ?? 0,
    email: bySource.email ?? 0,
    support_ticket: bySource.support_ticket ?? 0,
    customer_call: bySource.customer_call ?? 0,
    api: bySource.api ?? 0,
  };
}
