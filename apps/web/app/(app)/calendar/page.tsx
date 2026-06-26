import { redirect } from "next/navigation";

/** Legacy Thread calendar view — ShipFlow uses Requests for delivery tracking. */
export default function CalendarPage() {
  redirect("/requests");
}
