import type { ReactNode } from "react";

import "~/components/qship/qship.css";

export default function PrivacyLayout({ children }: { children: ReactNode }) {
  return <div className="qship-page qship-privacy-shell">{children}</div>;
}
