<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { DataAnalysis, Histogram, User, Document, PieChart, Fold, Expand, FullScreen, Close, Moon, Sunny } from '@element-plus/icons-vue'

import { isDark } from './theme'

const route = useRoute()
const router = useRouter()
const collapsed = ref(false)
const fullscreen = ref(false)
provide('dashboardFullscreen', fullscreen)
const active = computed(() => route.path)
const menuItems = [
  { path: '/', label: '运营总览', icon: DataAnalysis },
  { path: '/ranking', label: '业务排行', icon: Histogram },
  { path: '/efficiency', label: '个人效能', icon: User },
  { path: '/orders', label: '工单明细', icon: Document },
  { path: '/product-lines', label: '产品线事项', icon: PieChart },
]
const pageTitle = computed(() => menuItems.find(item => item.path === route.path)?.label || '运营总览')
const beijingClock = new Intl.DateTimeFormat('zh-CN', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: 'long', day: 'numeric',
  hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false,
})
const today = ref(beijingClock.format(new Date()))
let clockTimer: number | undefined

let autoRotateTimer: number | undefined

function stopAutoRotate() {
  if (autoRotateTimer !== undefined) {
    window.clearInterval(autoRotateTimer)
    autoRotateTimer = undefined
  }
}

function startAutoRotate() {
  stopAutoRotate()
  autoRotateTimer = window.setInterval(() => {
    const index = menuItems.findIndex(item => item.path === route.path)
    const next = menuItems[(index + 1) % menuItems.length]
    if (next) void router.push(next.path)
  }, 2 * 60 * 1000)
}

let autoScrollTimer: number | undefined
const autoScrollPauseUntil = new WeakMap<HTMLElement, number>()
function startAutoScroll() {
  stopAutoScroll()
  document.querySelectorAll<HTMLElement>('[data-auto-scroll]').forEach(element => {
    element.scrollTop = 0
    autoScrollPauseUntil.set(element, 0)
  })
  autoScrollTimer = window.setInterval(() => {
    document.querySelectorAll<HTMLElement>('[data-auto-scroll]').forEach(element => {
      if (!element.offsetParent || element.scrollHeight <= element.clientHeight + 2) return
      if (Date.now() < (autoScrollPauseUntil.get(element) ?? 0)) return
      const atBottom = element.scrollTop + element.clientHeight >= element.scrollHeight - 2
      if (atBottom) {
        element.scrollTo({ top: 0, behavior: 'smooth' })
        autoScrollPauseUntil.set(element, Date.now() + 2600)
      } else {
        element.scrollTop += 1
      }
    })
  }, 40)
}
function stopAutoScroll() {
  if (autoScrollTimer !== undefined) {
    window.clearInterval(autoScrollTimer)
    autoScrollTimer = undefined
  }
}

watch(fullscreen, isFullscreen => {
  if (isFullscreen) {
    startAutoRotate()
    startAutoScroll()
  } else {
    stopAutoRotate()
    stopAutoScroll()
  }
})

async function enterFullscreen() {
  fullscreen.value = true
  try { await document.documentElement.requestFullscreen() } catch { /* 嵌入预览不允许浏览器全屏时，仍保持无导航展示 */ }
}

async function exitFullscreen() {
  fullscreen.value = false
  stopAutoRotate()
  stopAutoScroll()
  if (document.fullscreenElement) {
    try { await document.exitFullscreen() } catch { /* 页面仍可通过按钮恢复导航 */ }
  }
}

function onFullscreenChange() {
  if (!document.fullscreenElement && fullscreen.value) fullscreen.value = false
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape' && fullscreen.value) void exitFullscreen()
}

onMounted(() => {
  today.value = beijingClock.format(new Date())
  clockTimer = window.setInterval(() => { today.value = beijingClock.format(new Date()) }, 1000)
  document.addEventListener('fullscreenchange', onFullscreenChange)
  document.addEventListener('keydown', onKeydown)
})
onBeforeUnmount(() => {
  if (clockTimer !== undefined) window.clearInterval(clockTimer)
  stopAutoRotate()
  stopAutoScroll()
  document.removeEventListener('fullscreenchange', onFullscreenChange)
  document.removeEventListener('keydown', onKeydown)
})
</script>

<template>
  <div class="app-shell" :class="{ 'is-collapsed': collapsed, 'is-fullscreen': fullscreen }">
    <aside v-if="!fullscreen" class="sidebar">
      <button class="brand" type="button" aria-label="返回运营总览" @click="router.push('/')">
        <img class="brand-mark" src="/favicon.ico?v=2" alt="" />
        <span v-if="!collapsed" class="brand-name">DEGSON <small>高松技术支持中心</small></span>
      </button>
      <div class="nav-section-label" v-if="!collapsed">工作空间</div>
      <nav class="nav-list" aria-label="主菜单">
        <button v-for="item in menuItems" :key="item.path" class="nav-item" :class="{ active: active === item.path }" :aria-current="active === item.path ? 'page' : undefined" @click="router.push(item.path)" :title="item.label">
          <el-icon :size="20"><DataAnalysis v-if="item.path === '/'"/><Histogram v-else-if="item.path === '/ranking'"/><User v-else-if="item.path === '/efficiency'"/><Document v-else-if="item.path === '/orders'"/><PieChart v-else/></el-icon><span v-if="!collapsed">{{ item.label }}</span><i v-if="active === item.path && !collapsed" class="active-indicator"></i>
        </button>
      </nav>
      <div class="sidebar-bottom">
        <button class="collapse-button" @click="collapsed = !collapsed" :aria-label="collapsed ? '展开侧边栏' : '收起侧边栏'">
          <el-icon :size="18"><Expand v-if="collapsed" /><Fold v-else /></el-icon><span v-if="!collapsed">收起菜单</span>
        </button>
      </div>
    </aside>
    <div class="main-area">
      <header v-if="!fullscreen" class="topbar">
        <div class="topbar-left"><span class="breadcrumb-root">工作空间</span><span class="breadcrumb-slash">/</span><strong>{{ pageTitle }}</strong></div>
        <div class="topbar-actions">
          <span class="today-label">{{ today }}</span><button class="fullscreen-button theme-toggle" :aria-label="isDark ? '切换浅色主题' : '切换深色主题'" :aria-pressed="isDark" @click="isDark = !isDark"><el-icon :size="17"><Sunny v-if="isDark"/><Moon v-else/></el-icon><span>{{ isDark ? '浅色' : '深色' }}</span></button>
          <button class="fullscreen-button" aria-label="全屏展示" title="全屏展示" @click="enterFullscreen"><el-icon :size="17"><FullScreen /></el-icon><span>全屏</span></button>
        </div>
      </header>
      <div v-if="fullscreen" class="fullscreen-exit-zone"><button class="fullscreen-exit" aria-label="退出全屏" title="退出全屏（Esc）" @click="exitFullscreen"><el-icon :size="18"><Close /></el-icon></button></div>
      <main class="page-content"><router-view v-slot="{ Component, route }"><Transition name="page-switch" mode="out-in"><component :is="Component" :key="route.path" /></Transition></router-view></main>
    </div>
  </div>
</template>
