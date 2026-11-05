import type { Trace } from './data';
import { summarizeProgress } from './progressReport';

export type TraceTab = 'progress' | 'concepts' | 'support';

export function TraceProfile({ trace, tab, onTab }: {
  trace: Trace;
  tab: TraceTab;
  onTab: (tab: TraceTab) => void;
}) {
  const summary = summarizeProgress(trace);
  return <section className="panel trace-profile" aria-label="Student profile">
    <div className="course-row course-between">
      <div className="course-row">
        <span className="trace-avatar" aria-hidden="true">{trace.id.length <= 3 ? trace.id : 'CS'}</span>
        <div><p className="eyebrow">Student profile · Simulated CS1</p><h2>Trace {trace.id}</h2><p className="minor">Latest activity · {summary.latestEvent}</p></div>
      </div>
      <div className="profile-metrics">
        <div><strong>{summary.mastery}</strong><span>Latest mastery</span></div>
        <div><strong>{summary.mastered} / {summary.total}</strong><span>Concepts mastered</span></div>
        <div><strong>{trace.events.length}</strong><span>Recorded events</span></div>
      </div>
    </div>
    <nav className="course-row trace-nav" aria-label="Student profile sections">
      {([['progress','Progress & evidence'],['concepts','Concepts & graph'],['support','Support & feedback']] as const).map(([id,label]) =>
        <button key={id} className="button" aria-pressed={tab===id} onClick={()=>onTab(id)}>{label}</button>)}
    </nav>
  </section>;
}
