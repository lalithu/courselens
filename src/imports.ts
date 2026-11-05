import { traceSchema, type Trace, type TraceEntry, type EventType } from './data';

export type LocalTrace = { entry: TraceEntry; load: () => Promise<Trace> };
const types: EventType[] = ['lecture','reading','office_hours','homework','quiz'];
const pathOf = (file: File) => file.webkitRelativePath || file.name;
async function hash(text: string | ArrayBuffer) {
  const digest=await crypto.subtle.digest('SHA-256',typeof text==='string'?new TextEncoder().encode(text):text);
  return Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('');
}

export function parseReport(text: string) {
  const parts=text.replace(/\r\n?/g,'\n').split(/^# Step (\d+)\s*$/m);
  const result: {type:EventType;inputText:string;responseText:string}[]=[];
  for(let i=1;i<parts.length;i+=2){
    const body=parts[i+1];
    const match=body.match(/^\s*## Type\s*\n([\s\S]*?)\n\s*## Step Input\s*\n([\s\S]*?)\n\s*## Step Response\s*\n([\s\S]*?)\s*$/);
    if(!match)throw new Error(`Cannot read report step ${parts[i]}.`);
    const type=match[1].trim().toLowerCase().replaceAll(' ','_') as EventType;
    if(!types.includes(type)||Number(parts[i])!==result.length+1)throw new Error('Report events are unsupported or out of order.');
    result.push({type,inputText:match[2].trim(),responseText:match[3].trim()});
  }
  if(!result.length)throw new Error('The selected event report contains no events.');
  return result;
}

export async function parseCsv(csv: string, name: string, id: string, report?: {text:string;name:string}): Promise<Trace> {
  const snapshots:Trace['snapshots']=[],events:Trace['events']=[];
  const descriptions=report?parseReport(report.text):null;
  let inventory=new Set<string>(),misInventory=new Set<string>();
  for(const block of csv.split('==::==::==').filter(b=>b.trim())){
    const rows=block.trim().split(/\r?\n/).map(line=>line.split(';'));
    const spheres=rows.filter(r=>r[0]==='Sphere'),mis=rows.filter(r=>r[0]==='Mis');
    if(!spheres.length||spheres.some(r=>r.length!==26)||mis.some(r=>r.length!==25))throw new Error('Unsupported CSV. Expected a CS1C simulator trace with Sphere records.');
    const ids=new Set(spheres.map(r=>r[1])),misIds=new Set(mis.map(r=>r[1]));
    if(ids.size!==spheres.length||misIds.size!==mis.length)throw new Error('Duplicate records in a snapshot.');
    if(snapshots.length&&(ids.size!==inventory.size||[...ids].some(x=>!inventory.has(x))||misIds.size!==misInventory.size||[...misIds].some(x=>!misInventory.has(x))))throw new Error('The concept inventory changes within this trace.');
    inventory=ids;misInventory=misIds;
    const day=Number(spheres[0].at(-3)),flags=spheres[0].slice(-10,-5);
    if(!Number.isInteger(day)||day<0||flags.some(f=>!['0','1'].includes(f)))throw new Error('Invalid day or event flags.');
    const concepts=spheres.map(r=>{
      const confidence=Number(r.at(-1));
      if(!['0','1'].includes(r.at(-2)!)||!['0','1'].includes(r.at(-5)!)||!r.at(-1)?.trim()||!Number.isFinite(confidence)||confidence<0||confidence>1||Number(r.at(-3))!==day||r.slice(-10,-5).join()!==flags.join())throw new Error('Invalid or inconsistent concept state.');
      return {conceptId:r[1],mastered:r.at(-2)==='1',confidence,exposed:r.at(-5)==='1'};
    });
    if(mis.some(r=>!['0','1'].includes(r.at(-1)!)||Number(r.at(-2))!==day))throw new Error('Invalid misconception state.');
    const snapshotId=`${id}:snapshot:${snapshots.length}`;
    snapshots.push({id:snapshotId,sequence:snapshots.length,day,concepts,activeMisconceptionIds:mis.filter(r=>r.at(-1)==='1').map(r=>r[1])});
    const kinds=types.filter((_,i)=>flags[i]==='1');
    if(kinds.length>1)throw new Error('Multiple simultaneous event flags need an explicit source mapping.');
    if(kinds.length){
      const source=descriptions?.[events.length];
      if(descriptions&&(!source||source.type!==kinds[0]))throw new Error('Event report does not match the CSV action sequence.');
      events.push({id:`${id}:event:${events.length+1}`,snapshotId,reportStep:events.length+1,type:kinds[0],inputText:source?.inputText??'',responseText:source?.responseText??'',assessments:[]});
    }
  }
  if(descriptions&&descriptions.length!==events.length)throw new Error('The event report has unmatched events.');
  return traceSchema.parse({schemaVersion:1,id,profileId:'unknown',exampleNumber:null,
    sources:[{path:name,sha256:await hash(csv)},...(report?[{path:report.name,sha256:await hash(report.text)}]:[])],
    concepts:[...inventory].sort().map(title=>({id:title,title,description:null})),
    misconceptions:[...misInventory].sort().map(title=>({id:title,title,conceptIds:[]})),snapshots,events});
}

export function buildLocalTraces(files: File[]): LocalTrace[] {
  const csv=files.filter(f=>/\.csv$/i.test(f.name));
  const candidates=csv.length?csv:files.filter(f=>/\.json$/i.test(f.name)&&f.name!=='manifest.json'&&!f.name.startsWith('.'));
  if(!candidates.length)throw new Error('Choose a CS1C trace CSV or prepared trace JSON. Folders may include matching Markdown event reports.');
  if(candidates.length>1000)throw new Error('Import up to 1,000 traces at once.');
  const sorted=[...candidates].sort((a,b)=>pathOf(a).localeCompare(pathOf(b),undefined,{numeric:true}));
  return sorted.map(file=>{
    if(file.size>64*1024*1024)throw new Error(`${file.name} exceeds the 64 MB per-trace limit.`);
    const id=`local-${crypto.randomUUID()}`;
    const entry:TraceEntry={id,profileId:'unknown',exampleNumber:null,label:`Imported · ${pathOf(file)}`,path:`local/${id}.json`};
    return {entry,load:async()=>{
      const text=await file.text();
      if(/\.json$/i.test(file.name)){let parsed:unknown;try{parsed=JSON.parse(text);}catch{throw new Error('The JSON file is not valid JSON.');}const result=traceSchema.safeParse(parsed);if(!result.success)throw new Error('The JSON file does not match the prepared CS1C trace format.');return {...result.data,id};}
      const sourcePath=pathOf(file),stem=file.name.replace(/\.csv$/i,'');
      const stemNumber=Number(stem.match(/^trace_(\d+)$/)?.[1]);
      const prefix=sourcePath.includes('/traces/')?sourcePath.split('/traces/')[0]+'/':sourcePath.slice(0,-file.name.length);
      const names=[`${prefix}${stem}.md`,`${prefix}${stem}_lem.md`];
      // This mapping is used only when the corresponding New_QA report actually exists.
      if(Number.isInteger(stemNumber)&&stemNumber>=1&&stemNumber<=1000){
        const reportName=`output_${Math.floor((stemNumber-1)/100)+1}_${(stemNumber-1)%100+1}_lem.md`;
        names.push(`${prefix}output/${reportName}`,`${prefix}${reportName}`);
      }
      const reports=files.filter(f=>names.includes(pathOf(f)));
      if(reports.length>1)throw new Error(`More than one matching event report for ${file.name}. Keep one authoritative report.`);
      const report=reports[0];
      const trace=await parseCsv(text,sourcePath,id,report?{text:await report.text(),name:pathOf(report)}:undefined);
      trace.sources[0].sha256=await hash(await file.arrayBuffer());
      if(report)trace.sources[1].sha256=await hash(await report.arrayBuffer());
      return trace;
    }};
  });
}
