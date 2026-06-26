import { redirect } from "next/navigation";

/** Legacy Corsair permissions flow — not used in ShipFlow. */
export default function CorsairApprovePage() {
  redirect("/settings");
}
