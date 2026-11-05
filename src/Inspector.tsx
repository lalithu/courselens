import {useEffect,useRef,useState,memo} from 'react';
import {ChartSync} from './chartSync';
import Markdown from 'react-markdown';
import type { CSSProperties } from 'react';
import type { Snapshot, Trace, TraceEvent } from './data';
import { eventStyles, mastery } from './domain';

export function Inspector({trace,event,sync,currentSnapshot}:{currentSnapshot:Snapshot|null;trace:Trace|null;event:TraceEvent|null;sync:ChartSync}){
  // Update the heavy event content only when the previewed event changes,
  // rather than rendering Markdown on every pointer movement.
  const [previewId,setPreviewId]=useState<string|null|undefined>(undefined);
  const day=useRef<number|null>(null);
  useEffect(()=>{
    day.current=null;setPreviewId(undefined);
    const update=()=>{
      if(day.current===null){setPreviewId(undefined);return;}
      const exact=trace?.events.find(e=>e.id===sync.hoveredEventId);
      if(exact){setPreviewId(exact.id);return;}
      let latest:TraceEvent|null=null;
      if(trace){const days=new Map(trace.snapshots.map(s=>[s.id,s.day]));for(const candidate of trace.events){if(days.get(candidate.snapshotId)!>day.current)break;latest=candidate;}}
      setPreviewId(latest?.id??null);
    };
    const unsubscribeTime=sync.subscribe(value=>{day.current=value;update();});
    const unsubscribeEvent=sync.subscribeEvent(update);
    return()=>{unsubscribeTime();unsubscribeEvent();};
  },[trace,sync]);
  const preview=previewId!==undefined;
  const shown=preview?trace?.events.find(e=>e.id===previewId)??null:event;
  return <InspectorContent trace={trace} event={shown} preview={preview} currentSnapshot={preview ? null : currentSnapshot}/>;
}

const InspectorContent=memo(function InspectorContent({ trace, event, preview, currentSnapshot }: { currentSnapshot: Snapshot | null; trace: Trace | null; event: TraceEvent | null; preview:boolean }) {
  if (!trace || !event) return <aside className="panel inspector" aria-label="Event details" data-preview={preview}><p className="eyebrow">Inspector</p><h2>Event details</h2><p className="muted inspector-placeholder">{preview?'No event was recorded at or before this point. Select an event to inspect it.':'Select a learning event to explore its input, student response, and recorded knowledge state.'}</p><div className="inspector-guide" aria-hidden="true"><span>01</span> Choose a trace<br/><span>02</span> Explore the timeline<br/><span>03</span> Inspect an event</div></aside>;
  const state = trace.snapshots.find(s => s.id === event.snapshotId)!;
  const masteryState = currentSnapshot ?? state;
  const percent = mastery(masteryState);
  return <aside className="panel inspector" aria-label="Event details" data-preview={preview} data-event-id={event.id} style={{ '--event-accent': eventStyles[event.type].color } as CSSProperties}>
    <p className="eyebrow">{preview?'Hover preview':'Event details'}</p>
    {preview&&<p className="inspector-preview-note">Recorded event preview · your selection is retained</p>}
    <h2 className="event-title"><span className="event-title-glyph" aria-hidden="true">{eventStyles[event.type].glyph}</span>{eventStyles[event.type].title}</h2>
    <p className="event-meta">Day {state.day} <span>·</span> Event {event.reportStep} of {trace.events.length}<br/>Snapshot {state.sequence + 1} <span>·</span> Profile {trace.profileId}</p>
    <div className="mastery-value"><strong>{percent === null ? '—' : `${percent.toFixed(1)}%`}</strong><span>overall mastery</span></div>
    <p className="measure-note">{percent === null ? 'Incomplete mastery data' : `${masteryState.concepts.filter(c => c.mastered).length} of ${masteryState.concepts.length} concepts mastered`} · simulator snapshot on day {masteryState.day}</p>
    {(event.type==='quiz'||event.type==='homework') && <div className="assessment-summary" aria-label="Assessment correctness"><span className="eyebrow">Assessment correctness</span>{event.assessments.length ? <div className="correctness-counts">{(['correct','incorrect','unknown'] as const).map(status=><span className={`state-badge correctness-${status}`} key={status}>{event.assessments.filter(a=>a.correctness===status).length} {status}</span>)}</div> : <span className="state-badge">Unavailable</span>}<p>Labels use exact question-and-answer matches in the source references. Unmatched responses remain Unknown.</p></div>}
    <details className="source-record"><summary>Source record</summary><p>Event text: report step {event.reportStep}. Mastery: snapshot {masteryState.sequence + 1}.</p>{trace.sources.map(source => <code key={source.path}>{source.path}</code>)}<p>Original input</p><pre data-testid="original-input">{event.inputText}</pre><p>Original response</p><pre data-testid="original-response">{event.responseText || '(No response recorded)'}</pre></details>
    {event.assessments.length ? <section className="event-section"><h3>Questions and responses</h3>{event.assessments.map((assessment,i)=><article className="assessment-card" key={i} data-correctness={assessment.correctness}><div className="assessment-card-heading"><strong>Question {i+1}</strong><span className={`state-badge correctness-${assessment.correctness}`}>{assessment.correctness==='unknown'?'Unknown':assessment.correctness==='correct'?'Correct':'Incorrect'}</span></div><div className="markdown"><Markdown skipHtml>{assessment.questionText}</Markdown></div>{assessment.correctness==='unknown'&&<p className="small muted">No exact source reference matched this response.</p>}<p className="response-label">Student response</p><div className="markdown"><Markdown skipHtml>{assessment.responseText || 'No response supplied.'}</Markdown></div>{assessment.conceptIds.length>0&&<p className="small muted">Recorded concepts: {assessment.conceptIds.join(', ')}</p>}</article>)}</section> : <section className="event-section"><h3>{event.type === 'quiz' || event.type === 'homework' ? 'Assessment questions' : 'Learning material'}</h3><div className="markdown"><Markdown skipHtml>{event.inputText || 'Event text unavailable: no matching event report was supplied.'}</Markdown></div></section>}
    {event.responseText && !event.assessments.length && <section className="event-section"><h3>Student response</h3><div className="markdown"><Markdown skipHtml>{event.responseText}</Markdown></div><p className="small muted">Original response; no structured question-and-answer match is available.</p></section>}
  </aside>;
});
