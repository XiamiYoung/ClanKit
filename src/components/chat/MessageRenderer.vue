<template>
  <div>
    <!-- ── User message ─────────────────────────────────────────────────────── -->
    <template v-if="message.role === 'user'">
      <!-- Image attachments -->
      <div
        v-if="imageAttachments.length > 0"
        class="flex flex-wrap gap-2 mb-2"
      >
        <img
          v-for="att in imageAttachments"
          :key="att.id || att.name"
          :src="att.preview"
          :alt="att.name"
          style="max-width:280px; max-height:200px; border-radius:10px; object-fit:contain; display:block; background:rgba(255,255,255,0.12); cursor:pointer;"
          :title="t('common.clickToOpen') + ' ' + att.name"
          @click="openImage(att)"
        />
      </div>
      <div v-if="message.content" class="prose-clankai user-content" style="max-width:none; color:#ffffff !important;" v-html="renderMarkdown(message.content || '')" @click="handleContentClick" />
      <BabylonViewer v-for="url in modelUrls" :key="url" :src="url" />
    </template>

    <!-- ── Assistant message ────────────────────────────────────────────────── -->
    <template v-else>
    <!-- ── Todo List Panel (single, live) ───────────────────────────────────────── -->
    <div v-if="latestTodos.length > 0" class="mb-3 rounded-xl overflow-hidden" style="border:1px solid #d4e4d4; background:#f8faf7;">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" style="background:#eaf3ea; border-bottom:1px solid #d4e4d4;" @click="todoCollapsed = !todoCollapsed">
        <span style="color:#4c8446; font-size:0.85rem;">☑</span>
        <span style="font-size:0.8rem; font-weight:600; color:#3a6b35;">{{ t('chats.taskList') }}</span>
        <div class="flex gap-1.5 ml-2">
          <span v-if="todoSummary.done > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:#dcfce7; color:#15803d;">{{ todoSummary.done }} {{ t('chats.done') }}</span>
          <span v-if="todoSummary.running > 0" class="px-1.5 py-0.5 rounded-full animate-pulse" style="font-size:0.7rem; background:#fef9c3; color:#a16207;">{{ todoSummary.running }} {{ t('chats.running') }}</span>
          <span v-if="todoSummary.blocked > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:#fee2e2; color:#dc2626;">{{ todoSummary.blocked }} {{ t('chats.blocked') }}</span>
          <span v-if="todoSummary.pending > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:#F5F5F5; color:#9CA3AF;">{{ todoSummary.pending }} {{ t('chats.pending') }}</span>
        </div>
        <span class="ml-auto" style="font-size:0.75rem; color:#6b7c6b;">{{ todoSummary.done }}/{{ latestTodos.length }}</span>
        <span style="font-size:0.7rem; color:#9ca89c; margin-left:4px;">{{ todoCollapsed ? '▶' : '▼' }}</span>
      </div>
      <!-- Task rows -->
      <div v-if="!todoCollapsed">
        <div v-for="todo in latestTodos" :key="todo.id" class="flex items-start gap-2 px-3 py-1.5" style="border-bottom:1px solid #f0f4f0;">
          <!-- Status icon -->
          <span class="shrink-0 mt-0.5" style="font-size:0.85rem; width:1.2rem; text-align:center;"
            :class="todo.status === 'in_progress' ? 'animate-pulse' : ''">
            <span v-if="todo.status === 'completed'" style="color:#22c55e;">✓</span>
            <span v-else-if="todo.status === 'in_progress'" style="color:#eab308;">⚡</span>
            <span v-else-if="todo.status === 'blocked'" style="color:#ef4444;">✕</span>
            <span v-else style="color:#9CA3AF;">○</span>
          </span>
          <!-- Title -->
          <span class="flex-1" style="font-size:0.8rem; color:#374151;" :style="todo.status === 'completed' ? 'text-decoration:line-through; color:#9ca3af;' : ''">
            {{ todo.title }}
          </span>
          <!-- Badge -->
          <span class="shrink-0 px-1.5 py-0.5 rounded-full" style="font-size:0.68rem;"
            :style="todo.status === 'completed' ? 'background:#dcfce7; color:#15803d;' :
                    todo.status === 'in_progress' ? 'background:#fef9c3; color:#a16207;' :
                    todo.status === 'blocked' ? 'background:#fee2e2; color:#dc2626;' :
                    'background:#F5F5F5; color:#9CA3AF;'">
            {{ todo.status === 'completed' ? t('chats.done') : todo.status === 'in_progress' ? t('chats.running') : todo.status === 'blocked' ? t('chats.blocked') : t('chats.pending') }}
          </span>
        </div>
      </div>
    </div>

    <!-- ── Segments loop ────────────────────────────────────────────────────── -->
    <template v-for="(seg, i) in message.segments" :key="i">

      <!-- Text segment: always show if there's content -->
      <div v-if="seg.type === 'text' && seg.content && !isIntermediateText(i)" 
           class="prose-clankai" 
           style="max-width:none;" 
           v-html="renderMarkdown(seg.content)" 
           @click="handleContentClick"
           :data-segment-index="i"
           :data-content-length="seg.content.length" />

      <!-- File diff (file_operation write/append) -->
      <div v-else-if="seg.type === 'tool' && isFileWrite(seg)" class="my-2 rounded-xl overflow-hidden" style="border:1px solid #d1d5db; font-size:0.78rem;">
        <!-- Diff header -->
        <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" style="background:#1C1C1E; color:#E5E5EA;" @click="toggleTool(i, seg)">
          <span style="color:#60a5fa;">🔧</span>
          <span style="font-size:0.75rem; font-weight:600;">file_operation</span>
          <span class="px-1.5 py-0.5 rounded" style="background:#374151; color:#9CA3AF; font-size:0.7rem; font-family:monospace;">{{ seg.input?.operation }}</span>
          <span v-if="seg.input?.path" class="px-1.5 py-0.5 rounded" style="background:#1e3a5f; color:#93c5fd; font-size:0.7rem; font-family:monospace;">{{ seg.input.path }}</span>
          <div class="ml-auto flex items-center gap-2">
            <span class="flex items-center gap-1">
              <span style="color:#22c55e; font-size:0.68rem;">+ {{ t('chats.added') }}</span>
              <span style="color:#ef4444; font-size:0.68rem; margin-left:4px;">− {{ t('chats.removed') }}</span>
              <span style="color:#60a5fa; font-size:0.68rem; margin-left:4px;">~ {{ t('chats.updated') }}</span>
            </span>
            <span v-if="seg.output === undefined" class="animate-pulse px-1.5 py-0.5 rounded" style="background:#422006; color:#fb923c; font-size:0.68rem;">{{ t('chats.writing') }}</span>
            <span v-else class="px-1.5 py-0.5 rounded" style="background:#14532d; color:#4ade80; font-size:0.68rem;">{{ t('chats.done') }}</span>
            <span style="color:#6b7280; font-size:0.7rem;">{{ expandedTools[i] ? '▼' : '▶' }}</span>
          </div>
        </div>
        <!-- Diff body -->
        <div v-if="expandedTools[i] !== false">
          <!-- Copy button -->
          <div class="flex items-center justify-between px-3 py-1.5" style="background:#161b22; border-bottom:1px solid #30363d;">
            <span style="font-size:0.7rem; color:#6b7280;">{{ t('chats.changes') }}</span>
            <button @click.stop="copyBlock('diff-'+i, seg.input?.content || '')" class="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer" style="background:#21262d; border:1px solid #30363d; color:#8b949e; font-size:0.68rem;">
              <span>{{ copiedBlock === 'diff-'+i ? '✓ ' + t('common.copied') : '⎘ ' + t('common.copy') }}</span>
            </button>
          </div>
          <!-- Diff lines -->
          <div style="background:#0d1117; max-height:400px; overflow-y:auto;">
            <div v-if="!expandedDiffs[i]">
              <div v-for="(line, li) in (getDiff(i, seg).slice(0, 8))" :key="li" class="flex" :style="diffLineStyle(line.type)">
                <span style="width:2.5rem; padding:0 8px; color:#484f58; font-family:monospace; font-size:0.72rem; text-align:right; user-select:none; border-right:1px solid #21262d;">{{ line.lineNo }}</span>
                <span style="width:1rem; padding:0 4px; font-family:monospace; font-size:0.72rem; text-align:center;">{{ diffMarker(line.type) }}</span>
                <span style="flex:1; padding:0 8px; font-family:monospace; font-size:0.72rem; white-space:pre; overflow-x:auto;">{{ line.content }}</span>
              </div>
              <div v-if="getDiff(i, seg).length > 8" class="flex items-center justify-center py-1.5 cursor-pointer" style="background:#161b22; color:#58a6ff; font-size:0.72rem;" @click.stop="expandedDiffs[i] = true">
                {{ t('chats.showAllLines', { count: getDiff(i, seg).length }) }} ▼
              </div>
            </div>
            <div v-else>
              <div v-for="(line, li) in getDiff(i, seg)" :key="li" class="flex" :style="diffLineStyle(line.type)">
                <span style="width:2.5rem; padding:0 8px; color:#484f58; font-family:monospace; font-size:0.72rem; text-align:right; user-select:none; border-right:1px solid #21262d;">{{ line.lineNo }}</span>
                <span style="width:1rem; padding:0 4px; font-family:monospace; font-size:0.72rem; text-align:center;">{{ diffMarker(line.type) }}</span>
                <span style="flex:1; padding:0 8px; font-family:monospace; font-size:0.72rem; white-space:pre; overflow-x:auto;">{{ line.content }}</span>
              </div>
              <div class="flex items-center justify-center py-1.5 cursor-pointer" style="background:#161b22; color:#58a6ff; font-size:0.72rem;" @click.stop="expandedDiffs[i] = false">
                {{ t('chats.showLess') }} ▲
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Generic tool / background_task / dispatch_subagent — collapsible summary row -->
      <div v-else-if="seg.type === 'tool' && !isHiddenTool(seg)" class="my-1.5 rounded-xl overflow-hidden" style="border:1px solid #E5E5EA; background:#FFFFFF;">
        <!-- Header row — always visible -->
        <div
          class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
          :style="seg.output === undefined
            ? 'background:#fffbeb; ;'
            : 'background:#F5F5F5; ;'"
          @click="toggleTool(i, seg)"
        >
          <!-- Icon -->
          <span style="font-size:0.85rem;">
            <span v-if="seg.name === 'execute_shell'">💻</span>
            <span v-else-if="seg.name === 'dispatch_subagent'">🤖</span>
            <span v-else-if="seg.name === 'background_task'">⚙️</span>
            <span v-else-if="seg.name === 'update_soul_memory' || seg.name === 'read_soul_memory'">🧠</span>
            <span v-else>🔧</span>
          </span>
          <!-- Tool name -->
          <span style="font-size:0.78rem; font-weight:600; color:#374151;">{{ toolDisplayName(seg) }}</span>
          <!-- Summary label -->
          <span class="flex-1 truncate" style="font-size:0.75rem; color:#6b7280;">
            {{ toolSummary(seg) }}
          </span>
          <!-- Status badge -->
          <span v-if="seg.output === undefined"
            class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full animate-pulse"
            style="background:#fef3c7; color:#d97706; font-size:0.7rem;">
            <span class="inline-block w-1.5 h-1.5 rounded-full" style="background:#f59e0b;"></span>
            {{ t('chats.running') }}
          </span>
          <span v-else
            class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full"
            style="background:#dcfce7; color:#15803d; font-size:0.7rem;">
            <span>✓</span>
            {{ t('chats.done') }}
          </span>
          <!-- Chevron -->
          <span style="font-size:0.7rem; color:#9CA3AF; margin-left:2px;">{{ isToolExpanded(i, seg) ? '▼' : '▶' }}</span>
        </div>
        <!-- Expanded body — shown when running OR manually expanded -->
        <div v-if="isToolExpanded(i, seg)" style="background:#FAFAFA; border-top:1px solid #E5E5EA;">
          <!-- Input -->
          <div v-if="seg.input && Object.keys(seg.input).length > 0" class="px-3 py-2">
            <div class="flex items-center justify-between mb-1">
              <span style="font-size:0.7rem; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">{{ t('chats.input') }}</span>
              <button @click.stop="copyBlock('input-'+i, JSON.stringify(seg.input, null, 2))" class="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer" style="background:#F5F5F5; border:1px solid #E5E5EA; color:#9CA3AF; font-size:0.68rem;">
                {{ copiedBlock === 'input-'+i ? '✓ ' + t('common.copied') : '⎘ ' + t('common.copy') }}
              </button>
            </div>
            <pre class="rounded-xl p-2 overflow-x-auto" style="background:#1C1C1E; color:#E5E5EA; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px;">{{ expandedInputs[i] || JSON.stringify(seg.input, null, 2).length <= 50 ? JSON.stringify(seg.input, null, 2) : JSON.stringify(seg.input, null, 2).slice(0, 50) + '…' }}</pre>
            <button v-if="JSON.stringify(seg.input, null, 2).length > 50" @click.stop="expandedInputs[i] = !expandedInputs[i]" class="mt-1 cursor-pointer" style="font-size:0.68rem; color:#007AFF; background:none; border:none; padding:0;">{{ expandedInputs[i] ? t('chats.showLess') + ' ▲' : t('chats.viewFull') + ' ▼' }}</button>
          </div>
          <!-- Tool images are rendered via the standalone inline image segment below -->
          <!-- Live streaming output (visible while tool is running) -->
          <div v-if="seg.output === undefined && seg.streamingOutput" class="px-3 py-2" style="border-top:1px solid #E5E5EA;">
            <div class="flex items-center mb-1">
              <span style="font-size:0.7rem; font-weight:600; color:#d97706; text-transform:uppercase; letter-spacing:0.05em;">live output</span>
            </div>
            <pre class="tool-streaming-pre rounded-xl p-2 overflow-x-auto" style="background:#1C1C1E; color:#34D399; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px; max-height:300px; overflow-y:auto;">{{ seg.streamingOutput }}</pre>
          </div>
          <!-- Output (final result after tool completes) -->
          <div v-if="seg.output !== undefined" class="px-3 py-2" style="border-top:1px solid #E5E5EA;">
            <div class="flex items-center justify-between mb-1">
              <span style="font-size:0.7rem; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">{{ t('chats.output') }}</span>
              <button @click.stop="copyBlock('output-'+i, String(seg.output))" class="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer" style="background:#F5F5F5; border:1px solid #E5E5EA; color:#9CA3AF; font-size:0.68rem;">
                {{ copiedBlock === 'output-'+i ? '✓ ' + t('common.copied') : '⎘ ' + t('common.copy') }}
              </button>
            </div>
            <pre class="rounded-xl p-2 overflow-x-auto" style="background:#1C1C1E; color:#E5E5EA; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px;">{{ expandedOutputs[i] || String(seg.output).length <= 50 ? String(seg.output) : String(seg.output).slice(0, 50) + '…' }}</pre>
            <button v-if="String(seg.output).length > 50" @click.stop="expandedOutputs[i] = !expandedOutputs[i]" class="mt-1 cursor-pointer" style="font-size:0.68rem; color:#007AFF; background:none; border:none; padding:0;">{{ expandedOutputs[i] ? t('chats.showLess') + ' ▲' : t('chats.viewFull') + ' ▼' }}</button>
          </div>
        </div>
      </div>

      <!-- Permission prompt segment -->
      <PermissionPrompt
        v-else-if="seg.type === 'permission'"
        :seg="seg"
        @allow-chat="handlePermissionAllowChat"
        @allow-global="handlePermissionAllowGlobal"
        @reject="handlePermissionReject"
      />

      <!-- Inline images — always visible in the message flow (base64 or URL) -->
      <div v-else-if="seg.type === 'image' && seg.images && seg.images.length > 0" class="my-2 rounded-xl overflow-hidden" style="border:1px solid #E5E5EA; background:#FFFFFF;">
        <div class="px-3 py-2" style="background:#F5F5F5; border-bottom:1px solid #E5E5EA;">
          <span style="font-size:0.75rem; font-weight:600; color:#6B7280;">{{ t('chats.image') }}{{ seg.images.length > 1 ? 's' : '' }}</span>
          <span v-if="seg.source" style="font-size:0.7rem; color:#9CA3AF; margin-left:6px;">{{ t('chats.from') }} {{ seg.source }}</span>
        </div>
        <div class="inline-images-grid p-3">
          <div
            v-for="(img, imgIdx) in seg.images"
            :key="imgIdx"
            class="inline-image-wrap"
          >
            <img
              :src="resolveImageSrc(img)"
              class="inline-image"
              @click="openImageFullscreen(resolveImageSrc(img), img)"
            />
            <button
              class="inline-image-quote-btn"
              :title="t('chats.quoteImage')"
              @click.stop="emit('quote-image', { img, src: resolveImageSrc(img) })"
            >
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/>
              </svg>
              {{ t('chats.quoteImage') }}
            </button>
          </div>
        </div>
      </div>

    </template>

      <!-- 3D models detected in assistant message -->
      <BabylonViewer v-for="url in modelUrls" :key="url" :src="url" />

      <!-- Wave bar: outside segments block so it shows even with no content yet -->
      <div v-if="message.streaming && !hasPendingPermission" class="flex items-center gap-3 mt-1 pl-1">
        <div class="flex items-end gap-0.5 h-5">
          <span v-for="n in 5" :key="n" class="wave-bar" :style="`--bar-color:#4c8446; --bar-glow:#4c844680; animation-delay:${(n-1)*0.13}s;`" />
        </div>
        <div v-if="cachedTokens" class="flex items-center gap-1.5" style="font-family:'JetBrains Mono',monospace; font-size:0.7rem; color:#6b9e65;">
          <span>in {{ formatTokenCount(cachedTokens.input) }}</span>
          <span style="opacity:0.5;">·</span>
          <span>out {{ formatTokenCount(cachedTokens.output) }}</span>
          <span style="opacity:0.5;">·</span>
          <span style="color:#4c8446; font-weight:600;">total {{ formatTokenCount(cachedTokens.total) }}</span>
        </div>
      </div>

    <!-- ── Agent Progress Panel (single row) - HIDDEN ────────────────────────── -->
    <!-- <div v-if="agentSteps.length > 0 && message.streaming" class="mt-3 rounded-lg overflow-hidden" style="background: linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%); box-shadow: 0 4px 16px rgba(5, 150, 105, 0.25);">
      <div class="flex items-center justify-between px-3 py-2" style="font-size:0.72rem; font-family:monospace;">
        <div class="flex items-center gap-3 flex-wrap">
          <span v-if="currentAgentStep?.details?.iteration !== undefined">
            <span style="color:#fbbf24;">{{ t('chats.agentIter') }}</span>
            <span style="color:#fdf6b2; margin-left:3px;">{{ currentAgentStep.details.iteration }}</span>
          </span>
          <span v-if="currentAgentStep?.details?.tools !== undefined">
            <span style="color:#fbbf24;">Tools</span>
            <span style="color:#fdf6b2; margin-left:3px;">{{ currentAgentStep.details.tools }}</span>
          </span>
          <span v-if="currentAgentStep?.details?.msgs !== undefined">
            <span style="color:#fbbf24;">Msgs</span>
            <span style="color:#fdf6b2; margin-left:3px;">{{ currentAgentStep.details.msgs }}</span>
          </span>
          <span v-if="currentAgentStep?.details?.thinking !== undefined">
            <span style="color:#fbbf24;">Thinking</span>
            <span style="margin-left:3px;" :style="currentAgentStep.details.thinking ? 'color:#fde68a;' : 'color:#fbbf24a0;'">{{ currentAgentStep.details.thinking ? 'on' : 'off' }}</span>
          </span>
          <span v-if="currentAgentStep?.details?.currentTools">
            <span style="color:#fbbf24a0;">↳ </span><span style="color:#f1faee;">{{ currentAgentStep.details.currentTools }}</span>
          </span>
        </div>
      </div>
    </div> -->

    <!-- Duration label: live while streaming, final when done -->
    <div v-if="message.streaming && message.streamingStartedAt && !hasPendingPermission" class="flex items-center gap-2 mt-1.5" style="color:#9CA3AF; font-size:var(--fs-small);">
      <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>{{ t('chats.cookingFor') }} {{ formatDuration(elapsedMs) }}…</span>
    </div>
    <div v-else-if="!message.streaming && message.durationMs" class="flex items-center gap-2 mt-1.5" style="color:#9CA3AF; font-size:var(--fs-small);">
      <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>{{ t('chats.cookedFor') }} {{ formatDuration(message.durationMs) }}</span>
      <template v-if="finalTokens">
        <span style="opacity:0.4;">·</span>
        <span style="font-family:'JetBrains Mono',monospace; color:#9CA3AF;">in {{ formatTokenCount(finalTokens.input) }} · out {{ formatTokenCount(finalTokens.output) }} · <span style="font-weight:600;">total {{ formatTokenCount(finalTokens.total) }}</span></span>
      </template>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, watchEffect, onBeforeUnmount, toRaw } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import BabylonViewer from './BabylonViewer.vue'
