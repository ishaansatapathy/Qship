import { redirect } from "next/navigation";

/** Redirect — ShipFlow uses Requests for delivery tracking. */
export default function CalendarPage() {
  redirect("/requests");
}
