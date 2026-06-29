import { SHIPFLOW_MCP_TOOLS } from "./definitions";

export function isShipflowTool(name: string): boolean {
  return SHIPFLOW_MCP_TOOLS.some((t) => t.name === name);
}

/** Prefix for feature-request focus stored in session focusContextId. */
export const FEATURE_FOCUS_PREFIX = "feature:";

export function isFeatureFocusId(value: string | undefined): boolean {
  return Boolean(value?.startsWith(FEATURE_FOCUS_PREFIX));
}

export function toFeatureFocusId(featureId: string): string {
  return `${FEATURE_FOCUS_PREFIX}${featureId}`;
}

export function fromFeatureFocusId(value: string): string {
  return value.startsWith(FEATURE_FOCUS_PREFIX) ? value.slice(FEATURE_FOCUS_PREFIX.length) : value;
}
