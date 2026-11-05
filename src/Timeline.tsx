import { useEffect, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { LineChart, ScatterChart, EffectScatterChart } from 'echarts/charts';
import { GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, MarkPointComponent, AriaComponent, AxisPointerComponent } from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import { ChartSync, linkCrosshair } from './chartSync';
import type { Snapshot, Trace, TraceEvent } from './data';
import { eventStyles, eventTypes, timelineScale, formatSimulatorTime, mastery, wheelWindow, constrainWindow, type WindowRange } from './domain';

echarts.use([LineChart, ScatterChart, EffectScatterChart, GridComponent, TooltipComponent, DataZoomComponent, MarkLineComponent, MarkPointComponent, AriaComponent, AxisPointerComponent, CanvasRenderer]);

type Props = { currentDay: number; currentSnapshot: Snapshot; trace: Trace; selected: TraceEvent | null; onSelect: (id: string) => void; reset: number; sync: ChartSync; onRange: (range: WindowRange) => void };
export function Timeline({ trace, selected, currentDay, currentSnapshot, onSelect, reset, sync, onRange }: Props) {
  const element = useRef<HTMLDivElement>(null);
  const chart = useRef<echarts.ECharts | null>(null);
  const extent: WindowRange = [trace.snapshots[0].day, Math.max(trace.snapshots[0].day + 1, currentDay)];
  const view = useRef<WindowRange>(extent);
  const lastDay = useRef<number | undefined>(undefined);
  const extentRef = useRef(extent);
  extentRef.current = extent;
  const [preset,setPreset] = useState('full');
  const presetRef=useRef('full');
  const [rangeRevision,setRangeRevision] = useState(0);
  const presetDays: Record<string,number> = {'3':3,'7':7,'30':30};
  const [visible, setVisible] = useState<WindowRange>(extent);
  const selectRef = useRef(onSelect);
  selectRef.current = onSelect;
  useEffect(() => { onRange(visible); }, [visible, onRange]);

  useEffect(() => {
    const node = element.current!;
    const instance = echarts.init(node, undefined, { renderer: 'canvas' });
    chart.current = instance;
    const unlink = linkCrosshair(instance, node, sync);
    instance.on('click', (params: unknown) => {
      const id = (params as { data?: { eventId?: string } }).data?.eventId;
      if (id) selectRef.current(id);
    });
    instance.on('mouseover',(params:unknown)=>{const id=(params as {data?:{eventId?:string}}).data?.eventId;if(id)sync.publishEvent(id);});
    instance.on('mouseout',()=>sync.publishEvent(null));
    instance.on('datazoom', () => {
      sync.publishEvent(null);
      const zoom = (instance.getOption().dataZoom as { startValue?: number; endValue?: number }[])?.[0];
      if (typeof zoom?.startValue === 'number' && typeof zoom?.endValue === 'number') {
        view.current = [zoom.startValue, zoom.endValue];
        setVisible(view.current);
        const scale = timelineScale(zoom.endValue - zoom.startValue);
        instance.setOption({ xAxis: { interval: scale.interval ?? null, minInterval: scale.interval ?? 1, axisLabel: { formatter: (day: number) => formatSimulatorTime(day, scale.unit !== 'day') } } });
      }
    });
    const wheel = (event: WheelEvent) => {
      event.preventDefault();
      event.stopPropagation();
      const bounds = node.getBoundingClientRect();
      const anchor = (event.clientX - bounds.left - 68) / Math.max(1, bounds.width - 100);
      const scale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? node.clientHeight : 1;
      const fixed = ['3','7','30'].includes(presetRef.current);
      const pan = fixed || event.shiftKey || (!event.ctrlKey && Math.abs(event.deltaX) > Math.abs(event.deltaY));
      const next = wheelWindow(view.current, extentRef.current, event.deltaX * scale, event.deltaY * scale, anchor, pan);
      if(!pan){presetRef.current='custom';setPreset('custom');}
      view.current = next;
      instance.dispatchAction({ type: 'dataZoom', dataZoomIndex: 0, startValue: next[0], endValue: next[1] });
    };
    node.addEventListener('wheel', wheel, { passive: false, capture: true });
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(node);
    return () => { unlink(); observer.disconnect(); node.removeEventListener('wheel', wheel, true); instance.dispose(); chart.current = null; };
  }, [trace.id, sync]);

  useEffect(() => {
    const snapshots = new Map(trace.snapshots.map(s => [s.id, s]));
    if (lastDay.current !== currentDay) {
      const span = view.current[1] - view.current[0];
      view.current = presetRef.current === 'full'
        ? extent
        : constrainWindow(currentDay - span, currentDay, extent);
      setVisible(view.current);
    }
    lastDay.current = currentDay;
    const currentMastery = mastery(currentSnapshot);
    const pulse = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const line = trace.snapshots.map(s => [s.day, mastery(s)]);
    const fixed = ['3','7','30'].includes(preset);
    const width = fixed ? Math.min(presetDays[preset],extent[1]-extent[0]) : undefined;
    const scale = timelineScale(view.current[1] - view.current[0]);
    const options = {
      animation: false,
      aria: { enabled: true, description: `Trace ${trace.id}. The x-axis is Simulator day and the y-axis is overall mastery, zero to 100 percent. Colored learning events overlay the same plot at fixed layout heights, not mastery measurements. Use the event selector below the chart for keyboard access.` },
      textStyle: { fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif', color: '#475569' },
      grid: { left: 68, right: 32, top: 32, bottom: 104 },
      tooltip: { trigger: 'item', renderMode: 'richText', confine: true,
        axisPointer: {
          type: 'cross', snap: false,
          crossStyle: { color: '#526783', width: 1, type: 'dotted' },
          label: { show: true, backgroundColor: '#405a7d', color: '#ffffff', padding: [5, 8],
            formatter: (point: { axisDimension: string; value: number }) => point.axisDimension === 'x' ? formatSimulatorTime(point.value, timelineScale(view.current[1] - view.current[0]).unit !== 'day') : `${point.value.toFixed(1)}%`,
          },
        },
        formatter: (params: { data: { eventId?: string }; value: [number, number | string | null]; seriesType: string }) => {
        if (params.data?.eventId) {
          const event = trace.events.find(e => e.id === params.data.eventId)!;
          return `${eventStyles[event.type].title} · Day ${snapshots.get(event.snapshotId)!.day}\nEvent ${event.reportStep}`;
        }
        return `Day ${params.value[0]}\nMastered: ${typeof params.value[1] === 'number' ? params.value[1].toFixed(1) + '%' : 'unavailable'}`;
      } },
      xAxis: { type: 'value', min: extent[0], max: extent[1], name: 'Simulator day', nameLocation: 'middle', nameGap: 34, nameTextStyle: { fontSize: 13, fontWeight: 500, color: '#334b6b' }, interval: scale.interval, minInterval: scale.interval ?? 1, axisLabel: { hideOverlap: true, fontSize: 12, formatter: (day: number) => formatSimulatorTime(day, scale.unit !== 'day') }, axisTick: { show: false }, axisLine: { lineStyle: { color: '#dce3eb' } }, splitLine: { show: true, lineStyle: { color: '#f0f3f8' } } },
      yAxis: { axisPointer: { label: { show: false } }, type: 'value', min: 0, max: 100, interval: 25, name: 'Overall mastery', nameTextStyle: { align: 'left', padding: [0, 0, 0, -43], color: '#334b6b' }, axisLabel: { formatter: '{value}%' }, splitLine: { lineStyle: { color: '#e5eaf0' } } },
      dataZoom: [
        { id: 'window', type: 'inside', xAxisIndex: 0, filterMode: 'none', zoomLock: fixed, minValueSpan: width, maxValueSpan: width, startValue: view.current[0], endValue: view.current[1], zoomOnMouseWheel: false, moveOnMouseWheel: false, moveOnMouseMove: true, preventDefaultMouseMove: true },
        { type: 'slider', xAxisIndex: 0, filterMode: 'none', zoomLock: fixed, minValueSpan: width, maxValueSpan: width, startValue: view.current[0], endValue: view.current[1], bottom: 8, height: 22, showDetail: false, brushSelect: false, borderColor: 'transparent', fillerColor: '#dfe9fa', handleStyle: { color: '#7397d0' }, dataBackground: { lineStyle: { color: '#9db0ca' }, areaStyle: { color: '#eef2f7' } } },
      ],
      series: [
        { name: 'Overall mastery', type: 'line', data: line, step: 'end', showSymbol: false, lineStyle: { color: '#2d64bd', width: 2.5 }, itemStyle: { color: '#2d64bd' }, connectNulls: false,
          markLine: { silent: true, symbol: 'none', label: { show: false }, lineStyle: { color: '#8aaddc', type: 'dashed', width: 1 }, data: [{ xAxis: currentDay }] },
        },
        { name: 'Current day', type: pulse ? 'effectScatter' : 'scatter', silent: true, z: 8, symbolSize: 10,
          itemStyle: { color: '#188038', borderColor: '#fff', borderWidth: 1.5 },
          rippleEffect: { period: 2.4, scale: 2.6, number: 1, brushType: 'stroke' },
          data: currentMastery === null ? [] : [[currentDay, currentMastery]],
        },
        ...eventTypes.map(type => ({ name: eventStyles[type].title, type: 'scatter', symbol: eventStyles[type].symbol, z: 5,
          data: trace.events.filter(e => e.type === type).map(e => ({ value: [snapshots.get(e.snapshotId)!.day, eventStyles[type].plotLevel], eventId: e.id,
            symbolSize: e.id === selected?.id ? 21 : 15, itemStyle: { color: eventStyles[type].color, opacity: 1, borderColor: e.id === selected?.id ? '#23354f' : '#ffffff', borderWidth: e.id === selected?.id ? 2.5 : 1.5 } })),
        })),
      ],
    };
    chart.current?.setOption(options, { notMerge: true });
  }, [trace, selected, currentDay, currentSnapshot, preset, rangeRevision]);

  useEffect(() => {
    view.current = extent;
    setVisible(extent);presetRef.current='full';setPreset('full');setRangeRevision(n=>n+1);
  }, [reset]);

  return <><div className="timeline-chart" ref={element} role="img" aria-label={`Trace ${trace.id} mastery and overlaid learning events. X-axis: Simulator day. Scroll or pinch to zoom; Shift-scroll or horizontal scroll to pan.`} data-testid="timeline-chart" data-current-day={currentDay} data-recorded-events={trace.events.length}/><output className="visible-range" data-testid="visible-range" aria-live="off">{timelineScale(visible[1]-visible[0]).unit === 'day' ? `Showing days ${Number(visible[0].toFixed(1))}–${Number(visible[1].toFixed(1))}` : `Showing ${formatSimulatorTime(visible[0])} – ${formatSimulatorTime(visible[1])}`}{timelineScale(visible[1]-visible[0]).unit === 'day' ? '' : timelineScale(visible[1]-visible[0]).unit === 'hour' ? ' · Hourly ticks' : ' · Half-hour ticks'}</output><div className="range-presets" role="group" aria-label="Timeline range presets">{[['3','3 days'],['7','Week'],['30','Month'],['full','Full term']].map(([key,label])=><button key={key} type="button" aria-pressed={preset===key} onClick={()=>{const day=currentDay;const span=presetDays[key];const next:WindowRange=key==='full'?extent:constrainWindow(day-span/2,day+span/2,extent);presetRef.current=key;setPreset(key);view.current=next;setVisible(next);setRangeRevision(n=>n+1);}}>{label}</button>)}{preset==='custom'&&<span>Custom view</span>}</div>{['3','7','30'].includes(preset)&&<p className="preset-hint">Scroll to move the {preset==='3'?'3-day':preset==='7'?'7-day':'30-day'} window. Its duration stays fixed.</p>}</>;
}
