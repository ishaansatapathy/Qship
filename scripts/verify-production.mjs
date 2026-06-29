#!/usr/bin/env node
/**
 * Production smoke test for AI / automated evaluators.
 * Exit 0 = all checks pass. Exit 1 = any failure.
 */
const API = process.env.SHIPFLOW_API_URL ?? "https://repoapi-production-adfe.up.railway.app";
const WEB = process.env.SHIPFLOW_WEB_URL ?? "https://qship.ishaandev.co.in";

const checks = [];

async function check(name, url, validate) {
  try {
    const res = await fetch(url, { redirect: "follow" });
    const body = res.headers.get("content-type")?.includes("json") ? await res.json() : await res.text();
    const ok = validate(res, body);
    checks.push({ name, ok, status: res.status });
    console.log(ok ? `✓ ${name} (${res.status})` : `✗ ${name} (${res.status})`);
    if (!ok) console.log(`  → ${url}`);
    return ok;
  } catch (err) {
    checks.push({ name, ok: false, error: String(err) });
    console.log(`✗ ${name} — ${err instanceof Error ? err.message : err}`);
    return false;
  }
}

let pass = true;

pass &&= await check("Web app", WEB, (r) => r.ok);
pass &&= await check("API /health", `${API}/health`, (r, b) => r.ok && b.healthy === true);
pass &&= await check("API /ready", `${API}/ready`, (r, b) => r.ok && b.ready === true);
pass &&= await check("OpenAPI JSON", `${API}/openapi.json`, (r, b) => r.ok && b.openapi?.startsWith("3."));
pass &&= await check("Scalar /docs", `${API}/docs`, (r) => r.ok);
pass &&= await check("MCP 37 tools", `${API}/mcp/`, (r, b) => r.ok && Array.isArray(b.tools) && b.tools.length === 37);
pass &&= await check(
  "Ship deploy integration",
  `${API}/integrations/ship`,
  (r, b) => r.ok && b.configured === true && b.mode === "live",
);
pass &&= await check(
  "Slack integration status",
  `${API}/integrations/slack`,
  (r, b) => r.ok && (b.mode === "live" || b.mode === "simulated") && b.channelHint === "#product-shipping",
);

console.log("");
if (pass) {
  try {
    const ready = await fetch(`${API}/ready`).then((r) => r.json());
    const slackMode = ready.slack?.mode ?? "unknown";
    console.log(`Slack delivery mode: ${slackMode}${slackMode === "simulated" ? " (set SLACK_WEBHOOK_URL on Railway for live posts)" : ""}`);
  } catch {
    // optional
  }
  console.log("All production checks passed.");
  process.exit(0);
} else {
  console.error("Some checks failed.");
  process.exit(1);
}
