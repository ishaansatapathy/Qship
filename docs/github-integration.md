# GitHub Integration Guide

Qship integrates with GitHub via a **GitHub App** (not OAuth tokens). This gives per-installation scoped permissions, webhook delivery, and the ability to post review comments as the Qship bot identity.

---

## What the integration does

| Event / Action | What Qship does |
|---------------|-----------------|
| App installed on GitHub org/user | Repos synced, installation ID stored |
| `push` to `shipflow/<feature-uuid>` branch | Branch auto-links to feature |
| `pull_request.opened` | PR row created, linked to feature, AI review triggered |
| `pull_request.synchronize` | PR diff invalidated, re-review queued |
| `pull_request.closed` (merged) | Feature status → `human_review` |
| `issues.opened` | GitHub issue → Qship feature (AI triage, labels issue, posts link-back comment) |
| `installation.deleted` | Org disconnected gracefully (installation row suspended) |
| AI review runs | Structured comment posted on PR (upserted — not duplicated) |
| Blocking issues with file paths | Inline diff annotations posted via `pulls.createReview` |
| AI auto-fix patches | Separate PR comment with copy-pasteable unified diff patches |
| Feature shipped (PR merged) | GitHub Release created with AI-generated release notes |

---

## Setup (5 minutes)

### 1. Create a GitHub App

