import { ServiceError } from "../errors";

import type { ShipflowToolContext } from "./definitions";
import { SHIPFLOW_TOOL_HANDLERS } from "./handlers/registry";
import { validateShipflowToolArgs } from "./validate-args";

export async function executeShipflowTool(
  ctx: ShipflowToolContext,
  name: string,
  args: Record<string, unknown>,
): Promise<string> {
  const validation = validateShipflowToolArgs(name, args);
  if (!validation.valid) {
    throw new ServiceError("BAD_REQUEST", validation.error);
  }

  const handler = SHIPFLOW_TOOL_HANDLERS[name];
  if (!handler) {
    throw new ServiceError("NOT_FOUND", `Unknown Qship tool: ${name}`);
  }
  return handler(ctx, args);
}
