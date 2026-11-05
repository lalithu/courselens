import type { Trace } from './data';

export function relevantTraceItems(trace: Trace) {
  const concepts = new Set<string>();
  const misconceptions = new Set<string>();
  const initial = new Map(trace.snapshots[0].concepts.map(c=>[c.conceptId,c.confidence]));
  for (const snapshot of trace.snapshots) {
    for (const state of snapshot.concepts) {
      if (state.exposed === true || state.mastered === true || (state.confidence !== null && state.confidence !== initial.get(state.conceptId))) concepts.add(state.conceptId);
    }
    snapshot.activeMisconceptionIds?.forEach(id => misconceptions.add(id));
  }
  for (const event of trace.events) for (const assessment of event.assessments) assessment.conceptIds.forEach(id => concepts.add(id));
  for (const mis of trace.misconceptions) if (misconceptions.has(mis.id)) mis.conceptIds.forEach(id => concepts.add(id));
  return { concepts: trace.concepts.filter(c=>concepts.has(c.id)), misconceptions: trace.misconceptions.filter(m=>misconceptions.has(m.id)) };
}

// An interval begins at the last source snapshot on a given day. Same-day
// intermediate states remain in source records, but have no elapsed duration.
export function misconceptionIntervals(trace: Trace, ids: string[], endDay: number) {
  const byDay = new Map(trace.snapshots.map(snapshot=>[snapshot.day,snapshot]));
  const states = [...byDay.values()];
  return ids.flatMap((id,row)=>states.flatMap((snapshot,index)=>{
    const end = states[index+1]?.day ?? endDay;
    if (snapshot.activeMisconceptionIds===null || end<=snapshot.day) return [];
    return [{id,row,start:snapshot.day,end,active:snapshot.activeMisconceptionIds.includes(id)}];
  }));
}

export function changedConceptsAt(trace:Trace,day:number):string[]{
  let index=0;
  for(let i=1;i<trace.snapshots.length;i++){if(trace.snapshots[i].day>day)break;index=i;}
  if(index===0)return [];
  const previous=new Map(trace.snapshots[index-1].concepts.map(c=>[c.conceptId,c]));
  return trace.snapshots[index].concepts.filter(current=>{
    const before=previous.get(current.conceptId);
    return before&&(before.mastered!==current.mastered||before.exposed!==current.exposed||before.confidence!==current.confidence);
  }).map(c=>c.conceptId);
}
