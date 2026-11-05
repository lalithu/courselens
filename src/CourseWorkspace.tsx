import { useState, type FormEvent } from 'react';
import { readAttachment, readRecord, traceRecordId, updateRecord, type Attachment } from './courseStore';
import type { Trace, TraceEvent } from './data';
import { eventStyles, mastery } from './domain';

export type CourseView = 'teacher' | 'student' | 'canvas';
type Action = 'evidence' | 'feedback' | 'options';

export function CourseWorkspace({ view, trace, event, conceptId, day, endDay }: {
  view: CourseView;
  day: number;
  endDay: number;
  trace: Trace | null;
  event: TraceEvent | null;
  conceptId: string;
}) {
  if (view === 'canvas') return <CanvasPreview/>;
  if (!trace) return view === 'student' ? <section className="panel course-panel">Select a trace to open the student view.</section> : null;
  const recordId = traceRecordId(trace);
  return <TraceWorkspace key={recordId} recordId={recordId} view={view} trace={trace} event={event} conceptId={conceptId} day={day} endDay={endDay}/>;
}

function TraceWorkspace({ view, trace, event, conceptId, recordId, day, endDay }: {
  view: 'teacher' | 'student';
  day: number;
  endDay: number;
  trace: Trace;
  event: TraceEvent | null;
  conceptId: string;
  recordId: string;
}) {
  const [record, setRecord] = useState(() => readRecord(recordId));
  const isVisible = (item: { day?: number }) => item.day === undefined ? day === endDay : item.day <= day;
  const observations = record.observations.filter(isVisible);
  const feedback = record.feedback.filter(isVisible);
  const reports = record.reports.filter(isVisible);
  const [action, setAction] = useState<Action | null>(null);
  const [message, setMessage] = useState('');
  const snapshot = (view === 'teacher' ? trace.snapshots.find(item => item.id === event?.snapshotId) : undefined) ?? trace.snapshots.at(-1)!;
  const selectedConcept = trace.concepts.find(item => item.id === conceptId);
  const eventLabel = event ? `Day ${snapshot.day} · ${eventStyles[event.type].title} · Event ${event.reportStep}` : 'General trace note';
  const conceptLabel = selectedConcept?.title ?? 'General course feedback';

  if (view === 'student') {
    const current = mastery(snapshot);
    return <div className="course-student">
      <section className="panel course-panel">
        <p className="eyebrow">Student view · Trace {trace.id}</p>
        <h2>Your learning progress</h2>
        <p className="course-summary">{current === null ? 'Mastery unavailable' : `${current.toFixed(1)}% overall mastery`} · Day {snapshot.day}</p>
        <details>
          <summary>Concept progress ({snapshot.concepts.length})</summary>
          <ul className="course-list">{snapshot.concepts.map(item => <li key={item.conceptId}>
            <strong>{trace.concepts.find(concept => concept.id === item.conceptId)?.title ?? item.conceptId}</strong>
            <span>{item.mastered === null ? 'Mastery unavailable' : item.mastered ? 'Mastered' : 'Mastery not yet demonstrated'} · {item.confidence === null ? 'Confidence unavailable' : `${(item.confidence * 100).toFixed(1)}% simulator confidence`}</span>
          </li>)}</ul>
        </details>
      </section>
      <section className="panel course-panel"><p className="eyebrow">Approved feedback</p><h2>What to practice next</h2>
        {feedback.length ? <ul className="course-list">{feedback.map(item => <li key={item.id}><strong>{item.concept}</strong><span>{item.event}</span><p>{item.text}</p></li>)}</ul> : <p>No teacher feedback has been approved for this trace.</p>}
        <h2>Progress reports</h2>
        {reports.length ? <ul className="course-list">{reports.map(report => <li key={report.id}><strong>{report.subject}</strong><p>{report.body}</p></li>)}</ul> : <p>No progress reports have been published for this trace.</p>}
      </section>
    </div>;
  }

  return <section className="panel course-panel course-tools" aria-label="Teacher tools">
    <div className="course-row course-between">
      <div><p className="eyebrow">Teacher tools</p><h2>Evidence &amp; feedback</h2></div>
      <div className="course-row">
        <button className="button primary" onClick={() => setAction('evidence')}>Add evidence</button>
        <button className="button" onClick={() => setAction('feedback')}>Draft feedback</button>
        <button className="button" onClick={() => setAction('options')}>Try a teaching option</button>
      </div>
    </div>
    {message && <p role="status">{message}</p>}
    {!!observations.length && <details><summary>Teacher observations ({observations.length})</summary>
      <ul className="course-list">{observations.map(item => <li key={item.id}>
        <strong>{item.concept}</strong><span>{item.event}</span><p>{item.text}</p>
        {item.attachment && <a href={item.attachment.url} download={item.attachment.name}>{item.attachment.name}</a>}
      </li>)}</ul>
    </details>}
    {action && <ActionForm key={action} action={action} concept={conceptLabel} event={eventLabel} close={() => setAction(null)}
      save={(text, attachment) => {
        const item = { id: crypto.randomUUID(), day, text, concept: conceptLabel, event: eventLabel };
        setRecord(updateRecord(recordId, current => action === 'evidence'
          ? { ...current, observations: [{ ...item, attachment }, ...current.observations] }
          : { ...current, feedback: [item, ...current.feedback] }));
        setMessage(action === 'evidence' ? 'Observation saved to this trace.' : 'Approved feedback is available in Student view.');
        setAction(null);
      }}/>}
  </section>;
}

