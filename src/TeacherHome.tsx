import { useState, type FormEvent } from 'react';
import type { Trace } from './data';
import { readRecord, traceRecordId, updateRecord } from './courseStore';
import { traceAtDay } from './traceAtDay';
import { reportText, summarizeProgress } from './progressReport';

type Reply = { day: number; prompt: string; traceId: string; text: string };

function makeReply(question: string, trace: Trace) {
  const summary = summarizeProgress(trace);
  if (/misconception/i.test(question)) {
    return summary.active === null ? 'Misconception state is unavailable at the latest snapshot.'
      : summary.active.length ? `Active on day ${summary.day}: ${summary.active.join(', ')}.`
      : `No active misconceptions were recorded on day ${summary.day}.`;
  }
  if (/quiz|assessment|scores?/i.test(question)) {
    const { correct, incorrect, unknown } = summary.counts;
    return `Across recorded assessment items: ${correct} correct, ${incorrect} incorrect, and ${unknown} unknown. Open Trace details for the original responses and item-level evidence.`;
  }
  const change = summary.change === null ? '' : ` The change since the first snapshot was ${summary.change >= 0 ? '+' : ''}${summary.change.toFixed(1)} percentage points.`;
  const next = summary.focus.length ? ` Review ${summary.focus.join(', ')} next. These concepts have recorded exposure and mastery has yet to be demonstrated.` : '';
  return `By day ${summary.day}, trace ${trace.id} shows ${summary.mastered} of ${summary.total} concepts mastered. Latest activity: ${summary.latestEvent}.${change}${next}`;
}

