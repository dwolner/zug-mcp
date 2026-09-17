import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
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
      <HowItWorks />
      <WorkContext />
      <Superpower />
      <Recaps />
      <UpgradeSection />
      <Footer />
    </>
  );
}
