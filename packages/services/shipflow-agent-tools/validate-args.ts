import { SHIPFLOW_MCP_TOOLS } from "./definitions";

const UUID_ARG_KEYS = new Set([
  "id",
  "issueId",
  "taskId",
  "repositoryId",
  "currentTaskId",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type JsonSchemaProperty = {
  type?: string;
  enum?: unknown[];
};

export type ToolArgValidationResult =
  | { valid: true }
  | { valid: false; error: string };

/**
 * Validates MCP/agent tool arguments against the shared JSON Schema definitions
 * before handlers run — blocks unknown keys, type mismatches, and malformed UUIDs.
 */
export function validateShipflowToolArgs(
  toolName: string,
  args: Record<string, unknown>,
): ToolArgValidationResult {
  const def = SHIPFLOW_MCP_TOOLS.find((tool) => tool.name === toolName);
  if (!def) {
    return { valid: false, error: `Unknown tool: ${toolName}` };
  }

  const schema = def.inputSchema;
  const properties = (schema.properties ?? {}) as Record<string, JsonSchemaProperty>;
  const required = (schema.required as string[]) ?? [];

  for (const field of required) {
    const value = args[field];
    if (value === undefined || value === null) {
      return { valid: false, error: `Missing required argument: ${field}` };
    }
  }

  for (const key of Object.keys(args)) {
    if (!(key in properties)) {
      return { valid: false, error: `Unexpected argument: ${key}` };
    }
  }

  for (const [key, value] of Object.entries(args)) {
    const prop = properties[key];
    if (!prop?.type) continue;

    if (prop.type === "string") {
      if (typeof value !== "string") {
        return { valid: false, error: `${key} must be a string` };
      }
      if (value.length > 50_000) {
        return { valid: false, error: `${key} is too long` };
      }
      if (UUID_ARG_KEYS.has(key) && !UUID_RE.test(value)) {
        return { valid: false, error: `${key} must be a valid UUID` };
      }
      if (prop.enum && !prop.enum.includes(value)) {
        return { valid: false, error: `${key} has an invalid value` };
      }
    } else if (prop.type === "number") {
      if (typeof value !== "number" || Number.isNaN(value)) {
        return { valid: false, error: `${key} must be a number` };
      }
    } else if (prop.type === "boolean") {
      if (typeof value !== "boolean") {
        return { valid: false, error: `${key} must be a boolean` };
      }
    } else if (prop.type === "object") {
      if (value !== null && typeof value !== "object") {
        return { valid: false, error: `${key} must be an object` };
      }
    }
  }

  return { valid: true };
}
