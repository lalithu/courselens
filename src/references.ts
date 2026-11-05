import { datasetFile } from './dataset';
import { z } from 'zod';
import { readJson, type Trace } from './data';

export const referenceSchema=z.object({schemaVersion:z.literal(1),
  concepts:z.record(z.string(),z.string().nullable()),
  misconceptions:z.record(z.string(),z.object({description:z.string().nullable(),conceptIds:z.array(z.string())})),
  answers:z.array(z.object({question:z.string(),answer:z.string(),correctness:z.enum(['correct','incorrect'])})),
  sources:z.array(z.object({path:z.string(),sha256:z.string().regex(/^[a-f0-9]{64}$/)})),
});
export type References=z.infer<typeof referenceSchema>;
const normalize=(text:string)=>text.replace(/\r\n?/g,'\n').trim();
const pair=(question:string,answer:string)=>JSON.stringify([normalize(question),normalize(answer)]);
let referencePromise:Promise<References>|null=null;
export function loadReferences(){
  if(!referencePromise){
    const url=datasetFile('references.json');
    referencePromise=readJson(url,referenceSchema,new AbortController().signal).catch(error=>{referencePromise=null;throw new Error(`Reference data unavailable. Check that the bundled reference catalog is present. ${error.message}`);});
  }
  return referencePromise;
}

function numbered(text:string,letter:string){
  const clean=text.replace(/\r\n?/g,'\n'),matches=[...clean.matchAll(new RegExp(`^${letter}(\\d+)\\.[ \\t]?`,'gm'))];
  return matches.map((match,i)=>({number:match[1],text:clean.slice(match.index!+match[0].length,matches[i+1]?.index??clean.length).trim()}));
}

export function enrichTrace(trace:Trace,refs:References):Trace {
  const answerIndex=new Map<string,'correct'|'incorrect'|'unknown'>();
  for(const answer of refs.answers){const key=pair(answer.question,answer.answer),previous=answerIndex.get(key);answerIndex.set(key,previous&&previous!==answer.correctness?'unknown':answer.correctness);}
  const ids=new Set(trace.concepts.map(c=>c.id));
  const events=trace.events.map(event=>{
    if(!['quiz','homework'].includes(event.type))return event;
    const questions=numbered(event.inputText,'Q'),answers=new Map(numbered(event.responseText,'A').map(a=>[a.number,a.text]));
    const assessments=questions.length?questions.map(question=>{
      const chunks=(answers.get(question.number)??'').split(/^Knowledge Components:[ \t]*$/m);
      const responseText=chunks[0].trim();
      return {questionId:null,questionText:question.text,responseText,correctness:responseText?(answerIndex.get(pair(question.text,responseText))??'unknown'):'unknown',
        conceptIds:(chunks[1]??'').split('\n').map(s=>s.trim()).filter(s=>ids.has(s))} as Trace['events'][number]['assessments'][number];
    }):event.assessments.map(a=>({...a,correctness:a.responseText?(answerIndex.get(pair(a.questionText,a.responseText))??'unknown'):'unknown' as const}));
    return {...event,assessments};
  });
  const sources=[...trace.sources];for(const source of refs.sources)if(!sources.some(s=>s.path===source.path&&s.sha256===source.sha256))sources.push(source);
  return {...trace,sources,events,
    concepts:trace.concepts.map(c=>({...c,description:c.description??refs.concepts[c.id]??null})),
    misconceptions:trace.misconceptions.map(m=>({...m,description:m.description??refs.misconceptions[m.id]?.description??null,
      conceptIds:[...new Set([...m.conceptIds,...(refs.misconceptions[m.id]?.conceptIds??[])])].filter(id=>ids.has(id))})),
  };
}

export async function withReferences(trace:Trace){return enrichTrace(trace,await loadReferences());}
