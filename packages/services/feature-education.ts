import { db, desc, eq } from "@repo/database";
import { featureRequests } from "@repo/database/schema";

import { ServiceError } from "./errors";
import { createChatCompletion, isOpenAiConfigured } from "./ai/openai";

export type CapabilityEducation = {
  shouldEducate: boolean;
  matchedFeatureId: string | null;
  matchedFeatureTitle: string | null;
  matchedFeatureStatus: string | null;
  educationMessage: string;
  existingCapabilitySummary: string;
  similarityScore: number;
};

const CAPABILITY_STATUSES = ["shipped", "approved", "prd_ready", "in_development", "pr_open"] as const;

export function normalizeTitle(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function titleSimilarity(a: string, b: string) {
  const na = normalizeTitle(a);
  const nb = normalizeTitle(b);
  if (!na || !nb) return 0;
  if (na === nb) return 1;
  if (na.includes(nb) || nb.includes(na)) return 0.88;

  const wa = new Set(na.split(" ").filter((w) => w.length > 2));
  const wb = new Set(nb.split(" ").filter((w) => w.length > 2));
  if (wa.size === 0 || wb.size === 0) return 0;
  const overlap = [...wa].filter((w) => wb.has(w)).length;
  return overlap / Math.max(wa.size, wb.size, 1);
}

export async function findSimilarCapabilities(
  projectId: string,
  title: string,
  rawRequest: string,
  excludeFeatureId?: string,
) {
  const rows = await db.query.featureRequests.findMany({
    where: eq(featureRequests.projectId, projectId),
    orderBy: [desc(featureRequests.updatedAt)],
    limit: 100,
    with: { prd: true },
  });

  const candidates = rows
    .filter((row) => row.id !== excludeFeatureId)
    .filter((row) =>
      (CAPABILITY_STATUSES as readonly string[]).includes(row.status) ||
      row.status === "human_review",
    )
    .map((row) => {
      const titleScore = titleSimilarity(title, row.title);
      const requestScore = titleSimilarity(rawRequest.slice(0, 280), row.title);
      const score = Math.max(titleScore, requestScore * 0.85);
      return { row, score };
    })
    .filter((item) => item.score >= 0.45)
    .sort((a, b) => b.score - a.score);

  return candidates.slice(0, 5);
}

async function buildEducationWithAi(input: {
  title: string;
  rawRequest: string;
  candidate: {
    id: string;
    title: string;
    status: string;
    rawRequest: string;
    prdSummary?: string;
  };
}) {
  if (!isOpenAiConfigured()) {
    return {
      educationMessage: `This looks similar to "${input.candidate.title}" (${input.candidate.status}). Review that feature before building again.`,
      existingCapabilitySummary: input.candidate.rawRequest.slice(0, 240),
      shouldEducate: true,
    };
  }

  const content = await createChatCompletion(
    [
      {
        role: "system",
        content: `You are a product educator for Qship. Decide if a NEW request duplicates an EXISTING capability.
Return JSON only: {
  "shouldEducate": boolean,
  "educationMessage": "2-3 sentences explaining what already exists and where user can find it — friendly, actionable",
  "existingCapabilitySummary": "1 sentence on what the existing feature already delivers"
}
Educate (shouldEducate=true) when the new request is substantially the same capability, subset, or duplicate of existing work.
Do NOT educate for genuinely new scope, different user segment, or meaningful extension.`,
      },
      {
        role: "user",
        content: `NEW REQUEST
Title: ${input.title}
Body: ${input.rawRequest}

EXISTING FEATURE
Title: ${input.candidate.title}
Status: ${input.candidate.status}
Summary: ${input.candidate.rawRequest.slice(0, 500)}
PRD hint: ${input.candidate.prdSummary ?? "none"}`,
      },
    ],
    { jsonObject: true, temperature: 0.15 },
  );

  try {
    return JSON.parse(content) as {
      shouldEducate: boolean;
      educationMessage: string;
      existingCapabilitySummary: string;
    };
  } catch {
    throw new ServiceError("INTERNAL", "AI returned invalid education JSON.");
  }
}

export async function checkExistingCapability(input: {
  projectId: string;
  title: string;
  rawRequest: string;
  excludeFeatureId?: string;
}): Promise<CapabilityEducation> {
  const candidates = await findSimilarCapabilities(
    input.projectId,
    input.title,
    input.rawRequest,
    input.excludeFeatureId,
  );

  if (candidates.length === 0) {
    return {
      shouldEducate: false,
      matchedFeatureId: null,
      matchedFeatureTitle: null,
      matchedFeatureStatus: null,
      educationMessage: "",
      existingCapabilitySummary: "",
      similarityScore: 0,
    };
  }

  const top = candidates[0]!;
  const prd = top.row.prd?.content;
  const prdSummary = prd
    ? [prd.problemStatement, ...(prd.goals ?? []).slice(0, 2)].filter(Boolean).join(" · ")
    : undefined;

  const ai = await buildEducationWithAi({
    title: input.title,
    rawRequest: input.rawRequest,
    candidate: {
      id: top.row.id,
      title: top.row.title,
      status: top.row.status,
      rawRequest: top.row.rawRequest,
      prdSummary,
    },
  });

  if (!ai.shouldEducate && top.score < 0.72) {
    return {
      shouldEducate: false,
      matchedFeatureId: null,
      matchedFeatureTitle: null,
      matchedFeatureStatus: null,
      educationMessage: "",
      existingCapabilitySummary: "",
      similarityScore: top.score,
    };
  }

  return {
    shouldEducate: ai.shouldEducate || top.score >= 0.85,
    matchedFeatureId: top.row.id,
    matchedFeatureTitle: top.row.title,
    matchedFeatureStatus: top.row.status,
    educationMessage: ai.educationMessage,
    existingCapabilitySummary: ai.existingCapabilitySummary,
    similarityScore: top.score,
  };
}
