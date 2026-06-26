import type { ReactNode } from "react";
import "~/components/qship/qship.css";
import "~/components/app/qship-app.css";
import { QshipAppShell } from "~/components/app/qship-app-shell";

export default function AppLayout({ children }: { children: ReactNode }) {
  return <QshipAppShell>{children}</QshipAppShell>;
}