import PermissionPrompt from './PermissionPrompt.vue'
import { useChatsStore } from '../../stores/chats'
import { useConfigStore } from '../../stores/config'
import { useAgentsStore } from '../../stores/agents'
import { useI18n } from '../../i18n/useI18n'

const chatsStore = useChatsStore()
const configStore = useConfigStore()
const agentsStore = useAgentsStore()
const { t } = useI18n()

const props = defineProps({
  message: { type: Object, required: true }
})

const emit = defineEmits(['quote-image'])

// ── Image attachments (from clipboard paste / file attach) ────────────────────
const imageAttachments = computed(() =>
  (props.message.attachments || []).filter(a => a.type === 'image' && a.preview)
)

function openImage(att) {
  if (window.electronAPI?.openImageDataUri) {
    window.electronAPI.openImageDataUri(att.preview, att.name)
  }
}

// ── 3D asset detection ────────────────────────────────────────────────────────
const MODEL_EXT_RE = /\.(glb|gltf|obj|stl|babylon|fbx)(\?[^\s)]*)?$/i
const URL_RE = /https?:\/\/[^\s<>"')\]]+/g

const modelUrls = computed(() => {
  const text = props.message.content || ''
  const segs = props.message.segments || []
  const urls = new Set()
  // Scan main content
  const matches = text.match(URL_RE) || []
  for (const u of matches) {
    if (MODEL_EXT_RE.test(u)) urls.add(u)
  }
  // Scan text segments
  for (const seg of segs) {
    if (seg.type === 'text' && seg.content) {
      const sm = seg.content.match(URL_RE) || []
      for (const u of sm) {
        if (MODEL_EXT_RE.test(u)) urls.add(u)
      }
    }
  }
  return [...urls]
})

// ── Pending permission check ───────────────────────────────────────────────
const hasPendingPermission = computed(() =>
  (props.message.segments || []).some(s => s.type === 'permission' && s.status === 'pending')
)

// ── Live elapsed timer ─────────────────────────────────────────────────────
const now = ref(Date.now())
let timer = null

function startTimer() {
  if (timer) return
  now.value = Date.now()
  timer = setInterval(() => { now.value = Date.now() }, 1000)
}

function stopTimer() {
  if (timer) { clearInterval(timer); timer = null }
}

const elapsedMs = computed(() => {
  if (!props.message.streamingStartedAt) return 0
  return now.value - props.message.streamingStartedAt
})

watch(() => props.message.streaming, (streaming) => {
  if (streaming) startTimer()
  else stopTimer()
}, { immediate: true })

onBeforeUnmount(stopTimer)

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return `${totalSec}s`
  const hours = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (hours > 0) return `${hours} hour${hours > 1 ? 's' : ''} ${mins} min${mins !== 1 ? 's' : ''} ${secs}s`
  return `${mins} min${mins !== 1 ? 's' : ''} ${secs}s`
}

