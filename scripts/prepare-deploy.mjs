#!/usr/bin/env node
/**
 * Local deploy prep — does NOT deploy anywhere.
 * Checks .env keys and prints a production BETTER_AUTH_SECRET.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import crypto from "node:crypto";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const envPath = path.join(root, ".env");

const API_KEYS = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "GITHUB_APP_ID",
  "GITHUB_APP_PRIVATE_KEY",
  "GITHUB_APP_SLUG",
  "RAZORPAY_KEY_ID",
  "RAZORPAY_KEY_SECRET",
];

const WEB_KEYS = [
  "DATABASE_URL",
  "OPENAI_API_KEY",
  "GOOGLE_OAUTH_CLIENT_ID",
  "GOOGLE_OAUTH_CLIENT_SECRET",
  "GITHUB_CLIENT_ID",
  "GITHUB_CLIENT_SECRET",
];

/** @param {string} file */
function parseEnv(file) {
  /** @type {Map<string, string>} */
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const i = t.indexOf("=");
    if (i === -1) continue;
    map.set(t.slice(0, i).trim(), t.slice(i + 1).trim());
  }
  return map;
}

/** @param {string | undefined} v */
function isPlaceholder(v) {
  if (!v) return true;
  return /change-me|placeholder|xxxxxxxx|your_test/i.test(v);
}

const env = parseEnv(envPath);
const secret = crypto.randomBytes(32).toString("base64");

console.log("\n=== ShipFlow deploy prep (local only) ===\n");

if (!fs.existsSync(envPath)) {
  console.log("❌ .env not found — copy .env.example first\n");
  process.exit(1);
}

console.log("✅ .env found\n");

console.log("--- API keys (deploy/vercel-api.env.template) ---");
for (const k of API_KEYS) {
  const ok = env.has(k) && !isPlaceholder(env.get(k));
  console.log(`${ok ? "✅" : "⚠️ "} ${k}`);
}

console.log("\n--- Web keys (deploy/vercel-web.env.template) ---");
for (const k of WEB_KEYS) {
  const val =
    k.startsWith("GOOGLE") && !env.has(k)
      ? env.get(k.replace("GOOGLE_OAUTH_", "GOOGLE_"))
      : env.get(k);
  const ok = Boolean(val) && !isPlaceholder(val);
  console.log(`${ok ? "✅" : "⚠️ "} ${k}`);
}

const authSecret = env.get("BETTER_AUTH_SECRET");
if (isPlaceholder(authSecret)) {
  console.log("\n⚠️  BETTER_AUTH_SECRET is still placeholder — use this for Vercel WEB:\n");
  console.log(`BETTER_AUTH_SECRET=${secret}\n`);
} else {
  console.log("\n✅ BETTER_AUTH_SECRET looks set (use same on Vercel web)\n");
}

console.log("--- Next steps (you do these) ---");
console.log("1. pnpm db:seed  (if not done on Neon)");
console.log("2. Vercel: apps/api  → deploy/vercel-api.env.template");
console.log("3. Vercel: apps/web  → deploy/vercel-web.env.template");
console.log("4. Hostinger DNS     → deploy/YOU_DEPLOY.md");
console.log("5. Google/GitHub/Razorpay callbacks → DEPLOY.md Phase 4–6\n");
