import { useEffect, useState } from 'react';
import { fetchStatisticsReviewHistory, type StatisticsReviewDay } from '../../../api/exercises';
import { buildSRChartDays, formatReviewCount, localDateKey, SR_REVIEW_STATUSES, timelineTicks } from '../statisticsData';

export function SRReviewHistoryGraph() {
  const [history, setHistory] = useState<StatisticsReviewDay[]>([]);
  const [rangeDays, setRangeDays] = useState(30);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let isCurrent = true;
    fetchStatisticsReviewHistory()
      .then((data) => {
        if (isCurrent) setHistory(data);
      })
      .catch((loadError: unknown) => {
        if (isCurrent) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Unable to load review history.',
          );
        }
      })
      .finally(() => {
        if (isCurrent) setLoading(false);
      });
    return () => {
      isCurrent = false;
    };
  }, []);

  const days = buildSRChartDays(history, rangeDays, new Date());
  const maximumDailyCount = Math.max(
    1,
    ...days.map((day) => day.learning + day.relearning + day.young + day.mature),
  );
  const maximumCumulativeTotal = Math.max(1, ...days.map((day) => day.cumulativeTotal));
  const dailyTicks = timelineTicks(maximumDailyCount);
  const totalTicks = timelineTicks(maximumCumulativeTotal);
  // Extend the total line to the plot edges so it spans the full graph width.
  const totalPoints = [
    ...(days.length > 0 ? [{ x: 0, total: days[0].cumulativeTotal }] : []),
    ...days.map((day, index) => ({ x: index + 0.5, total: day.cumulativeTotal })),
    ...(days.length > 0 ? [{ x: days.length, total: days[days.length - 1].cumulativeTotal }] : []),
  ].map((point) => ({ x: point.x, y: 100 - (point.total / maximumCumulativeTotal) * 100 }));
  const totalAreaPath = [
    `M 0 100`,
    ...totalPoints.map((point) => `L ${point.x} ${point.y}`),
    `L ${days.length} 100 Z`,
  ].join(' ');
  const totalLinePoints = totalPoints.map((point) => `${point.x},${point.y}`).join(' ');
  const labelStep = Math.max(1, Math.ceil(rangeDays / 5));
  const dateLabels = days.filter(
    (day, index) => index % labelStep === 0 || index === days.length - 1,
  );

  return (
    <section className="statistics-timeline-section statistics-sr-review-section" aria-label="Spaced-repetition reviews">
      <div className="statistics-timeline-heading">
        <h3>Reviews</h3>
        <p className="statistics-sr-review-subtitle">Daily reviews by learning state</p>
        <div className="statistics-sr-review-ranges" aria-label="Review history time range">
          {[30, 90, 365].map((range) => (
            <button
              key={range}
              type="button"
              aria-pressed={rangeDays === range}
              className={rangeDays === range ? 'is-active' : ''}
              onClick={() => setRangeDays(range)}
            >
              {range === 30 ? '1 month' : range === 90 ? '3 months' : '1 year'}
            </button>
          ))}
        </div>
        <div className="statistics-timeline-legend" aria-label="Review status legend">
          {SR_REVIEW_STATUSES.map((status) => (
            <span key={status.key} className="statistics-timeline-legend-item">
              <span className={`statistics-sr-review-swatch is-${status.key}`} aria-hidden="true" />
              {status.label}
            </span>
          ))}
          <span className="statistics-timeline-legend-item">
            <span className="statistics-sr-review-swatch is-total" aria-hidden="true" />
            Total reviews
          </span>
        </div>
      </div>
      {loading ? <p className="statistics-sr-review-message">Loading review history...</p> : null}
      {error ? <p className="statistics-sr-review-error" role="alert">{error}</p> : null}
      {!loading && !error ? (
        <>
          <div className="statistics-sr-review-chart">
            <div className="statistics-sr-review-axis-title">Reviews per day</div>
            <div className="statistics-sr-review-axis" aria-label="Reviews per day">
              {dailyTicks.map((tick) => (
                <span
                  key={tick}
                  className="statistics-timeline-axis-label"
                  style={{ bottom: `${(tick / maximumDailyCount) * 100}%` }}
                >
                  {formatReviewCount(tick)}
                </span>
              ))}
            </div>
            <div className="statistics-sr-review-plot">
              <svg
                className="statistics-sr-review-svg"
                viewBox={`0 0 ${days.length} 100`}
                preserveAspectRatio="none"
                role="img"
                aria-label={`Daily learning, relearning, young, and mature reviews over the last ${rangeDays} days`}
              >
                {dailyTicks.map((tick) => {
                  const y = 100 - (tick / maximumDailyCount) * 100;
                  return (
                    <line
                      key={`daily-grid-${tick}`}
                      className="statistics-sr-review-grid"
                      x1="0"
                      x2={days.length}
                      y1={y}
                      y2={y}
                    />
                  );
                })}
                <path className="statistics-sr-review-total-area" d={totalAreaPath} />
                {days.map((day, index) => {
                  let stackedCount = 0;
                  const segments = SR_REVIEW_STATUSES.map((status) => {
                    const count = day[status.key];
                    const y = 100 - ((stackedCount + count) / maximumDailyCount) * 100;
                    stackedCount += count;
                    return count > 0 ? (
                      <rect
                        key={status.key}
                        className={`statistics-sr-review-segment is-${status.key}`}
                        x={index + 0.12}
                        y={y}
                        width="0.76"
                        height={(count / maximumDailyCount) * 100}
                      />
                    ) : null;
                  });
                  return (
                    <g key={localDateKey(day.date)}>
                      <title>
                        {`${day.daysAgo} days ago: ${day.learning + day.relearning + day.young + day.mature} categorized reviews; ${day.total} total reviews`}
                      </title>
                      {segments}
                    </g>
                  );
                })}
                <polyline className="statistics-sr-review-total-line" points={totalLinePoints} />
              </svg>
              <div className="statistics-sr-review-date-labels" aria-hidden="true">
                {dateLabels.map((day) => (
                  <span
                    key={localDateKey(day.date)}
                    style={{ left: `${((rangeDays - day.daysAgo) / rangeDays) * 100}%` }}
                  >
                    {day.daysAgo === 0 ? '0' : `-${day.daysAgo}`}
                  </span>
                ))}
              </div>
            </div>
            <div className="statistics-sr-review-right-axis" aria-label="Cumulative total reviews">
              {totalTicks.map((tick) => (
                <span
                  key={tick}
                  className="statistics-timeline-axis-label"
                  style={{ bottom: `${(tick / maximumCumulativeTotal) * 100}%` }}
                >
                  {formatReviewCount(tick)}
                </span>
              ))}
            </div>
            <div className="statistics-sr-review-axis-caption">days ago</div>
            <div className="statistics-sr-review-right-axis-title">Cumulative reviews</div>
          </div>
        </>
      ) : null}
    </section>
  );
}
