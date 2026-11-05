import { describe, expect, it } from 'vitest';
import { constrainWindow, mastery, wheelWindow, timelineScale, formatSimulatorTime } from './domain';
import type { Snapshot } from './data';

describe('mastery', () => {
  const state = (values: (boolean | null)[]) => ({ concepts: values.map((v, i) => ({ conceptId: String(i), mastered: v, confidence: .8, exposed: true })) } as Snapshot);
  it('uses recorded mastery flags, not confidence', () => expect(mastery(state([true, false, false, true]))).toBe(50));
  it('does not turn missing states into zero', () => expect(mastery(state([true, null]))).toBeNull());
});
describe('viewport', () => {
  it('preserves range width when panning into a boundary', () => expect(constrainWindow(-3, 4, [0, 34])).toEqual([0, 7]));
  it('clamps zoom-out to the full trace', () => expect(constrainWindow(-10, 60, [0, 34])).toEqual([0, 34]));
  it('zooms around the pointer', () => {
    const next = wheelWindow([0, 34], [0, 34], 0, -80, .5, false);
    expect(next[1] - next[0]).toBeLessThan(34);
    expect((next[0] + next[1]) / 2).toBeCloseTo(17);
  });
  it('horizontal pan preserves scale', () => {
    const next = wheelWindow([5, 12], [0, 34], 60, 0, .5, true);
    expect(next[1] - next[0]).toBeCloseTo(7);
    expect(next[0]).toBeGreaterThan(5);
  });
});

describe('simulator time labels', () => {
  it('switches from days to hours and half-hours', () => {
    expect(timelineScale(34).interval).toBeUndefined();
    expect(timelineScale(1).interval).toBe(1 / 24);
    expect(timelineScale(6 / 24).interval).toBe(1 / 48);
  });
  it('formats day boundaries and fractional hours without floating-point artifacts', () => {
    expect(formatSimulatorTime(1 + 1 / 48)).toBe('Day 1 · 00:30');
    expect(formatSimulatorTime(2 - 0.000001)).toBe('Day 2 · 00:00');
    expect(formatSimulatorTime(0)).toBe('Day 0 · 00:00');
  });
  it('allows an hourly view without zooming past its minimum', () => {
    expect(constrainWindow(5, 5.001, [0,34])[1]).toBeCloseTo(5 + 1 / 24);
  });
});
