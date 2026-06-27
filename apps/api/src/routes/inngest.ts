import { serve } from "inngest/express";

import { inngest } from "@repo/services/inngest/client";
import { inngestFunctions } from "@repo/services/inngest/functions";

export const inngestServe = serve({
  client: inngest,
  functions: inngestFunctions,
});
