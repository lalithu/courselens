import type { ECharts } from 'echarts/core';

export type HoverItem = {kind:'concept'|'misconception';id:string};

// Time and transient item emphasis are independent of persistent selection.
export class ChartSync {
  private eventId:string|null=null;
  private eventListeners=new Set<()=>void>();
  get hoveredEventId(){return this.eventId;}
  publishEvent(id:string|null){if(id===this.eventId)return;this.eventId=id;this.eventListeners.forEach(listener=>listener());}
  subscribeEvent(listener:()=>void){this.eventListeners.add(listener);return()=>{this.eventListeners.delete(listener);};}
  private item: HoverItem | null = null;
  private itemListeners = new Set<(item:HoverItem|null)=>void>();
  get hoveredItem(){return this.item;}
  publishItem(item:HoverItem|null){this.item=item;this.itemListeners.forEach(listener=>listener(item));}
  subscribeItem(listener:(item:HoverItem|null)=>void){this.itemListeners.add(listener);return()=>{this.itemListeners.delete(listener);};}
  private listeners = new Set<(day: number | null) => void>();
  publish(day: number | null) { if(day===null){this.publishItem(null);this.publishEvent(null);} this.listeners.forEach(listener => listener(day)); }
  subscribe(listener: (day: number | null) => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
}

export function linkCrosshair(chart: ECharts, node: HTMLDivElement, sync: ChartSync) {
  const cursor = document.createElement('div');
  cursor.className = 'synced-time-cursor';
  cursor.setAttribute('aria-hidden', 'true');
  node.append(cursor);
  let current: number | null = null;
  const gridIndices = () => ((chart.getOption().grid as unknown[] | undefined)?.length ?? 1) > 1 ? [0,1] : [0];
  const draw = () => {
    const x = current === null ? NaN : chart.convertToPixel({xAxisIndex:0}, current) as number;
    const top = chart.convertToPixel({yAxisIndex:0},100) as number;
    const bottom = gridIndices().length>1 ? chart.getHeight()-38 : chart.convertToPixel({yAxisIndex:0},0) as number;
    const rect = {y:top,height:bottom-top};
    const visible = rect && Number.isFinite(x) && chart.containPixel({gridIndex:0},[x,top+1]);
    cursor.style.display = visible ? 'block' : 'none';
    if (visible) { cursor.style.left = `${x}px`; cursor.style.top = `${rect.y}px`; cursor.style.height = `${rect.height}px`; }
    if (current === null) delete node.dataset.hoverDay;
    else node.dataset.hoverDay = String(current);
  };
  const unsubscribe = sync.subscribe(day => { current = day; draw(); });
  const move = (event: {offsetX:number;offsetY:number}) => {
    if (!chart.containPixel({gridIndex:gridIndices()},[event.offsetX,event.offsetY])) { sync.publish(null); return; }
    const day = chart.convertFromPixel({xAxisIndex:0},event.offsetX) as number;
    if (Number.isFinite(day)) sync.publish(day);
  };
  const leave = () => sync.publish(null);
  chart.getZr().on('mousemove',move);
  chart.getZr().on('globalout',leave);
  chart.on('finished',draw);
  return () => {
    unsubscribe(); chart.getZr().off('mousemove',move); chart.getZr().off('globalout',leave);
    chart.off('finished',draw); cursor.remove(); sync.publish(null);
  };
}
