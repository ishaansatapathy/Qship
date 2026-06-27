import { redirect } from "next/navigation";

/** Redirect legacy calendar route to the engineering Kanban board. */
export default function CalendarPage() {
  redirect("/tasks");
}
