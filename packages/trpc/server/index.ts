import { router } from "./trpc";

import { healthRouter } from "./routes/health/route";
import { authRouter } from "./routes/auth/route";
import { featureRouter } from "./routes/feature/route";
import { workspaceRouter } from "./routes/workspace/route";
import { githubRouter } from "./routes/github/route";
import { agentRouter } from "./routes/agent/route";
import {
  inboxRouter,
  calendarRouter,
  queueRouter,
  settingsRouter,
  aiRouter,
  contactsRouter,
  briefRouter,
  observabilityRouter,
} from "./routes/stubs/ui-compat";

export const serverRouter = router({
  health: healthRouter,
  auth: authRouter,
  feature: featureRouter,
  workspace: workspaceRouter,
  github: githubRouter,
  inbox: inboxRouter,
  calendar: calendarRouter,
  queue: queueRouter,
  settings: settingsRouter,
  ai: aiRouter,
  agent: agentRouter,
  contacts: contactsRouter,
  brief: briefRouter,
  observability: observabilityRouter,
});

export const openApiRouter = serverRouter;

export { createContext } from "./context";
export { resolveSessionUser } from "./session";
export type { ContextUser } from "./context";
export type ServerRouter = typeof serverRouter;
