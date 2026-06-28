import crypto from "node:crypto";

import { logger } from "@repo/logger";

import type { Octokit } from "@octokit/rest";

import { cacheGet, cacheSet } from "../cache/kv-store";
import { withRetry } from "../cache/retry";

export type RepoFileSnippet = {
  path: string;
  excerpt: string;
};

const SKIP_PATH_RE =
  /(?:^|\/)(?:node_modules|dist|build|\.next|coverage|vendor|\.git|pnpm-lock|package-lock)(?:\/|$)/i;

const BINARY_EXT_RE =
  /\.(?:png|jpe?g|gif|webp|ico|svg|pdf|zip|tar|gz|woff2?|ttf|eot|mp4|mp3|lock)$/i;

const SOURCE_EXT_RE = /\.(?:ts|tsx|js|jsx|py|go|rs|java|rb|php|cs|sql|md|json|yaml|yml|toml)$/i;

const STOP_WORDS = new Set([
  "about",
  "after",
  "also",
  "back",
  "been",
  "before",
  "being",
  "both",
  "create",
  "each",
  "from",
  "have",
  "into",
  "just",
  "make",
  "more",
  "must",
  "need",
  "only",
  "should",
  "task",
  "that",
  "their",
  "them",
  "then",
  "there",
  "these",
  "this",
  "through",
  "using",
  "when",
  "will",
  "with",
  "work",
  "your",
]);

const MAX_FILE_BYTES = 120_000;
const MAX_EXCERPT_CHARS = 3_500;
const MAX_SEARCH_KEYWORDS = 4;
const SNIPPET_CACHE_TTL_MS = 15 * 60 * 1000;

/** Exported for unit tests. */
export function extractTaskKeywords(title: string, description: string, max = MAX_SEARCH_KEYWORDS): string[] {
  const raw = `${title} ${description}`.toLowerCase().split(/\W+/);
  const seen = new Set<string>();
  const keywords: string[] = [];

  for (const word of raw) {
    const w = word.trim();
    if (w.length < 4 || STOP_WORDS.has(w) || seen.has(w)) continue;
    seen.add(w);
    keywords.push(w);
    if (keywords.length >= max) break;
  }

  return keywords;
}

function snippetCacheKey(owner: string, repo: string, title: string, description: string): string {
  const digest = crypto
    .createHash("sha256")
    .update(`${owner}/${repo}:${title}:${description}`)
    .digest("hex")
    .slice(0, 24);
  return `repo_snippets:${digest}`;
}

function scoreTreePath(path: string, keywords: string[]): number {
  if (SKIP_PATH_RE.test(path) || BINARY_EXT_RE.test(path)) return -1;
  const lower = path.toLowerCase();
  let score = SOURCE_EXT_RE.test(path) ? 2 : 0;
  if (lower.endsWith("readme.md")) score += 3;
  if (lower.endsWith("package.json")) score += 2;
  for (const kw of keywords) {
    if (lower.includes(kw)) score += 3;
  }
  return score;
}

async function fetchFileSnippet(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
): Promise<RepoFileSnippet | null> {
  if (SKIP_PATH_RE.test(path) || BINARY_EXT_RE.test(path)) return null;

  try {
    const { data } = await withRetry(
      () => octokit.rest.repos.getContent({ owner, repo, path }),
      { label: "repos.getContent", maxAttempts: 3 },
    );
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
    if (typeof data.size === "number" && data.size > MAX_FILE_BYTES) {
      logger.debug("repo_context.file_skipped_large", { owner, repo, path, size: data.size });
      return null;
    }

    const raw = Buffer.from(data.content, data.encoding === "base64" ? "base64" : "utf8").toString(
      "utf8",
    );
    return { path, excerpt: raw.slice(0, MAX_EXCERPT_CHARS) };
  } catch (error) {
    logger.debug("repo_context.file_fetch_failed", {
      owner,
      repo,
      path,
      error: error instanceof Error ? error.message : String(error),
    });
    return null;
  }
}

