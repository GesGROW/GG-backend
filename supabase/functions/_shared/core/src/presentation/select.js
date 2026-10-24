export function supportsCustomSelect() {
  return globalThis.CSS?.supports?.('appearance', 'base-select') ?? false
}

// The PWA replaces option lists directly; restore only the native trigger.
export function enhanceNativeSelects(root = document) {
  if (!supportsCustomSelect()) return () => {}
  const doc = root.ownerDocument ?? root
  function enhance(select) {
    if (
      select.multiple ||
      select.hasAttribute('size') ||
      select.querySelector(':scope > button.scc-select-trigger')
    ) return
    const trigger = doc.createElement('button')
    trigger.type = 'button'
    trigger.className = 'scc-select-trigger'
    trigger.append(doc.createElement('selectedcontent'))
    select.prepend(trigger)
  }
  root.querySelectorAll('select').forEach(enhance)
  const observer = new MutationObserver((records) => {
    const selects = new Set()
    for (const record of records) {
      if (record.target instanceof Element) {
        const select = record.target.closest('select')
        if (select) selects.add(select)
      }
      for (const node of record.addedNodes) {
        if (!(node instanceof Element)) continue
        if (node.matches('select')) selects.add(node)
        node.querySelectorAll('select').forEach((select) => selects.add(select))
      }
    }
    selects.forEach(enhance)
  })
  observer.observe(root, { childList: true, subtree: true })
  return () => observer.disconnect()
}
