import { ServiceError } from "../errors";

import type { ShipflowToolContext } from "./definitions";
import { SHIPFLOW_TOOL_HANDLERS } from "./handlers/registry";

export async function executeShipflowTool(
  ctx: ShipflowToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const handler = SHIPFLOW_TOOL_HANDLERS[name];
  if (!handler) {
    throw new ServiceError("NOT_FOUND", `Unknown Qship tool: ${name}`);
  }
  return handler(ctx, args);
}
