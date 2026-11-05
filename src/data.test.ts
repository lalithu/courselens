import { expect, it } from 'vitest';
import { traceSchema, verifyIdentity, type Trace } from './data';

function fixture(): Trace {
  return {
    schemaVersion: 1, id: '1', profileId: '1', exampleNumber: 1,
    sources: [{ path: 'source.csv', sha256: 'a'.repeat(64) }],
    concepts: [{ id: 'Variables', title: 'Variables', description: null }], misconceptions: [],
    snapshots: [0, 1].map(sequence => ({ id: `s${sequence}`, sequence, day: 12,
      concepts: [{ conceptId: 'Variables', mastered: sequence === 1, confidence: .7, exposed: true }], activeMisconceptionIds: [] })),
    events: [{ id: 'e1', snapshotId: 's1', reportStep: 1, type: 'lecture', inputText: 'Variables', responseText: '', assessments: [] }],
  };
}

it('retains separate snapshots on the same day', () => expect(traceSchema.parse(fixture()).snapshots).toHaveLength(2));
it('rejects broken snapshot references', () => {
  const data = fixture(); data.events[0].snapshotId = 'not-present';
  expect(traceSchema.safeParse(data).success).toBe(false);
});
it('rejects duplicate concept rows instead of inflating mastery', () => {
  const data = fixture(); data.snapshots[0].concepts.push(data.snapshots[0].concepts[0]);
  expect(traceSchema.safeParse(data).success).toBe(false);
});
it('rejects a file for a different student even when it otherwise validates', () => {
  expect(() => verifyIdentity(fixture(), { id: '1', profileId: '10', exampleNumber: 1, label: 'Trace 1', path: 'traces/1.json' })).toThrow('identity');
});
