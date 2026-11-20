import { useMemo } from 'react';
import type { ExerciseSummary } from '../../../api/exercises';
import type { ApiLogbookState } from '../../../api/logbook';
import { buildRestDurationDistribution, timeBinLabel, timeBinTitle, timelineTicks } from '../statisticsData';

export function RestDurationGraph({ exerciseSummaries, logbooks, isLoading }: { exerciseSummaries: ExerciseSummary[]; logbooks: Record<string, ApiLogbookState[]>; isLoading: boolean }) {
  const buckets = useMemo(
    () => buildRestDurationDistribution(exerciseSummaries, logbooks),
    [exerciseSummaries, logbooks],
  );
  if (isLoading) return <p>Loading logbook statistics...</p>;

  const maximumCount = Math.max(1, ...buckets.map((bucket) => bucket.easy + bucket.medium + bucket.difficult));
  const ticks = timelineTicks(maximumCount);

  return (
    <section className="statistics-timeline-section" aria-label="Rest duration distribution">
      <div className="statistics-timeline-heading">
        <h3>Rests duration</h3>
        <div className="statistics-timeline-legend" aria-label="Difficulty legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-green" aria-hidden="true" />Easy</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Medium</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Difficult</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-distribution-chart">
        <div className="statistics-timeline-axis-title">Number of rests</div>
        <div className="statistics-timeline-axis" aria-label="Number of rests">
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
            <div className="statistics-time-distribution" style={{ '--timeline-days': buckets.length } as React.CSSProperties}>
              {buckets.map((bucket) => {
                const total = bucket.easy + bucket.medium + bucket.difficult;
                return (
                  <div
                    key={bucket.bin}
                    className="statistics-time-distribution-day"
                    title={`${timeBinTitle(bucket.bin)}: ${total} rest${total === 1 ? '' : 's'}`}
                  >
                    <div className="statistics-timeline-bar" aria-label={`${timeBinTitle(bucket.bin)}: ${total} rests`}>
                      <span className="statistics-timeline-segment is-green" style={{ height: `${(bucket.easy / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-blue" style={{ height: `${(bucket.medium / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-red" style={{ height: `${(bucket.difficult / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-time-distribution-label">{timeBinLabel(bucket.bin)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">rest duration (min)</div>
    </section>
  );
}
