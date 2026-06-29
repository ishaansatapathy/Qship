import { logger } from "@repo/logger";

import { ServiceError } from "../errors";

function readPostgresCode(error: unknown): string | undefined {
  if (!error || typeof error !== "object") return undefined;
  const direct = error as { code?: unknown; cause?: unknown };
  if (typeof direct.code === "string") return direct.code;
  if (direct.cause && typeof direct.cause === "object") {
    const nested = direct.cause as { code?: unknown };
    if (typeof nested.code === "string") return nested.code;
  }
  return undefined;
}

function readHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== "object") return undefined;
  const status = (error as { status?: unknown }).status;
  return typeof status === "number" ? status : undefined;
}

/** Maps Octokit / Postgres failures to actionable ServiceErrors for repo sync. */
export function rethrowGithubSyncError(error: unknown, operation = "installation.sync"): never {
  if (error instanceof ServiceError) throw error;

  const status = readHttpStatus(error);
  if (status === 401 || status === 403) {
    throw new ServiceError(
      "PRECONDITION_FAILED",
      "GitHub App cannot access this installation. Check repository permissions and reinstall the app if needed.",
    );
  }
  if (status === 404) {
    throw new ServiceError(
      "NOT_FOUND",
      "GitHub installation not found. Disconnect and connect GitHub again from Settings.",
    );
  }

  if (readPostgresCode(error) === "23505") {
    throw new ServiceError(
      "CONFLICT",
      "A repository is already linked to another workspace. Disconnect GitHub there first, then sync again.",
    );
  }

  logger.error(`github.${operation}_failed`, {
    message: error instanceof Error ? error.message : String(error),
    status,
    postgresCode: readPostgresCode(error),
    stack: error instanceof Error ? error.stack : undefined,
  });
  throw error;
}
