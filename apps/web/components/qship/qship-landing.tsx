import "./qship.css";
import { QshipNav } from "./qship-nav";
import { QshipHero } from "./qship-hero";
import { QshipProcess } from "./qship-process";
import { QshipPrHighlight } from "./qship-pr-highlight";
import { QshipRotator } from "./qship-rotator";
import { QshipShowcase } from "./qship-showcase";
import {
  QshipAgent,
  QshipCta,
  QshipFaq,
  QshipFooter,
  QshipIntegrations,
  QshipCapabilities,
  QshipMarquee,
  QshipPricing,
  QshipWorkflows,
} from "./qship-sections";

export function QshipLanding() {
  return (
    <div className="qship-page">
      <QshipNav />
      <div className="qship-page-column">
        <main>
          <QshipHero />
          <QshipMarquee />
          <QshipProcess />
          <QshipIntegrations />
          <QshipShowcase />
          <QshipPrHighlight />
          <QshipWorkflows />
          <QshipRotator />
          <QshipCapabilities />
          <QshipAgent />
          <QshipPricing />
          <QshipFaq />
          <QshipCta />
        </main>
        <QshipFooter />
      </div>
    </div>
  );
}
