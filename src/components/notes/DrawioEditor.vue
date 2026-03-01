<template>
  <div style="width:100%;height:100%;display:flex;flex-direction:column;position:relative;">
    <!-- Loading overlay — visible until draw.io fires 'init' -->
    <div
      v-if="!initialized"
      style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:#F9F9F9;z-index:10;"
    >
      <div style="text-align:center;">
        <svg class="drawio-spin" style="width:32px;height:32px;color:#9CA3AF;margin:0 auto 8px;display:block;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <path d="M21 12a9 9 0 1 1-6.2-8.6"/>
        </svg>
        <p style="font-family:'Inter',sans-serif;font-size:var(--fs-secondary);color:#9CA3AF;margin:0;">Loading editor…</p>
      </div>
    </div>

    <!-- Webview: only mounted once preloadPath is ready (avoids "Only file: protocol" error) -->
    <webview
      v-if="preloadPath && embedUrl"
      ref="wv"
      :src="embedUrl"
      :preload="preloadPath"
      style="flex:1;border:none;width:100%;height:100%;"
      nodeintegration="false"
      @ipc-message="onIpcMessage"
    />
  </div>
</template>

<script setup>
import { ref, onMounted, onBeforeUnmount } from 'vue'

const props = defineProps({
  xml: { type: String, default: '' },
  filePath: { type: String, default: '' },
})
const emit = defineEmits(['save'])

const wv = ref(null)
const embedUrl = ref('')
const preloadPath = ref('')
const initialized = ref(false)

onMounted(async () => {
  const [framePath, preload] = await Promise.all([
    window.electronAPI.drawio.getFramePath(),
    window.electronAPI.drawio.getPreloadPath(),
  ])
  preloadPath.value = `file://${preload}`
  embedUrl.value = `file://${framePath}`
})

onBeforeUnmount(() => {
  initialized.value = false
})

function sendToDrawio(payload) {
  if (!wv.value) return
  wv.value.executeJavaScript(
    `window.postMessage(${JSON.stringify(JSON.stringify(payload))}, '*')`
  )
}

function onIpcMessage(e) {
  if (e.channel !== 'drawio-message') return
  const msg = e.args[0]
  if (!msg) return

  if (msg.event === 'init') {
    initialized.value = true
    sendToDrawio({
      action: 'load',
      xml: props.xml || '<mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel>',
      autosave: 1,
    })
  } else if (msg.event === 'autosave' || msg.event === 'save') {
    if (msg.xml) emit('save', msg.xml)
  }
}
</script>

<style>
@keyframes drawio-spin-anim {
  from { transform: rotate(0deg); }
  to   { transform: rotate(360deg); }
}
.drawio-spin { animation: drawio-spin-anim 1s linear infinite; }
</style>
