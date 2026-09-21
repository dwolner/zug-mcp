import { content } from '../content';
import { RecapsBlock } from './Recaps';
import { SectionHead } from './SectionHead';
import { FanOutBlock } from './Superpower';
import { WorkContextBlock } from './WorkContext';

/**
 * One section, three beats. These were three separate sections making
 * overlapping arguments: knowing the system, the session record, and the
 * fan-out are all the same claim about sessions compounding.
 */
export function Compound() {
  const { compound } = content;

  return (
    <section id="why" className="border-t border-line bg-sunk/60 py-24">
      <SectionHead eyebrow={compound.eyebrow} headline={compound.headline} body={compound.body} />

      <div className="mt-16 space-y-24">
        <WorkContextBlock />
        <RecapsBlock />
        <FanOutBlock />
      </div>
    </section>
  );
}
