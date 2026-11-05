import { datasetFile, datasetLabel } from './dataset';
import { useEffect, useRef, useState } from 'react';
import { manifestSchema, traceSchema, readJson, verifyIdentity, type Manifest, type Trace, type TraceEntry } from './data';
import { eventStyles, eventTypes } from './domain';
import { Timeline } from './Timeline';
import { Inspector } from './Inspector';
import { UploadDialog } from './UploadDialog';
import { withReferences } from './references';
import type { LocalTrace } from './imports';
import { ChartSync } from './chartSync';
import type { WindowRange } from './domain';
import { KnowledgeGraph } from './KnowledgeGraph';
import { ResearchPanels } from './ResearchPanels';
import { CourseWorkspace, type CourseView } from './CourseWorkspace';
import { TeacherHome } from './TeacherHome';
import { CourseOverview } from './CourseOverview';
import { TraceProfile, type TraceTab } from './TraceProfile';

const datasetUrl = datasetFile('manifest.json');
export default function App() {
  const [view, setView] = useState<CourseView>('teacher');
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [courseOpen, setCourseOpen] = useState(false);
  const [traceTab, setTraceTab] = useState<TraceTab>('progress');
  const sync = useRef(new ChartSync()).current;
  const [timeRange, setTimeRange] = useState<WindowRange | null>(null);
  const shell = useRef<HTMLDivElement>(null);
  const fullscreenButton = useRef<HTMLButtonElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [fullscreenError, setFullscreenError] = useState('');
  function closeExpanded() {
    if (document.fullscreenElement === shell.current) void document.exitFullscreen().catch(() => {});
    setExpanded(false);
    fullscreenButton.current?.focus();
  }
  async function toggleExpanded() {
    if (expanded) { closeExpanded(); return; }
    setFullscreenError('');
    setExpanded(true);
    try {
      if (shell.current?.requestFullscreen) await shell.current.requestFullscreen();
    } catch {
      setFullscreenError('Browser fullscreen is unavailable. Expanded view is active; use Exit fullscreen or Escape to return.');
    }
  }
  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) { setExpanded(false); fullscreenButton.current?.focus(); }
    };
    const onKey = (event: KeyboardEvent) => {
      // Let an open upload dialog handle its own Escape key first.
      if (event.key === 'Escape' && !document.querySelector('dialog[open]')) closeExpanded();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('fullscreenchange', onChange); document.removeEventListener('keydown', onKey); };
  }, []);
  useEffect(() => {
    const panel=shell.current?.querySelector('.timeline-panel');
    if (!panel) return;
    const observer=new ResizeObserver(()=>shell.current?.style.setProperty('--timeline-height',`${panel.getBoundingClientRect().height}px`));
    observer.observe(panel);
    return ()=>observer.disconnect();
  }, [view, detailsOpen, traceTab, expanded]);
  const [manifest, setManifest] = useState<Manifest | null>(null);
  const [chosen, setChosen] = useState('');
  const [trace, setTrace] = useState<Trace | null>(null);
  const [eventId, setEventId] = useState<string | null>(null);
  useEffect(()=>{sync.publish(null);},[eventId,sync]);
  const [loading, setLoading] = useState(false);
  const [datasetLoading, setDatasetLoading] = useState(true);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const [reset, setReset] = useState(0);
  const [overview,setOverview] = useState(true);
  const [conceptId, setConceptId] = useState('');
  const [imports,setImports]=useState<LocalTrace[]>([]);
  const entries=[...(manifest?.traces??[]),...imports.map(item=>item.entry)];
  const pending = useRef<AbortController | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    setDatasetLoading(true); setError('');
    readJson(datasetUrl, manifestSchema, controller.signal).then(value => {
      setManifest(value);
      const example = value.traces.find(entry => entry.id === '206') ?? value.traces[0];
      if (example) void loadTrace(example.id, example);
    }).catch(e => { if (!controller.signal.aborted) setError(`${e.message} Check that the bundled trace data is present, then retry.`); })
      .finally(() => { if (!controller.signal.aborted) setDatasetLoading(false); });
    return () => controller.abort();
  }, [retry]);
  useEffect(() => () => pending.current?.abort(), []);

  async function resolveTrace(id: string, initialEntry?: TraceEntry, signal = new AbortController().signal) {
    const local = imports.find(item => item.entry.id === id);
    const entry = initialEntry ?? local?.entry ?? manifest?.traces.find(item => item.id === id);
    if (!entry) throw new Error('Trace not found.');
    const raw = local ? await local.load() : await readJson(new URL(entry.path, datasetUrl).href, traceSchema, signal);
    if (!local) verifyIdentity(raw, entry);
    return withReferences(raw);
  }

  async function loadTrace(id: string, initialEntry?: TraceEntry) {
    setChosen(id);
    pending.current?.abort();
    const controller = new AbortController(); pending.current = controller;
    setLoading(true); setError('');
    try {
      const value = await resolveTrace(id, initialEntry, controller.signal);
      if (!controller.signal.aborted) { setTimeRange(null); sync.publish(null); setTrace(value); setEventId(value.events.find(e => e.type === 'homework')?.id ?? value.events[0]?.id ?? null); setConceptId(value.concepts.find(c => c.id === 'Variables')?.id ?? value.concepts[0]?.id ?? ''); setOverview(true); setReset(n => n + 1); }
    } catch (e) {
      if (!controller.signal.aborted) setError(`${e instanceof Error ? e.message : 'Could not load trace.'}${trace ? ` Still showing trace ${trace.id}.` : ''}`);
    } finally { if (!controller.signal.aborted) setLoading(false); }
  }
  async function importSources(sources:LocalTrace[]){
    const first=await withReferences(await sources[0].load()); // Do not alter the current collection after an invalid first file.
    pending.current?.abort();setLoading(false);setError('');setImports(previous=>[...previous,...sources]);setChosen(first.id);setTimeRange(null);sync.publish(null);setTrace(first);setEventId(null);setConceptId('');setOverview(true);setReset(n=>n+1);
  }
  const traceIndex = entries.findIndex(t => t.id === chosen);
  const importedEntry=imports.find(item=>item.entry.id===trace?.id)?.entry;
  const selected = trace?.events.find(e => e.id === eventId) ?? null;
  const index = selected ? trace!.events.indexOf(selected) : -1;
  const snapshotById = new Map(trace?.snapshots.map(s => [s.id, s]) ?? []);

  return <div ref={shell} className={`app-shell${expanded ? ' exploration-fullscreen' : ''}`}>
    <header className="app-header">
      <div className="course-brand"><span className="course-mark" aria-hidden="true">◎</span><div><h1>CourseLens</h1><p className="subtitle">CS1 · Intro to Programming</p></div></div>
      <nav className="course-nav" aria-label="Workspace view">
        {([['teacher','Teacher'],['student','Student'],['canvas','Canvas setup']] as const).map(([id,label])=><button key={id} className="button" aria-pressed={view===id} onClick={()=>{if(expanded)closeExpanded();if(id==='teacher'){setDetailsOpen(false);setCourseOpen(false);}setView(id);}}>{label}</button>)}
      </nav>
      <div className="header-actions"><span className="course-pill">{datasetLabel}</span>{view==='teacher' && detailsOpen && <><button ref={fullscreenButton} className="button fullscreen-button" type="button" aria-pressed={expanded} onClick={() => { void toggleExpanded(); }}>{expanded ? 'Exit fullscreen' : 'Fullscreen view'}</button><UploadDialog onImport={importSources}/></>}</div>
    </header>
    {fullscreenError && <p className="fullscreen-notice" role="status">{fullscreenError}</p>}
    {view!=='canvas' && !courseOpen && <div className="trace-bar">
      <label className="field trace-field">Student trace<select aria-label="Student trace" value={chosen} onChange={e => { void loadTrace(e.target.value); }} disabled={!entries.length}><option value="" disabled>{datasetLoading ? 'Reading dataset…' : manifest ? 'Choose a student trace…' : 'Dataset unavailable'}</option>{entries.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}</select></label>
      {view==='teacher' && detailsOpen && <div className="trace-buttons"><button className="button" type="button" disabled={!entries.length || traceIndex <= 0} onClick={() => { void loadTrace(entries[traceIndex - 1].id); }}>← Previous trace</button><button className="button" type="button" disabled={!entries.length || traceIndex >= entries.length - 1} onClick={() => { void loadTrace(entries[traceIndex + 1].id); }}>Next trace →</button></div>}
      <div className="loaded-status" role="status" aria-label="Loaded trace status">{loading ? `Loading trace ${chosen}…` : trace ? <>Viewing <strong>{importedEntry?importedEntry.label:`trace ${trace.id}`}</strong><span>{trace.profileId==='unknown'?'Profile not supplied':`Profile ${trace.profileId}`} · {trace.exampleNumber===null?'Example not supplied':`Example ${trace.exampleNumber}`}{chosen !== trace.id ? ' · Selected trace could not be loaded' : ''}</span></> : <>No trace loaded<span>Select a trace to begin</span></>}</div>
    </div>}
    {error && <div className="error-message" role="alert"><span>{error}</span>{!manifest ? <button className="button" onClick={() => setRetry(n => n + 1)}>Retry dataset</button> : <button className="button" onClick={() => { void loadTrace(chosen); }}>Retry trace</button>}</div>}
    {view==='teacher' && <div hidden={detailsOpen || courseOpen}><TeacherHome trace={trace} resolveTrace={resolveTrace}
      openTrace={id=>{if(id!==trace?.id)void loadTrace(id);setTraceTab('progress');setDetailsOpen(true);}} openDetails={()=>{setTraceTab('progress');setDetailsOpen(true);}}/></div>}
    {view==='teacher' && !detailsOpen && !courseOpen && <div className="course-overview-home"><CourseOverview expanded={false} onOpen={()=>setCourseOpen(true)}/></div>}
    {view==='teacher' && courseOpen && <div className="course-overview-detail">
      <button className="button teacher-back" onClick={()=>setCourseOpen(false)}>← Teacher workspace</button>
      <CourseOverview expanded onOpen={()=>setCourseOpen(true)}/>
    </div>}
    {view==='teacher' && detailsOpen && !expanded && <>
      <button className="button teacher-back" onClick={()=>setDetailsOpen(false)}>← Teacher workspace</button>
      {trace && <TraceProfile trace={trace} tab={traceTab} onTab={setTraceTab}/>}
      {trace && traceTab!=='progress' && <div className="panel trace-context course-row">
        <label className="field">Snapshot context<select value={eventId ?? ''} onChange={e=>setEventId(e.target.value || null)}>
          <option value="">Choose an event</option>
          {trace.events.map(e=><option key={e.id} value={e.id}>Day {snapshotById.get(e.snapshotId)!.day} · {eventStyles[e.type].title} · Event {e.reportStep}</option>)}
        </select></label>
        {traceTab==='concepts' && <button className="button" aria-pressed={overview} onClick={()=>setOverview(value=>!value)}>{overview?'Trace overview':'Selected concept'}</button>}
      </div>}
    </>}
    {(view!=='teacher' || (detailsOpen && !expanded && traceTab==='support')) && <CourseWorkspace view={view} trace={trace} event={selected} conceptId={conceptId}/>}
    {view==='teacher' && detailsOpen && (expanded || traceTab!=='support') && <main className="workspace trace-workspace">
      <div className="primary-column">
      {(expanded || traceTab==='progress') &&       <section className="panel timeline-panel" aria-label="Learning timeline">
        <div className="panel-heading"><div><p className="eyebrow">Learning timeline</p><h2>Knowledge over time</h2></div><button className="button reset-button" disabled={!trace} onClick={() => setReset(n => n + 1)}><span aria-hidden="true">↺</span> Reset view</button></div>
        {trace ? <><p className="chart-instruction">Pinch or scroll to zoom <span>·</span> Horizontal scroll or Shift-scroll to pan</p><Timeline key={trace.id} trace={trace} selected={selected} onSelect={setEventId} reset={reset} sync={sync} onRange={setTimeRange}/></> : <div className="empty-chart"><div className="empty-chart-lines" aria-hidden="true"><span/><span/><span/></div><div className="empty-copy"><span className="empty-symbol" aria-hidden="true">⌁</span><h3>Your learning timeline starts here</h3><p>Select a student trace to explore mastery,<br/>learning events, and assessment responses.</p></div></div>}
        <div className="legend" aria-label="Timeline legend"><span className="legend-entry"><i className="line-swatch"/>Overall mastery</span>{eventTypes.map(type => <span className="legend-entry" key={type}><i className={`event-glyph glyph-${type}`} style={{ color: eventStyles[type].color }} aria-hidden="true">{eventStyles[type].glyph}</i>{eventStyles[type].title}</span>)}</div>
        <p className="timeline-note">The blue line measures mastery. Event symbols are overlaid at fixed heights by type; their heights are not mastery values.</p>
        {trace && <div className="event-navigation"><label className="field event-field">Inspect an event<select aria-label="Inspect an event" value={eventId ?? ''} onChange={e => setEventId(e.target.value || null)}><option value="">Select an event on the chart or here</option>{trace.events.map(e => <option key={e.id} value={e.id}>Day {snapshotById.get(e.snapshotId)!.day} · {eventStyles[e.type].title} · Event {e.reportStep}</option>)}</select></label><div className="event-buttons"><button className={`button history-mode ${overview ? 'mode-overview' : 'mode-selected'}`} type="button" aria-pressed={overview} title="Switch between trace-wide overview and selected-concept history" onClick={()=>setOverview(value=>!value)}>{overview ? 'Trace overview' : 'Selected concept'}</button><button className="button" disabled={index <= 0} onClick={() => setEventId(trace.events[index - 1].id)}>← Previous event</button><button className="button" disabled={index >= trace.events.length - 1} onClick={() => setEventId(trace.events[index + 1].id)}>Next event →</button></div></div>}
      </section>}
      {(expanded || traceTab==='concepts') && <ResearchPanels trace={trace} event={selected} conceptId={conceptId} onConcept={setConceptId} sync={sync} timeRange={timeRange} onEvent={setEventId} overview={overview}/>}
      </div>
      <div className="secondary-column">{(expanded || traceTab==='progress') && <Inspector trace={trace} event={selected} sync={sync}/>} {(expanded || traceTab==='concepts') && <KnowledgeGraph trace={trace} event={selected} conceptId={conceptId} onConcept={setConceptId} sync={sync}/>}</div>
    </main>}
    <footer className="app-footer"><span>Source: simulated CS1C student traces</span><span>{trace ? `${trace.snapshots.length} snapshots · ${trace.events.length} events · Days ${trace.snapshots[0].day}–${trace.snapshots.at(-1)!.day}` : ''}</span></footer>
  </div>;
}
