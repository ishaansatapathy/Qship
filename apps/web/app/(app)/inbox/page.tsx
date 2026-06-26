import { redirect } from "next/navigation";

/** Legacy Thread inbox — ShipFlow uses Feature Requests. */
export default function InboxPage() {
  redirect("/requests");
}
