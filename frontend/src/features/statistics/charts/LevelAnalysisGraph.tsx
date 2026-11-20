import type { ExerciseSummary } from '../../../api/exercises';
import { buildLevelPoints, formatDuration, LEVEL_DOT_COLORS, LEVEL_MIN_POINTS, timeScaleMaximum } from '../statisticsData';

export function LevelAnalysisGraph({ exerciseSummaries }: { exerciseSummaries: ExerciseSummary[] }) {
  const levels = buildLevelPoints(exerciseSummaries);
  const allLevels = levels.map((points, level) => ({ points, level }));
  const analyzedLevels = allLevels.filter(({ points }) => points.length >= LEVEL_MIN_POINTS);
  const allSeconds = analyzedLevels.flatMap(({ points }) => points.map((point) => point.seconds));
  const maximum = timeScaleMaximum(Math.max(0, ...allSeconds));
  const ticks = [0, maximum / 4, maximum / 2, (maximum * 3) / 4, maximum];
  const position = (seconds: number) => `${Math.min(100, Math.max(0, (seconds / maximum) * 100))}%`;

  return (
    <section className="statistics-timeline-section" aria-label="Level analysis">
      <div className="statistics-timeline-heading">
        <h3>Time per exercise level</h3>
        <div className="statistics-timeline-legend" aria-label="Difficulty legend">
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-green" aria-hidden="true" />Easy</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-blue" aria-hidden="true" />Medium</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-contribution-swatch statistics-contribution-status is-red" aria-hidden="true" />Difficult</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-level-mean-legend" aria-hidden="true" />Mean</span>
          <span className="statistics-timeline-legend-item"><span className="statistics-level-mad-legend" aria-hidden="true" />Mean absolute deviation</span>
        </div>
      </div>
      {(
        <div className="statistics-level-chart">
          {allLevels.map(({ points, level }) => {
            const hasAnalysis = points.length >= LEVEL_MIN_POINTS;
            const mean = points.reduce((sum, point) => sum + point.seconds, 0) / points.length;
            const mad = points.reduce((sum, point) => sum + Math.abs(point.seconds - mean), 0) / points.length;
            const left = Math.max(0, mean - mad);
            const right = Math.min(maximum, mean + mad);
            return (
              <div key={level} className="statistics-level-row">
                <div className="statistics-level-label">
                  <strong>Level {level}</strong>
                  <span>n={points.length}</span>
                </div>
                <div className="statistics-level-track">
                  {hasAnalysis ? (<>
                  <div
                    className="statistics-level-mad"
                    style={{ left: position(left), width: `${((right - left) / maximum) * 100}%` }}
                    title={`MAD: ${formatDuration(Math.round(mad))}`}
                  />
                  <div className="statistics-level-mean" style={{ left: position(mean) }}>
                    <span className="statistics-level-mean-label">{`Mean ${formatDuration(Math.round(mean))} / MAD ${formatDuration(Math.round(mad))}`}</span>
                  </div>
                  {points.map((point) => (
                    <span
                      key={point.id}
                      className="statistics-level-dot"
                      style={{ left: position(point.seconds), background: LEVEL_DOT_COLORS[point.difficulty] }}
                      title={`${point.name}: ${formatDuration(Math.round(point.seconds))}`}
                    />
                  ))}
                  </>) : (
                    <span className="statistics-level-placeholder">{`Analysis of this level appears when at least ${LEVEL_MIN_POINTS} exercises of this level have been completed`}</span>
                  )}
                </div>
              </div>
            );
          })}
          <div className="statistics-level-row">
            <div className="statistics-level-label" />
            <div className="statistics-level-axis">
              {ticks.map((tick) => (
                <span key={tick} style={{ left: position(tick) }}>{formatDuration(Math.round(tick))}</span>
              ))}
            </div>
          </div>
        </div>
      )}
      <div className="statistics-time-of-day-axis-title">time spent (min:sec)</div>
    </section>
  );
}
