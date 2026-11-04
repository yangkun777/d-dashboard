const REQUEST_TIMEOUT_MS = 3000

// 卡住的请求离开页面再进入就会成功。到点后中断，并自动再请求一次。
export function isRequestCancelled(signal: AbortSignal) {
  if (!signal.aborted) return false
  const reason: unknown = signal.reason
  return !(reason instanceof DOMException && reason.name === 'TimeoutError')
}

export function useSlowRefresh(load: (signal: AbortSignal) => Promise<void>) {
  let controller: AbortController | undefined
  let timer: number | undefined

  function clearTimer() {
    if (timer !== undefined) window.clearTimeout(timer)
    timer = undefined
  }

  function isCurrent(signal: AbortSignal) {
    return controller?.signal === signal
  }

  async function run(attempt: number) {
    clearTimer()
    controller?.abort()
    const current = new AbortController()
    controller = current
    timer = window.setTimeout(() => {
      if (controller !== current) return
      if (attempt < 1) {
        void run(attempt + 1)
        return
      }
      current.abort(new DOMException('请求超过 3 秒没有返回，请重试', 'TimeoutError'))
    }, REQUEST_TIMEOUT_MS)
    try {
      await load(current.signal)
    } finally {
      if (controller === current) clearTimer()
    }
  }

  function refresh() {
    return run(0)
  }

  function dispose() {
    clearTimer()
    controller?.abort()
    controller = undefined
  }

  return { refresh, dispose, isCurrent }
}
