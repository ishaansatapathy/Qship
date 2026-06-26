"use client";

import { authClient } from "~/lib/auth-client";

/** BetterAuth session for ShipFlow shell. */
export function useQshipUser() {
  const { data, isPending, error } = authClient.useSession();

  const user = data?.user
    ? {
        displayName: data.user.name,
        fullName: data.user.name,
        email: data.user.email,
        emailVerified: data.user.emailVerified,
        twoFactorEnabled: false,
        profileImageUrl: data.user.image ?? null,
      }
    : null;

  return {
    user,
    isLoading: isPending,
    isError: Boolean(error),
  };
}

export function initials(name: string | null | undefined, email: string) {
  const source = name?.trim() || email;
  const parts = source.split(/[\s@._-]+/).filter(Boolean);
  if (parts.length === 0) return "S";
  if (parts.length === 1) return parts[0]!.slice(0, 2).toUpperCase();
  return (parts[0]![0]! + parts[1]![0]!).toUpperCase();
}
