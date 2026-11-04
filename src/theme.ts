import { ref, watch } from 'vue'

function readTheme(): boolean {
  try { return localStorage.getItem('degson.theme') === 'dark' } catch { return false }
}
export const isDark = ref(readTheme())
let transitionFrame: number | undefined
watch(isDark, value => {
  if (transitionFrame !== undefined) window.cancelAnimationFrame(transitionFrame)
  document.documentElement.classList.add('theme-transitioning')
  // Suppress component hover/focus transitions while applying the new palette.
  void document.documentElement.offsetHeight
  document.documentElement.dataset.theme = value ? 'dark' : 'light'
  document.documentElement.style.colorScheme = value ? 'dark' : 'light'
  void document.documentElement.offsetHeight
  transitionFrame = window.requestAnimationFrame(() => {
    document.documentElement.classList.remove('theme-transitioning')
    transitionFrame = undefined
  })
  try { localStorage.setItem('degson.theme', value ? 'dark' : 'light') } catch { /* Optional storage. */ }
}, { immediate: true })
