import { useMemo } from 'react';
import type { ExerciseSummary } from '../../../api/exercises';
import type { ApiLogbookState } from '../../../api/logbook';
import { buildLogbookDistribution, timelineTicks } from '../statisticsData';

export function LogbookDistributionGraph({ exerciseSummaries, logbooks, isLoading }: { exerciseSummaries: ExerciseSummary[]; logbooks: Record<string, ApiLogbookState[]>; isLoading: boolean }) {
  const buckets = useMemo(
    () => buildLogbookDistribution(exerciseSummaries, logbooks),
    [exerciseSummaries, logbooks],
  );
  if (isLoading) return <p>Loading logbook statistics...</p>;

  const maximumCount = Math.max(
    1,
    ...buckets.map((bucket) => bucket.createFragment + bucket.link + bucket.mergeFragments + bucket.dbe + bucket.rest + bucket.pause),
  );
  const ticks = timelineTicks(maximumCount);

  return (
    <section className="statistics-timeline-section" aria-label="Logbook events over exercise duration">
      <div className="statistics-timeline-heading">
        <h3>Logbook events during completed exercises</h3>
        <div className="statistics-timeline-legend" aria-label="Logbook event legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-create" aria-hidden="true" />Create fragment</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-link" aria-hidden="true" />Link</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-merge" aria-hidden="true" />Merge fragments</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-dbe" aria-hidden="true" />Set DBE</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-rest" aria-hidden="true" />Rests (&gt;30 s)</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-logbook-swatch is-pause" aria-hidden="true" />Pause</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-of-day-chart">
        <div className="statistics-timeline-axis-title">Number of events</div>
        <div className="statistics-timeline-axis" aria-label="Number of logbook events">
          {ticks.map((tick) => (
            <span key={tick} className="statistics-timeline-axis-label" style={{ bottom: `${(tick / maximumCount) * 100}%` }}>
              {tick}
            </span>
          ))}
        </div>
        <div className="statistics-timeline-viewport">
          <div className="statistics-timeline-plot">
            <div className="statistics-timeline-guides" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / maximumCount) * 100}%` }} />
              ))}
            </div>
            <div className="statistics-time-of-day-distribution statistics-spaced-bins" style={{ '--timeline-days': buckets.length } as React.CSSProperties}>
              {buckets.map((bucket, index) => {
                const total = bucket.createFragment + bucket.link + bucket.mergeFragments + bucket.dbe + bucket.rest + bucket.pause;
                return (
                  <div key={index} className="statistics-time-of-day-bin" title={`${index * 5}-${(index + 1) * 5}%: ${total} event${total === 1 ? '' : 's'}`}>
                    <div className="statistics-timeline-bar" aria-label={`${index * 5}-${(index + 1) * 5}%: ${total} events`}>
                      <span className="statistics-timeline-segment statistics-logbook-create" style={{ height: `${(bucket.createFragment / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-link" style={{ height: `${(bucket.link / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-merge" style={{ height: `${(bucket.mergeFragments / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-dbe" style={{ height: `${(bucket.dbe / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-rest" style={{ height: `${(bucket.rest / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment statistics-logbook-pause" style={{ height: `${(bucket.pause / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-time-distribution-label">{index % 5 === 0 ? `${index * 5}%` : ''}</span>
                  </div>
                );
              })}
              <span className="statistics-time-of-day-end-label">100%</span>
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">normalized time</div>
    </section>
  );
}
