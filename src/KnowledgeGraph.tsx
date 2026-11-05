import { datasetFile } from './dataset';
import {useEffect,useMemo,useRef,useState} from 'react';
import * as echarts from 'echarts/core';
import {GraphChart} from 'echarts/charts';
import {TooltipComponent} from 'echarts/components';
import {CanvasRenderer} from 'echarts/renderers';
import {readJson,type Trace,type TraceEvent} from './data';
import {ChartSync} from './chartSync';
import {graphSchema,graphView,nodeTitle,nodeColors,graphNodeState,snapshotAtTime,type KnowledgeGraph as Graph,type GraphNode} from './graphData';

echarts.use([GraphChart,TooltipComponent,CanvasRenderer]);
export function KnowledgeGraph({trace,event,conceptId,onConcept,sync}:{trace:Trace|null;event:TraceEvent|null;conceptId:string;onConcept:(id:string)=>void;sync:ChartSync}){
 const [graph,setGraph]=useState<Graph|null>(null),[error,setError]=useState(''),[retry,setRetry]=useState(0);
 const [scope,setScope]=useState<'trace'|'all'>('trace'),[material,setMaterial]=useState(false),[focus,setFocus]=useState(false);
 const [picked,setPicked]=useState<string|null>(null),[hoverDay,setHoverDay]=useState<number|null>(null);
 const [types,setTypes]=useState<string[]>([]);
 const panel=useRef<HTMLElement>(null),fullscreenButton=useRef<HTMLButtonElement>(null);
 const [fullscreen,setFullscreen]=useState(false);
 function exitGraph(){
  setFullscreen(false);
  if(document.fullscreenElement===panel.current)void document.exitFullscreen().catch(()=>{});
  fullscreenButton.current?.focus();
 }
 async function toggleFullscreen(){
  if(fullscreen){exitGraph();return;}
  setFullscreen(true);
  try{await panel.current?.requestFullscreen?.();}catch{/* Expanded panel remains usable when browser fullscreen is denied. */}
 }
 useEffect(()=>{
  const changed=()=>{if(document.fullscreenElement!==panel.current&&fullscreen){setFullscreen(false);fullscreenButton.current?.focus();}};
  const key=(event:KeyboardEvent)=>{if(event.key==='Escape'&&fullscreen){event.stopImmediatePropagation();exitGraph();}};
  document.addEventListener('fullscreenchange',changed);
  document.addEventListener('keydown',key,true);
  return()=>{document.removeEventListener('fullscreenchange',changed);document.removeEventListener('keydown',key,true);};
 },[fullscreen]);
 const [reset,setReset]=useState(0);
 const positions=useRef(new Map<string,[number,number]>());
 const dragging=useRef<string|null>(null);
 const element=useRef<HTMLDivElement>(null),chart=useRef<echarts.ECharts|null>(null);
 const onConceptRef=useRef(onConcept);onConceptRef.current=onConcept;
 const traceRef=useRef(trace);traceRef.current=trace;
 useEffect(()=>{const abort=new AbortController();setError('');readJson(datasetFile('graph.json'),graphSchema,abort.signal).then(value=>{setGraph(value);setTypes([...new Set(value.edges.map(e=>e.type))].sort());}).catch(e=>{if(!abort.signal.aborted)setError(`${e.message} Check that the bundled graph export is present, then retry.`);});return()=>abort.abort();},[retry]);
 useEffect(()=>sync.subscribe(setHoverDay),[sync]);
 useEffect(()=>{setPicked(null);setFocus(false);setHoverDay(null);setScope('trace');},[trace?.id]);
 useEffect(()=>{if(conceptId&&graph){const node=graph.nodes.find(n=>n.labels.includes('Sphere')&&nodeTitle(n)===conceptId);setPicked(node?.id??null);if(!node)setFocus(false);}},[conceptId,graph]);
 const selected=graph?.nodes.find(n=>n.id===picked)??null;
 const eventSnapshot=trace?(event?trace.snapshots.find(s=>s.id===event.snapshotId)!:trace.snapshots[0]):null;
 const snapshot=trace&&hoverDay!==null?snapshotAtTime(trace,hoverDay):eventSnapshot;
 const view=useMemo(()=>graph?graphView(graph,trace,scope,material,focus?picked:null,types):{nodes:[],edges:[]},[graph,trace,scope,material,focus,picked,types]);
 const snapshotRef=useRef(snapshot);snapshotRef.current=snapshot;
 function pick(node:GraphNode){setPicked(node.id);const title=nodeTitle(node);if(node.labels.includes('Sphere')&&traceRef.current?.concepts.some(c=>c.id===title))onConceptRef.current(title);}
 const pickRef=useRef(pick);pickRef.current=pick;
 useEffect(()=>{
  if(!graph||!element.current)return;
  const instance=echarts.init(element.current!);chart.current=instance;
  instance.on('click',(params:unknown)=>{const item=params as {dataType:string;data:{id:string}};if(item.dataType==='node'){const node=graph.nodes.find(n=>n.id===item.data.id);if(node)pickRef.current(node);}});
  instance.on('mousedown',(params:unknown)=>{const item=params as {dataType:string;data:{id:string}};if(item.dataType==='node')dragging.current=item.data.id;});
  const dragEnd=(point:{offsetX:number;offsetY:number})=>{if(dragging.current){const position=instance.convertFromPixel({seriesIndex:0},[point.offsetX,point.offsetY]) as [number,number];if(position?.every(Number.isFinite))positions.current.set(dragging.current,position);dragging.current=null;}};
  instance.getZr().on('mouseup',dragEnd);
  const observer=new ResizeObserver(()=>instance.resize());observer.observe(element.current!);
  return()=>{instance.getZr().off('mouseup',dragEnd);observer.disconnect();instance.dispose();chart.current=null;};
 },[graph]);
 useEffect(()=>{
  if(!chart.current)return;
  // Fixed starting coordinates avoid layout jumps when time and state change.
  const order=new Map((graph?.nodes??[]).map((n,i)=>[n.id,i]));
  chart.current.setOption({animation:false,tooltip:{renderMode:'richText',confine:true,formatter:(params:{dataType:string;data:{id:string;source?:string;target?:string;relation?:string}})=>{
   if(params.dataType==='edge')return params.data.relation??'';
   const node=graph!.nodes.find(n=>n.id===params.data.id)!;return `${nodeTitle(node)}\n${graphNodeState(node,snapshotRef.current,traceRef.current)}`;
  }},series:[{id:'knowledge',type:'graph',layout:'none',roam:true,draggable:true,scaleLimit:{min:.1,max:12},label:{show:view.nodes.length<=35,position:'right',color:'#253247',fontSize:11,formatter:(p:{data:{title:string}})=>p.data.title},emphasis:{focus:'adjacency',label:{show:true,fontWeight:'bold'}},lineStyle:{color:'#a4b2c4',width:1,opacity:.5,curveness:.08},edgeSymbol:['none','arrow'],edgeSymbolSize:5,
   data:view.nodes.map(node=>{
    const index=order.get(node.id)??0,angle=index*2.399963229728653,radius=14*Math.sqrt(index+1);
    const position=positions.current.get(node.id)??[Math.cos(angle)*radius,Math.sin(angle)*radius];
    const state=graphNodeState(node,snapshot,trace),active=state==='Active misconception',mastered=state==='Mastered';
    return {id:node.id,name:node.id,title:nodeTitle(node),x:position[0],y:position[1],symbol:node.labels.includes('Misconception')?'diamond':'circle',symbolSize:node.id===picked?21:node.labels.includes('Sphere')?12:9,
     itemStyle:{color:nodeColors[node.labels[0]]??'#64748b',opacity:node.labels.includes('Misconception')&&!active? .5:1,borderColor:node.id===picked?'#0f172a':active?'#9b3039':mastered?'#15803d':'#fff',borderWidth:node.id===picked?3:active||mastered?2:1}};
   }),
   links:view.edges.map(edge=>({id:edge.id,source:edge.source,target:edge.target,relation:edge.type,label:{show:false,formatter:edge.type},emphasis:{label:{show:true,color:'#334155',fontSize:10},lineStyle:{opacity:1,width:2}}})),
  }]},{replaceMerge:['series']});
 },[graph,view,picked,reset,snapshot]);
 const connections=selected?view.edges.filter(e=>e.source===selected.id||e.target===selected.id):[];
 const missing=trace&&graph?trace.concepts.filter(c=>!graph.nodes.some(n=>n.labels.includes('Sphere')&&nodeTitle(n)===c.id)).length:0;
 return <section ref={panel} className={`panel knowledge-panel${fullscreen?' graph-fullscreen':''}`} aria-label="Knowledge graph">
  <div className="graph-heading"><div><p className="eyebrow">Connected knowledge</p><h2>Knowledge graph</h2></div><div className="graph-heading-actions"><button ref={fullscreenButton} className="button" type="button" aria-pressed={fullscreen} disabled={!graph} onClick={()=>{void toggleFullscreen();}}>{fullscreen?'Exit graph fullscreen':'Fullscreen graph'}</button><button className="button" disabled={!graph} onClick={()=>{positions.current.clear();chart.current?.setOption({series:[{id:'knowledge',zoom:1,center:null}]});setReset(n=>n+1);}}>Reset graph</button></div></div>
  {error?<div className="graph-error" role="alert">{error}<button className="button" onClick={()=>setRetry(n=>n+1)}>Retry graph</button></div>:!graph?<p className="small">Reading knowledge graph…</p>:<>
   <div className="graph-toolbar"><div role="group" aria-label="Graph scope"><button aria-pressed={scope==='trace'} disabled={!trace} onClick={()=>{setScope('trace');setFocus(false);}}>This trace</button><button aria-pressed={scope==='all'} onClick={()=>{setScope('all');setFocus(false);}}>Compendium</button></div><label><input type="checkbox" checked={material} onChange={e=>setMaterial(e.target.checked)}/>Learning material</label><button className="graph-focus" disabled={!selected} aria-pressed={focus} onClick={()=>setFocus(v=>!v)}>{focus?'Show connections only':'Focus selection'}</button></div>
   {conceptId&&!graph.nodes.some(n=>n.labels.includes('Sphere')&&nodeTitle(n)===conceptId)&&<p className="small">{conceptId} has no exact match in this dump. Its trace state is still available in concept inspection.</p>}
   <div className="graph-context" role="status" aria-label="Graph context"><strong>{view.nodes.length}</strong> nodes · <strong>{view.edges.length}</strong> links{snapshot&&<> · {hoverDay===null?'Selected':'Preview'} day <strong>{snapshot.day}</strong> · Snapshot {snapshot.sequence+1}</>}</div>
   <div className="graph-exploration"><div className="graph-visual"><div ref={element} className="knowledge-canvas" role="img" aria-label="Interactive knowledge graph. Drag to pan, scroll to zoom, select a node to inspect." data-testid="knowledge-graph" data-snapshot={snapshot?.id??''} data-selected-node={picked??''}/>
   {!view.nodes.length&&<p className="small">No dump nodes match this view. Try Compendium or change the relationship filters.</p>}
   <div className="graph-legend"><span><i style={{background:nodeColors.Sphere}}/>Concept</span><span><i className="diamond" style={{background:nodeColors.Misconception}}/>Misconception</span>{material&&['Question','Answer','Collection'].map(type=><span key={type}><i style={{background:nodeColors[type]}}/>{type}</span>)}<span>Green ring: mastered · Red ring: active</span></div>
   <p className="small graph-help">Drag to move · Scroll or pinch to zoom · Select a node to follow its connections. Arrows preserve source direction.</p>
   </div><div className="graph-inspection"><label className="field graph-node-select">Inspect a graph node<select aria-label="Inspect a graph node" value={view.nodes.some(n=>n.id===picked)?picked??'':''} onChange={e=>{const node=graph.nodes.find(n=>n.id===e.target.value);if(node)pick(node);}}><option value="">Choose a node…</option>{view.nodes.map(node=><option key={node.id} value={node.id}>{nodeTitle(node)} · {node.labels[0]}</option>)}</select></label>
   {selected&&<div className="graph-details"><strong>{nodeTitle(selected)}</strong><span className="graph-state">{graphNodeState(selected,snapshot,trace)}</span>{snapshot&&selected.labels.includes('Sphere')&&<span className="small">{(()=>{const c=snapshot.concepts.find(c=>c.conceptId===nodeTitle(selected));return c?`Confidence: ${c.confidence===null?'unavailable':(c.confidence*100).toFixed(1)+'%'} · Exposed: ${c.exposed===null?'unavailable':c.exposed?'yes':'no'}`:'No matching concept state in this trace.';})()}</span>}<p>{typeof selected.properties.description==='string'&&selected.properties.description.trim().toLowerCase()!=='placeholder'?selected.properties.description:'No description recorded in this dump.'}</p>{(selected.labels.includes('Question')||selected.labels.includes('Answer'))&&<pre>{String(selected.properties.value??selected.properties.description??'')}</pre>}
    <div className="graph-connections">{connections.map(edge=>{const other=graph.nodes.find(n=>n.id===(edge.source===selected.id?edge.target:edge.source))!;return <button key={edge.id} onClick={()=>pick(other)}><span>{edge.source===selected.id?'→':'←'} {edge.type.replaceAll('_',' ')}</span><strong>{nodeTitle(other)}</strong></button>;})}{!connections.length&&<span className="small">No connections in the current view.</span>}</div>
   </div>}
   <details className="graph-source"><summary>Source and relationship filters</summary><p>{graph.source.path} · {graph.nodes.length} nodes · {graph.edges.length} links</p><code>SHA-256: {graph.source.sha256}</code>{missing>0&&<p>{missing} trace concepts have no exact title match in this dump; no links are inferred for them.</p>}<div className="graph-filters">{[...new Set(graph.edges.map(e=>e.type))].sort().map(type=><label key={type}><input type="checkbox" checked={types.includes(type)} onChange={e=>setTypes(current=>e.target.checked?[...current,type]:current.filter(t=>t!==type))}/>{type.replaceAll('_',' ')}</label>)}</div></details></div></div>
  </>}
 </section>;
}
