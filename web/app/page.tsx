import { Nav } from './components/Nav';
import { Hero } from './components/Hero';
import { FeatureGrid } from './components/FeatureGrid';
import { UpgradeSection } from './components/UpgradeSection';
import { Footer } from './components/Footer';

export default function Home() {
  return (
    <>
      <Nav />
      <Hero />
      <FeatureGrid />
      <UpgradeSection />
      <Footer />
    </>
  );
}
