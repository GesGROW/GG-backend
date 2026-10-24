export function esErrorTemporal(error) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true
  const status = Number(error?.status ?? error?.code)
  if ([0, 408, 429].includes(status) || status >= 500) return true
  if (status >= 400 && status < 500) return false
  const mensaje = String(error?.message ?? error).toLowerCase()
  return /fetch|network|timeout|timed out|sin conexi[oó]n|failed to fetch|econn|temporarily unavailable|service unavailable|gateway/.test(
    mensaje
  )
}
