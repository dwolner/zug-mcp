import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { AgentStack } from './components/AgentStack';
import { UpgradeSection } from './components/UpgradeSection';
import { HowItWorks } from './components/HowItWorks';
import { Compound } from './components/Compound';
import { Footer } from './components/Footer';

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      {/* What it is, then the price, then how it works, then what changes.
          A reader should know what they are installing and what it costs
          before the mechanics. */}
      <AgentStack />
      <UpgradeSection />
      <HowItWorks />
      <Compound />
      <Footer />
    </>
  );
}
