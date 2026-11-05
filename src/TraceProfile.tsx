import type { Snapshot, Trace, TraceEvent } from './data';
import { eventStyles, mastery } from './domain';

export type TraceTab = 'progress' | 'concepts' | 'support';

export function TraceProfile({ trace, tab, onTab, snapshot, day, event }: {
  trace: Trace;
  snapshot: Snapshot;
  day: number;
  event: TraceEvent | null;
  tab: TraceTab;
  onTab: (tab: TraceTab) => void;
}) {
  const percent = mastery(snapshot);
  const mastered = snapshot.concepts.filter(concept => concept.mastered === true).length;
  const events = event ? trace.events.indexOf(event) + 1 : 0;
  return <section className="panel trace-profile" aria-label="Student profile">
    <div className="course-row course-between">
      <div className="course-row">
        <span className="trace-avatar" aria-hidden="true">{trace.id.length <= 3 ? trace.id : 'CS'}</span>
        <div><p className="eyebrow">Student profile · Simulated CS1</p><h2>Trace {trace.id}</h2><p className="minor">Day {day} · {event ? eventStyles[event.type].title : 'No event selected'}</p></div>
      </div>
      <div className="profile-metrics">
        <div><strong>{percent === null ? 'Unavailable' : percent.toFixed(1) + '%'}</strong><span>Recorded mastery</span></div>
        <div><strong>{mastered} / {snapshot.concepts.length}</strong><span>Concepts mastered</span></div>
        <div><strong>{events}</strong><span>Events through selection</span></div>
      </div>
    </div>
    <nav className="course-row trace-nav" aria-label="Student profile sections">
      {([['progress','Progress & evidence'],['concepts','Concepts & graph'],['support','Support & feedback']] as const).map(([id,label]) =>
        <button key={id} className="button" aria-pressed={tab===id} onClick={()=>onTab(id)}>{label}</button>)}
    </nav>
  </section>;
}
