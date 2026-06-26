import { redirect } from "next/navigation";

/** Legacy approval queue UI — ShipFlow uses Requests + human_review status. */
export default function QueuePage() {
  redirect("/requests");
}
