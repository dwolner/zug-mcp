import { STATUS } from '@/lib/chart-palette';
import type { PipelineHealth as Health } from '@/lib/zug-metrics';

/**
 * Stat tiles, not a chart. Each of these is a single headline number, and a bar chart of one value
 * is a worse way to read a number than the number.
 *
 * State is never carried by color alone -- every tile ships a glyph and a text status too.
 */
function Tile({
  label,
  value,
  detail,
  status,
}: {
  label: string;
  value: string;
  detail: string;
  status: 'good' | 'warning' | 'critical' | 'neutral';
}) {
  const glyph = { good: '✓', warning: '!', critical: '✕', neutral: '·' }[status];
  return (
    <div className="border border-ink/15 rounded-lg p-4 bg-white/40">
      <div className="flex items-baseline gap-2">
        <span className="font-mono text-xs" style={{ color: STATUS[status] }} aria-hidden>
          {glyph}
        </span>
        <span className="text-xs uppercase tracking-wide text-ink/60">{label}</span>
      </div>
      <div className="mt-1 font-mono text-2xl" style={{ color: STATUS[status] }}>
        {value}
      </div>
      <p className="mt-1 text-xs leading-snug text-ink/70">{detail}</p>
    </div>
  );
}

function daysSince(iso: string): number {
  return Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 86_400_000));
}

/**
 * Pending observations are normal briefly — anything recorded after the last push waits for the next
 * one. A backlog that has aged past a day means pushes are no longer draining it, which is the
 * ISS-050 failure. Age, not count, is what separates the two, so a large-but-fresh batch (a long
 * session) does not raise an alarm and a single stuck observation does.
 */
const BACKLOG_STALE_DAYS = 1;

export function PipelineHealth({ health }: { health: Health }) {
  const { synthesis, backlog, gap, lessons, reinforcementCount, maxReinforcement, canEverPromote } =
    health;

  const backlogStale =
    backlog.oldestPendingAt !== null && daysSince(backlog.oldestPendingAt) >= BACKLOG_STALE_DAYS;

  const okTile = backlogStale
    ? {
        // `ok` while a backlog ages is precisely how ISS-050 stayed invisible: the outcome describes
        // the last batch, not the observations that were never offered. Surface it as a warning.
        value: `${backlog.pending} pending`,
        detail: `Last succeeded ${synthesis?.timestamp.slice(0, 10)}, but the oldest unabsorbed observation is ${daysSince(backlog.oldestPendingAt!)}d old.`,
        status: 'warning' as const,
      }
    : {
        value: 'ok',
        detail: backlog.known
          ? `Last succeeded ${synthesis?.timestamp.slice(0, 10)}. ${backlog.pending === 0 ? 'Nothing pending.' : `${backlog.pending} pending, awaiting next push.`}`
          : `Last succeeded ${synthesis?.timestamp.slice(0, 10)}. Backlog unknown — server sends no cursor.`,
        status: 'good' as const,
      };

  const synthesisTile =
    synthesis === null
      ? { value: 'never run', detail: 'No synthesis outcome has been recorded yet.', status: 'neutral' as const }
      : synthesis.outcome === 'ok'
        ? okTile
        : {
            value: synthesis.outcome,
            detail: `${synthesis.detail ?? 'Failed'} — last attempt ${synthesis.timestamp.slice(0, 10)}.`,
            status: 'critical' as const,
          };

  return (
    <section>
      <h2 className="text-lg mb-1">Pipeline health</h2>
      <p className="text-sm text-ink/70 mb-4 max-w-2xl">
        Observations go in; a synthesized fingerprint is supposed to come out, and repeated patterns
        are supposed to graduate into lessons. This row is whether that is actually happening.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Tile label="Last synthesis" {...synthesisTile} />
        {gap ? (
          <Tile
            label="Persona"
            value={`${daysSince(gap.frozenSince)}d frozen`}
            detail={`${gap.personaLines} lines, unchanged across ${gap.sessions} sessions while ${gap.observationsAccumulated} observations arrived.`}
            status="critical"
          />
        ) : (
          <Tile label="Persona" value="moving" detail="Changed on the most recent session." status="good" />
        )}
        <Tile
          label="Reinforcements"
          value={`${reinforcementCount}`}
          detail={`Strongest pattern seen ${maxReinforcement}×. Promotion needs 3×.`}
          status={canEverPromote ? 'good' : 'critical'}
        />
        <Tile
          label="Lessons"
          value={`${lessons}`}
          detail={
            canEverPromote
              ? 'Candidates exist and can be promoted.'
              : 'No pattern reaches 3×, so no candidate can ever be offered.'
          }
          status={lessons > 0 ? 'good' : canEverPromote ? 'warning' : 'critical'}
        />
      </div>
    </section>
  );
}
