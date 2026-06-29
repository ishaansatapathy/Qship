import { z } from "./schema";

/** OpenAPI-safe catch-all — use `z.any()` so tRPC client types stay usable */
export const openApiResponse = z.any();

export const workspaceOutput = z
  .object({
    organizationId: z.string(),
    organizationName: z.string(),
    projectId: z.string(),
    projectName: z.string(),
    role: z.string(),
  })
  .nullable();

export const pipelineSummaryOutput = z.object({
  total: z.number(),
  submitted: z.number(),
  inDelivery: z.number(),
  awaitingApproval: z.number(),
  shipped: z.number(),
  needsAttention: z.number(),
});

export const intakeSummaryOutput = z.object({
  total: z.number(),
  manual: z.number(),
  email: z.number(),
  support_ticket: z.number(),
  customer_call: z.number(),
  api: z.number(),
});

export const agentStatusOutput = z.object({
  configured: z.boolean(),
  model: z.string(),
  ready: z.boolean(),
});

export const billingStatusOutput = z.object({
  razorpayConfigured: z.boolean(),
  ready: z.boolean(),
});

export const githubInstallUrlOutput = z.object({
  url: z.string().nullable(),
  configured: z.boolean(),
});

export const githubConnectionOutput = z.object({
  connected: z.boolean(),
  configured: z.boolean(),
  accountLogin: z.string().nullable(),
  installationId: z.string().nullable().optional(),
  repositoryCount: z.number(),
});

export const githubRepoListOutput = z.array(
  z.object({
    id: z.string(),
    fullName: z.string(),
    defaultBranch: z.string(),
    owner: z.string(),
    name: z.string(),
  }),
);

export const cancelWorkflowOutput = z.object({
  cancelled: z.number(),
});