async function listRepoSourcePaths(octokit: Octokit, owner: string, repo: string): Promise<string[]> {
  try {
    const { data: meta } = await withRetry(() => octokit.rest.repos.get({ owner, repo }), {
      label: "repos.get",
    });
    const branch = meta.default_branch ?? "main";
    const { data: tree } = await withRetry(
      () =>
        octokit.rest.git.getTree({
          owner,
          repo,
          tree_sha: branch,
          recursive: "true",
        }),
      { label: "git.getTree" },
    );
    return (tree.tree ?? [])
      .filter((node) => node.type === "blob" && typeof node.path === "string")
      .map((node) => node.path as string);
  } catch (error) {
    logger.debug("repo_context.tree_list_failed", {
      owner,
      repo,
      error: error instanceof Error ? error.message : String(error),
    });
    return [];
  }
}

async function fetchRepoSnippetsUncached(
  octokit: Octokit,
  owner: string,
  repo: string,
  taskTitle: string,
  taskDescription: string,
  maxFiles: number,
): Promise<RepoFileSnippet[]> {
  const keywords = extractTaskKeywords(taskTitle, taskDescription);
  const snippets: RepoFileSnippet[] = [];
  const seen = new Set<string>();

  const pushPath = async (path: string) => {
    if (seen.has(path) || snippets.length >= maxFiles) return;
    seen.add(path);
    const snippet = await fetchFileSnippet(octokit, owner, repo, path);
    if (snippet) snippets.push(snippet);
  };

  for (const keyword of keywords) {
    if (snippets.length >= maxFiles) break;
    try {
      const { data } = await withRetry(
        () =>
          octokit.rest.search.code({
            q: `${keyword} repo:${owner}/${repo}`,
            per_page: 3,
          }),
        { label: "search.code", maxAttempts: 2 },
      );
      for (const item of data.items ?? []) {
        await pushPath(item.path);
        if (snippets.length >= maxFiles) break;
      }
    } catch (error) {
      logger.debug("repo_context.code_search_failed", {
        owner,
        repo,
        keyword,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  if (snippets.length < maxFiles) {
    const treePaths = await listRepoSourcePaths(octokit, owner, repo);
    const ranked = treePaths
      .map((path) => ({ path, score: scoreTreePath(path, keywords) }))
      .filter((row) => row.score > 0)
      .sort((a, b) => b.score - a.score);

    for (const row of ranked) {
      await pushPath(row.path);
      if (snippets.length >= maxFiles) break;
    }
  }

  return snippets.sort((a, b) => {
    const score = (s: RepoFileSnippet) => {
      const hay = `${s.path} ${s.excerpt}`.toLowerCase();
      return keywords.reduce((sum, kw) => sum + (hay.includes(kw) ? 1 : 0), 0);
    };
    return score(b) - score(a);
  });
}

/**
 * Pulls a small, task-relevant slice of a linked GitHub repo for codebase-aware
 * task walkthroughs. Results are cached for 15 minutes per repo + task text.
 */
export async function fetchRepoSnippetsForTask(
  octokit: Octokit,
  owner: string,
  repo: string,
  taskTitle: string,
  taskDescription: string,
  maxFiles = 6,
): Promise<RepoFileSnippet[]> {
  const cacheKey = snippetCacheKey(owner, repo, taskTitle, taskDescription);
  const cached = await cacheGet(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as RepoFileSnippet[];
    } catch {
      // Corrupt cache entry — refetch below.
    }
  }

  const snippets = await fetchRepoSnippetsUncached(
    octokit,
    owner,
    repo,
    taskTitle,
    taskDescription,
    maxFiles,
  );

  await cacheSet(cacheKey, JSON.stringify(snippets), SNIPPET_CACHE_TTL_MS);
  return snippets;
}
