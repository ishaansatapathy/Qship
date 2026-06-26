import type { Octokit } from "@octokit/rest";

export type PullRequestFileChange = {
  filename: string;
  status: string;
  additions: number;
  deletions: number;
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
  files: PullRequestFileChange[];
  /** Truncated unified diff text for AI context */
  diffText: string;
};

const MAX_PATCH_CHARS = 24_000;

export async function fetchPullRequestDiff(
  octokit: Octokit,
  owner: string,
  repo: string,
  pullNumber: number,
): Promise<PullRequestDiff> {
  const { data: pr } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: pullNumber,
  });

  const { data: files } = await octokit.rest.pulls.listFiles({
    owner,
    repo,
    pull_number: pullNumber,
    per_page: 100,
  });

  const mapped: PullRequestFileChange[] = files.map((f) => ({
    filename: f.filename,
    status: f.status,
    additions: f.additions,
    deletions: f.deletions,
    patch: f.patch ?? undefined,
  }));

  let diffText = mapped
    .map((f) => {
      const header = `--- ${f.filename} (${f.status}, +${f.additions}/-${f.deletions})`;
      return f.patch ? `${header}\n${f.patch}` : `${header}\n(no patch)`;
    })
    .join("\n\n");

  if (diffText.length > MAX_PATCH_CHARS) {
    diffText = `${diffText.slice(0, MAX_PATCH_CHARS)}\n\n… [diff truncated for model context]`;
  }

  return {
    owner,
    repo,
    pullNumber,
    headSha: pr.head.sha,
    baseBranch: pr.base.ref,
    title: pr.title,
    body: pr.body ?? "",
    files: mapped,
    diffText,
  };
}
