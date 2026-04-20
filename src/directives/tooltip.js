// Global v-tooltip directive — replaces the native browser `title` attribute
// with a dark, styled, instant-appearing tooltip that matches the look of
// ChatHeader's .ch-config-tooltip-fixed.
//
// Usage:  <button v-tooltip="'Help text'">...</button>
// or:     <button v-tooltip="dynamicVar">...</button>
//
// The directive strips the element's `title` attribute on mount so the native
// browser tooltip never fires (it would appear in addition to ours, with a
// ~1.5s delay that feels broken).

let _tipEl = null
let _hideTimer = null

function ensureTipEl() {
  if (_tipEl) return _tipEl
  _tipEl = document.createElement('div')
  _tipEl.className = 'app-custom-tooltip'
  _tipEl.style.cssText = [
    'position: fixed',
    'z-index: 9999',
    'pointer-events: none',
    'background: #1A1A1A',
    'color: #FFFFFF',
    'padding: 0.375rem 0.625rem',
    'border-radius: 0.375rem',
    'font-size: 0.75rem',
    'font-weight: 500',
    'line-height: 1.4',
    'white-space: nowrap',
    'max-width: 18rem',
    'box-shadow: 0 4px 12px rgba(0,0,0,0.18)',
    'opacity: 0',
    'transform: translate(0, 2px)',
    'transition: opacity .08s ease, transform .08s ease',
  ].join(';')
  document.body.appendChild(_tipEl)
  return _tipEl
}

function showTip(el) {
  const text = el._tooltipText
  if (!text) return
  const tip = ensureTipEl()
  // Clear any pending hide so rapid re-enter doesn't get swallowed
  if (_hideTimer) { clearTimeout(_hideTimer); _hideTimer = null }
  tip.textContent = text

  // Measure after writing text so getBoundingClientRect is accurate
  // (briefly make visible but off-screen for measurement)
  tip.style.left = '-9999px'
  tip.style.top  = '-9999px'
  tip.style.opacity = '0'
  tip.style.transform = 'translate(0, 2px)'

  const rect = el.getBoundingClientRect()
  // Force layout
  const tipRect = tip.getBoundingClientRect()

  const vpW = window.innerWidth
  const vpH = window.innerHeight
  const margin = 8

  let top = rect.bottom + 6
  // If not enough space below, flip above
  if (top + tipRect.height + margin > vpH) top = rect.top - tipRect.height - 6
  top = Math.max(margin, Math.min(vpH - tipRect.height - margin, top))

  let left = rect.left + rect.width / 2 - tipRect.width / 2
  left = Math.max(margin, Math.min(vpW - tipRect.width - margin, left))

  tip.style.left = left + 'px'
  tip.style.top  = top + 'px'
  tip.style.opacity = '1'
  tip.style.transform = 'translate(0, 0)'
}

function hideTip() {
  if (!_tipEl) return
  _tipEl.style.opacity = '0'
}

// Document-level delegation for elements with a `title` attribute that are
// rendered via v-html (markdown output, etc.) so we can't attach the directive
// to them. Such elements opt in by carrying the `data-app-tooltip` attribute.
let _delegationInstalled = false
function installDelegation() {
  if (_delegationInstalled) return
  _delegationInstalled = true
  document.addEventListener('mouseover', (e) => {
    const el = e.target.closest && e.target.closest('[data-app-tooltip]')
    if (!el) return
    if (!el._tooltipText) {
      const t = el.getAttribute('title') || el.getAttribute('data-tooltip-text') || ''
      if (!t) return
      el._tooltipText = t
      if (el.hasAttribute('title')) {
        el.setAttribute('data-tooltip-fallback', t)
        el.removeAttribute('title')
      }
    }
    showTip(el)
  }, true)
  document.addEventListener('mouseout', (e) => {
    const el = e.target.closest && e.target.closest('[data-app-tooltip]')
    if (el) hideTip()
  }, true)
  document.addEventListener('click', (e) => {
    const el = e.target.closest && e.target.closest('[data-app-tooltip]')
    if (el) hideTip()
  }, true)
}

if (typeof document !== 'undefined') installDelegation()

export default {
  mounted(el, binding) {
    el._tooltipText = binding.value == null ? '' : String(binding.value)
    // Move any native title out of the way — but keep it on a custom attribute
    // so screen readers still have access (aria-label would be cleaner but
    // risks overriding existing labels, so we stash it.)
    if (el.hasAttribute('title')) {
      const t = el.getAttribute('title')
      el.setAttribute('data-tooltip-fallback', t)
      el.removeAttribute('title')
      if (!el._tooltipText) el._tooltipText = t
    }
    el._tooltipEnter = () => showTip(el)
    el._tooltipLeave = () => hideTip()
    el.addEventListener('mouseenter', el._tooltipEnter)
    el.addEventListener('mouseleave', el._tooltipLeave)
    // Also hide on click (e.g. if user clicks the button, tooltip should dismiss)
    el.addEventListener('click', el._tooltipLeave)
  },
  updated(el, binding) {
    el._tooltipText = binding.value == null ? '' : String(binding.value)
  },
  unmounted(el) {
    if (el._tooltipEnter) el.removeEventListener('mouseenter', el._tooltipEnter)
    if (el._tooltipLeave) {
      el.removeEventListener('mouseleave', el._tooltipLeave)
      el.removeEventListener('click', el._tooltipLeave)
    }
    hideTip()
  },
}
