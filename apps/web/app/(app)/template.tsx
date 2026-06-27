"use client";

import type { ReactNode } from "react";

export default function AppTemplate({ children }: { children: ReactNode }) {
  return <div className="qship-page-enter">{children}</div>;
}
