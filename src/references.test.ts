import { expect,it } from 'vitest';
import { enrichTrace, type References } from './references';
import { traceSchema } from './data';

const question='When talking about computers and code, what is a program?';
const answer='A question you ask your computer.';
const refs:References={schemaVersion:1,concepts:{},misconceptions:{},answers:[{question,answer,correctness:'incorrect'}],sources:[]};
function trace(response=answer){return traceSchema.parse({schemaVersion:1,id:'unit-test',profileId:'unknown',exampleNumber:null,
 sources:[{path:'unit-test',sha256:'a'.repeat(64)}],concepts:[{id:'Variables',title:'Variables',description:null}],misconceptions:[],
 snapshots:[{id:'s0',sequence:0,day:0,concepts:[{conceptId:'Variables',mastered:false,confidence:null,exposed:true}],activeMisconceptionIds:[]}],
 events:[{id:'e1',snapshotId:'s0',reportStep:1,type:'quiz',inputText:`Q1. ${question}`,responseText:`A1. ${response}`,assessments:[]}]});}
it('uses the authoritative false label for an exact source pair',()=>expect(enrichTrace(trace(),refs).events[0].assessments[0].correctness).toBe('incorrect'));
it('leaves an unmatched answer unknown rather than guessing',()=>expect(enrichTrace(trace(answer+' Extra text.'),refs).events[0].assessments[0].correctness).toBe('unknown'));
it('treats contradictory normalized source labels as unknown',()=>{
 const conflicting:References={...refs,answers:[...refs.answers,{question,answer,correctness:'correct'}]};
 expect(enrichTrace(trace(),conflicting).events[0].assessments[0].correctness).toBe('unknown');
});
it('does not overwrite the original event text during enrichment',()=>{
 const original=trace();const result=enrichTrace(original,refs);
 expect(result.events[0].inputText).toBe(original.events[0].inputText);expect(result.events[0].responseText).toBe(original.events[0].responseText);
});
it('does not collapse whitespace inside code when matching references',()=>{
 const code=trace();code.events[0].inputText='Q1. ```\nif True:\n  print(1)\n```';code.events[0].responseText='A1. 1';
 const codeRefs:References={...refs,answers:[{question:'```\nif True:\nprint(1)\n```',answer:'1',correctness:'correct'}]};
 expect(enrichTrace(code,codeRefs).events[0].assessments[0].correctness).toBe('unknown');
});