1. Go to **GitHub → Settings → Developer settings → GitHub Apps → New GitHub App**
2. Fill in:
   - **App name:** `Qship` (or your preferred name)
   - **Homepage URL:** `https://qship.ishaandev.co.in`
   - **Webhook URL:** `https://repoapi-production-adfe.up.railway.app/webhooks/github`
   - **Webhook secret:** Generate a random 32-char string (save it — you'll need it)

3. **Permissions (Repository):**
   - Contents: **Read & Write** (to push branches and create releases)
   - Pull requests: **Read & Write** (to create review comments)
   - Issues: **Read & Write** (to label and comment on issues)
   - Metadata: **Read** (required)

4. **Subscribe to events:**
   - `Push`
   - `Pull request`
   - `Issues`
   - `Installation`
   - `Installation repositories`

5. **Where can this GitHub App be installed?** → `Any account` (or `Only on this account` for private use)

6. Click **Create GitHub App**

### 2. Generate a private key

On the App settings page → **Generate a private key** → download the `.pem` file.

### 3. Note your App ID and slug

- **App ID** — shown on the settings page (numeric)
- **App slug** — the URL-safe name shown in the app URL (e.g. `qship-bot`)

### 4. Set environment variables

**Railway (API):**

```env
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIEo...\n-----END RSA PRIVATE KEY-----\n"
GITHUB_APP_SLUG=qship-bot
GITHUB_WEBHOOK_SECRET=your-32-char-random-secret
```

> **Tip for private key:** Replace newlines with `\n` for single-line env var, or use Railway's multiline env editor.

**Local `.env`:** Same variables.

### 5. Install the App on your GitHub org/repo

1. Go to `https://github.com/apps/<your-app-slug>` → **Install**
2. Choose which repositories to grant access to
3. After install, you'll be redirected — the installation is stored automatically when Qship receives the `installation.created` webhook

### 6. Connect from Qship Settings

1. Log in to Qship
2. Go to **Settings → GitHub**
3. Click **Connect GitHub** — this triggers a repository sync via paginated Octokit calls
4. Repositories appear in the list within seconds

---

## How branch linking works

Qship generates branches in the format `shipflow/<feature-uuid>`. When a PR is opened from such a branch, the webhook handler extracts the feature UUID and links the PR automatically:

```typescript
// apps/api/src/github-webhook.ts
const match = pr.head.ref.match(/^shipflow\/([0-9a-f-]{36})$/);
if (match) {
  const featureId = match[1];
  // link PR to feature
}
```

This means developers (or the AI code implementation agent) just need to create branches with this naming convention — no manual linking required.

### Push events (local / CI commits)

When code is pushed to `shipflow/<feature-uuid>` (without opening a new PR):

1. GitHub sends a `push` webhook
2. Qship extracts the feature UUID from the branch name
3. Activity is logged on the feature timeline
4. If an **open PR** already exists for that feature → head SHA is updated and **AI re-review is queued** (same as `pull_request.synchronize`)
5. If no PR exists yet → feature moves to `in_development` when appropriate; open a PR to trigger the first AI review

This is how laptop pushes and `git push origin shipflow/<uuid>` stay in sync with Qship without extra UI steps.

---

## Webhook security

Every incoming webhook is verified before processing:

```typescript
const sig = req.headers["x-hub-signature-256"];
const expected = "sha256=" + createHmac("sha256", GITHUB_WEBHOOK_SECRET)
  .update(rawBody).digest("hex");

if (!timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
  return res.status(401).json({ error: "invalid_signature" });
}
```

Key points:
- `timingSafeEqual` prevents timing-based signature forgery
- `rawBody` is captured before any JSON parsing (body-transform attacks prevented)
- `x-github-delivery` header stored → duplicate delivery detection

---

## Webhook outbox (reliability)

If a webhook event arrives while the database is temporarily unavailable or a handler throws an unexpected error, it is stored in the `github_webhook_outbox` table and retried by the 2-minute Inngest cron.

```
github_webhook_outbox
  delivery_id  (UNIQUE — prevents double-processing)
  event        (pull_request, issues, etc.)
  payload      (full body)
  delivered    (boolean)
  attempts     (retry count)
  last_error   (last failure reason)
```

---

## PR review comment format

The main AI review comment is posted (and upserted via `x-shipflow-review` sentinel) in this format:

```
## 🤖 Qship AI Review — Iteration N

> Verdict: PASS ✓ / FAIL ✗ · Severity: low/medium/high

### Summary
...

### Checklist
| Dimension | Result | Note |
|-----------|--------|------|
| Requirements fit | ✅ PASS | All 4 acceptance criteria satisfied |
| Security | ❌ FAIL | Missing authentication on /upload endpoint |
...

### Blocking Issues
1. **[security] Missing auth guard** (src/api/upload.ts:45) ...
```

If the review has blocking issues with `filePath` + `lineNumber`, a separate `pulls.createReview` call posts them as **inline diff annotations** — reviewers see them directly in the diff view.

If blocking issues have file paths, a third comment is posted: **🔧 AI Auto-Fix patches** with copy-pasteable unified diffs.

---

## GitHub Release creation

When a feature is shipped (PR merged + human approved):

1. `generateReleaseNotes` is called with the PRD content and PR diff summary
2. A version tag is derived (semantic version from AI, or `qship-<feature-id-prefix>` as fallback)
3. `octokit.rest.repos.createRelease` creates the release on the merged PR's repo
4. A link to the release appears in the feature delivery timeline

All three steps are fire-and-forget — they do not block the ship operation.

---

## Issues auto-intake

When a GitHub issue is opened on a connected repo:

1. The `issues.opened` webhook fires
2. `processGithubIssueWebhook` runs:
   - Finds the Qship org by installation ID
   - Creates a feature request with `source: "github_issue"`
   - Runs AI triage (`triageFeatureRequest`)
   - Labels the GitHub issue as `qship-imported`
   - Posts a link-back comment: "This issue has been imported into Qship: [link]"
3. The feature appears in the Qship pipeline like any other request

---

## Troubleshooting

| Problem | Check |
|---------|-------|
| Repos not appearing after connect | Verify `GITHUB_APP_SLUG` matches exactly; check Railway logs for `github.installation` events |
| Webhooks not firing | Confirm webhook URL in GitHub App settings; check `x-hub-signature-256` header is present |
| Review comments not posted | Confirm `GITHUB_APP_PRIVATE_KEY` has correct newlines; check Railway logs for `pr_review.github_comment_failed` |
| `400 Bad credentials` from Octokit | Private key may be malformed; regenerate and re-set the env var |
| PRs not auto-linking to features | Confirm branch name follows `shipflow/<uuid>` pattern exactly |
