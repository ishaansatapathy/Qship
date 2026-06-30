import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";

import { db } from "@repo/database";
import { accounts, sessions, users, verifications } from "@repo/database/schema";

import { getBetterAuthSocialProviders } from "./providers";

function requiredEnv(name: string, fallback?: string) {
  const value = process.env[name]?.trim() || fallback?.trim();
  if (!value) throw new Error(`Missing required env: ${name}`);
  return value;
}

const isProduction = process.env.NODE_ENV === "production";

export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: users,
      session: sessions,
      account: accounts,
      verification: verifications,
    },
  }),
  secret: requiredEnv("BETTER_AUTH_SECRET", process.env.JWT_SECRET),
  baseURL: requiredEnv("BETTER_AUTH_URL", process.env.CLIENT_URL ?? "http://localhost:3000"),
  trustedOrigins: [
    process.env.BETTER_AUTH_URL,
    process.env.CLIENT_URL,
    process.env.BASE_URL,
    "http://localhost:3000",
    "http://localhost:8000",
  ]
    .map((o) => o?.trim().replace(/\/$/, ""))
    .filter((o, i, arr): o is string => Boolean(o) && arr.indexOf(o) === i),
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 8,
  },
  socialProviders: getBetterAuthSocialProviders(),
  advanced: {
    cookiePrefix: "qship",
    ...(isProduction
      ? {
          defaultCookieAttributes: {
            secure: true,
            sameSite: "lax" as const,
          },
        }
      : {}),
  },
  account: {
    accountLinking: {
      enabled: true,
      allowDifferentEmailAddresses: false,
    },
  },
});

export type AuthSession = typeof auth.$Infer.Session;

export {
  getEnabledAuthProviders,
  getGoogleOAuthCredentials,
  getGithubOAuthCredentials,
  isGoogleOAuthConfigured,
  isGithubOAuthConfigured,
} from "./providers";
export type { AuthProviderKind, EnabledAuthProvider } from "./providers";
