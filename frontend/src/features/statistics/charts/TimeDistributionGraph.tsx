import type { ExerciseSummary } from '../../../api/exercises';
import { buildTimeDistribution, timeBinLabel, timeBinTitle, timelineTicks } from '../statisticsData';

export function TimeDistributionGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const buckets = buildTimeDistribution(exerciseSummaries);
  const maximumCount = Math.max(
    1,
    ...buckets.map((bucket) => bucket.easy + bucket.medium + bucket.difficult),
  );
  const ticks = timelineTicks(maximumCount);

  return (
    <section className="statistics-timeline-section" aria-label="Completed exercise time distribution">
      <div className="statistics-timeline-heading">
        <h3>Completed exercises by time</h3>
        <div className="statistics-timeline-legend" aria-label="Difficulty legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-green" aria-hidden="true" />Easy</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Medium</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Difficult</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-distribution-chart">
        <div className="statistics-timeline-axis-title">Number of exercises</div>
        <div className="statistics-timeline-axis" aria-label="Number of exercises">
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
                    key={bucket.minute}
                    className="statistics-time-distribution-day"
                    title={`${timeBinTitle(bucket.minute)}: ${total} exercise${total === 1 ? '' : 's'}`}
                  >
                    <div className="statistics-timeline-bar" aria-label={`${timeBinTitle(bucket.minute)}: ${total} exercises`}>
                      <span className="statistics-timeline-segment is-green" style={{ height: `${(bucket.easy / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-blue" style={{ height: `${(bucket.medium / maximumCount) * 100}%` }} />
                      <span className="statistics-timeline-segment is-red" style={{ height: `${(bucket.difficult / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-time-distribution-label">{timeBinLabel(bucket.minute)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">time spent (min)</div>
    </section>
  );
}
