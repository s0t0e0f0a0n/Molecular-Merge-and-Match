import type { ExerciseSummary } from '../../../api/exercises';
import { buildAverageTimeDays, buildTimeline, formatDuration, formatTimelineDate, localDateKey, timeScaleMaximum, timeScaleTicks, TIMELINE_STATUSES, timelineTicks } from '../statisticsData';

export function StatisticsTimeline({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const days = buildTimeline(exerciseSummaries);
  const maximumCount = Math.max(1, ...days.map((day) => Object.values(day.counts).reduce((sum, count) => sum + count, 0)));
  const ticks = timelineTicks(maximumCount);
  const averageTimeDays = buildAverageTimeDays(exerciseSummaries);
  const maximumAverage = timeScaleMaximum(Math.max(0, ...averageTimeDays.map((day) => day.averageSeconds)));
  const averageTimeTicks = timeScaleTicks(maximumAverage);
  const averageTimeLinePoints = averageTimeDays
    .map((day, index) => `${index + 0.5},${100 - (day.averageSeconds / maximumAverage) * 100}`)
    .join(' ');

  return (
    <section className="statistics-timeline-section" aria-label="Daily statistics timeline">
      <div className="statistics-timeline-heading">
        <h3>Activity over time</h3>
        <div className="statistics-timeline-legend" aria-label="Timeline legend">
          {TIMELINE_STATUSES.map((status) => (
            <span key={status.key} className="statistics-timeline-legend-item">
              <span className={`statistics-contribution-swatch statistics-contribution-status ${status.key}`} aria-hidden="true" />
              {status.label}
            </span>
          ))}
          <span className="statistics-timeline-legend-item">
            <span className="statistics-average-time-legend-line" aria-hidden="true" />
            Average time per exercise
          </span>
        </div>
      </div>
      <div className="statistics-timeline-chart">
        <div className="statistics-timeline-axis-title">Number of exercises</div>
        <div className="statistics-timeline-right-axis-title">Average time</div>
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
            <div className="statistics-timeline" style={{ '--timeline-days': days.length } as React.CSSProperties}>
              <svg
                className="statistics-average-time-line"
                viewBox={`0 0 ${days.length} 100`}
                preserveAspectRatio="none"
                aria-hidden="true"
              >
                <polyline points={averageTimeLinePoints} />
              </svg>
              {days.map((day) => {
                const total = Object.values(day.counts).reduce((sum, count) => sum + count, 0);
                const averageTimeDay = averageTimeDays.find((candidate) => localDateKey(candidate.date) === localDateKey(day.date));
                return (
                  <div key={localDateKey(day.date)} className="statistics-timeline-day" title={`${formatTimelineDate(day.date)}: ${total} exercise${total === 1 ? '' : 's'}`}>
                    <div className="statistics-timeline-bar" aria-label={`${formatTimelineDate(day.date)}: ${total} exercises`}>
                      {TIMELINE_STATUSES.map((status) => (
                        <span
                          key={status.key}
                          className={`statistics-timeline-segment ${status.key}`}
                          style={{ height: `${(day.counts[status.key] / maximumCount) * 100}%` }}
                        />
                      ))}
                    </div>
                    {averageTimeDay ? (
                      <span
                        className="statistics-average-time-point"
                        style={{ '--average-time-position': averageTimeDay.averageSeconds / maximumAverage } as React.CSSProperties}
                        title={`${formatDuration(Math.round(averageTimeDay.averageSeconds))} average time`}
                        aria-label={`${formatTimelineDate(day.date)}: ${formatDuration(Math.round(averageTimeDay.averageSeconds))} average time`}
                      />
                    ) : null}
                    <span className="statistics-timeline-date">{formatTimelineDate(day.date)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        <div className="statistics-timeline-right-axis" aria-label="Average time per exercise">
          {averageTimeTicks.map((tick) => (
            <span
              key={tick}
              className="statistics-timeline-axis-label"
              style={{ '--average-time-position': tick / maximumAverage } as React.CSSProperties}
            >
              {formatDuration(tick)}
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
