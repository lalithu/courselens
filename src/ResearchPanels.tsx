import { useEffect, useLayoutEffect, useRef, useMemo, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, CustomChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, LegendComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartSync, linkCrosshair, type HoverItem } from './chartSync';
import { constrainWindow, formatSimulatorTime, timelineScale, type WindowRange } from './domain';
import { relevantTraceItems, misconceptionIntervals, changedConceptsAt } from './traceOverview';
import { snapshotAtTime } from './graphData';
import type { Snapshot, Trace, TraceEvent } from './data';

echarts.use([LineChart, CustomChart, GridComponent, TooltipComponent, LegendComponent, CanvasRenderer]);

function ConfidenceHistory({ trace, conceptId, sync, timeRange, event, onEvent, overview, currentDay }: { currentDay: number; trace: Trace; conceptId: string; sync: ChartSync; timeRange: WindowRange | null; event: TraceEvent | null; onEvent: (id: string) => void; overview: boolean }) {
  const element = useRef<HTMLDivElement>(null);
  const instance = useRef<echarts.ECharts | null>(null);
  const selectRef = useRef(onEvent); selectRef.current = onEvent;
  const eventRef = useRef(event); eventRef.current = event;
  const relevant = useMemo(()=>relevantTraceItems(trace),[trace]);
  const concepts = overview ? relevant.concepts : trace.concepts.filter(c=>c.id===conceptId);
  const misconceptions = overview ? relevant.misconceptions : [];
  const height = overview ? 270 + Math.max(40,misconceptions.length*22) : 225;
  useEffect(() => {
    const chart = echarts.init(element.current!);
    instance.current = chart;
    const end = Math.max(trace.snapshots[0].day + 1, currentDay);
    const axis = { type:'value',name:'Simulator day',nameLocation:'middle',nameGap:28,min:trace.snapshots[0].day,max:end,minInterval:1,splitLine:{show:false},axisLabel:{hideOverlap:true,color:'#475569'} };
    const markers = {silent:true,symbol:'none',label:{show:false},lineStyle:{color:'#527fc0',type:'dashed'},data:[]};
    const series: Record<string,unknown>[] = concepts.map((concept,index)=>({
      id:concept.id,name:concept.title,type:'line',triggerEvent:'line',step:'end',showSymbol:false,connectNulls:false,
      tooltip:{formatter:(params:{value:[number,number|null]})=>`${concept.title}\n${formatSimulatorTime(params.value[0],false)} · ${params.value[1]===null?'Unavailable':params.value[1].toFixed(1)+'% confidence'}`},
      lineStyle:{width:concept.id===conceptId?3:1.6},emphasis:{focus:'series'},markLine:index===0?markers:undefined,
      data:trace.snapshots.map(snapshot=>{const confidence=snapshot.concepts.find(c=>c.conceptId===concept.id)?.confidence;return[snapshot.day,confidence===null||confidence===undefined?null:confidence*100];}),
    }));
    if (misconceptions.length) series.push({
      id:'misconception-bands',name:'Misconception state',type:'custom',xAxisIndex:1,yAxisIndex:1,
      encode:{x:[0,2],y:1},
      renderItem: (_params:unknown,api:{value:(index:number)=>number;coord:(point:number[])=>number[];size:(size:number[])=>number[]})=>{
        const start=api.coord([api.value(0),api.value(1)]),end=api.coord([api.value(2),api.value(1)]);
        const bandHeight=Math.abs(api.size([0,1])[1])*.65;
        return {type:'rect',shape:{x:start[0],y:start[1]-bandHeight/2,width:Math.max(0,end[0]-start[0]),height:bandHeight},style:{fill:api.value(3)?'#ac4a2b':'#e6ebf1'},silent:false};
      },clip:true,
      tooltip:{formatter:(params:{value:number[]})=>`${misconceptions[params.value[1]].title}\n${params.value[3]?'Active':'Inactive'} · ${formatSimulatorTime(params.value[0],false)}–${formatSimulatorTime(params.value[2],false)}`},
      data:misconceptionIntervals(trace,misconceptions.map(m=>m.id),currentDay).map(interval=>[interval.start,interval.row,interval.end,interval.active?1:0]),
    });
    chart.setOption({ animation:false,
      color:['#2459a6','#187775','#7546ad','#b45309','#be3455','#007f91','#536d28','#805238'],
      legend:overview?{type:'scroll',top:0,left:0,right:0,data:concepts.map(c=>c.title),textStyle:{color:'#334155',fontSize:11}}:{show:false},
      grid:misconceptions.length?[{left:125,right:16,top:45,height:140},{left:125,right:16,top:235,bottom:38}]:[{left:46,right:16,top:overview?45:20,bottom:48}],
      xAxis:misconceptions.length?[{...axis,gridIndex:0},{...axis,gridIndex:1}]:[axis],
      yAxis:[{type:'value',min:0,max:100,interval:50,axisPointer:{label:{show:false}},axisLabel:{formatter:'{value}%',color:'#475569'},splitLine:{lineStyle:{color:'#e7edf5'}}},...(misconceptions.length?[{type:'category',gridIndex:1,data:misconceptions.map(m=>m.title),inverse:true,axisLabel:{color:'#723e2c',fontSize:10,width:105,overflow:'truncate'},axisTick:{show:false},axisLine:{show:false},axisPointer:{show:false}}]:[])],
      tooltip:{trigger:overview?'item':'axis',renderMode:'richText',confine:true,axisPointer:{type:'cross',snap:false,crossStyle:{type:'dotted',color:'#526783'}},valueFormatter:(value:number)=>`${value.toFixed(1)}%`},
      series,
    });
    let hoverDay:number|null=null;
    const emphasize=()=>{
      chart.dispatchAction({type:'downplay'});
      const item=sync.hoveredItem;
      const ids=item?.kind==='concept'?[item.id]:!item&&hoverDay!==null?changedConceptsAt(trace,hoverDay):[];
      for(const id of ids){const index=concepts.findIndex(c=>c.id===id);if(index>=0)chart.dispatchAction({type:'highlight',seriesIndex:index});}
      if(item?.kind==='misconception'){
        const row=misconceptions.findIndex(m=>m.id===item.id);
        const data=(series.at(-1)?.data??[]) as number[][];
        data.forEach((value,index)=>{if(value[1]===row)chart.dispatchAction({type:'highlight',seriesIndex:concepts.length,dataIndex:index});});
      }
    };
    const unsubscribeTime=sync.subscribe(day=>{hoverDay=day;emphasize();});
    const unsubscribeItem=sync.subscribeItem(emphasize);
    const over=(params:unknown)=>{
      const point=params as {seriesId?:string;seriesIndex:number;value:number[]};
      if(point.seriesId==='misconception-bands'||point.seriesIndex===concepts.length){
        const mis=misconceptions[point.value?.[1]];if(mis)sync.publishItem({kind:'misconception',id:mis.id});
      }else {const concept=concepts[point.seriesIndex];if(concept)sync.publishItem({kind:'concept',id:concept.id});}
    };
    const out=()=>sync.publishItem(null);
    chart.on('mouseover',over);chart.on('mouseout',out);
    const unlink = linkCrosshair(chart,element.current!,sync);
    const click = (point:{offsetX:number;offsetY:number})=>{
      if (!chart.containPixel({gridIndex:misconceptions.length?[0,1]:0},[point.offsetX,point.offsetY]) || !trace.events.length) return;
      const day=(chart.convertFromPixel({xAxisIndex:0},point.offsetX) as number);
      const dayFor=(e:TraceEvent)=>trace.snapshots.find(s=>s.id===e.snapshotId)!.day;
      const closest=trace.events.reduce((best,e)=>Math.abs(dayFor(e)-day)<Math.abs(dayFor(best)-day)?e:best);
      const current=eventRef.current;
      selectRef.current(current&&dayFor(current)===dayFor(closest)?current.id:closest.id);
    };
    chart.getZr().on('click',click);
    const observer=new ResizeObserver(()=>chart.resize());observer.observe(element.current!);
    return()=>{unsubscribeTime();unsubscribeItem();chart.off('mouseover',over);chart.off('mouseout',out);unlink();chart.getZr().off('click',click);observer.disconnect();chart.dispose();instance.current=null;};
  },[trace,conceptId,overview,currentDay]);
  useEffect(()=>{
    const bounds: WindowRange = [trace.snapshots[0].day, Math.max(trace.snapshots[0].day + 1, currentDay)];
    const range = timeRange ? constrainWindow(timeRange[0], timeRange[1], bounds) : bounds;
    const scale=timelineScale(range[1]-range[0]);
    const day=currentDay;
    const axis={min:range[0],max:range[1],interval:scale.interval??null,minInterval:scale.interval??1,axisLabel:{formatter:(value:number)=>formatSimulatorTime(value,scale.unit!=='day')}};
    instance.current?.setOption({xAxis:misconceptions.length?[axis,axis]:[axis],series:concepts.length?[{id:concepts[0].id,markLine:{silent:true,symbol:'none',label:{show:false},lineStyle:{color:'#527fc0',type:'dashed'},data:day===null?[]:[{xAxis:day}]}}]:[]});
  },[trace,conceptId,timeRange,currentDay,overview]);
  return <><div data-testid="confidence-chart" data-mode={overview?'overview':'selected'} data-concept-count={concepts.length} data-misconception-count={misconceptions.length} data-range={timeRange?.join(',')} data-selected-event={event?.id??''} ref={element} style={{height}} className="confidence-chart" role="img" aria-label={overview?'Trace-wide concept confidence and misconception activity':`Recorded simulator confidence history for ${conceptId}`}/>{overview&&<p className="small band-key"><strong>Misconception bands:</strong> <span className="band-active"/> active <span className="band-inactive"/> inactive · gaps mean unknown. Concept lines show recorded confidence.</p>}</>;
}

