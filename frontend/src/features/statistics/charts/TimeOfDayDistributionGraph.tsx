import { useMemo } from 'react';
import type { ExerciseSummary } from '../../../api/exercises';
import type { ApiLogbookState } from '../../../api/logbook';
import { buildTimeOfDayDistribution, formatDuration, formatTimeOfDayBin, TIME_OF_DAY_BIN_COUNT, timeScaleMaximum, timeScaleTicks } from '../statisticsData';

export function TimeOfDayDistributionGraph({ exerciseSummaries, logbooks }: { exerciseSummaries: ExerciseSummary[]; logbooks: Record<string, ApiLogbookState[]> }) {
  const buckets = useMemo(
    () => buildTimeOfDayDistribution(exerciseSummaries, logbooks),
    [exerciseSummaries, logbooks],
  );
  const maximumSeconds = timeScaleMaximum(Math.max(0, ...buckets.map((bucket) => bucket.easy + bucket.medium + bucket.difficult)));
  const ticks = timeScaleTicks(maximumSeconds);

  return (
    <section className="statistics-timeline-section" aria-label="Time spent by time of day">
      <div className="statistics-timeline-heading">
        <h3>Time spent by time of day</h3>
        <div className="statistics-timeline-legend" aria-label="Difficulty legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-green" aria-hidden="true" />Easy</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Medium</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Difficult</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-of-day-chart">
        <div className="statistics-timeline-axis-title">Total time</div>
        <div className="statistics-timeline-axis" aria-label="Total time">
          {ticks.map((tick) => (
            <span key={tick} className="statistics-timeline-axis-label" style={{ bottom: `${(tick / maximumSeconds) * 100}%` }}>
              {formatDuration(Math.round(tick))}
            </span>
          ))}
        </div>
        <div className="statistics-timeline-viewport">
          <div className="statistics-timeline-plot">
            <div className="statistics-timeline-guides" aria-hidden="true">
              {ticks.map((tick) => (
                <span key={tick} style={{ bottom: `${(tick / maximumSeconds) * 100}%` }} />
              ))}
            </div>
            <div className="statistics-time-of-day-distribution" style={{ '--timeline-days': buckets.length } as React.CSSProperties}>
              {buckets.map((bucket, index) => {
                const total = bucket.easy + bucket.medium + bucket.difficult;
                const label = `${formatTimeOfDayBin(index)}-${formatTimeOfDayBin((index + 1) % TIME_OF_DAY_BIN_COUNT)}: ${formatDuration(Math.round(total))}`;
                return (
                  <div key={index} className="statistics-time-of-day-bin" title={label}>
                    <div className="statistics-timeline-bar" aria-label={label}>
                      <span className="statistics-timeline-segment is-green" style={{ height: `${(bucket.easy / maximumSeconds) * 100}%` }} />
                      <span className="statistics-timeline-segment is-blue" style={{ height: `${(bucket.medium / maximumSeconds) * 100}%` }} />
                      <span className="statistics-timeline-segment is-red" style={{ height: `${(bucket.difficult / maximumSeconds) * 100}%` }} />
                    </div>
                    <span className="statistics-time-distribution-label">{index % 4 === 0 ? String(index / 4) : ''}</span>
                  </div>
                );
              })}
              <span className="statistics-time-of-day-end-label">24</span>
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">time of the day</div>
    </section>
  );
}