function ActionForm({ action, concept, event, close, save }: {
  action: Action;
  concept: string;
  event: string;
  close: () => void;
  save: (text: string, attachment?: Attachment) => void;
}) {
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [option, setOption] = useState('worked');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!text.trim()) { setError('Enter a note or feedback message.'); return; }
    setBusy(true);
    setError('');
    try {
      const attachment = file ? await readAttachment(file) : undefined;
      save(text.trim(), attachment);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save. Check your browser storage.');
      setBusy(false);
    }
  }

  return <form className="course-editor" onSubmit={submit}>
    <h3>{action === 'evidence' ? 'Add evidence' : action === 'feedback' ? 'Review student feedback' : 'Compare teaching options'}</h3>
    <p>{event} · {concept}</p>
    {action === 'options' ? <>
      <label className="field">Teaching activity<select value={option} onChange={e => setOption(e.target.value)}><option value="worked">Guided worked example</option><option value="check">Independent practice check</option></select></label>
      <p><strong>Illustrative guidance</strong> · {option === 'worked' ? 'Ask the student to explain each step before trying a similar problem independently.' : 'Give a short transfer question and use their explanation to choose the next exercise.'}</p>
    </> : <>
      <label className="field">{action === 'evidence' ? 'Teacher observation' : 'Message to student'}<textarea required rows={3} value={text} onChange={e => setText(e.target.value)}/></label>
      {action === 'evidence' && <label className="field">Optional attachment · 1 MB maximum<input type="file" accept="image/png,image/jpeg,image/webp,application/pdf,text/plain" onChange={e => setFile(e.target.files?.[0] ?? null)}/></label>}
      {error && <p role="alert">{error}</p>}
    </>}
    <div className="course-row">
      {action !== 'options' && <button className="button primary" disabled={busy}>{busy ? 'Saving…' : action === 'evidence' ? 'Save observation' : 'Approve feedback'}</button>}
      <button type="button" className="button" disabled={busy} onClick={close}>Close</button>
    </div>
  </form>;
}

function CanvasPreview() {
  const [stage, setStage] = useState<'initial' | 'review' | 'confirmed'>('initial');
  return <section className="panel course-panel canvas-preview">
    <p className="eyebrow">Course setup · Sample import</p><h2>Canvas course map</h2>
    <p>Preview how course materials, assessments, and rubrics would be reviewed before a Canvas import.</p>
    {stage === 'initial' ? <button className="button primary" onClick={() => setStage('review')}>Preview sample import</button> : <>
      <ul className="course-list">
        <li><strong>Variables and expressions</strong><span>Module material · Variables, expressions</span></li>
        <li><strong>Loop debugging</strong><span>Assignment and rubric · Loops, conditionals</span></li>
        <li><strong>Final assessment</strong><span>Assessment · Course concepts</span></li>
      </ul>
      {stage === 'review' ? <button className="button primary" onClick={() => setStage('confirmed')}>Confirm sample map</button> : <p role="status">Sample map confirmed. The teacher workspace uses the original simulated traces.</p>}
    </>}
  </section>;
}
