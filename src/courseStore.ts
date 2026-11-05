import type { Trace } from './data';

export type Attachment = { name: string; url: string };
export type Observation = { id: string; day?: number; text: string; event: string; concept: string; attachment?: Attachment };
export type Feedback = { id: string; day?: number; text: string; event: string; concept: string };
export type StudentReport = { id: string; day?: number; subject: string; body: string };
export type CourseRecord = {
  observations: Observation[];
  feedback: Feedback[];
  contacts: { student: string; parent: string };
  reports: StudentReport[];
};

const empty = (): CourseRecord => ({ observations: [], feedback: [], contacts: { student: '', parent: '' }, reports: [] });
const key = (id: string) => 'courselens:record:v1:' + id;

export function readRecord(id: string): CourseRecord {
  try {
    const saved = JSON.parse(localStorage.getItem(key(id)) ?? 'null');
    return saved && Array.isArray(saved.observations) && Array.isArray(saved.feedback) ? { ...empty(), ...saved } : empty();
  } catch {
    return empty();
  }
}

export function updateRecord(id: string, update: (record: CourseRecord) => CourseRecord): CourseRecord {
  const record = update(readRecord(id));
  localStorage.setItem(key(id), JSON.stringify(record));
  return record;
}

export function readAttachment(file: File): Promise<Attachment> {
  if (file.size > 1024 * 1024) return Promise.reject(new Error('Choose a file under 1 MB for this local preview.'));
  if (!['image/png', 'image/jpeg', 'image/webp', 'application/pdf', 'text/plain'].includes(file.type))
    return Promise.reject(new Error('Choose a PNG, JPEG, WebP, PDF, or plain text file.'));
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({ name: file.name, url: String(reader.result) });
    reader.onerror = () => reject(new Error('The attachment could not be read.'));
    reader.readAsDataURL(file);
  });
}

export function traceRecordId(trace: Trace): string {
  return trace.sources.slice(0, 2).map(source => source.sha256).join(':') || trace.id;
}
