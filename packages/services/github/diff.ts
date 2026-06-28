import type { Octokit } from "@octokit/rest";

export type PullRequestFileChange = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
  /** Raw unified diff hunk, absent for binary or large files. */
  patch?: string;
};

export type PullRequestDiff = {
  owner: string;
  repo: string;
  pullNumber: number;
  headSha: string;
  baseBranch: string;
  title: string;
  body: string;
  /** All changed files (may include binary files without a patch). */
  files: PullRequestFileChange[];
  /** Unified diff text, truncated to fit the AI model context window. */
  diffText: string;
  /** True when the diff was truncated due to size limits. */
  truncated: boolean;
};

// ── Limits ────────────────────────────────────────────────────────────────────

/**
 * Maximum characters of unified diff sent to the AI.
 * ~24k chars ≈ ~6k tokens — well within gpt-4o's 128k context.
 */
const MAX_TOTAL_DIFF_CHARS = 24_000;

/**
 * Maximum patch chars kept per file before it is truncated individually.
 * This preserves breadth (many files) over depth (one huge file).
 */
const MAX_PER_FILE_PATCH_CHARS = 4_000;

/**
 * File extensions that are binary / generated and add no value to code review.
 * Patches are still listed so the reviewer knows they changed.
 */
const BINARY_OR_GENERATED_EXTENSIONS = new Set([
  ".png", ".jpg", ".jpeg", ".gif", ".webp", ".svg", ".ico",
  ".pdf", ".zip", ".tar", ".gz", ".wasm", ".lock", ".sum",
  ".min.js", ".min.css", ".map",
]);

function isBinaryOrGenerated(filename: string): boolean {
  return BINARY_OR_GENERATED_EXTENSIONS.has(
    filename.includes(".") ? filename.slice(filename.lastIndexOf(".")) : "",
  );
}

function truncatePatch(patch: string, maxChars: number): string {
  if (patch.length <= maxChars) return patch;
  return `${patch.slice(0, maxChars)}\n… [patch truncated — ${patch.length - maxChars} chars omitted]`;
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Fetches a fully paginated pull request diff from GitHub and assembles it
 * into a structured object suitable for AI review.
 *
 * Files are paginated (no 100-file ceiling), binary/generated files are noted
 * but their patches are omitted, and the total diff is truncated gracefully so
 * it always fits the AI model context window.
 */
export async function fetchPullRequestDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullRequestDiff> {
  const [{ data: pr }, rawFiles] = await Promise.all([
    octokit.rest.pulls.get({ owner, repo, pull_number: pullNumber }),
    octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: pullNumber,
      per_page: 100,
    }),
  ]);

  const files: PullRequestFileChange[] = rawFiles.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: isBinaryOrGenerated(f.filename) ? undefined : (f.patch ?? undefined),
  }));

  // Build per-file diff sections, truncating large patches early.
  const sections: string[] = [];
  let totalChars = 0;
  let truncated = false;

  for (const f of files) {
    const header = `--- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`;

    let section: string;
    if (!f.patch) {
      section = `${header}\n(binary or generated — patch omitted)`;
    } else {
      const truncatedPatch = truncatePatch(f.patch, MAX_PER_FILE_PATCH_CHARS);
      section = `${header}\n${truncatedPatch}`;
    }

    if (totalChars + section.length > MAX_TOTAL_DIFF_CHARS) {
      const remaining = MAX_TOTAL_DIFF_CHARS - totalChars;
      if (remaining > 200) {
        sections.push(`${section.slice(0, remaining)}\n… [diff truncated]`);
      }
      truncated = true;
      break;
    }

    sections.push(section);
    totalChars += section.length;
  }

  if (truncated) {
    const skipped = files.length - sections.length;
    sections.push(
      `\n… [${skipped} file${skipped === 1 ? "" : "s"} omitted — diff size limit reached]`,
    );
  }

  return {
    owner,
    repo,
    pullNumber,
    headSha: pr.head.sha,
    baseBranch: pr.base.ref,
    title: pr.title,
    body: pr.body ?? "",
    files,
    diffText: sections.join("\n\n"),
    truncated,
  };
}
