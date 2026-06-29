#!/usr/bin/env node
/**
 * Verify SHIP_DEPLOY_WEBHOOK_URL without shipping a feature.
 * Usage:
 *   node scripts/test-ship-deploy-webhook.mjs              # status only
 *   node scripts/test-ship-deploy-webhook.mjs --trigger    # POST (starts real deploy!)
 */
const url = process.env.SHIP_DEPLOY_WEBHOOK_URL?.trim();
const trigger = process.argv.includes("--trigger");

if (!url) {
  console.error("✗ SHIP_DEPLOY_WEBHOOK_URL is not set.");
  console.error("  Set it in Railway API variables or export locally, then retry.");
  console.error("  See deploy/SHIP_DEPLOY_SETUP.md");
  process.exit(1);
}

let host;
try {
  host = new URL(url).host;
} catch {
  console.error("✗ SHIP_DEPLOY_WEBHOOK_URL is not a valid URL");
  process.exit(1);
}

console.log(`✓ SHIP_DEPLOY_WEBHOOK_URL is set (host: ${host})`);

if (!trigger) {
  console.log("");
  console.log("Dry run only. To fire the hook (starts a real deploy):");
  console.log("  node scripts/test-ship-deploy-webhook.mjs --trigger");
  process.exit(0);
}

console.log("");
console.log("⚠️  Triggering deploy webhook…");

const res = await fetch(url, {
  method: "POST",
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify({
    event: "feature.shipped",
    featureId: "manual-probe",
    featureTitle: "Manual ship deploy webhook test",
    organizationId: "probe",
    prUrl: null,
    merged: false,
    shippedAt: new Date().toISOString(),
    probe: true,
  }),
});

if (!res.ok) {
  console.error(`✗ Webhook returned HTTP ${res.status}`);
  const text = await res.text().catch(() => "");
  if (text) console.error(text.slice(0, 500));
  process.exit(1);
}

console.log(`✓ Webhook OK (HTTP ${res.status})`);
console.log("  Check Vercel → Deployments for a new build.");
