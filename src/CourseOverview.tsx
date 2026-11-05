import { useEffect, useState } from 'react';
import { z } from 'zod';
import { datasetFile, datasetLabel } from './dataset';
import { readJson } from './data';
import { eventStyles, eventTypes } from './domain';

const schema = z.object({
  traceCount: z.number().int().nonnegative(),
  snapshotCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  activity: z.record(z.string(), z.number().int().nonnegative()),
  finalMean: z.number().min(0).max(100).nullable(),
  finalCount: z.number().int().nonnegative(),
  trend: z.array(z.object({ day: z.number().nonnegative(), mean: z.number().min(0).max(100), count: z.number().int().positive() })),
});
type Summary = z.infer<typeof schema>;

export function CourseOverview({ expanded, onOpen }: { expanded: boolean; onOpen: () => void }) {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    readJson(datasetFile('course-summary.json'), schema, controller.signal)
      .then(setSummary).catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => controller.abort();
  }, []);

  const final = summary?.finalMean;
  return <section className="panel course-panel cohort-panel" aria-label="Course overview">
    <div className="course-row course-between">
      <div><p className="eyebrow">Course overview</p><h2>{expanded ? 'CS1 learning across the course' : 'How the course is progressing'}</h2></div>
      {summary && <span className="course-pill">{summary.traceCount.toLocaleString()} simulated traces</span>}
    </div>
    {unavailable ? <p>Course summary unavailable for this dataset.</p> : !summary ? <p role="status">Loading course summary…</p> : <>
      <div className="cohort-body">
        <div><strong>{final == null ? 'Unavailable' : final.toFixed(1) + '%'}</strong><p>Average mastery at each trace’s last snapshot</p></div>
        <CourseTrend trend={summary.trend}/>
      </div>
      {expanded && <>
        <p className="minor">{datasetLabel} · {summary.snapshotCount.toLocaleString()} snapshots · {summary.finalCount.toLocaleString()} traces with known final mastery.</p>
        <h3>Recorded activities</h3>
        <ul className="cohort-activities">{eventTypes.map(type => <li key={type}><span>{eventStyles[type].title}</span><strong>{(summary.activity[type] ?? 0).toLocaleString()}</strong></li>)}</ul>
        <p className="minor">{summary.eventCount.toLocaleString()} events in total. The daily trend uses each trace’s latest observation at or before that day, within the trace’s recorded span. Traces with unavailable mastery are excluded for that day.</p>
      </>}
    </>}
    {!expanded && <button className="button" onClick={onOpen}>View course overview →</button>}
  </section>;
}

function CourseTrend({ trend }: { trend: Summary['trend'] }) {
  if (trend.length < 2) return <p className="minor">A daily trend is unavailable.</p>;
  const first = trend[0], last = trend.at(-1)!;
  const span = last.day - first.day || 1;
  const x = (day: number) => 8 + (day - first.day) / span * 284;
  const y = (mean: number) => 68 - mean * .6;
  const line = trend.map(point => `${x(point.day)},${y(point.mean)}`).join(' ');
  return <figure className="cohort-trend">
    <svg viewBox="0 0 300 76" role="img" aria-label={`Mean recorded mastery from day ${first.day} (${first.mean.toFixed(1)}%) to day ${last.day} (${last.mean.toFixed(1)}%)`}>
      <path d={`M8 68 H292 M8 38 H292 M8 8 H292`} fill="none" stroke="var(--border)"/>
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
      <circle cx={x(last.day)} cy={y(last.mean)} r="3" fill="var(--accent)"/>
    </svg>
    <figcaption><span>Day {first.day}</span><span>Mean recorded mastery</span><span>Day {last.day}</span></figcaption>
  </figure>;
}
