import { describe,it,expect } from 'vitest';
import type {Trace} from './data';
import {relevantTraceItems,misconceptionIntervals,changedConceptsAt} from './traceOverview';
const trace = {
  concepts:[{id:'seen'},{id:'baseline'},{id:'changed'},{id:'linked'}],
  misconceptions:[{id:'m',conceptIds:['linked']},{id:'unused',conceptIds:[]}],events:[],
  snapshots:[
    {day:0,concepts:[{conceptId:'seen',exposed:true,mastered:false,confidence:.2},{conceptId:'baseline',exposed:false,mastered:false,confidence:.2},{conceptId:'changed',exposed:false,mastered:false,confidence:.2}],activeMisconceptionIds:[]},
    {day:1,concepts:[{conceptId:'changed',exposed:false,mastered:false,confidence:.4}],activeMisconceptionIds:['m']},
    {day:1,concepts:[],activeMisconceptionIds:[]},
    {day:2,concepts:[],activeMisconceptionIds:null},
    {day:3,concepts:[],activeMisconceptionIds:['m']},
  ],
} as unknown as Trace;
describe('trace overview provenance',()=>{
  it('uses exposure, confidence changes and recorded links, not baseline confidence alone',()=>{
    const result=relevantTraceItems(trace);
    expect(result.concepts.map(c=>c.id)).toEqual(['seen','changed','linked']);
    expect(result.misconceptions.map(m=>m.id)).toEqual(['m']);
  });
  it('keeps unknown intervals as gaps and uses the last snapshot on the same day',()=>{
    expect(misconceptionIntervals(trace,['m'],4)).toEqual([
      {id:'m',row:0,start:0,end:1,active:false},
      {id:'m',row:0,start:1,end:2,active:false},
      {id:'m',row:0,start:3,end:4,active:true},
    ]);
  });
});

it('hover changes compare the latest recorded snapshot, including same-day ordering',()=>{
 const state=(confidence:number)=>[{conceptId:'c',confidence,mastered:false,exposed:true}];
 const source={snapshots:[{day:0,concepts:state(.1)},{day:1,concepts:state(.2)},{day:1,concepts:state(.3)},{day:3,concepts:state(.3)}]} as unknown as Trace;
 expect(changedConceptsAt(source,.5)).toEqual([]);
 expect(changedConceptsAt(source,1)).toEqual(['c']);
 expect(changedConceptsAt(source,2)).toEqual(['c']);
 expect(changedConceptsAt(source,3)).toEqual([]);
});
