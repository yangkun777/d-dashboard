import { ref, watch } from 'vue'

function readTheme(): boolean {
  try { return localStorage.getItem('degson.theme') === 'dark' } catch { return false }
}
export const isDark = ref(readTheme())
let transitionTimer: number | undefined
let initialized = false
watch(isDark, value => {
  if (initialized && !window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.documentElement.classList.add('theme-transitioning')
    window.clearTimeout(transitionTimer)
    transitionTimer = window.setTimeout(() => document.documentElement.classList.remove('theme-transitioning'), 700)
  }
  document.documentElement.dataset.theme = value ? 'dark' : 'light'
  document.documentElement.style.colorScheme = value ? 'dark' : 'light'
  try { localStorage.setItem('degson.theme', value ? 'dark' : 'light') } catch { /* Optional storage. */ }
  initialized = true
}, { immediate: true })
