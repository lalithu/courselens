import type { Snapshot } from './data';

export function TraceScrubber({ start, end, day, snapshot, onChange }: {
  start: number;
  end: number;
  day: number;
  snapshot: Snapshot | null;
  onChange: (day: number) => void;
}) {
  const label = Number(day.toFixed(3));
  return <section className="panel trace-scrubber" aria-label="Course playback">
    <div className="course-row course-between">
      <label htmlFor="trace-simulation-day"><span className="current-day-dot" aria-hidden="true"/> Course progress</label>
      <output htmlFor="trace-simulation-day">Day {label}{snapshot && snapshot.day !== day && <span> · Last recorded snapshot on day {snapshot.day}</span>}</output>
    </div>
    <input id="trace-simulation-day" type="range" min={start} max={end}
      step={Number.isInteger(start) && Number.isInteger(end) ? 1 : 'any'}
      value={day} disabled={start === end} aria-valuetext={`Day ${label} of ${end}`}
      onChange={e => onChange(e.target.valueAsNumber)}/>
    <div className="course-row course-between minor"><span>Day {start}</span><span>Day {end} · End of course</span></div>
  </section>;
}
