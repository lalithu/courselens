import { useEffect, useId, useState, type PointerEvent } from 'react';
import { z } from 'zod';
import { datasetFile, datasetLabel } from './dataset';
import { readJson } from './data';
import { eventStyles, eventTypes } from './domain';

const pointSchema = z.object({
  day: z.number().nonnegative(),
  mean: z.number().min(0).max(100),
  count: z.number().int().positive(),
  median: z.number().min(0).max(100),
  eventsThroughDay: z.number().int().nonnegative(),
  snapshotsThroughDay: z.number().int().nonnegative(),
  activityThroughDay: z.record(z.string(), z.number().int().nonnegative()),
});
const schema = z.object({
  lastDay: z.number().nonnegative(),
  traceCount: z.number().int().nonnegative(),
  snapshotCount: z.number().int().nonnegative(),
  eventCount: z.number().int().nonnegative(),
  activity: z.record(z.string(), z.number().int().nonnegative()),
  finalCount: z.number().int().nonnegative(),
  trend: z.array(pointSchema),
});
type Summary = z.infer<typeof schema>;
type Point = z.infer<typeof pointSchema>;

export function useCourseSummary() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [unavailable, setUnavailable] = useState(false);
  useEffect(() => {
    const controller = new AbortController();
    readJson(datasetFile('course-summary.json'), schema, controller.signal)
      .then(setSummary).catch(() => { if (!controller.signal.aborted) setUnavailable(true); });
    return () => controller.abort();
  }, []);
  return { summary, unavailable };
}

export function CourseOverview({ expanded, onOpen, day, onDay, summary, unavailable }: {
  expanded: boolean;
  onOpen: () => void;
  day: number;
  onDay: (day: number) => void;
  summary: Summary | null;
  unavailable: boolean;
}) {
  const sliderId = useId();
  const [preview, setPreview] = useState<{ index: number; cutoff: number } | null>(null);
  const trend = (summary?.trend ?? []).filter(point => point.day <= day);
  const index = preview?.cutoff === day && preview.index < trend.length ? preview.index : trend.length - 1;
  const point = trend[index];
  function pin(i: number) {
    if (trend[i]) onDay(trend[i].day);
    setPreview(null);
  }

  return <section className="panel course-panel cohort-panel" aria-label="Course overview">
    <div className="course-row course-between">
      <div><p className="eyebrow">Course overview</p><h2>{expanded ? 'CS1 learning across the course' : 'How the course is progressing'}</h2></div>
      {summary && <span className="course-pill">{summary.traceCount.toLocaleString()} simulated traces</span>}
    </div>
    {unavailable ? <p>Course summary unavailable for this dataset.</p> : !summary ? <p role="status">Loading course summary…</p> : <>
      {point ? <>
        <div className="cohort-body">
          <div><strong>{point.mean.toFixed(1)}%</strong><p>Mean recorded mastery · Day {point.day}{index !== trend.length - 1 && ' · Preview'}</p></div>
          <CourseTrend trend={trend} active={index} onPreview={index=>setPreview(index === null ? null : { index, cutoff: day })} onSelect={pin}/>
        </div>
        <div className="cohort-scrubber">
          <label htmlFor={sliderId}>Course day <strong>{day}</strong></label>
          <input id={sliderId} type="range" min={0} max={summary.lastDay} step={Number.isInteger(summary.lastDay) ? 1 : 'any'}
            value={Math.min(day, summary.lastDay)} aria-valuetext={`Day ${day}`}
            onChange={e=>{setPreview(null);onDay(e.target.valueAsNumber);}}/>
        </div>
        <dl className="cohort-metrics">
          <div><dt>Median mastery</dt><dd>{point.median.toFixed(1)}%</dd></div>
          <div><dt>Traces represented</dt><dd>{point.count.toLocaleString()}</dd></div>
          <div><dt>Events through day {point.day}</dt><dd>{point.eventsThroughDay.toLocaleString()}</dd></div>
        </dl>
      </> : <p className="minor">A daily trend is unavailable.</p>}
      {expanded && <>
        <p className="minor">{datasetLabel} · {(point?.snapshotsThroughDay ?? 0).toLocaleString()} snapshots through day {point?.day ?? day}.</p>
        <h3>Recorded activities through day {point?.day ?? day}</h3>
        <ul className="cohort-activities">{eventTypes.map(type => <li key={type}><span>{eventStyles[type].title}</span><strong>{(point?.activityThroughDay[type] ?? 0).toLocaleString()}</strong></li>)}</ul>
        <p className="minor"> Daily mastery uses each trace’s latest observation at or before that day, within its recorded span. Traces with unavailable mastery are excluded from mastery metrics. Events through the selected day count all recorded course activity up to that point.</p>
      </>}
    </>}
    {!expanded && <button className="button" onClick={onOpen}>View course overview →</button>}
  </section>;
}

function CourseTrend({ trend, active, onPreview, onSelect }: {
  trend: Point[];
  active: number;
  onPreview: (index: number | null) => void;
  onSelect: (index: number) => void;
}) {
  const first = trend[0], last = trend.at(-1)!, point = trend[active];
  const span = last.day - first.day || 1;
  const x = (day: number) => 8 + (day - first.day) / span * 284;
  const y = (mean: number) => 68 - mean * .6;
  const line = trend.map(sample => `${x(sample.day)},${y(sample.mean)}`).join(' ');
  function nearest(event: PointerEvent<SVGSVGElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const target = first.day + ((event.clientX - rect.left) / rect.width * 300 - 8) / 284 * span;
    return trend.reduce((best, sample, i) => Math.abs(sample.day - target) < Math.abs(trend[best].day - target) ? i : best, 0);
  }
  return <figure className="cohort-trend" data-through-day={last.day}>
    <svg viewBox="0 0 300 76" preserveAspectRatio="none" role="img" aria-label={`Mean recorded mastery on day ${point.day}: ${point.mean.toFixed(1)} percent. Use the course progress slider to select a day.`}
      onPointerMove={e=>{if(e.pointerType!=='touch')onPreview(nearest(e));}} onPointerLeave={()=>onPreview(null)} onPointerUp={e=>onSelect(nearest(e))}>
      <path d="M8 68 H292 M8 38 H292 M8 8 H292" fill="none" stroke="var(--border)"/>
      <polyline points={line} fill="none" stroke="var(--accent)" strokeWidth="2.5" vectorEffect="non-scaling-stroke"/>
      <path d={`M${x(point.day)} 8 V68 M8 ${y(point.mean)} H292`} fill="none" stroke="var(--text-secondary)" strokeDasharray="2 3" vectorEffect="non-scaling-stroke"/>
      <circle className="cohort-live-halo" cx={x(point.day)} cy={y(point.mean)} r="6" fill="var(--cl-green)"/>
      <circle className="cohort-live-dot" cx={x(point.day)} cy={y(point.mean)} r="3.5" fill="#188038"/>
    </svg>
    <figcaption><span>Day {first.day}</span><span>Mean recorded mastery</span><span>Day {last.day}</span></figcaption>
  </figure>;
}
