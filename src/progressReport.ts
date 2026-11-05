import type { Trace } from './data';
import { eventStyles, mastery } from './domain';

export function summarizeProgress(trace: Trace) {
  const latest = trace.snapshots.at(-1)!;
  const start = mastery(trace.snapshots[0]);
  const end = mastery(latest);
  const mastered = latest.concepts.filter(concept => concept.mastered === true).length;
  const counts = { correct: 0, incorrect: 0, unknown: 0 };
  for (const event of trace.events) for (const item of event.assessments) counts[item.correctness]++;
  const concepts = new Map(trace.concepts.map(concept => [concept.id, concept.title]));
  const misconceptions = new Map(trace.misconceptions.map(item => [item.id, item.title]));
  const active = latest.activeMisconceptionIds?.map(id => misconceptions.get(id) ?? id) ?? null;
  const focus = latest.concepts.filter(concept => concept.exposed === true && concept.mastered === false)
    .slice(0, 3).map(concept => concepts.get(concept.conceptId) ?? concept.conceptId);
  const latestEvent = trace.events.at(-1);
  const eventDay = latestEvent && trace.snapshots.find(snapshot => snapshot.id === latestEvent.snapshotId)?.day;
  return {
    day: latest.day,
    mastery: end === null ? 'Unavailable' : end.toFixed(1) + '%',
    change: start !== null && end !== null ? end - start : null,
    mastered,
    total: latest.concepts.length,
    counts,
    active,
    focus,
    latestEvent: latestEvent && eventDay !== undefined ? `Day ${eventDay} · ${eventStyles[latestEvent.type].title}` : 'No recorded event',
  };
}

export function reportText(trace: Trace, audience: 'student' | 'parent') {
  const summary = summarizeProgress(trace);
  const subject = audience === 'student' ? 'Your CS1 progress report' : 'CS1 progress update';
  const progress = audience === 'student' ? 'Your recorded progress' : 'Recorded student progress';
  const body = [
    `${progress} through simulator day ${summary.day}: ${summary.mastered} of ${summary.total} concepts recorded as mastered.`,
    summary.focus.length ? `Suggested practice for teacher review: ${summary.focus.join(', ')}.` : 'Ask your instructor what to practice next.',
    'Source: simulated CS1 course trace.',
  ].join('\n\n');
  return { subject, body };
}
