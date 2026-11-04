<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { isDark } from '../theme'
import * as echarts from 'echarts'
import type { EChartsOption } from 'echarts'

const props = defineProps<{ option: EChartsOption }>()
const root = ref<HTMLElement | null>(null)
let chart: echarts.ECharts | undefined
let observer: ResizeObserver | undefined
let renderFrame: number | undefined
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)')

const darkColors: Record<string, string> = {
  '#fff': '#10283f', '#ffffff': '#10283f', '#33435b': '#c9dfef',
  '#7d8ba0': '#8faec5', '#24354d': '#e3f3ff', '#d9e1ea': '#2a465e',
  '#e7edf3': '#20394f', '#dce6ef': '#30516c', '#f0f4f8': '#172f45',
}
function recolor(value: unknown): unknown {
  if (typeof value === 'string') return darkColors[value.toLowerCase()] ?? value
  if (Array.isArray(value)) return value.map(recolor)
  if (value && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype)
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, recolor(item)]))
  return value
}
function setOption(option: EChartsOption) {
  if (isDark.value) option = recolor(option) as EChartsOption
  const animatedOption: EChartsOption = prefersReducedMotion.matches
    ? { ...option, animation: false }
    : {
        animation: true,
        animationDuration: 850,
        animationDurationUpdate: 600,
        animationEasing: 'cubicOut',
        animationEasingUpdate: 'cubicOut',
        ...option,
      }
  chart?.setOption(animatedOption, true)
}

function resizeToContainer() {
  if (!root.value || !chart) return
  const { clientWidth: width, clientHeight: height } = root.value
  if (width > 0 && height > 0 && (width !== chart.getWidth() || height !== chart.getHeight())) {
    chart.resize({ width, height })
  }
}

function scheduleRender() {
  if (renderFrame !== undefined) window.cancelAnimationFrame(renderFrame)
  renderFrame = window.requestAnimationFrame(() => {
    renderFrame = undefined
    // Ranking data can change the scroll canvas height. Finish that resize
    // before applying data so it cannot cancel the new series animation.
    resizeToContainer()
    setOption(props.option)
  })
}

onMounted(() => {
  if (!root.value) return
  chart = echarts.init(root.value)
  scheduleRender()
  observer = new ResizeObserver(() => {
    if (renderFrame === undefined) resizeToContainer()
  })
  observer.observe(root.value)
})
watch(isDark, scheduleRender, { flush: 'post' })
watch(() => props.option, scheduleRender, { deep: true, flush: 'post' })
onBeforeUnmount(() => {
  if (renderFrame !== undefined) window.cancelAnimationFrame(renderFrame)
  observer?.disconnect()
  chart?.dispose()
})
</script>

<template><div ref="root" class="echart-root" role="img" aria-label="数据图表"></div></template>