// ── Strip base64 blobs from text before rendering ────────────────────────────
function stripBase64(text) {
  if (!text || text.length < 200) return text
  // Replace data:image URIs with a short label
  let cleaned = text.replace(/data:(image\/[a-z+]+);base64,[A-Za-z0-9+/=]{100,}/gi,
    (m, mime) => `[image: ${mime}]`)
  // Replace any remaining long base64-like runs (100+ chars of pure base64 alphabet)
  cleaned = cleaned.replace(/[A-Za-z0-9+/=]{200,}/g,
    (m) => `[binary data: ${Math.round(m.length * 0.75 / 1024)}KB]`)
  return cleaned
}

// ── Markdown renderer ────────────────────────────────────────────────────────
// File-path regex: matches files with known extensions OR directory paths (trailing / or \)
// Files:  ~/path/file.ext, /abs/path/file.ext, C:\path\file.ext, \\server\share\file.ext
// Dirs:   ~/dir/sub/, /abs/path/dir/, C:\path\dir\, \\server\share\  (2+ segments)
const FILE_PATH_RE = /(?:(?:~\/[\w.\/\-]+|\/(?:[\w.\-]+\/)+[\w.\-]+|[A-Z]:\\(?:[\w.\-]+\\)*[\w.\-]+|\\\\[\w.\-]+(?:\\[\w.\-]+)+)\.(?:md|txt|json|js|ts|jsx|tsx|py|rb|go|rs|java|c|cpp|h|hpp|css|scss|html|xml|yaml|yml|toml|ini|cfg|conf|log|csv|sql|sh|bash|zsh|env|vue|svelte)|(?:~\/(?:[\w.\-]+\/)+|\/(?:[\w.\-]+\/){2,}|[A-Z]:\\(?:[\w.\-]+\\){2,}|\\\\[\w.\-]+(?:\\[\w.\-]+)+\\)(?=[\s.,;:!?)'"}\]]|$))/g

function injectFilePathChips(html) {
  // Split HTML into tags vs text runs so we never match inside tags or <pre>/<a>
  // Note: inline <code> is intentionally allowed so backtick-wrapped paths get chips
  const parts = html.split(/(<[^>]+>)/g)
  let insidePre = 0 // depth counter for <pre>
  let insideA = 0   // depth counter for <a>
  for (let i = 0; i < parts.length; i++) {
    const p = parts[i]
    if (p.startsWith('<')) {
      const tag = p.toLowerCase()
      if (/^<pre[\s>]/.test(tag)) insidePre++
      else if (/^<\/pre>/.test(tag)) insidePre = Math.max(0, insidePre - 1)
      if (/^<a[\s>]/.test(tag)) insideA++
      else if (/^<\/a>/.test(tag)) insideA = Math.max(0, insideA - 1)
      continue
    }
    if (insidePre > 0 || insideA > 0) continue
    // File paths are rendered as plain text (no chip/button decoration)
  }
  return parts.join('')
}

function renderMarkdown(text) {
  if (!text) return ''
  try {
    const clean = stripBase64(String(text))
    const raw = marked.parse(clean, { breaks: true, gfm: true })
    const sanitized = DOMPurify.sanitize(raw)
    // Highlight @mentions using exact agent names from the store.
    // Sorted longest-first so "Yeo Bo Jun" matches before "Bo Jun" if both exist.
    const allAgents = agentsStore.agents || []
    const sortedNames = allAgents
      .map(a => a.name)
      .filter(Boolean)
      .sort((a, b) => b.length - a.length)
    let withMentions = sanitized
    for (const name of sortedNames) {
      const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      withMentions = withMentions.replace(
        new RegExp(`@(${escaped})(?=\\W|$)`, 'g'),
        '<span class="mention">@$1</span>'
      )
    }
    // Wrap <pre><code> blocks with a header bar containing a copy button
    const withCodeBlocks = withMentions
      .replace(/<pre><code(?:\s+class="language-(\w+)")?>/g, (m, lang) => {
        const label = lang ? `<span class="code-lang">${lang}</span>` : ''
        return `<div class="code-block-wrap">${label}<span class="code-copy-btn">${t('common.copy')}</span><pre><code${lang ? ` class="language-${lang}"` : ''}>`
      })
      .replace(/<\/code><\/pre>/g, '</code></pre></div>')
    // Inject file-path chips (skipping paths inside code/pre/a)
    return injectFilePathChips(withCodeBlocks)
  } catch { return String(text) }
}

// ── Click handler for code-copy (event delegation) ───────────────────────────
function handleContentClick(e) {
  // Code block copy button
  const btn = e.target.closest('.code-copy-btn')
  if (!btn) return
  const wrap = btn.closest('.code-block-wrap')
  if (!wrap) return
  const code = wrap.querySelector('code')
  if (!code) return
  navigator.clipboard.writeText(code.textContent).then(() => {
    btn.textContent = t('common.copiedExclaim')
    setTimeout(() => { btn.textContent = t('common.copy') }, 2000)
  }).catch(() => {})
}

// ── Permission prompt handlers ────────────────────────────────────────────────

// Persist the chat immediately so resolved seg.status survives app restart
function _persistChatNow(chatId) {
  const chat = chatsStore.chats.find(c => c.id === chatId)
  if (chat && window.electronAPI?.saveChat) {
    window.electronAPI.saveChat(JSON.parse(JSON.stringify(toRaw(chat))))
  }
}

async function handlePermissionAllowChat(seg) {
  if (seg.status !== 'pending') return
  seg.status = 'allowed'
  _persistChatNow(seg.chatId)
  chatsStore.clearPermissionPending(seg.chatId)
  const res = await window.electronAPI?.permissionResponse?.(seg.chatId, {
    blockId: seg.blockId,
    decision: 'allow_chat',
    pattern: seg.command,
  })
  // Push the new entry into the reactive chat so the Permissions tab shows it immediately
  if (res?.newChatAllowEntry) {
    const chat = chatsStore.chats.find(c => c.id === seg.chatId)
    if (chat) {
      if (!Array.isArray(chat.chatAllowList)) chat.chatAllowList = []
      const exists = chat.chatAllowList.some(e => e.pattern === res.newChatAllowEntry.pattern)
      if (!exists) chat.chatAllowList.push(res.newChatAllowEntry)
    }
  }
}

async function handlePermissionAllowGlobal(seg) {
  if (seg.status !== 'pending') return
  seg.status = 'allowed'
  _persistChatNow(seg.chatId)
  chatsStore.clearPermissionPending(seg.chatId)
  await window.electronAPI?.permissionResponse?.(seg.chatId, {
    blockId: seg.blockId,
    decision: 'allow_global',
    pattern: seg.command,
  })
  // Reload config so the Security tab's global allow list reflects the new entry
  await configStore.loadConfig()
}

async function handlePermissionReject(seg) {
  if (seg.status !== 'pending') return
  seg.status = 'rejected'
  _persistChatNow(seg.chatId)
  chatsStore.clearPermissionPending(seg.chatId)
  await window.electronAPI?.permissionResponse?.(seg.chatId, {
    blockId: seg.blockId,
    decision: 'reject',
    pattern: seg.command,
  })
}

// ── Todo panel state ─────────────────────────────────────────────────────────
const todoCollapsed = ref(false)

// ── Agent Progress state ──────────────────────────────────────────────────────
const agentSteps = computed(() => {
  const segs = props.message.segments || []
  const steps = []
  for (const seg of segs) {
    if (seg.type === 'agent_step') {
      steps.push({
        id: seg.id || `step-${steps.length}`,
        title: seg.title || 'Processing...',
        status: seg.status || 'pending', // completed, in_progress, pending
        duration: seg.duration || 0,
        details: seg.details || {},
        timestamp: seg.timestamp,
      })
    }
  }
  return steps
})

// 只返回最新的一条步骤（当前正在执行的或最后一条）
const currentAgentStep = computed(() => {
  const steps = agentSteps.value
  if (steps.length === 0) return null
  
  // 优先找正在执行的步骤
  const inProgress = steps.find(s => s.status === 'in_progress')
  if (inProgress) return inProgress
  
  // 否则返回最后一条
  return steps[steps.length - 1]
})

const currentAgentStepIndex = computed(() => {
  const steps = agentSteps.value
  const step = currentAgentStep.value
  if (!step) return -1
  return steps.findIndex(s => s.id === step.id)
})

// Token usage for current message (live during streaming)
const currentTokens = computed(() => {
  // First priority: message.tokenUsage (set from step-complete)
  const tu = props.message.tokenUsage
  if (tu && (tu.input || tu.output)) {
    return { input: tu.input || 0, output: tu.output || 0, total: (tu.input || 0) + (tu.output || 0) }
  }
  // Fall back to agent step details (available in step-tools events)
  const step = currentAgentStep.value
  if (!step?.details) return null
  const input = step.details.inputTokens || 0
  const output = step.details.outputTokens || 0
  if (input === 0 && output === 0) return null
  return { input, output, total: input + output }
})

// Cached tokens: once set, never goes back to null (prevents flicker when streaming ends)
const cachedTokens = ref(null)
watchEffect(() => {
  const t = currentTokens.value
  if (t) cachedTokens.value = t
})

// Token usage after streaming ends (persisted on message)
const finalTokens = computed(() => {
  const t = props.message.tokenUsage
  if (!t) return null
  const input = t.input || 0
  const output = t.output || 0
  if (input === 0 && output === 0) return null
  return { input, output, total: input + output }
})

function formatTokenCount(count) {
  if (!count) return '0'
  if (count < 1000) return count.toString()
  if (count < 1000000) return (count / 1000).toFixed(1).replace(/\.0$/, '') + 'k'
  return (count / 1000000).toFixed(2).replace(/\.?0+$/, '') + 'M'
}

const latestTodos = computed(() => {
  const segs = props.message.segments || []
  const map = new Map()
  const order = []
  for (const seg of segs) {
    if (seg.type !== 'tool' || seg.name !== 'todo_manager') continue
    const out = parseOutput(seg)
    const action = seg.input?.action
    if (action === 'add' && out?.todo) {
      if (!map.has(out.todo.id)) order.push(out.todo.id)
      map.set(out.todo.id, { ...out.todo })
    } else if ((action === 'update' || action === 'complete') && out?.todo) {
      if (map.has(out.todo.id)) {
        Object.assign(map.get(out.todo.id), out.todo)
      }
    } else if (action === 'clear') {
      map.clear(); order.length = 0
    } else if (action === 'remove' && out?.todo) {
      map.delete(out.todo.id)
    }
  }
  return order.map(id => map.get(id)).filter(Boolean)
})

const todoSummary = computed(() => {
  const todos = latestTodos.value
  return {
    done: todos.filter(t => t.status === 'completed').length,
    running: todos.filter(t => t.status === 'in_progress').length,
    blocked: todos.filter(t => t.status === 'blocked').length,
    pending: todos.filter(t => t.status === 'pending').length,
  }
})

function parseOutput(seg) {
  if (!seg.output) return null
  if (typeof seg.output === 'object') return seg.output
  try { return JSON.parse(seg.output) } catch { return null }
}

// ── Tool expand/collapse state ───────────────────────────────────────────────
const expandedTools  = reactive({})   // manually toggled
const expandedInputs  = reactive({})
const expandedOutputs = reactive({})
const expandedDiffs   = reactive({})
const diffCache       = reactive({})
const copiedBlock     = ref(null)

/**
 * Returns true if this text segment is "intermediate narration" — i.e. the model
 * said something like "Let me read the file:" right before calling a tool.
 * Currently disabled to ensure all messages are shown.
 */
function isIntermediateText(i) {
  // Disabled: always show all text segments
  return false
}

// A tool is expanded if:
//  - output is undefined (still running) => always expanded
//  - user manually toggled it open
function isToolExpanded(i, seg) {
  if (seg.output === undefined) return true          // running → always open
  return expandedTools[i] === true                   // done → only if user opened it
}

function toggleTool(i, seg) {
  // Get current visible state, then flip it
  const currentlyExpanded = isToolExpanded(i, seg)
  expandedTools[i] = !currentlyExpanded
}

// ── Tool helpers ─────────────────────────────────────────────────────────────
function isHiddenTool(seg) {
  // Only hide file_operation read-only ops and todo_manager list
  if (seg.name === 'file_operation' && seg.input) {
    const hiddenOps = ['read', 'list', 'search', 'exists']
    if (hiddenOps.includes(seg.input.operation)) return true
  }
  if (seg.name === 'todo_manager') return true
  return false
}

function isFileWrite(seg) {
  return seg.name === 'file_operation' &&
    seg.input && ['write', 'append'].includes(seg.input.operation)
}

function toolDisplayName(seg) {
  if (seg.name === 'update_soul_memory') return t('chats.toolUpdateMemory')
  if (seg.name === 'read_soul_memory') return t('chats.toolReadMemory')
  return seg.name
}

function toolSummary(seg) {
  if (!seg.input) return ''
  if (seg.name === 'execute_shell') {
    const cmd = seg.input.command || ''
    const rawArgs = seg.input.args || []
    const args = Array.isArray(rawArgs) ? rawArgs.join(' ') : String(rawArgs)
    const cmdStr = (cmd + ' ' + args).trim()
    // When done, show exit code + line count
    if (seg.output !== undefined) {
      const lines = (seg.output || '').split('\n').length
      const exitMatch = (seg.output || '').match(/\[exit code: (\d+)\]/)
      const exitCode = exitMatch ? exitMatch[1] : '0'
      return `${cmdStr.slice(0, 40)}  ·  exit ${exitCode} · ${lines} lines`
    }
    return cmdStr.slice(0, 80)
  }
  if (seg.name === 'dispatch_subagent') {
    const task = seg.input.task || ''
    return task.length > 80 ? task.slice(0, 80) + '…' : task
  }
  if (seg.name === 'background_task') {
    if (seg.input.action === 'start') {
      const cmd = seg.input.command || ''
      const rawArgs = seg.input.args || []
      const args = Array.isArray(rawArgs) ? rawArgs.join(' ') : String(rawArgs)
      return (cmd + ' ' + args).trim().slice(0, 80)
    }
    return seg.input.action || ''
  }
  // Generic: show key input fields
  const parts = []
  if (seg.input.operation) parts.push(seg.input.operation)
  if (seg.input.path) parts.push(seg.input.path)
  if (seg.input.command) parts.push(seg.input.command)
  if (seg.input.action) parts.push(seg.input.action)
  return parts.join('  ').slice(0, 80)
}

async function copyBlock(key, text) {
  try {
    await navigator.clipboard.writeText(text)
    copiedBlock.value = key
    setTimeout(() => { copiedBlock.value = null }, 2000)
  } catch {}
}

/**
 * Resolve an image object to a renderable src string.
 * Supports: { url }, { src }, { data, mimeType } (base64), or a plain string.
 */
function resolveImageSrc(img) {
  if (typeof img === 'string') return img
  if (img.url) return img.url
  if (img.src) return img.src
  if (img.data && img.mimeType) return `data:${img.mimeType};base64,${img.data}`
  if (img.data) return `data:image/png;base64,${img.data}`
  return ''
}

// Open image with the OS default image viewer (or fallback to a new browser window)
function openImageFullscreen(dataUri, imgObj) {
  if (window.electronAPI?.openImageDataUri) {
    const ext = imgObj?.mimeType?.split('/')[1] || 'png'
    window.electronAPI.openImageDataUri(dataUri, `image.${ext}`)
    return
  }
  // Fallback for non-Electron environments
  const win = window.open('', '_blank')
  if (!win) return
  const style = win.document.createElement('style')
  style.textContent = 'body{margin:0;background:#1A1A1A;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;object-fit:contain;}'
  win.document.head.appendChild(style)
  win.document.title = 'Image'
  const imgEl = win.document.createElement('img')
  imgEl.src = dataUri
  win.document.body.appendChild(imgEl)
}

// ── File diff ────────────────────────────────────────────────────────────────
function getDiff(i, seg) {
  if (diffCache[i]) return diffCache[i]
  const newContent = seg.input?.content || ''
  const oldContent = typeof seg.output === 'string' ? seg.output : ''
  diffCache[i] = computeDiff(oldContent, newContent)
  return diffCache[i]
}

function computeDiff(oldText, newText) {
  const oldLines = oldText ? oldText.split('\n') : []
  const newLines = newText ? newText.split('\n') : []
  const result = []
  let lineNo = 1
  if (oldLines.length === 0) {
    for (const line of newLines) result.push({ type: 'add', content: line, lineNo: lineNo++ })
    return result
  }
  const m = oldLines.length, n = newLines.length
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--)
      dp[i][j] = oldLines[i] === newLines[j] ? dp[i+1][j+1] + 1 : Math.max(dp[i+1][j], dp[i][j+1])
  let i = 0, j = 0
  while (i < m || j < n) {
    if (i < m && j < n && oldLines[i] === newLines[j]) {
      result.push({ type: 'equal', content: newLines[j], lineNo: lineNo++ })
      i++; j++
    } else if (j < n && (i >= m || dp[i][j+1] >= dp[i+1][j])) {
      result.push({ type: 'add', content: newLines[j], lineNo: lineNo++ })
      j++
    } else {
      result.push({ type: 'remove', content: oldLines[i], lineNo: lineNo++ })
      i++
    }
  }
  return result
}

function diffLineStyle(type) {
  if (type === 'add')    return 'background:#0f2a1a; color:#4ade80;'
  if (type === 'remove') return 'background:#2a0f0f; color:#f87171; text-decoration:line-through;'
  return 'color:#9ca3af;'
}

function diffMarker(type) {
  if (type === 'add')    return '+'
  if (type === 'remove') return '−'
  return ' '
}
</script>

<style scoped>
/* ── Code block copy button ────────────────────────────────────────────────── */
:deep(.code-block-wrap) {
  position: relative;
  margin: 0.5rem 0;
  border-radius: 0.75rem;
  overflow: hidden;
  border: 1px solid #30363d;
}
:deep(.code-lang) {
  position: absolute;
  top: 8px;
  left: 12px;
  font-size: 0.65rem;
  color: #6b7280;
  font-family: monospace;
  text-transform: lowercase;
  z-index: 1;
  pointer-events: none;
}
:deep(.code-copy-btn) {
  position: absolute;
  top: 0.375rem;
  right: 0.5rem;
  z-index: 2;
  font-size: 0.7rem;
  color: #fff;
  background: #1A1A1A;
  border: none;
  border-radius: 0.5rem;
  padding: 0.1875rem 0.625rem;
  cursor: pointer;
  user-select: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  transition: background 0.15s, opacity 0.15s;
  opacity: 0;
}
:deep(.code-block-wrap:hover .code-copy-btn) {
  opacity: 1;
}
:deep(.code-copy-btn:hover) {
  color: #fff;
  background: #374151;
}
:deep(.code-block-wrap pre) {
  margin: 0;
  padding: 2rem 0.75rem 0.75rem;
  background: #1C1C1E;
  overflow-x: auto;
}
:deep(.code-block-wrap code) {
  font-family: 'SF Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: 0.78rem;
  color: #E5E5EA;
  background: transparent;
  padding: 0;
}

/* ── Inline Images (base64 or URL) ─────────────────────────────────────────── */
.inline-images-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}
.inline-image {
  max-width: 100%;
  max-height: 25rem;
  border-radius: 0.75rem;
  border: 1px solid #E5E5EA;
  cursor: pointer;
  transition: opacity 0.15s, box-shadow 0.15s;
  object-fit: contain;
  background: #FFFFFF;
}
.inline-image:hover {
  opacity: 0.9;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.1);
}
.inline-image-wrap {
  position: relative;
  display: inline-flex;
}
.inline-image-quote-btn {
  position: absolute;
  top: 0.375rem;
  right: 0.375rem;
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  border: none;
  border-radius: 0.375rem;
  font-size: 0.7rem;
  font-weight: 600;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s ease, background 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.25);
  z-index: 10;
}
.inline-image-wrap:hover .inline-image-quote-btn {
  opacity: 1;
}
.inline-image-quote-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

.wave-bar {
  display: inline-block;
  width: 0.21875rem;
  height: 1.125rem;
  border-radius: 0.125rem;
  transform-origin: bottom;
  transform: scaleY(0.3);
  background: var(--bar-color);
  box-shadow: 0 0 0px var(--bar-glow);
  animation: wave-oscillate 1.3s ease-in-out infinite, wave-hue 6s linear infinite;
}
@keyframes wave-oscillate {
  0%, 100% { transform: scaleY(0.3); opacity: 0.45; box-shadow: 0 0 0px var(--bar-glow); }
  50% { transform: scaleY(1); opacity: 1; box-shadow: 0 0 10px var(--bar-glow), 0 0 20px var(--bar-glow); }
}
@keyframes wave-hue {
  0%   { filter: hue-rotate(0deg) brightness(1); }
  50%  { filter: hue-rotate(45deg) brightness(1.15); }
  100% { filter: hue-rotate(0deg) brightness(1); }
}

/* @Mention highlighting */
:deep(.mention) {
  background: rgba(99, 102, 241, 0.15);
  color: #6366F1;
  padding: 0.0625rem 0.25rem;
  border-radius: 0.25rem;
  font-weight: 600;
}

</style>
