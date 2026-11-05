import { z } from 'zod';
import type { Trace, Snapshot } from './data';
import { relevantTraceItems } from './traceOverview';

const key=z.string().min(1);
const properties=z.record(z.string(),z.unknown());
export const graphSchema=z.object({schemaVersion:z.literal(1),source:z.object({path:key,sha256:z.string().regex(/^[a-f0-9]{64}$/)}),nodes:z.array(z.object({id:key,labels:z.array(key).min(1),properties})),edges:z.array(z.object({id:key,source:key,target:key,type:key,properties}))}).superRefine((graph,ctx)=>{
  const ids=new Set(graph.nodes.map(n=>n.id));
  if(ids.size!==graph.nodes.length||new Set(graph.edges.map(e=>e.id)).size!==graph.edges.length)ctx.addIssue({code:'custom',message:'Duplicate graph identifiers'});
  if(graph.edges.some(e=>!ids.has(e.source)||!ids.has(e.target)))ctx.addIssue({code:'custom',message:'Invalid graph relationship'});
});
export type KnowledgeGraph=z.infer<typeof graphSchema>;
export type GraphNode=KnowledgeGraph['nodes'][number];
export const nodeColors:Record<string,string>={Sphere:'#2459a6',Misconception:'#b45332',Question:'#7546ad',Answer:'#187775',Collection:'#7c6530'};
export function nodeTitle(node:GraphNode):string {
  return String(node.properties.title??(node.labels.includes('Collection')?`${node.properties.type??'Collection'} ${node.properties.index??node.id}`:`${node.labels[0]} ${node.properties.index??node.id}`));
}
export function snapshotAtTime(trace:Trace,day:number):Snapshot {
  let result=trace.snapshots[0];
  for(const snapshot of trace.snapshots){if(snapshot.day>day)break;result=snapshot;}
  return result;
}
export function graphNodeState(node:GraphNode,snapshot:Snapshot|null,trace?:Trace|null):string {
  const title=nodeTitle(node);
  if(!snapshot&&node.labels.some(l=>l==='Sphere'||l==='Misconception'))return 'Load a trace to inspect recorded state';
  if(node.labels.includes('Sphere')){
    const state=snapshot?.concepts.find(c=>c.conceptId===title);
    if(!state)return 'Not in this trace';
    if(state.mastered===true)return 'Mastered';
    if(state.mastered===null)return 'Mastery unavailable';
    return state.exposed===true?'Exposed · not mastered':'Not mastered';
  }
  if(node.labels.includes('Misconception')&&trace&&!trace.misconceptions.some(m=>m.id===title))return 'Not in this trace';
  if(node.labels.includes('Misconception'))return !snapshot||snapshot.activeMisconceptionIds===null?'Activity unavailable':snapshot.activeMisconceptionIds.includes(title)?'Active misconception':'Inactive misconception';
  return node.labels[0];
}
export function graphView(graph:KnowledgeGraph,trace:Trace|null,scope:'trace'|'all',material:boolean,focus:string|null,types:string[]){
  const relevant=trace?relevantTraceItems(trace):null;
  const titles=new Set([...(relevant?.concepts.map(c=>c.id)??[]),...(relevant?.misconceptions.map(m=>m.id)??[])]);
  let nodes=graph.nodes.filter(n=>material||n.labels.some(l=>l==='Sphere'||l==='Misconception'));
  if(scope==='trace'&&trace){
    const knowledge=new Set(nodes.filter(n=>titles.has(nodeTitle(n))).map(n=>n.id));
    // Learning material is connected only by actual stored edges.
    const linked=new Set(knowledge);
    if(material){
      const byId=new Map(graph.nodes.map(n=>[n.id,n]));
      for(let step=0;step<2;step++){
        const previous=new Set(linked);
        for(const edge of graph.edges)if(previous.has(edge.source)||previous.has(edge.target)){
          for(const id of [edge.source,edge.target]){
            const node=byId.get(id)!;
            if(knowledge.has(id)||!node.labels.some(l=>l==='Sphere'||l==='Misconception'))linked.add(id);
          }
        }
      }
    }
    nodes=nodes.filter(n=>linked.has(n.id));
  }
  let ids=new Set(nodes.map(n=>n.id));
  let edges=graph.edges.filter(e=>ids.has(e.source)&&ids.has(e.target)&&types.includes(e.type));
  if(focus){
    const neighbors=new Set([focus]);
    for(const e of edges)if(e.source===focus||e.target===focus){neighbors.add(e.source);neighbors.add(e.target);}
    nodes=nodes.filter(n=>neighbors.has(n.id));ids=new Set(nodes.map(n=>n.id));edges=edges.filter(e=>ids.has(e.source)&&ids.has(e.target));
  }
  return {nodes,edges};
}
