import type { EChartsOption } from 'echarts'

export const colors = { purple: '#3985D7', violet: '#759FE8', cyan: '#27B7A6', pink: '#E18A9A', blue: '#75A9E8', gold: '#E5AE56', text: '#33435B', muted: '#7D8BA0' }
export const productPieColors = ['#3985D7', '#27B7A6', '#E5AE56', '#E07A4C', '#7B6FD6', '#5BAE6A', '#E18A9A', '#4AA3C7', '#C46BB0', '#8C7AE6']
const axis = { axisLine: { lineStyle: { color: '#D9E1EA' } }, axisTick: { show: false }, axisLabel: { color: colors.muted, fontSize: 11 } }
const gridLine = { lineStyle: { color: '#E7EDF3' } }

export function horizontalBars(names: string[], values: number[], color: string | string[] = colors.purple, max?: number): EChartsOption {
  const barColors = Array.isArray(color) ? color : names.map(() => color)
  const data = values.map((value, index) => ({ value, itemStyle: { color: barColors[index] ?? colors.purple, borderRadius: [0, 5, 5, 0] } })).reverse()
  return {
    animationDuration: 700,
    grid: { left: 72, right: 48, top: 14, bottom: 25, containLabel: false },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff', borderColor: '#DCE6EF', textStyle: { color: colors.text } },
    xAxis: { type: 'value', max, splitLine: gridLine, ...axis },
    yAxis: { type: 'category', data: [...names].reverse(), ...axis, axisLine: { show: false }, axisLabel: { color: colors.text, fontSize: 12, interval: 0, hideOverlap: false } },
    series: [{ type: 'bar', data, barWidth: '48%', showBackground: true, backgroundStyle: { color: '#F0F4F8', borderRadius: 8 }, label: { show: true, position: 'right', color: colors.text, fontSize: 11 } }],
  }
}

export function donut(data: { name: string; value: number }[], centerLabel?: string, compact = false): EChartsOption {
  // 所有饼图直接把名称、数量、百分比标在图上，不再依赖底部图例或 hover。
  const singleCompact = compact && data.length === 1;
  const pieLabel = (params: any) =>
    `${params.name ?? ''} ${Number(params.value ?? 0)}; ${Number(params.percent ?? 0).toFixed(2)}%`;
  const singleLabel = singleCompact
    ? `${data[0].name}\n${data[0].value} · 100.00%`
    : centerLabel;
  return {
    color: compact ? productPieColors : [colors.purple, colors.cyan, colors.blue, colors.pink, colors.gold, '#7BC7AA'],
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#DCE6EF', textStyle: { color: colors.text } },
    title: singleLabel && !compact ? { text: singleLabel, left: 'center', top: '46%', textStyle: { color: '#24354D', fontSize: 18, fontWeight: 700 } } : undefined,
    graphic: compact && singleLabel ? [{ type: 'text', left: 'center', top: 'middle', silent: true, style: { text: singleLabel, fill: '#24354D', font: `700 ${singleCompact ? 14 : 18}px sans-serif`, align: 'center', verticalAlign: 'middle' } }] : undefined,
    series: [{
      type: 'pie',
      animationType: 'expansion',
      animationTypeUpdate: 'transition',
      animationDuration: 1250,
      animationDurationUpdate: 850,
      animationEasing: 'cubicOut',
      animationEasingUpdate: 'cubicOut',
      startAngle: 90,
      radius: compact ? ['34%', '64%'] : ['46%', '76%'],
      center: ['50%', '50%'],
      itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 4 },
      avoidLabelOverlap: true,
      label: {
        show: !singleCompact,
        position: 'outside',
        formatter: pieLabel,
        color: colors.text,
        fontSize: compact ? 11 : 12,
        lineHeight: compact ? 15 : 17,
        width: compact ? 108 : 120,
        overflow: 'break',
        alignTo: compact ? 'edge' : 'labelLine',
        edgeDistance: compact ? 12 : 12,
        bleedMargin: compact ? 12 : 10,
      },
      labelLine: { show: !singleCompact, length: compact ? 5 : 7, length2: compact ? 6 : 8, smooth: true },
      emphasis: { label: { show: !singleCompact, color: colors.text, formatter: pieLabel } },
      data,
    }],
    // 小屏时给外侧标签多留一点空间，避免文字被裁切。
    media: compact ? undefined : [
      { query: { maxHeight: 250 }, option: { series: [{ radius: ['40%', '66%'] }] } },
      { query: { maxHeight: 300 }, option: { series: [{ radius: ['42%', '68%'] }] } },
    ],
  }
}
