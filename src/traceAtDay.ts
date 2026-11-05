import type { Trace } from './data';

export function traceAtDay(trace: Trace, day: number): Trace | null {
  const last = trace.snapshots.at(-1)!;
  if (day >= last.day) return trace;
  const snapshots = trace.snapshots.filter(snapshot => snapshot.day <= day);
  if (!snapshots.length) return null;
  const available = new Set(snapshots.map(snapshot => snapshot.id));
  return { ...trace, snapshots, events: trace.events.filter(event => available.has(event.snapshotId)) };
}
