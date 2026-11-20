import { useEffect, useState } from 'react';
import { fetchStatisticsBehaviorEvents, type ExerciseSummary, type StatisticsBehaviorEvent } from '../../../api/exercises';
import type { ApiLogbookState } from '../../../api/logbook';
import { RadarChart } from './RadarChart';
import { generateGlobalProfile, generateStudyStyleProfile, MIN_STYLE_SESSIONS, selectSessions } from '../metaCognitive';
import { buildExerciseSessions, LAST_SESSIONS_WINDOW } from '../statisticsData';

export function BehaviourProfiles({ exerciseSummaries, logbooks }: { exerciseSummaries: ExerciseSummary[]; logbooks: Record<string, ApiLogbookState[]> }) {
  const [data, setData] = useState<{ logbooks: Record<string, ApiLogbookState[]>; events: StatisticsBehaviorEvent[] } | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [lastOnly, setLastOnly] = useState(false);

  useEffect(() => {
    let isCurrent = true;
    setData(null);
    setLoadError(null);
    setData({ logbooks, events: [] });
    fetchStatisticsBehaviorEvents()
      .then((events) => {
        if (isCurrent) setData({ logbooks, events });
      })
      .catch((error: unknown) => {
        if (isCurrent) {
          setLoadError(error instanceof Error ? error.message : 'Unable to load study behaviour data.');
        }
      });
    return () => {
      isCurrent = false;
    };
  }, [exerciseSummaries, logbooks]);

  if (loadError) return <p role="alert">{loadError}</p>;
  if (!data) return <p>Loading study behaviour...</p>;

  const allSessions = buildExerciseSessions(exerciseSummaries, data.logbooks, data.events);
  const sessions = selectSessions(allSessions, lastOnly ? LAST_SESSIONS_WINDOW : null);
  const profile = generateGlobalProfile(sessions);
  const style = generateStudyStyleProfile(sessions);
  const countLabel = `${sessions.length} completed exercise${sessions.length === 1 ? '' : 's'} with logbook data`;

  return (
    <>
      <div className="statistics-radar-row">
        <section className="statistics-timeline-section statistics-radar-section" aria-label="Metacognitive profile">
          <div className="statistics-timeline-heading">
            <h3>Metacognitive profile</h3>
            <span className="statistics-timeline-legend-item">{countLabel}</span>
          </div>
          <RadarChart
            ariaLabel="Metacognitive profile radar chart"
            axes={[
              { label: 'Concept mastery', value: profile.conceptMastery, description: 'Accuracy (1 / (incorrect validations + 1)) weighted by difficulty. High is good.' },
              { label: 'Calibration', value: profile.calibration, description: 'How closely your confidence rating matches your actual accuracy. High is good.' },
              { label: 'Deliberation', value: profile.deliberation, description: 'Planning quality: execution efficiency (no reversals), pace consistency, and thoughtful pauses. High is good.' },
              { label: 'Resilience', value: profile.resilience, description: 'Response to incorrect validations: no immediate cheat, exit or excessive backtracking. If all exercises are error-free, defaults to 100%; resilience has not been tested.' },
              { label: 'Autonomy', value: profile.autonomous, description: 'Solving without cheats. 1 at no cheat use, 0 when 30% or more of exercises used cheats.' },
            ]}
          />
        </section>
        <div className="statistics-radar-toggle" role="group" aria-label="Exercises included in the profiles">
          <button type="button" className={lastOnly ? '' : 'is-active'} aria-pressed={!lastOnly} onClick={() => setLastOnly(false)}>All exercises</button>
          <button type="button" className={lastOnly ? 'is-active' : ''} aria-pressed={lastOnly} onClick={() => setLastOnly(true)}>Last {LAST_SESSIONS_WINDOW}</button>
        </div>
        <section className="statistics-timeline-section statistics-radar-section" aria-label="Study style profile">
          <div className="statistics-timeline-heading">
            <h3>Study style profile</h3>
            <span className="statistics-timeline-legend-item">
              {sessions.length < MIN_STYLE_SESSIONS ? `Needs at least ${MIN_STYLE_SESSIONS} exercises` : 'Low everywhere is best'}
            </span>
          </div>
          <RadarChart
            ariaLabel="Study style radar chart"
            startAngle={(-2 * Math.PI) / 3}
            floor={0.1}
            axes={[
              { label: 'Phantom', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.phantom, description: 'Accurate and quick, but with cheats. Leans on aids.' },
              { label: 'Dunning-Kruger', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.dunningKruger, description: 'Confident on difficult exercises, yet inaccurate. Overestimates own skill.' },
              { label: 'Hidden genius', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.hiddenGenius, description: 'Accurate and decisive, yet low confidence. Underestimates own skill.' },
              { label: 'Speed demon', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.speedDemon, description: 'Finishes in under 5 minutes with many mistakes. Rushes.' },
              { label: 'Perfectionist', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.perfectionist, description: 'Accurate without cheats, but takes over 20 minutes.' },
              { label: 'Stubborn', value: sessions.length < MIN_STYLE_SESSIONS ? 0 : style.stubborn, description: 'Many mistakes, no cheats, and either a long time or a lot of undoing. Struggles without help.' },
            ]}
          />
        </section>
      </div>
    </>
  );
}
