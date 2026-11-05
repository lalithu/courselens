import { z } from 'zod';

const key = z.string().min(1);
const nonnegative = z.number().int().nonnegative();
const eventType = z.enum(['lecture', 'reading', 'office_hours', 'homework', 'quiz']);
const relativePath = z.string().regex(/^(?!\/)(?!.*(?:^|\/)\.\.(?:\/|$))[a-zA-Z0-9_./-]+$/);
const entrySchema = z.object({ id: key, profileId: key, exampleNumber: z.number().int().positive().nullable(), label: key, path: relativePath });
export const manifestSchema = z.object({
  schemaVersion: z.literal(1), datasetId: key, title: key, origin: z.literal('simulator'),
  calendarStart: z.string().nullable(), traces: z.array(entrySchema).min(1),
}).superRefine((value, ctx) => {
  if (new Set(value.traces.map(t => t.id)).size !== value.traces.length)
    ctx.addIssue({ code: 'custom', message: 'Duplicate trace IDs.' });
});
const snapshotSchema = z.object({
  id: key, sequence: nonnegative, day: z.number().nonnegative(),
  concepts: z.array(z.object({ conceptId: key, mastered: z.boolean().nullable(),
    confidence: z.number().min(0).max(1).nullable(), exposed: z.boolean().nullable() })).min(1),
  activeMisconceptionIds: z.array(key).nullable(),
});
export const traceSchema = z.object({
  schemaVersion: z.literal(1), id: key, profileId: key, exampleNumber: z.number().int().positive().nullable(),
  sources: z.array(z.object({ path: key, sha256: z.string().regex(/^[a-f0-9]{64}$/) })).min(1),
  concepts: z.array(z.object({ id: key, title: key, description: z.string().nullable() })).min(1),
  misconceptions: z.array(z.object({ id: key, title: key, description: z.string().nullable().optional().default(null), conceptIds: z.array(key) })),
  snapshots: z.array(snapshotSchema).min(1),
  events: z.array(z.object({ id: key, snapshotId: key, reportStep: z.number().int().positive(), type: eventType,
    inputText: z.string(), responseText: z.string(), assessments: z.array(z.object({
      questionId: key.nullable(), questionText: z.string(), responseText: z.string(),
      correctness: z.enum(['correct', 'incorrect', 'unknown']), conceptIds: z.array(key),
    })) })),
}).superRefine((trace, ctx) => {
  const fail = (message: string) => ctx.addIssue({ code: 'custom', message });
  const concepts = new Set(trace.concepts.map(c => c.id));
  const misconceptions = new Set(trace.misconceptions.map(m => m.id));
  const snapshots = new Set(trace.snapshots.map(s => s.id));
  if (concepts.size !== trace.concepts.length || misconceptions.size !== trace.misconceptions.length ||
      snapshots.size !== trace.snapshots.length || new Set(trace.events.map(e => e.id)).size !== trace.events.length)
    fail('Duplicate identifiers.');
  for (const [i, snapshot] of trace.snapshots.entries()) {
    const ids = new Set(snapshot.concepts.map(c => c.conceptId));
    if (snapshot.sequence !== i || (i > 0 && snapshot.day < trace.snapshots[i - 1].day)) fail('Snapshot ordering is invalid.');
    if (ids.size !== snapshot.concepts.length || ids.size !== concepts.size || [...ids].some(id => !concepts.has(id))) fail('Snapshot concept inventory is invalid.');
    if (snapshot.activeMisconceptionIds?.some(id => !misconceptions.has(id))) fail('Unknown misconception reference.');
  }
  let previous = -1;
  const order = new Map(trace.snapshots.map(s => [s.id, s.sequence]));
  for (const [i, event] of trace.events.entries()) {
    const sequence = order.get(event.snapshotId);
    if (sequence === undefined || sequence < previous || event.reportStep !== i + 1) fail('Invalid event reference or order.');
    previous = sequence ?? previous;
  }
});

export type Manifest = z.infer<typeof manifestSchema>;
export type TraceEntry = Manifest['traces'][number];
export type Trace = z.infer<typeof traceSchema>;
export type Snapshot = Trace['snapshots'][number];
export type TraceEvent = Trace['events'][number];
export type EventType = TraceEvent['type'];

export async function readJson<T>(url: string, schema: z.ZodType<T>, signal: AbortSignal): Promise<T> {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error(`Could not read dataset file (HTTP ${response.status}).`);
  const parsed = schema.safeParse(await response.json());
  if (!parsed.success) throw new Error(`Dataset format is invalid: ${parsed.error.issues[0]?.message ?? 'unsupported data'}`);
  return parsed.data;
}

export function verifyIdentity(trace: Trace, entry: TraceEntry) {
  if (trace.id !== entry.id || trace.profileId !== entry.profileId || trace.exampleNumber !== entry.exampleNumber)
    throw new Error('Trace identity does not match the dataset index.');
}
