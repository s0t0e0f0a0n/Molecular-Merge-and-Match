import type { ExerciseSummary } from '../../../api/exercises';
import { buildDueDistribution, dueBinClass, timelineTicks } from '../statisticsData';

export function DueDistributionGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const bins = buildDueDistribution(exerciseSummaries, Date.now());
  const maximumCount = Math.max(1, ...bins.map((bin) => bin.count));
  const ticks = timelineTicks(maximumCount);

  return (
    <section className="statistics-timeline-section" aria-label="Exercises by due date">
      <div className="statistics-timeline-heading">
        <h3>Exercises by due date</h3>
        <div className="statistics-timeline-legend" aria-label="Due date legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Due for review</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Upcoming reviews</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-black" aria-hidden="true" />In deep knowledge</span>
        </div>
      </div>
      <div className="statistics-timeline-chart statistics-time-of-day-chart">
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
            <div className="statistics-time-of-day-distribution" style={{ '--timeline-days': bins.length } as React.CSSProperties}>
              {bins.map((bin) => {
                const endDay = bin.startDay + bin.size - 1;
                const range = bin.size === 1 ? `Day ${bin.startDay}` : `Days ${bin.startDay} to ${endDay}`;
                const showLabel = bin.labeled;
                return (
                  <div key={bin.startDay} className="statistics-time-of-day-bin" title={`${range}: ${bin.count} exercise${bin.count === 1 ? '' : 's'}`}>
                    <div className="statistics-timeline-bar" aria-label={`${range}: ${bin.count} exercises`}>
                      <span className={`statistics-timeline-segment statistics-due-segment ${dueBinClass(bin.startDay)}`} style={{ height: `${(bin.count / maximumCount) * 100}%` }} />
                    </div>
                    <span className="statistics-due-label"><span>{showLabel ? bin.startDay : ''}</span></span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
      <div className="statistics-time-of-day-axis-title">days relative to today</div>
    </section>
  );
}
