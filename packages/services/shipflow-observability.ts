import { and, count, eq, gte, inArray } from "@repo/database";
import db from "@repo/database";
import { agentChatSessionsTable, featureRequests, pullRequests, repositories } from "@repo/database/schema";

import { getPipelineSummary, getWorkspaceProjectForUser } from "./feature-request";

export async function getDeliveryActivityTimeline(projectId: string, days = 14) {
  const since = new Date(Date.now() - days * 86_400_000);
  const rows = await db.query.featureRequests.findMany({
    where: and(eq(featureRequests.projectId, projectId), gte(featureRequests.updatedAt, since)),
    columns: { updatedAt: true, status: true },
  });

  const byDate = new Map<string, { date: string; updates: number; shipped: number }>();

  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - i);
    const key = d.toISOString().slice(0, 10);
    byDate.set(key, { date: key, updates: 0, shipped: 0 });
  }

  for (const row of rows) {
    const key = row.updatedAt.toISOString().slice(0, 10);
    const bucket = byDate.get(key);
    if (!bucket) continue;
    bucket.updates += 1;
    if (row.status === "shipped" || row.status === "approved") {
      bucket.shipped += 1;
    }
  }

  return [...byDate.values()];
}

export async function getShipflowObservabilitySummary(userId: string) {
  const ws = await getWorkspaceProjectForUser(userId);
  if (!ws) {
    return {
      agentSessions: 0,
      agentMessages: 0,
      mcpToolCalls: 0,
      pullRequests: 0,
      pipeline: {
        total: 0,
        submitted: 0,
        inDelivery: 0,
        awaitingApproval: 0,
        shipped: 0,
        needsAttention: 0,
      },
      deliveryTimeline: [] as Array<{ date: string; updates: number; shipped: number }>,
    };
  }

  const [sessionAgg] = await db
    .select({ sessions: count() })
    .from(agentChatSessionsTable)
    .where(eq(agentChatSessionsTable.userId, userId));

  const sessions = await db
    .select({
      messages: agentChatSessionsTable.messages,
      toolMemory: agentChatSessionsTable.toolMemory,
    })
    .from(agentChatSessionsTable)
    .where(eq(agentChatSessionsTable.userId, userId));

  let agentMessages = 0;
  let mcpToolCalls = 0;
  for (const session of sessions) {
    agentMessages += session.messages?.length ?? 0;
    mcpToolCalls += session.toolMemory?.length ?? 0;
  }

  const orgRepos = await db.query.repositories.findMany({
    where: eq(repositories.organizationId, ws.organization.id),
    columns: { id: true },
  });
  const repoIds = orgRepos.map((r) => r.id);
  let pullRequestCount = 0;
  if (repoIds.length > 0) {
    const prRows = await db
      .select({ id: pullRequests.id })
      .from(pullRequests)
      .where(inArray(pullRequests.repositoryId, repoIds));
    pullRequestCount = prRows.length;
  }

  const pipeline = await getPipelineSummary(ws.project.id);
  const deliveryTimeline = await getDeliveryActivityTimeline(ws.project.id);

  return {
    agentSessions: Number(sessionAgg?.sessions ?? 0),
    agentMessages,
    mcpToolCalls,
    pullRequests: pullRequestCount,
    pipeline,
    deliveryTimeline,
  };
}
