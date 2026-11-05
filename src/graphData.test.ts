import {describe,it,expect} from 'vitest';
import {graphSchema,graphView,graphNodeState,snapshotAtTime,type KnowledgeGraph} from './graphData';
import type {Trace} from './data';
const graph:KnowledgeGraph={schemaVersion:1,source:{path:'dump',sha256:'a'.repeat(64)},nodes:[
 {id:'c',labels:['Sphere'],properties:{title:'Concept'}},{id:'other',labels:['Sphere'],properties:{title:'Other'}},
 {id:'m',labels:['Misconception'],properties:{title:'Mistake'}},{id:'q',labels:['Question'],properties:{index:'1'}},
],edges:[{id:'r',source:'m',target:'c',type:'Derived_from',properties:{}},{id:'r2',source:'other',target:'c',type:'Required_for',properties:{}},{id:'r3',source:'q',target:'c',type:'Matching',properties:{}}]};
const trace={concepts:[{id:'Concept'}],misconceptions:[{id:'Mistake',conceptIds:['Concept']}],events:[],snapshots:[
 {id:'s0',sequence:0,day:0,concepts:[{conceptId:'Concept',mastered:false,exposed:true,confidence:.1}],activeMisconceptionIds:[]},
 {id:'s1',sequence:1,day:1,concepts:[{conceptId:'Concept',mastered:true,exposed:true,confidence:.8}],activeMisconceptionIds:['Mistake']},
 {id:'s2',sequence:2,day:1,concepts:[{conceptId:'Concept',mastered:true,exposed:true,confidence:.9}],activeMisconceptionIds:null},
]} as unknown as Trace;
describe('graph source and trace mapping',()=>{
 it('preserves stored direction and filters to trace titles without inferred edges',()=>{
  const view=graphView(graph,trace,'trace',false,null,['Derived_from','Required_for']);
  expect(view.nodes.map(n=>n.id)).toEqual(['c','m']);expect(view.edges).toEqual([graph.edges[0]]);
 });
 it('includes material only through stored relationships and respects relationship filters',()=>{
  expect(graphView(graph,trace,'trace',true,null,['Matching']).nodes.map(n=>n.id)).toEqual(['c','m','q']);
  expect(graphView(graph,trace,'all',false,'m',['Derived_from']).nodes.map(n=>n.id)).toEqual(['c','m']);
 });
 it('uses the last recorded same-day state and never a future snapshot',()=>{
  expect(snapshotAtTime(trace,.9).id).toBe('s0');expect(snapshotAtTime(trace,1).id).toBe('s2');
 });
 it('distinguishes missing and unknown states from false',()=>{
  expect(graphNodeState(graph.nodes[1],trace.snapshots[0],trace)).toBe('Not in this trace');
  expect(graphNodeState(graph.nodes[2],trace.snapshots[2],trace)).toBe('Activity unavailable');
  expect(graphNodeState(graph.nodes[2],trace.snapshots[1],trace)).toBe('Active misconception');
 });
 it('rejects dangling or duplicate relationships',()=>{
  expect(graphSchema.safeParse({...graph,edges:[{...graph.edges[0],target:'missing'}]}).success).toBe(false);
  expect(graphSchema.safeParse({...graph,edges:[graph.edges[0],graph.edges[0]]}).success).toBe(false);
 });
});