export function ResearchPanels({ trace, event, conceptId, onConcept, sync, timeRange, onEvent, overview, currentDay, currentSnapshot }: { currentDay: number; currentSnapshot: Snapshot | null; trace: Trace | null; event: TraceEvent | null; conceptId: string; onConcept: (id: string) => void; sync: ChartSync; timeRange: WindowRange | null; onEvent: (id: string) => void; overview: boolean }) {
  const rail = useRef<HTMLDivElement>(null);
  const misPanel = useRef<HTMLElement>(null);
  const savedMisScroll = useRef<{panel:number;list:number}|null>(null);
  const [hoverDay,setHoverDay]=useState<number|null>(null);
  const [hoverItem,setHoverItem]=useState<HoverItem|null>(null);
  useEffect(()=>sync.subscribe(setHoverDay),[sync]);
  useEffect(()=>sync.subscribeItem(setHoverItem),[sync]);
  const changed=useMemo(()=>trace&&hoverDay!==null?changedConceptsAt(trace,hoverDay):[],[trace,hoverDay]);
  const displayConceptId=hoverItem?.kind==='concept'?hoverItem.id:conceptId;
  const relevant = useMemo(()=>trace ? relevantTraceItems(trace) : {concepts:[],misconceptions:[]},[trace]);
  const filtered = overview ? relevant.concepts : trace?.concepts ?? [];
  useEffect(()=>{ rail.current?.querySelector('[aria-pressed="true"]')?.scrollIntoView({block:'nearest',inline:'nearest'}); },[conceptId]);
  useEffect(()=>{
    if(hoverItem?.kind!=='concept'||!rail.current)return;
    const chip=[...rail.current.querySelectorAll<HTMLButtonElement>('[data-concept-id]')].find(item=>item.dataset.conceptId===hoverItem.id);
    if(chip){const left=chip.getBoundingClientRect().left-rail.current.getBoundingClientRect().left+rail.current.scrollLeft;rail.current.scrollLeft=Math.max(0,left-rail.current.clientWidth/2+chip.offsetWidth/2);}
  },[hoverItem]);
  const conceptIndex = filtered.findIndex(c=>c.id===conceptId);
  const selectedSnapshot = currentSnapshot;
  const snapshot=trace&&hoverDay!==null?snapshotAtTime(trace,hoverDay):selectedSnapshot;
  const concept = trace?.concepts.find(c=>c.id===displayConceptId);
  const state = snapshot?.concepts.find(c=>c.conceptId===displayConceptId);
  const highlightedConcepts=hoverItem?.kind==='concept'?[hoverItem.id]:hoverItem?[]:changed;
  const highlightedMisconceptions=hoverItem?.kind==='misconception'?[hoverItem.id]:hoverItem?[]:snapshot?.activeMisconceptionIds??[];
  const traceMisconceptions = relevant.misconceptions.map(m=>m.id);
  const active = overview ? traceMisconceptions : snapshot?.activeMisconceptionIds;
  const highlightedSet = new Set(highlightedMisconceptions);
  const shownMisconceptions = active ? [...active.filter(id=>highlightedSet.has(id)),...active.filter(id=>!highlightedSet.has(id))] : [];
  const highlightedKey = JSON.stringify(shownMisconceptions.filter(id=>highlightedSet.has(id)));
  useLayoutEffect(()=>{
    const panel=misPanel.current;
    if(!panel)return;
    const list=panel.querySelector<HTMLElement>('.misconception-list');
    if(highlightedKey!=='[]'){
      if(!savedMisScroll.current)savedMisScroll.current={panel:panel.scrollTop,list:list?.scrollTop??0};
      panel.scrollTop=0;if(list)list.scrollTop=0;
    }else if(savedMisScroll.current){
      panel.scrollTop=savedMisScroll.current.panel;
      if(list)list.scrollTop=savedMisScroll.current.list;
      savedMisScroll.current=null;
    }
  },[highlightedKey]);
  const hasRecordedState = overview ? trace?.snapshots.some(s=>s.activeMisconceptionIds!==null) : snapshot?.activeMisconceptionIds!==null;
  return <div className="research-panels">
    <section ref={misPanel} className="panel research-panel misconception-panel" aria-label="Misconception exploration"><div className="research-heading"><div><p className="eyebrow">Understanding gaps</p><h2>Misconception exploration</h2></div>{snapshot && <span className="context-chip">{overview ? `Day ${snapshot.day} · ${snapshot.activeMisconceptionIds?.length ?? 'Unknown'} active · ${traceMisconceptions.length} across trace` : `Day ${snapshot.day} · Snapshot ${snapshot.sequence+1}`}</span>}</div>
      <p className="research-description">{overview ? 'All misconceptions recorded active anywhere in this student’s trace.' : 'Explore the misconceptions recorded at the selected day.'}</p>
      {(hoverDay!==null||hoverItem?.kind==='misconception')&&<p className="hover-context">{hoverItem?.kind==='misconception'?`Highlighting ${hoverItem.id}`:`Preview day ${snapshot?.day} · active misconceptions highlighted`}</p>}
      {!snapshot ? <p className="panel-empty">Load a trace to explore its recorded misconceptions.</p> : !hasRecordedState ? <p className="panel-empty">{overview ? 'Misconception state is unavailable for this trace.' : 'Misconception state is unavailable for this snapshot.'}</p> : active?.length ? <ul className="misconception-list">{shownMisconceptions.map(id=><li key={id} data-misconception-id={id} className={highlightedMisconceptions.includes(id)?'hover-highlight':''}><span className="misconception-dot"/><div><strong>{trace!.misconceptions.find(m=>m.id===id)?.title ?? id}</strong><span>{trace!.misconceptions.find(m=>m.id===id)?.description ?? 'No description supplied by the source references.'}</span><div className="related-concepts">{trace!.misconceptions.find(m=>m.id===id)?.conceptIds.map(c=><button className="concept-link" type="button" key={c} aria-pressed={conceptId===c} onClick={()=>onConcept(c)}>{c}</button>)}</div></div></li>)}</ul> : <p className="panel-empty">{overview ? 'No active misconceptions recorded anywhere in this trace.' : 'No active misconceptions recorded at this snapshot.'}</p>}
      {overview && trace?.snapshots.some(s=>s.activeMisconceptionIds===null) && hasRecordedState && <p className="small muted">Some snapshots have no misconception state. This list includes recorded observations only.</p>}
      {trace && !overview && !event && <p className="small muted">Use course progress to explore another recorded snapshot.</p>}
    </section>
    <div className="concept-grid">
      <section className={`panel research-panel concept-panel${highlightedConcepts.length?' panel-hover-highlight':''}`} data-preview-concept={hoverItem?.kind==='concept'?hoverItem.id:''} aria-label="Concept-level inspection"><p className="eyebrow">Knowledge components</p><h2>Concept-level inspection</h2><p className="research-description">{overview ? 'All concepts relevant anywhere in this student’s trace. Select one to inspect its state at the selected day.' : 'Choose a concept to inspect its recorded state and confidence.'}</p>
        {(hoverDay!==null||hoverItem)&&<p className="hover-context" role="status" aria-label="Concept hover preview">{hoverItem?.kind==='concept'?`Previewing ${hoverItem.id}`:hoverDay!==null?`Preview day ${snapshot?.day} · ${changed.length} changed concepts`:'Previewing misconception'} · selection retained</p>}
        <label className="field">Concept<select aria-label="Inspect a concept" value={conceptIndex>=0?conceptId:''} disabled={!trace} onChange={e=>onConcept(e.target.value)}><option value="">Choose a concept…</option>{filtered.map(c=><option key={c.id} value={c.id}>{c.title}</option>)}</select></label>
        <div ref={rail} className="concept-rail" role="group" aria-label="Browse concepts horizontally" tabIndex={0}>{filtered.map(c=><button type="button" key={c.id} data-concept-id={c.id} className={highlightedConcepts.includes(c.id)?'hover-highlight':''} aria-pressed={c.id===conceptId} onClick={()=>onConcept(c.id)}>{c.title}</button>)}</div>
        <div className="concept-browse"><button className="button" disabled={conceptIndex<=0} onClick={()=>onConcept(filtered[conceptIndex-1].id)}>← Previous concept</button><span role="status" aria-label="Concept position">{filtered.length} {overview?'relevant':'available'}{conceptIndex>=0 ? ` · ${conceptIndex+1} of ${filtered.length}` : ''}</span><button className="button" disabled={!filtered.length || conceptIndex>=filtered.length-1} onClick={()=>onConcept(filtered[conceptIndex+1].id)}>Next concept →</button></div>

        {overview && concept && displayConceptId===conceptId && conceptIndex<0 && <p className="small muted">{concept.title} is selected outside the trace overview. Choose a relevant concept above to browse this trace.</p>}
        {concept && state ? <><div className="concept-state">{hoverItem?.kind==='concept'&&<strong className="hover-concept-title">{concept.title}</strong>}<span className={`state-badge ${state.mastered===true?'state-mastered':state.mastered===false?'state-unknown':''}`}>{state.mastered===true?'Mastered':state.mastered===false?'Not mastered':'Unavailable'}</span><span>{hoverDay!==null?'Preview day':'Day'} {snapshot!.day} · Snapshot {snapshot!.sequence+1}</span></div><dl className="concept-facts"><div><dt>Simulator confidence</dt><dd>{state.confidence===null?'Unavailable':`${(state.confidence*100).toFixed(1)}%`}</dd></div><div><dt>Exposed in this snapshot</dt><dd>{state.exposed===null?'Unavailable':state.exposed?'Yes':'No'}</dd></div></dl><p className="small muted">{concept.description ?? 'No description supplied by the source references.'}</p></> : <p className="panel-empty">Select a concept to see its mastery, exposure, and source description.</p>}
      </section>
      <section className="panel research-panel confidence-panel" aria-label="Concept confidence history"><p className="eyebrow">Learning over time</p><h2>Concept confidence history</h2><p className="research-description">{overview ? 'Trace overview · all relevant concept confidence and misconception activity' : concept ? concept.title : 'Choose a concept to view its history.'}</p>{trace && (overview || conceptId) ? <ConfidenceHistory trace={trace} conceptId={conceptId} sync={sync} timeRange={timeRange} event={event} onEvent={onEvent} overview={overview} currentDay={currentDay}/> : <div className="confidence-empty"><span className="empty-confidence-line" aria-hidden="true"/><p>Choose a concept in the inspection panel<br/>to view its recorded confidence history.</p></div>}<p className="small muted">Hover either chart to compare the same time. Click confidence history to select the closest recorded event. Source: simulator confidence. This is separate from mastery and assessment correctness.</p></section>
    </div>
  </div>;
}