export function TeacherHome({ trace, selectedTraceId, day, resolveTrace, openTrace, openDetails }: {
  trace: Trace | null;
  selectedTraceId?: string;
  day: number;
  resolveTrace: (id: string) => Promise<Trace>;
  openTrace: (id: string) => void;
  openDetails: () => void;
}) {
  const [question, setQuestion] = useState('');
  const [reply, setReply] = useState<Reply | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function ask(prompt: string) {
    if (!prompt.trim() || !selectedTraceId || busy) return;
    const number = prompt.match(/\b(?:trace|student)\s*#?\s*(\d+)\b/i)?.[1];
    const id = number ? String(Number(number)) : selectedTraceId;
    setBusy(true);
    setError('');
    try {
      const target = trace?.id === id ? trace : traceAtDay(await resolveTrace(id), day);
      setReply({ day, prompt, traceId: id, text: target ? makeReply(prompt, target) : `Trace ${id} has no recorded observations through day ${day}.` });
      setQuestion('');
    } catch {
      setError(`Trace ${id} could not be loaded. Choose a trace in the selector or try another number.`);
    } finally {
      setBusy(false);
    }
  }

  return <div className="teacher-home">
    <section className="panel course-panel teacher-assistant" aria-label="Teacher assistant">
      <p className="eyebrow">Teacher workspace · CS1</p>
      <h2>What would you like to know?</h2>
      <p className="teacher-subtitle">Ask about progress, assessments, or misconceptions. Use a trace number to look up a different student.</p>
      <form className="teacher-prompt" onSubmit={e => { e.preventDefault(); void ask(question); }}>
        <input aria-label="Ask about a student" value={question} placeholder="Give me an update on trace 206" onChange={e => setQuestion(e.target.value)}/>
        <button className="button primary" disabled={!selectedTraceId || busy || !question.trim()}>{busy ? 'Looking up…' : 'Ask'}</button>
      </form>
      <div className="course-row teacher-suggestions">
        {['Update on this student', 'Summarize assessments', 'What misconceptions are active?'].map(prompt =>
          <button className="button" key={prompt} disabled={!selectedTraceId || busy} onClick={() => void ask(prompt)}>{prompt}</button>)}
      </div>
      {error && <p role="alert">{error}</p>}
      {reply?.day === day && <div className="teacher-replies" aria-live="polite">
        <article>
          <p className="teacher-question">{reply.prompt}</p>
          <p className="eyebrow">Recorded trace {reply.traceId}</p><p>{reply.text}</p>
          <button className="button" onClick={() => openTrace(reply.traceId)}>Open trace {reply.traceId} details</button>
        </article>
      </div>}
      <p className="minor">Local answers are drawn from the recorded simulator data.</p>
    </section>
    {trace && <StudentBrief key={traceRecordId(trace)} trace={trace} day={day} openDetails={openDetails}/>}
  </div>;
}

function StudentBrief({ trace, day, openDetails }: { trace: Trace; day: number; openDetails: () => void }) {
  const summary = summarizeProgress(trace);
  const [audience, setAudience] = useState<'student' | 'parent' | null>(null);
  const [status, setStatus] = useState('');
  return <section className="panel course-panel teacher-brief" aria-label="Student briefing">
    <div className="course-row course-between">
      <div><p className="eyebrow">Selected student</p><h2>Trace {trace.id} · Progress brief</h2></div>
      <button className="button" onClick={openDetails}>Open trace details</button>
    </div>
    <div className="brief-stats"><div><strong>{summary.mastery}</strong><span>Overall mastery</span></div><div><strong>{summary.mastered} / {summary.total}</strong><span>Concepts mastered</span></div><div><strong>Day {summary.day}</strong><span>Latest snapshot</span></div></div>
    <p className="brief-focus"><strong>Review next</strong> {summary.focus.join(', ') || 'No exposed, unmastered concepts flagged at this snapshot.'}</p>
    <div className="course-row">
      <button className="button primary" onClick={() => setAudience('student')}>Send report to student</button>
      <button className="button" onClick={() => setAudience('parent')}>Send report to parent</button>
    </div>
    {status && <p role="status">{status}</p>}
    {audience && <ReportEditor key={audience + day} trace={trace} day={day} audience={audience} close={() => setAudience(null)} onPublish={() => { setAudience(null); setStatus('Report published to the local Student view.'); }}/>}
  </section>;
}

function ReportEditor({ trace, day, audience, close, onPublish }: {
  trace: Trace;
  day: number;
  audience: 'student' | 'parent';
  close: () => void;
  onPublish: () => void;
}) {
  const id = traceRecordId(trace);
  const [draft, setDraft] = useState(() => reportText(trace, audience));
  const [email, setEmail] = useState(() => readRecord(id).contacts[audience]);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const emailValid = /^[^\s@?,;]+@[^\s@?,;]+\.[^\s@?,;]+$/.test(email.trim());
  const draftReady = Boolean(draft.subject.trim() && draft.body.trim());

  function saveContact(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!emailValid) { setError('Enter a valid recipient address.'); return; }
    try {
      updateRecord(id, current => ({ ...current, contacts: { ...current.contacts, [audience]: email.trim() } }));
      setError('');
      setStatus('Recipient saved in this browser.');
    } catch { setError('Browser storage could not save the recipient.'); }
  }

  function publish() {
    try {
      updateRecord(id, current => ({ ...current, reports: [{ id: crypto.randomUUID(), day, ...draft }, ...current.reports] }));
      onPublish();
    } catch { setError('Browser storage could not save the report.'); }
  }

  return <section className="course-editor report-editor" aria-label={`Review ${audience} report`}>
    <h3>Review {audience} report</h3>
    <p>Recipient addresses are saved locally. Open an email draft to review and send it from your email app.</p>
    <form className="course-row report-recipient" onSubmit={saveContact}>
      <label className="field">{audience === 'student' ? 'Student email' : 'Parent email'}<input type="email" required value={email} onChange={e => setEmail(e.target.value)}/></label>
      <button className="button">Save recipient</button>
    </form>
    <label className="field">Report subject<input value={draft.subject} onChange={e => setDraft({ ...draft, subject: e.target.value })}/></label>
    <label className="field">Report message<textarea rows={5} value={draft.body} onChange={e => setDraft({ ...draft, body: e.target.value })}/></label>
    {error && <p role="alert">{error}</p>}
    {status && <p role="status">{status}</p>}
    <div className="course-row">
      {emailValid && draftReady
        ? <a className="button primary" href={`mailto:${encodeURIComponent(email.trim())}?subject=${encodeURIComponent(draft.subject)}&body=${encodeURIComponent(draft.body)}`}>Open email draft</a>
        : <button className="button primary" disabled>Open email draft</button>}
      {audience === 'student' && <button className="button" disabled={!draftReady} onClick={publish}>Publish to Student view</button>}
      <button className="button" onClick={close}>Close report</button>
    </div>
  </section>;
}
