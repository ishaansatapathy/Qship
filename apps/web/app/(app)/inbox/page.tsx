import { redirect } from "next/navigation";

/** Redirect — ShipFlow uses Feature Requests. */
export default function InboxPage() {
  redirect("/requests");
}
