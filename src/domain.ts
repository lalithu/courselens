import type { EventType, Snapshot } from './data';

export const eventStyles: Record<EventType, { title: string; glyph: string; symbol: string; color: string; plotLevel: number }> = {
  lecture: { title: 'Lecture', glyph: '◆', symbol: 'diamond', color: '#27834f', plotLevel: 10 },
  reading: { title: 'Reading', glyph: '●', symbol: 'circle', color: '#8557c4', plotLevel: 75 },
  office_hours: { title: 'Office hours', glyph: '○', symbol: 'emptyCircle', color: '#007f91', plotLevel: 20 },
  homework: { title: 'Homework', glyph: '■', symbol: 'rect', color: '#b86b09', plotLevel: 95 },
  quiz: { title: 'Quiz', glyph: '▲', symbol: 'triangle', color: '#c34b56', plotLevel: 85 },
};
export const eventTypes = Object.keys(eventStyles) as EventType[];

export function mastery(snapshot: Snapshot): number | null {
  if (snapshot.concepts.some(c => c.mastered === null) || !snapshot.concepts.length) return null;
  return snapshot.concepts.filter(c => c.mastered).length / snapshot.concepts.length * 100;
}

export type WindowRange = [number, number];
export function constrainWindow(start: number, end: number, extent: WindowRange): WindowRange {
  const total = extent[1] - extent[0];
  const width = Math.min(total, Math.max(Math.min(1 / 24, total), end - start));
  const left = Math.max(extent[0], Math.min(start, extent[1] - width));
  return [left, left + width];
}

export function wheelWindow(current: WindowRange, extent: WindowRange, deltaX: number, deltaY: number, anchor: number, pan: boolean): WindowRange {
  const width = current[1] - current[0];
  if (pan) {
    const offset = (deltaX || deltaY) * width / 600;
    return constrainWindow(current[0] + offset, current[1] + offset, extent);
  }
  const factor = Math.exp(Math.max(-100, Math.min(100, deltaY)) * .006);
  const nextWidth = width * factor;
  const position = Math.max(0, Math.min(1, anchor));
  const start = current[0] + width * position - nextWidth * position;
  return constrainWindow(start, start + nextWidth, extent);
}

// Simulator days are offsets, not calendar dates. Finer ticks do not add samples.
export function timelineScale(span: number) {
  if (span <= 6 / 24) return { interval: 1 / 48, unit: 'half-hour' };
  if (span <= 2) return { interval: 1 / 24, unit: 'hour' };
  return { interval: undefined, unit: 'day' };
}

export function formatSimulatorTime(day: number, detailed = true): string {
  if (!detailed) return `Day ${Number(day.toFixed(2))}`;
  const minutes = Math.round(day * 24 * 60);
  const days = Math.floor(minutes / 1440);
  const withinDay = minutes - days * 1440;
  return `Day ${days} · ${String(Math.floor(withinDay / 60)).padStart(2, '0')}:${String(withinDay % 60).padStart(2, '0')}`;
}
