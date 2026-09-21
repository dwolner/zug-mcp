import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { AgentStack } from './components/AgentStack';
import { HowItWorks } from './components/HowItWorks';
import { WorkContext } from './components/WorkContext';
import { Superpower } from './components/Superpower';
import { Recaps } from './components/Recaps';
import { UpgradeSection } from './components/UpgradeSection';
import { Footer } from './components/Footer';

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      {/* What it is, then the price, then the long explainers. A reader should
          know what they are installing and what it costs before the mechanics. */}
      <AgentStack />
      <UpgradeSection />
      <HowItWorks />
      <WorkContext />
      <Superpower />
      <Recaps />
      <Footer />
    </>
  );
}
