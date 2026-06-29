import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { authRouter } from "./routes/auth/route";
import { featureRouter } from "./routes/feature/route";
import { workspaceRouter } from "./routes/workspace/route";
import { githubRouter } from "./routes/github/route";
import { agentRouter } from "./routes/agent/route";
import { observabilityRouter } from "./routes/observability/route";
import { billingRouter } from "./routes/billing/route";
import {
  inboxRouter,
  calendarRouter,
  queueRouter,
  settingsRouter,
  aiRouter,
  contactsRouter,
  briefRouter,
} from "./routes/stubs/ui-compat";

const coreRouter = {
  health: healthRouter,
  auth: authRouter,
  feature: featureRouter,
  workspace: workspaceRouter,
  github: githubRouter,
  agent: agentRouter,
  observability: observabilityRouter,
  billing: billingRouter,
};

const legacyStubRouter = {
  inbox: inboxRouter,
  calendar: calendarRouter,
  queue: queueRouter,
  settings: settingsRouter,
  ai: aiRouter,
  contacts: contactsRouter,
  brief: briefRouter,
};

/** Full tRPC surface (legacy stubs return NOT_FOUND in production — see ui-compat). */
export const serverRouter = router({
  ...coreRouter,
  ...legacyStubRouter,
});

/** OpenAPI surface — production APIs only (no legacy Gmail/calendar stubs). */
export const openApiRouter = router({
  ...coreRouter,
});

export { createContext } from "./context";
export { resolveSessionUser } from "./session";
export type { ContextUser } from "./context";
export type ServerRouter = typeof serverRouter;
