import { ServiceError } from "../errors";
import { assertFeatureInUserWorkspace } from "../feature-request";

export function featureSummary(row: {
  id: string;
  title: string;
  status: string;
  rawRequest: string;
  metadata?: Record<string, unknown> | null;
}) {
  const triage = row.metadata?.triage as Record<string, unknown> | undefined;
  return {
    id: row.id,
    title: row.title,
    status: row.status,
    excerpt: row.rawRequest.slice(0, 200),
    priority: triage?.priority ?? null,
    category: triage?.category ?? null,
  };
}

export async function loadAuthorizedFeature(userId: string, id: string) {
  const trimmed = id.trim();
  if (!trimmed) throw new ServiceError("BAD_REQUEST", "id is required");
  return assertFeatureInUserWorkspace(userId, trimmed);
}
