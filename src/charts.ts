import type { EChartsOption } from 'echarts'

export const colors = { purple: '#3985D7', violet: '#759FE8', cyan: '#27B7A6', pink: '#E18A9A', blue: '#75A9E8', gold: '#E5AE56', text: '#33435B', muted: '#7D8BA0' }
const axis = { axisLine: { lineStyle: { color: '#D9E1EA' } }, axisTick: { show: false }, axisLabel: { color: colors.muted, fontSize: 11 } }
const gridLine = { lineStyle: { color: '#E7EDF3' } }

export function horizontalBars(names: string[], values: number[], color = colors.purple, max?: number): EChartsOption {
  return {
    animationDuration: 700,
    grid: { left: 72, right: 42, top: 14, bottom: 25, containLabel: false },
    tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' }, backgroundColor: '#fff', borderColor: '#DCE6EF', textStyle: { color: colors.text } },
    xAxis: { type: 'value', max, splitLine: gridLine, ...axis },
    yAxis: { type: 'category', data: [...names].reverse(), ...axis, axisLine: { show: false }, axisLabel: { color: colors.text, fontSize: 12 } },
    series: [{ type: 'bar', data: [...values].reverse(), barWidth: '48%', showBackground: true, backgroundStyle: { color: '#F0F4F8', borderRadius: 8 }, itemStyle: { color, borderRadius: [0, 5, 5, 0] }, label: { show: true, position: 'right', color: colors.text, fontSize: 11 } }],
  }
}

export function donut(data: { name: string; value: number }[], centerLabel?: string): EChartsOption {
  return {
    color: [colors.purple, colors.cyan, colors.blue, colors.pink, colors.gold, '#7BC7AA'],
    tooltip: { trigger: 'item', backgroundColor: '#fff', borderColor: '#DCE6EF', textStyle: { color: colors.text } },
    legend: { bottom: 0, left: 'center', icon: 'circle', itemWidth: 8, itemHeight: 8, textStyle: { color: colors.muted, fontSize: 11 }, pageTextStyle: { color: colors.muted }, type: 'scroll' },
    title: centerLabel ? { text: centerLabel, left: 'center', top: '39%', textStyle: { color: '#24354D', fontSize: 21, fontWeight: 700 } } : undefined,
    series: [{ type: 'pie', animationType: 'expansion', animationTypeUpdate: 'expansion', animationDuration: 1250, animationDurationUpdate: 850, animationEasing: 'cubicOut', animationEasingUpdate: 'cubicOut', startAngle: 90, radius: ['51%', '72%'], center: ['50%', '43%'], itemStyle: { borderColor: '#fff', borderWidth: 3, borderRadius: 4 }, label: { show: false }, emphasis: { label: { show: true, color: colors.text, formatter: '{b}: {c}' } }, data }],
  }
}
