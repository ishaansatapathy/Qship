import { logger } from "@repo/logger";

import type { Octokit } from "@octokit/rest";

export type RepoFileSnippet = {
  path: string;
  excerpt: string;
};

const SKIP_PATH_RE =
  /(?:^|\/)(?:node_modules|dist|build|\.next|coverage|vendor|pnpm-lock|package-lock)(?:\/|$)/i;

/**
 * Pulls a small, task-relevant slice of a linked GitHub repo for codebase-aware
 * task walkthroughs. Uses code search first, then falls back to common source paths.
 */
export async function fetchRepoSnippetsForTask(
  octokit: Octokit,
  owner: string,
  repo: string,
  taskTitle: string,
  taskDescription: string,
  maxFiles = 6,
): Promise<RepoFileSnippet[]> {
  const keywords = [...taskTitle.split(/\W+/), ...taskDescription.split(/\W+/)]
    .map((w) => w.trim().toLowerCase())
    .filter((w) => w.length > 3)
    .slice(0, 6);

  const snippets: RepoFileSnippet[] = [];
  const seen = new Set<string>();

  const pushFile = async (path: string) => {
    if (seen.has(path) || snippets.length >= maxFiles) return;
    if (SKIP_PATH_RE.test(path)) return;
    seen.add(path);
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path });
      if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return;
      const raw = Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf8").toString(
        "utf8",
      );
      snippets.push({
        path,
        excerpt: raw.slice(0, 3500),
      });
    } catch (error) {
      logger.debug("repo_context.file_fetch_failed", {
        owner,
        repo,
        path,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  };

  for (const keyword of keywords) {
    if (snippets.length >= maxFiles) break;
    try {
      const { data } = await octokit.rest.search.code({
        q: `${keyword} repo:${owner}/${repo}`,
        per_page: 3,
      });
      for (const item of data.items ?? []) {
        await pushFile(item.path);
        if (snippets.length >= maxFiles) break;
      }
    } catch {
      // Code search may be unavailable on private repos without indexing — fall through.
    }
  }

  if (snippets.length === 0) {
    const fallbacks = [
      "README.md",
      "package.json",
      "apps/api/src/index.ts",
      "packages/services/feature-request.ts",
    ];
    for (const path of fallbacks) {
      await pushFile(path);
      if (snippets.length >= 2) break;
    }
  }

  return snippets;
}
