import { Suspense } from "react";
import { QshipLanding } from "~/components/qship/qship-landing";
import { QshipAuthProvider } from "~/components/qship/qship-auth-provider";

export default function Home() {
  return (
    <Suspense>
      <QshipAuthProvider>
        <QshipLanding />
      </QshipAuthProvider>
    </Suspense>
  );
}
