import { authClient } from "./auth-client";

/** Clear BetterAuth session and hard-navigate (clears React Query / tRPC cache). */
export async function signOutShipflow(redirectTo = "/") {
  await authClient.signOut();
  window.location.assign(redirectTo);
}
