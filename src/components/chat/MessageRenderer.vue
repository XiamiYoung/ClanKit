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
          v-tooltip="t('common.clickToOpen') + ' ' + att.name"
          @click="openImage(att)"
        />
      </div>
      <!-- Inline content: text segments interleaved with blob chips -->
      <template v-if="contentSegments.length === 1 && contentSegments[0].type === 'text'">
        <div v-if="message.content" class="prose-clankit user-content" style="max-width:none; color:#ffffff !important;" v-html="renderMarkdown(message.content || '')" @click="handleContentClick" />
      </template>
      <template v-else-if="contentSegments.length > 0">
        <span v-for="(seg, si) in contentSegments" :key="si">
          <span v-if="seg.type === 'text' && seg.value" class="prose-clankit user-content" style="max-width:none; color:#ffffff !important;" v-html="renderMarkdown(seg.value)" />
          <span v-else-if="seg.type === 'blob'" class="msg-blob-chip" @click="emit('view-blob', seg.content)">
            📄 {{ t('chats.longInputChip', { preview: seg.content.slice(0, 10), count: seg.content.length }) }}
          </span>
        </span>
      </template>
      <BabylonViewer v-for="url in modelUrls" :key="url" :src="url" />
    </template>

    <!-- ── Assistant message ────────────────────────────────────────────────── -->
    <template v-else>
    <!-- ── Todo List Panel (single, live) — shown at top only when no plan exists ── -->
    <div v-if="latestTodos.length > 0 && !hasSubmitPlan" class="mb-3 rounded-xl overflow-hidden" style="border:1px solid #3a5478; background:#f4f7fb;">
      <!-- Header -->
      <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" style="background:linear-gradient(135deg,#47648e,#24435e); border-bottom:1px solid #3a5478;" @click="todoCollapsed = !todoCollapsed">
        <span style="color:#a8c8f0; font-size:0.85rem;">☑</span>
        <span style="font-size:0.8rem; font-weight:600; color:#fff;">{{ t('chats.taskList') }}</span>
        <div class="flex gap-1.5 ml-2">
          <span v-if="todoSummary.done > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:rgba(255,255,255,0.2); color:#fff;">{{ todoSummary.done }} {{ t('chats.done') }}</span>
          <span v-if="todoSummary.running > 0" class="px-1.5 py-0.5 rounded-full animate-pulse" style="font-size:0.7rem; background:#fef9c3; color:#a16207;">{{ todoSummary.running }} {{ t('chats.running') }}</span>
          <span v-if="todoSummary.blocked > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:#fee2e2; color:#dc2626;">{{ todoSummary.blocked }} {{ t('chats.blocked') }}</span>
          <span v-if="todoSummary.pending > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:rgba(255,255,255,0.15); color:rgba(255,255,255,0.75);">{{ todoSummary.pending }} {{ t('chats.pending') }}</span>
        </div>
        <span class="ml-auto" style="font-size:0.75rem; color:rgba(255,255,255,0.8);">{{ todoSummary.done }}/{{ latestTodos.length }}</span>
        <span style="font-size:0.7rem; color:rgba(255,255,255,0.6); margin-left:4px;">{{ todoCollapsed ? '▶' : '▼' }}</span>
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

      <!-- Text segment: final response shown normally; intermediate shown collapsed -->
      <template v-if="seg.type === 'text' && seg.content">
        <!-- Intermediate text: collapsed by default, expandable -->
        <div v-if="isIntermediateText(i)" style="margin:2px 0;">
          <div @click="expandedThinking[i] = !expandedThinking[i]"
               style="display:inline-flex; align-items:center; gap:4px; cursor:pointer; color:#6b7280; font-size:0.72rem; user-select:none;">
            <span>{{ expandedThinking[i] ? '▼' : '▶' }}</span>
            <span>{{ expandedThinking[i] ? $t('chats.hideThinking') : $t('chats.showThinking') }}</span>
          </div>
          <div v-if="expandedThinking[i]"
               class="prose-clankit"
               style="max-width:none; opacity:0.6; font-size:0.88em; margin-top:4px;"
               v-html="renderMarkdown(seg.content)"
               @click="handleContentClick" />
        </div>
        <!-- Final response text: always shown normally -->
        <div v-else
             class="prose-clankit"
             style="max-width:none;"
             v-html="renderMarkdown(seg.content)"
             @click="handleContentClick"
             :data-segment-index="i"
             :data-content-length="seg.content.length" />
      </template><div v-else-if="seg.type === 'tool' && isMemoryTool(seg)" class="my-1.5 rounded-xl overflow-hidden" style="border:1px solid #E5E5EA; background:#FFFFFF;">
        <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
          :class="seg.output === undefined ? 'tool-header-running' : 'tool-header-done'"
          @click="toggleTool(i, seg)">
          <span style="font-size:0.85rem;">🧠</span>
          <span style="font-size:0.78rem; font-weight:600; color:#374151;">{{ toolDisplayName(seg) }}</span>
          <span class="flex-1 truncate" style="font-size:0.75rem; color:#6b7280;">{{ toolSummary(seg) }}</span>
          <span v-if="seg.output === undefined" class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full animate-pulse" style="background:#fef3c7; color:#d97706; font-size:0.7rem;">
            <span class="inline-block w-1.5 h-1.5 rounded-full" style="background:#f59e0b;"></span>
            {{ t('chats.running') }}
          </span>
          <span v-else class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full" style="background:#dcfce7; color:#15803d; font-size:0.7rem;">
            <span>✓</span> {{ t('chats.done') }}
          </span>
          <span style="font-size:0.7rem; color:#9CA3AF; margin-left:2px;">{{ isToolExpanded(i, seg) ? '▼' : '▶' }}</span>
        </div>
        <div v-if="isToolExpanded(i, seg)" style="background:#FAFAFA; border-top:1px solid #E5E5EA;">
          <div v-if="seg.input && (typeof seg.input === 'string' ? seg.input.length > 0 : Object.keys(seg.input).length > 0)" class="px-3 py-2">
            <span style="font-size:0.7rem; font-weight:600; color:#6b7280; text-transform:uppercase;">{{ t('chats.input') }}</span>
            <pre class="rounded-xl p-2 overflow-x-auto mt-1" style="background:#1C1C1E; color:#E5E5EA; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px;">{{ formatInput(seg.input) }}</pre>
          </div>
          <div v-if="seg.output !== undefined" class="px-3 py-2" style="border-top:1px solid #E5E5EA;">
            <span style="font-size:0.7rem; font-weight:600; color:#6b7280; text-transform:uppercase;">{{ t('chats.output') }}</span>
            <pre class="rounded-xl p-2 overflow-x-auto mt-1" style="background:#1C1C1E; color:#E5E5EA; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px; max-height:200px; overflow-y:auto;">{{ String(seg.output).slice(0, 500) }}</pre>
          </div>
        </div>
      </div><!-- ── submit_plan: render PlanCard + Todo panel inline ── -->
      <template v-else-if="seg.type === 'tool' && seg.name === 'submit_plan'">
        <PlanCard
          v-if="planData"
          :plan="planData"
          :state="planState"
          @approve="onApprovePlan?.()"
          @refine="onRefinePlan?.()"
          @reject="onRejectPlan?.()"
        />
        <!-- Todo List Panel — rendered after PlanCard when plan exists -->
        <div v-if="latestTodos.length > 0" class="mt-3 mb-3 rounded-xl overflow-hidden" style="border:1px solid #3a5478; background:#f4f7fb;">
          <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" style="background:linear-gradient(135deg,#47648e,#24435e); border-bottom:1px solid #3a5478;" @click="todoCollapsed = !todoCollapsed">
            <span style="color:#a8c8f0; font-size:0.85rem;">☑</span>
            <span style="font-size:0.8rem; font-weight:600; color:#fff;">{{ t('chats.taskList') }}</span>
            <div class="flex gap-1.5 ml-2">
              <span v-if="todoSummary.done > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:rgba(255,255,255,0.2); color:#fff;">{{ todoSummary.done }} {{ t('chats.done') }}</span>
              <span v-if="todoSummary.running > 0" class="px-1.5 py-0.5 rounded-full animate-pulse" style="font-size:0.7rem; background:#fef9c3; color:#a16207;">{{ todoSummary.running }} {{ t('chats.running') }}</span>
              <span v-if="todoSummary.blocked > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:#fee2e2; color:#dc2626;">{{ todoSummary.blocked }} {{ t('chats.blocked') }}</span>
              <span v-if="todoSummary.pending > 0" class="px-1.5 py-0.5 rounded-full" style="font-size:0.7rem; background:rgba(255,255,255,0.15); color:rgba(255,255,255,0.75);">{{ todoSummary.pending }} {{ t('chats.pending') }}</span>
            </div>
            <span class="ml-auto" style="font-size:0.75rem; color:rgba(255,255,255,0.8);">{{ todoSummary.done }}/{{ latestTodos.length }}</span>
            <span style="font-size:0.7rem; color:rgba(255,255,255,0.6); margin-left:4px;">{{ todoCollapsed ? '▶' : '▼' }}</span>
          </div>
          <div v-if="!todoCollapsed">
            <div v-for="todo in latestTodos" :key="todo.id" class="flex items-start gap-2 px-3 py-1.5" style="border-bottom:1px solid #f0f4f0;">
              <span class="shrink-0 mt-0.5" style="font-size:0.85rem; width:1.2rem; text-align:center;" :class="todo.status === 'in_progress' ? 'animate-pulse' : ''">
                <span v-if="todo.status === 'completed'" style="color:#22c55e;">✓</span>
                <span v-else-if="todo.status === 'in_progress'" style="color:#eab308;">⚡</span>
                <span v-else-if="todo.status === 'blocked'" style="color:#ef4444;">✕</span>
                <span v-else style="color:#9CA3AF;">○</span>
              </span>
              <span class="flex-1" style="font-size:0.8rem; color:#374151;" :style="todo.status === 'completed' ? 'text-decoration:line-through; color:#9ca3af;' : ''">{{ todo.title }}</span>
              <span class="shrink-0 px-1.5 py-0.5 rounded-full" style="font-size:0.68rem;"
                :style="todo.status === 'completed' ? 'background:#dcfce7; color:#15803d;' : todo.status === 'in_progress' ? 'background:#fef9c3; color:#a16207;' : todo.status === 'blocked' ? 'background:#fee2e2; color:#dc2626;' : 'background:#F5F5F5; color:#9CA3AF;'">
                {{ todo.status === 'completed' ? t('chats.done') : todo.status === 'in_progress' ? t('chats.running') : todo.status === 'blocked' ? t('chats.blocked') : t('chats.pending') }}
              </span>
            </div>
          </div>
        </div>
      </template>
      <template v-else-if="(seg.type === 'tool' || seg.type === 'permission') && !isMemoryTool(seg) && processExpanded">
      <!-- File diff (file_operation write/append) -->
      <div v-if="seg.type === 'tool' && isFileWrite(seg)" class="my-2 rounded-xl overflow-hidden" style="border:1px solid #d1d5db; font-size:0.78rem;">
        <!-- Diff header -->
        <div class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none" :class="seg.output === undefined ? 'tool-file-header-running' : 'tool-file-header-done'" style="color:#E5E5EA;" @click="toggleTool(i, seg)">
          <span style="color:#60a5fa;">🔧</span>
          <span style="font-size:0.75rem; font-weight:600;">{{ t('chats.toolFileOperation') }}</span>
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
          <div style="background:#0d1117; max-height:400px; overflow:auto;">
            <div v-if="!expandedDiffs[i]">
              <div v-for="(line, li) in (getDiff(i, seg).slice(0, 8))" :key="li" class="flex" :style="diffLineStyle(line.type)">
                <span style="width:2.5rem; padding:0 8px; color:#484f58; font-family:monospace; font-size:0.72rem; text-align:right; user-select:none; border-right:1px solid #21262d;">{{ line.lineNo }}</span>
                <span style="width:1rem; padding:0 4px; font-family:monospace; font-size:0.72rem; text-align:center;">{{ diffMarker(line.type) }}</span>
                <span style="flex:1; padding:0 8px; font-family:monospace; font-size:0.72rem; white-space:pre;">{{ line.content }}</span>
              </div>
              <div v-if="getDiff(i, seg).length > 8" class="flex items-center justify-center py-1.5 cursor-pointer" style="background:#161b22; color:#58a6ff; font-size:0.72rem;" @click.stop="expandedDiffs[i] = true">
                {{ t('chats.showAllLines', { count: getDiff(i, seg).length }) }} ▼
              </div>
            </div>
            <div v-else>
              <div v-for="(line, li) in getDiff(i, seg)" :key="li" class="flex" :style="diffLineStyle(line.type)">
                <span style="width:2.5rem; padding:0 8px; color:#484f58; font-family:monospace; font-size:0.72rem; text-align:right; user-select:none; border-right:1px solid #21262d;">{{ line.lineNo }}</span>
                <span style="width:1rem; padding:0 4px; font-family:monospace; font-size:0.72rem; text-align:center;">{{ diffMarker(line.type) }}</span>
                <span style="flex:1; padding:0 8px; font-family:monospace; font-size:0.72rem; white-space:pre;">{{ line.content }}</span>
              </div>
              <div class="flex items-center justify-center py-1.5 cursor-pointer" style="background:#161b22; color:#58a6ff; font-size:0.72rem;" @click.stop="expandedDiffs[i] = false">
                {{ t('chats.showLess') }} ▲
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Generic tool / background_task / dispatch_subagent — collapsible summary row -->
      <div v-else-if="seg.type === 'tool' && (!isHiddenTool(seg) || seg.output === undefined)" class="my-1.5 rounded-xl overflow-hidden" style="border:1px solid #E5E5EA; background:#FFFFFF;">
        <!-- Header row — always visible -->
        <div
          class="flex items-center gap-2 px-3 py-2 cursor-pointer select-none"
          :class="seg.output === undefined ? 'tool-header-running' : 'tool-header-done'"
          @click="toggleTool(i, seg)"
        >
          <!-- Icon -->
          <span style="font-size:0.85rem;">
            <span v-if="seg.name === 'execute_shell'">💻</span>
            <span v-else-if="seg.name === 'dispatch_subagent' || seg.name === 'dispatch_subagents'">🤖</span>
            <span v-else-if="seg.name === 'background_task'">⚙️</span>
            <span v-else-if="seg.name === 'update_memory' || seg.name === 'read_memory'">🧠</span>
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
          <span v-else-if="seg.isError || shellExitOk(seg) === false || isToolErrorOutput(seg)"
            class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full"
            style="background:#fee2e2; color:#dc2626; font-size:0.7rem;">
            <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            {{ t('common.failed') }}
          </span>
          <span v-else
            class="shrink-0 flex items-center gap-1 px-2 py-0.5 rounded-full"
            style="background:#dcfce7; color:#15803d; font-size:0.7rem;">
            <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
            {{ t('common.success') }}
          </span>
          <!-- Chevron -->
          <span style="font-size:0.7rem; color:#9CA3AF; margin-left:2px;">{{ isToolExpanded(i, seg) ? '▼' : '▶' }}</span>
        </div>
        <!-- Expanded body — shown when running OR manually expanded -->
        <div v-if="isToolExpanded(i, seg)" style="background:#FAFAFA; border-top:1px solid #E5E5EA;">
          <!-- Input -->
          <div v-if="seg.input && (typeof seg.input === 'string' ? seg.input.length > 0 : Object.keys(seg.input).length > 0)" class="px-3 py-2">
            <div class="flex items-center justify-between mb-1">
              <span style="font-size:0.7rem; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">{{ t('chats.input') }}</span>
              <button @click.stop="copyBlock('input-'+i, formatInput(seg.input))" class="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer" style="background:#F5F5F5; border:1px solid #E5E5EA; color:#9CA3AF; font-size:0.68rem;">
                {{ copiedBlock === 'input-'+i ? '✓ ' + t('common.copied') : '⎘ ' + t('common.copy') }}
              </button>
            </div>
            <pre class="rounded-xl p-2 overflow-x-auto" style="background:#1C1C1E; color:#E5E5EA; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px;">{{ expandedInputs[i] || formatInput(seg.input).length <= 50 ? formatInput(seg.input) : formatInput(seg.input).slice(0, 50) + '…' }}</pre>
            <button v-if="formatInput(seg.input).length > 50" @click.stop="expandedInputs[i] = !expandedInputs[i]" class="mt-1 cursor-pointer" style="font-size:0.68rem; color:#007AFF; background:none; border:none; padding:0;">{{ expandedInputs[i] ? t('chats.showLess') + ' ▲' : t('chats.viewFull') + ' ▼' }}</button>
          </div>
          <!-- Tool images are rendered via the standalone inline image segment below -->
          <!-- Live streaming output (visible while tool is running) -->
          <div v-if="seg.output === undefined && seg.streamingOutput" class="px-3 py-2" style="border-top:1px solid #E5E5EA;">
            <div class="flex items-center mb-1">
              <span style="font-size:0.7rem; font-weight:600; color:#d97706; text-transform:uppercase; letter-spacing:0.05em;">{{ t('chats.toolLiveOutput') }}</span>
            </div>
            <pre :ref="el => setLivePreRef(i, el)" @scroll="onLiveOutputScroll(i)" class="tool-streaming-pre rounded-xl p-2 overflow-x-auto" style="background:#1C1C1E; color:#34D399; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px; max-height:300px; overflow-y:auto;">{{ seg.streamingOutput }}</pre>
          </div>
          <!-- Output (final result after tool completes) -->
          <div v-if="seg.output !== undefined" class="px-3 py-2" style="border-top:1px solid #E5E5EA;">
            <div class="flex items-center justify-between mb-1">
              <span style="font-size:0.7rem; font-weight:600; color:#6b7280; text-transform:uppercase; letter-spacing:0.05em;">{{ t('chats.output') }}</span>
              <button @click.stop="copyBlock('output-'+i, String(seg.output))" class="flex items-center gap-1 px-2 py-0.5 rounded cursor-pointer" style="background:#F5F5F5; border:1px solid #E5E5EA; color:#9CA3AF; font-size:0.68rem;">
                {{ copiedBlock === 'output-'+i ? '✓ ' + t('common.copied') : '⎘ ' + t('common.copy') }}
              </button>
            </div>
            <pre class="rounded-xl p-2 overflow-x-auto" style="background:#1C1C1E; color:#E5E5EA; font-size:0.72rem; margin:0; white-space:pre-wrap; border-radius:12px; max-height:300px; overflow-y:auto;">{{ expandedOutputs[i] || String(seg.output).length <= 50 ? String(seg.output) : String(seg.output).slice(0, 50) + '…' }}</pre>
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

      </template>

      <!-- Inline images — always visible -->
      <div v-if="seg.type === 'image' && seg.images && seg.images.length > 0" class="my-2 rounded-xl overflow-hidden" style="border:1px solid #E5E5EA; background:#FFFFFF;">
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
              v-tooltip="t('chats.quoteImage')"
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

      <!-- ── Execution records header ── -->
      <div v-if="hasProcessSegments"
           class="steps-header"
           :class="{ 'steps-header-running': message.streaming }"
           @click="processExpanded = !processExpanded">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0;">
          <circle cx="12" cy="12" r="3"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M4.93 4.93a10 10 0 0 0 0 14.14"/>
        </svg>
        <template v-if="message.streaming && !processExpanded">
          <span>{{ t('chats.stepsRunning') }}</span>
          <div v-if="runningToolLabel" class="steps-ticker-clip">
            <span class="steps-ticker-track" :key="runningToolLabel">
              <span class="steps-ticker-highlight">{{ runningToolLabel }}</span>
            </span>
          </div>
          <div v-else-if="activeToolLabel" class="steps-ticker-clip">
            <span class="steps-ticker-track" :key="activeToolLabel">
              <span class="steps-ticker-highlight">{{ activeToolLabel }}</span>
            </span>
          </div>
          <span v-else-if="isLlmThinking" class="steps-thinking-label">{{ t('chats.thinking') }}</span>
          <span class="steps-badge">{{ processSegmentCount }}</span>
        </template>
        <template v-else>
          <span>{{ message.streaming ? t('chats.stepsRunning') : t('chats.executionSteps') }}</span>
          <span class="steps-badge">{{ processSegmentCount }}</span>
        </template>
        <span class="steps-chevron" style="margin-left:auto;">{{ processExpanded ? '▼' : '▶' }}</span>
      </div>

      <!-- Wave bar: outside segments block so it shows even with no content yet -->
      <div v-if="message.streaming && !hasPendingPermission" class="flex items-center gap-3 mt-1 pl-1 wavebar-scan">
        <div class="flex items-end gap-0.5 h-5">
          <span v-for="n in 5" :key="n" class="wave-bar" :style="`--bar-color:${wavebarColor.bar}; --bar-glow:${wavebarColor.glow}; animation-delay:${(n-1)*0.13}s;`" />
        </div>
        <div v-if="cachedTokens" class="flex items-center gap-1.5 wavebar-tokens" :style="`font-family:'JetBrains Mono',monospace; font-size:0.7rem; line-height:1.25rem; --wb-color:${wavebarColor.bar}; --wb-bright:${wavebarColor.glow};`">
          <span>{{ t('chats.tokenIn') }} {{ formatTokenCount(cachedTokens.input) }}</span>
          <span style="opacity:0.5;">·</span>
          <span>{{ t('chats.tokenOut') }} {{ formatTokenCount(cachedTokens.output) }}</span>
          <span style="opacity:0.5;">·</span>
          <span style="font-weight:600;">{{ t('chats.tokenTotal') }} {{ formatTokenCount(cachedTokens.total) }}</span>
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
    <div v-if="message.streaming && message.streamingStartedAt && !hasPendingPermission" class="flex items-center gap-2 mt-1.5" style="color:#A09890; font-size:var(--fs-small);">
      <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>{{ t('chats.cookingFor') }} {{ formatDuration(elapsedMs) }}…</span>
    </div>
    <div v-else-if="!message.streaming && message.durationMs" class="flex items-center gap-2 mt-1.5" style="color:#A09890; font-size:var(--fs-small);">
      <svg class="w-3 h-3 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
      <span>{{ t('chats.cookedFor') }} {{ formatDuration(message.durationMs) }}</span>
      <template v-if="finalTokens">
        <span style="opacity:0.5;">·</span>
        <span style="font-family:'JetBrains Mono',monospace; color:#A09890;">{{ t('chats.tokenIn') }} {{ formatTokenCount(finalTokens.input) }} · {{ t('chats.tokenOut') }} {{ formatTokenCount(finalTokens.output) }} · <span style="font-weight:600;">{{ t('chats.tokenTotal') }} {{ formatTokenCount(finalTokens.total) }}</span></span>
      </template>
    </div>
    </template>
  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, watchEffect, onUpdated, onBeforeUnmount, toRaw, nextTick } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import BabylonViewer from './BabylonViewer.vue'
import PermissionPrompt from './PermissionPrompt.vue'
import PlanCard from './PlanCard.vue'
import { useRouter } from 'vue-router'
import { useChatsStore } from '../../stores/chats'
import { useConfigStore } from '../../stores/config'
import { useAgentsStore } from '../../stores/agents'
import { useObsidianStore } from '../../stores/obsidian'
import { useToolsStore } from '../../stores/tools'
import { useI18n } from '../../i18n/useI18n'

const router = useRouter()
const chatsStore = useChatsStore()
const configStore = useConfigStore()
const agentsStore = useAgentsStore()
const obsidianStore = useObsidianStore()
const toolsStore = useToolsStore()
const { t } = useI18n()

const props = defineProps({
  message:      { type: Object,   required: true },
  planData:     { type: Object,   default: null },
  planState:    { type: String,   default: 'pending' },
  onApprovePlan:{ type: Function, default: null },
  onRefinePlan: { type: Function, default: null },
  onRejectPlan: { type: Function, default: null }
})

const emit = defineEmits(['quote-image', 'delete-message', 'view-blob'])

// Split message.content into text/blob segments using {{BLOB:id}} markers.
// Skip text fragments that are nothing but whitespace + ZWSP — the input
// editor leaves zero-width spaces around inserted chips so the cursor has a
// real text node to land in, but those should NOT render as their own
// markdown paragraph (which adds visible vertical padding to the bubble).
// Match: regular whitespace plus ZWSP / ZWNJ / ZWJ / BOM via explicit \u
// escapes so editors don't silently drop the invisibles in source.
const _BLANK_RE = new RegExp('[\\s\\u200B\\u200C\\u200D\\uFEFF]+', 'g')
const _isBlankFragment = (s) => !s || !s.replace(_BLANK_RE, '')
const contentSegments = computed(() => {
  const content = props.message.content || ''
  const blobs = props.message.longBlobs
  if (!blobs || Object.keys(blobs).length === 0) return [{ type: 'text', value: content }]
  const parts = content.split(/(\{\{BLOB:[a-z0-9-]+\}\})/)
  const segments = []
  for (const part of parts) {
    const m = part.match(/^\{\{BLOB:([a-z0-9-]+)\}\}$/)
    if (m && blobs[m[1]]) {
      segments.push({ type: 'blob', id: m[1], content: blobs[m[1]] })
    } else if (!_isBlankFragment(part)) {
      segments.push({ type: 'text', value: part })
    }
  }
  return segments.length > 0 ? segments : [{ type: 'text', value: content }]
})

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

// Auto-expand execution steps when a permission prompt needs user attention
watch(hasPendingPermission, (pending) => {
  if (pending) processExpanded.value = true
})

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

// ── Wavebar color cycling ─────────────────────────────────────────────────
const WAVEBAR_COLORS = [
  { bar: '#D46A3A', glow: '#D46A3AA0' },  // burnt orange
  { bar: '#D4A832', glow: '#D4A832A0' },  // golden amber
  { bar: '#4DAA6D', glow: '#4DAA6DA0' },  // emerald green
  { bar: '#3D8EB9', glow: '#3D8EB9A0' },  // ocean blue
  { bar: '#8B5CC2', glow: '#8B5CC2A0' },  // violet
  { bar: '#CC5078', glow: '#CC5078A0' },  // hot pink
]
const wavebarColorIdx = ref(0)
let colorTimer = null
const wavebarColor = computed(() => WAVEBAR_COLORS[wavebarColorIdx.value])

function startColorCycle() {
  if (colorTimer) return
  wavebarColorIdx.value = Math.floor(Math.random() * WAVEBAR_COLORS.length)
  colorTimer = setInterval(() => {
    let next
    do { next = Math.floor(Math.random() * WAVEBAR_COLORS.length) } while (next === wavebarColorIdx.value)
    wavebarColorIdx.value = next
  }, 3000)
}
function stopColorCycle() {
  if (colorTimer) { clearInterval(colorTimer); colorTimer = null }
}

watch(() => props.message.streaming, (streaming) => {
  if (streaming) { startTimer(); startColorCycle() }
  else { stopTimer(); stopColorCycle() }
}, { immediate: true })

onBeforeUnmount(() => { stopTimer(); stopColorCycle() })

// ── Live output <pre> auto-scroll ───────────────────────────────────────────
// Track which segment indices the user has manually scrolled up (suppress auto-scroll)
const liveOutputUserScrolled = reactive(new Set())
// Map of segment index → <pre> DOM element (set via template ref callback)
const livePreRefs = reactive(new Map())

function setLivePreRef(idx, el) {
  if (el) livePreRefs.set(idx, el)
  else livePreRefs.delete(idx)
}

function onLiveOutputScroll(idx) {
  const el = livePreRefs.get(idx)
  if (!el) return
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  if (distFromBottom > 30) {
    liveOutputUserScrolled.add(idx)
  } else {
    liveOutputUserScrolled.delete(idx)
  }
}

// Auto-scroll live output <pre> elements after each render update
onUpdated(() => {
  const segs = props.message.segments || []
  for (let i = 0; i < segs.length; i++) {
    const seg = segs[i]
    if (seg.type === 'tool' && seg.output === undefined && seg.streamingOutput) {
      if (liveOutputUserScrolled.has(i)) continue
      const el = livePreRefs.get(i)
      if (el) el.scrollTop = el.scrollHeight
    }
  }
})

function formatDuration(ms) {
  const totalSec = Math.round(ms / 1000)
  if (totalSec < 60) return t('chats.durationSecs', { s: totalSec })
  const hours = Math.floor(totalSec / 3600)
  const mins = Math.floor((totalSec % 3600) / 60)
  const secs = totalSec % 60
  if (hours > 0) {
    return t('chats.durationHoursMinsSecs', {
      h: hours, hPlural: hours > 1 ? 's' : '',
      m: mins,  mPlural: mins !== 1 ? 's' : '',
      s: secs,
    })
  }
  return t('chats.durationMinsSecs', {
    m: mins, mPlural: mins !== 1 ? 's' : '',
    s: secs,
  })
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
//
// Character-class fragments are hoisted into constants so the emoji ranges
// (needed for filenames like `大虾米👀_report.html`) can be maintained in one
// place. `_P_EMO` covers Supplementary Multilingual Plane pictographs commonly
// found in WeChat nicknames — Misc Symbols/Pictographs (1F300-1F9FF), Emoticons
// (1F600-1F64F), Misc Symbols (2600-27BF), ZWJ + variation selectors. Without
// these, a single emoji in a filename breaks the entire path match and the
// open/folder buttons never appear.
const _P_FILE  = '\\w\\u00C0-\\u024F\\u4E00-\\u9FFF\\u3400-\\u4DBF.\\-\\u{1F000}-\\u{1FFFF}\\u{2600}-\\u{27BF}\\u{FE00}-\\u{FE0F}\\u{200D}'
const _P_DIR   = _P_FILE + ' '   // directory segments may contain spaces
const _P_DIR_S = _P_FILE         // Unix/posix segments (no spaces)
const FILE_PATH_RE = new RegExp(
  `(?:(?:~\\/[${_P_DIR_S}\\/]+|\\/(?:[${_P_DIR_S}]+\\/)+[${_P_DIR_S}]+|[A-Z]:\\\\(?:[${_P_DIR}]+\\\\)*[${_P_DIR_S}]+|\\\\\\\\[${_P_DIR_S}]+(?:\\\\[${_P_DIR_S}]+)+)\\.(?:md|txt|json|jsx|tsx|toml|yaml|yml|html|scss|sass|bash|conf|java|svelte|vue|ts|js|py|rb|go|rs|cpp|hpp|css|xml|ini|cfg|log|csv|sql|zsh|env|sh|c|h)|(?:~\\/(?:[${_P_DIR_S}]+\\/)+|\\/(?:[${_P_DIR_S}]+\\/){2,}|[A-Z]:\\\\(?:[${_P_DIR}]+\\\\){2,}|\\\\\\\\[${_P_DIR_S}]+(?:\\\\[${_P_DIR_S}]+)+\\\\)(?=[\\s.,;:!?)'"\\]}]|$))`,
  'gu'
)

function _normSlash(p) { return p.replace(/\\/g, '/').toLowerCase() }

function _isUnderAidocDir(filePath) {
  const docPath = configStore.config.DoCPath
  if (!docPath) return false
  return _normSlash(filePath).startsWith(_normSlash(docPath))
}

// Only show the "open in AI Doc" chip when the file is under the aidoc dir AND
// the session probe has confirmed it's openable. Unknown (unprobed) paths get
// a lazy probe fired in the background; when the result arrives it updates
// `obsidianStore.probeCache` (reactive), which triggers this render to re-run
// and the button appears. Confirmed-binary paths never get the button.
function _shouldShowAidocButton(filePath) {
  if (!_isUnderAidocDir(filePath)) return false
  const cache = obsidianStore.probeCache
  if (filePath in cache) return cache[filePath] === true
  // Fire-and-forget probe. De-duped inside the store.
  Promise.resolve().then(() => obsidianStore.probeFile(filePath))
  return false
}

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
    // Replace file paths with chips containing open buttons (use data-* for event delegation)
    parts[i] = p.replace(FILE_PATH_RE, (path) => {
      const escaped = path.replace(/"/g, '&quot;')
      const aidocBtn = _shouldShowAidocButton(path)
        ? `<button class="file-path-btn file-path-aidoc" data-action="open-in-aidoc" data-path="${escaped}" data-app-tooltip title="${t('common.openInAiDoc')}">📝</button>`
        : ''
      return `${path}${aidocBtn}<button class="file-path-btn file-path-open" data-action="open-file" data-path="${escaped}" data-app-tooltip title="${t('common.openFile')}">📄</button><button class="file-path-btn file-path-folder" data-action="open-folder" data-path="${escaped}" data-app-tooltip title="${t('common.openFolder')}">📁</button>`
    })
  }
  return parts.join('')
}

// Replace <recommend-agent id="..." reason="..."/> tags in the raw text with
// button HTML before marked.parse. The button survives DOMPurify because it
// uses only standard data-attributes (same shape as the file-path chips).
// Match both self-closing (<recommend-agent ... />) and paired forms.
//
// Streaming hygiene: while the LLM types the tag character-by-character, we
// would otherwise leak the raw tag text to the UI until the closing chars
// arrive. To prevent that flash, we ALSO strip any unclosed
// "<recommend-agent ..." fragment that sits at the very end of the buffer.
// On the next streaming frame the closing chars arrive and the full-tag
// regex below converts the (now-complete) fragment to a button.
function expandRecommendAgentTags(text) {
  if (!text || typeof text !== 'string') return text
  // Strip a half-typed tag at the trailing edge of the buffer. The match must
  // be anchored to end-of-string and must NOT contain a `>` (which would mean
  // the tag is actually closed and should be handled by the full-tag regex).
  const trailingPartial = /<recommend-agent\b[^>]*$/i
  let cleaned = text.replace(trailingPartial, '')
  const re = /<recommend-agent\s+([^>]*?)\/?\s*>(?:\s*<\/recommend-agent>)?/gi
  return cleaned.replace(re, (full, attrStr) => {
    const idMatch = attrStr.match(/\bid\s*=\s*["']([^"']+)["']/i)
    const reasonMatch = attrStr.match(/\breason\s*=\s*["']([^"']*)["']/i)
    const id = idMatch ? idMatch[1] : ''
    const reason = reasonMatch ? reasonMatch[1] : ''
    if (!id) return full
    const agent = (agentsStore.agents || []).find(a => a.id === id)
    // Unknown agent id (model hallucinated) — drop the tag silently rather
    // than render a button that goes nowhere.
    if (!agent) return ''
    const escAttr = (s) => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const escText = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    const name = agent.name || 'Agent'
    // Reason is rendered as a sibling span AFTER the button (not inside it),
    // so the button stays compact while the description reads as natural prose
    // alongside the click target.
    const button = `<button class="recommend-agent-btn" data-action="recommend-agent" data-agent-id="${escAttr(id)}" type="button"><span class="recommend-agent-arrow">→</span><span class="recommend-agent-name">${escText(name)}</span></button>`
    const reasonHtml = reason ? `<span class="recommend-agent-caption">${escText(reason)}</span>` : ''
    return button + reasonHtml
  })
}

function renderMarkdown(text) {
  if (!text) return ''
  try {
    // Strip DeepSeek-style tool execution log blocks: [Tool execution log from this response: ... ]
    // Match from the marker to either a standalone ] line or end of string
    let stripped = String(text).replace(/\n?\[Tool execution log[\s\S]*?(?:\n\]|$)/g, '')
    // Strip Qwen3 / Ollama-style inline thinking blocks: <think>...</think>.
    // Some thinking models emit their internal monologue inline in delta.content
    // (rather than via reasoning_content). It's not user-facing — and during
    // streaming the closing tag may not have arrived yet, so also strip an
    // unterminated trailing <think>... so the wavebar doesn't render raw thoughts.
    stripped = stripped.replace(/<think>[\s\S]*?<\/think>/gi, '').replace(/<think>[\s\S]*$/i, '').trim()
    const withRecommendButtons = expandRecommendAgentTags(stripped)
    const clean = stripBase64(withRecommendButtons)
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

// ── Click handler for code-copy + file-path buttons (event delegation) ───────
async function handleContentClick(e) {
  // Recommend-agent button: jump to existing single-agent chat with this agent,
  // or create a fresh one (mirrors the AgentCard "open chat" flow).
  const recBtn = e.target.closest('[data-action="recommend-agent"]')
  if (recBtn) {
    e.stopPropagation()
    e.preventDefault()
    const agentId = recBtn.dataset.agentId
    if (!agentId) return
    const agent = (agentsStore.agents || []).find(a => a.id === agentId)
    if (!agent) return
    const title = t('chats.chatWithAgentTitle', { name: agent.name })
    const existing = chatsStore.chats.find(c =>
      c.type !== 'analysis' &&
      c.title === title &&
      !c.isGroupChat &&
      c.systemAgentId === agent.id
    )
    if (existing) {
      chatsStore.setActiveChat(existing.id)
      router.push('/chats')
      return
    }
    const chat = await chatsStore.createChat(title, [agent.id])
    if (!chat) return
    chatsStore.setActiveChat(chat.id)
    // Best-effort greeting trigger — same as AgentCard. Lazy-import to avoid
    // a hard dependency from the renderer module graph.
    try {
      const { triggerAgentGreeting } = await import('../../composables/useAgentGreeting')
      triggerAgentGreeting({ chatId: chat.id, agentId: agent.id })
    } catch { /* greeting is optional, swallow errors */ }
    router.push('/chats')
    return
  }

  // File path chip buttons
  const fpBtn = e.target.closest('[data-action]')
  if (fpBtn) {
    e.stopPropagation()
    const action = fpBtn.dataset.action
    const filePath = fpBtn.dataset.path
    if (!filePath) return
    if (action === 'open-in-aidoc') {
      const fileName = filePath.split(/[/\\]/).pop()
      obsidianStore.openFile(filePath, fileName)
      router.push('/notes')
    } else if (action === 'open-file' && window.electronAPI?.openFile) {
      window.electronAPI.openFile(filePath)
    } else if (action === 'open-folder' && window.electronAPI?.showInFolder) {
      window.electronAPI.showInFolder(filePath)
    }
    return
  }

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

const hasSubmitPlan = computed(() =>
  (props.message.segments || []).some(s => s.type === 'tool' && s.name === 'submit_plan')
)

const latestTodos = computed(() => {
  const segs = props.message.segments || []
  // After plan approval, only show todos from the execution phase (after submit_plan)
  let startIdx = 0
  for (let j = segs.length - 1; j >= 0; j--) {
    if (segs[j].type === 'tool' && segs[j].name === 'submit_plan') { startIdx = j + 1; break }
  }
  const map = new Map()    // keyed by todo.id
  const order = []
  const titleMap = new Map() // keyed by normalized title → todo.id (dedup across agent runs)
  // Normalize title: strip "Step N: ", "Step N/N — ", "Step N — ", "#N " prefixes
  const normalizeTitle = (t) => t.replace(/^(?:Step\s+\d+(?:\/\d+)?[\s:—-]+|#\d+\s+)/i, '').trim()
  for (let idx = startIdx; idx < segs.length; idx++) {
    const seg = segs[idx]
    if (seg.type !== 'tool' || seg.name !== 'todo_manager') continue
    const out = parseOutput(seg)
    const action = seg.input?.action
    if (action === 'add' && out?.todo) {
      const normTitle = normalizeTitle(out.todo.title)
      // Dedup by normalized title: if a todo with the same core title already
      // exists (from a different agent run with different IDs/prefix), merge
      const existingId = titleMap.get(normTitle)
      if (existingId !== undefined && map.has(existingId)) {
        Object.assign(map.get(existingId), out.todo, { id: existingId })
      } else {
        if (!map.has(out.todo.id)) order.push(out.todo.id)
        map.set(out.todo.id, { ...out.todo })
        titleMap.set(normTitle, out.todo.id)
      }
    } else if ((action === 'update' || action === 'complete') && out?.todo) {
      if (map.has(out.todo.id)) {
        Object.assign(map.get(out.todo.id), out.todo)
      }
    } else if (action === 'clear') {
      map.clear(); order.length = 0; titleMap.clear()
    } else if (action === 'remove' && out?.todo) {
      const removed = map.get(out.todo.id)
      if (removed) titleMap.delete(normalizeTitle(removed.title))
      map.delete(out.todo.id)
    }
  }
  return order.map(id => map.get(id)).filter(Boolean).sort((a, b) => a.id - b.id)
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
const expandedTools    = reactive({})   // manually toggled
const expandedThinking = reactive({})   // intermediate text expand/collapse
const expandedInputs  = reactive({})
const expandedOutputs = reactive({})
const expandedDiffs   = reactive({})
const diffCache       = reactive({})
const copiedBlock     = ref(null)

// ── Execution records collapse ─
const processExpanded = ref(false)

function isMemoryTool(seg) {
  return seg.name === 'update_memory' || seg.name === 'read_memory'
}
// Visible = rendered inside the collapsible block (excludes hidden tools AND memory tools)
function isVisibleProcessSegment(s) {
  if (s.type === 'permission') return true
  if (s.type === 'tool') return (isFileWrite(s) || !isHiddenTool(s) || s.output === undefined) && !isMemoryTool(s)
  return false
}

const hasProcessSegments = computed(() => {
  const segs = props.message?.segments
  if (!segs) return false
  return segs.some(isVisibleProcessSegment)
})
const processSegmentCount = computed(() => {
  const segs = props.message?.segments
  if (!segs) return 0
  return segs.filter(isVisibleProcessSegment).length
})
// Active tool label for the collapsed header — shows running or last completed
const activeToolLabel = computed(() => {
  const segs = props.message?.segments
  if (!segs) return ''
  let lastCompleted = ''
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s.type !== 'tool' || isMemoryTool(s)) continue
    const name = toolDisplayName(s)
    const summary = toolSummary(s)
    const label = summary ? `${name} — ${summary}` : name
    if (s.output === undefined) return label  // currently running
    lastCompleted = label
  }
  return lastCompleted  // fallback: last completed tool
})

const runningToolLabel = computed(() => {
  const segs = props.message?.segments
  if (!segs) return ''
  for (let i = 0; i < segs.length; i++) {
    const s = segs[i]
    if (s.type !== 'tool' || isMemoryTool(s)) continue
    if (s.output !== undefined) continue
    const name = toolDisplayName(s)
    const summary = toolSummary(s)
    return summary ? `${name} — ${summary}` : name
  }
  return ''
})
// True when streaming but no tool is currently running — LLM is thinking between iterations
const isLlmThinking = computed(() => {
  if (!props.message.streaming) return false
  const segs = props.message?.segments
  if (!segs || segs.length === 0) return true // streaming, no segments yet
  return !segs.some(s => s.type === 'tool' && s.output === undefined)
})

/**
 * Returns true if this text segment is "intermediate narration" — i.e. the model
 * said something like "Let me read the file:" right before calling a tool.
 * Hides pre-tool-call thinking text that adds no value to the user.
 */
function isIntermediateText(i) {
  const segs = props.message.segments
  if (!segs) return false

  // Find the next meaningful segment (skip empty text)
  let next = null
  for (let j = i + 1; j < segs.length; j++) {
    const s = segs[j]
    if (!s || (s.type === 'text' && !s.content)) continue
    next = s
    break
  }

  // Find the previous meaningful segment (skip empty text)
  let prev = null
  for (let j = i - 1; j >= 0; j--) {
    const s = segs[j]
    if (!s || (s.type === 'text' && !s.content)) continue
    prev = s
    break
  }

  // Text immediately before a tool call = pre-tool narration (hide)
  if (next?.type === 'tool_call') return true

  // Text between a tool result and the next tool call = between-tool narration (hide)
  if (prev?.type === 'tool_result' && next?.type === 'tool_call') return true

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
  // todo_manager has its own dedicated panel renderer above, so hide it from
  // the generic tool list to avoid duplication.
  if (seg.name === 'todo_manager') return true
  // file_operation read-only ops (read/list/search/exists/glob/grep) used to be
  // hidden to reduce UI noise. We now show them — productivity-mode users
  // need to SEE tool calls to trust the system, and the collapsible
  // "execution steps" header already handles the clutter concern by collapsing
  // the whole block by default.
  return false
}

function isFileWrite(seg) {
  return seg.name === 'file_operation' &&
    seg.input && ['write', 'append'].includes(seg.input.operation)
}
function shellExitOk(seg) {
  if (seg.name !== 'execute_shell' || seg.output === undefined) return null
  const m = (seg.output || '').match(/\[exit code: (\d+)\]/)
  return m ? m[1] === '0' : true
}

// Defensive fallback: detect a tool error from the output payload itself
// when the upstream `isError` flag did not propagate (legacy code paths,
// MCP tools, etc.). BaseTool._err always prefixes the text with "Error: "
// and uiResult forwards it, so probing for that substring catches every
// case the explicit flag misses.
function isToolErrorOutput(seg) {
  if (seg.output === undefined) return false
  const out = String(seg.output)
  if (out.startsWith('Error:')) return true
  // For JSON-stringified tool results, the error text lives at .text
  // → match `"text": "Error: …"` near the start of the blob.
  if (/"text"\s*:\s*"Error:/.test(out.slice(0, 500))) return true
  return false
}

function toolDisplayName(seg) {
  if (seg.name === 'execute_shell')    return t('chats.toolExecuteShell')
  if (seg.name === 'dispatch_subagent') return t('chats.toolDispatchSubagent')
  if (seg.name === 'dispatch_subagents') return t('chats.toolDispatchSubagent')
  if (seg.name === 'background_task')  return t('chats.toolBackgroundTask')
  if (seg.name === 'file_operation')   return t('chats.toolFileOperation')
  if (seg.name === 'update_memory') return t('chats.toolUpdateMemory')
  if (seg.name === 'read_memory') return t('chats.toolReadMemory')
  if (seg.name === 'todo_manager') return t('chats.toolTodoManager')
  if (seg.name === 'search_chat_history') return t('chats.toolSearchChatHistory')
  // User-defined tools are exposed to the LLM as `{type}_{id}` (e.g. smtp_smtp-qq-com).
  // Strip the prefix, look up the tool by id, and fall back to the pretty name.
  const m = typeof seg.name === 'string' ? seg.name.match(/^(http|smtp|code|prompt)_(.+)$/) : null
  if (m) {
    const tool = toolsStore.tools.find(x => x.id === m[2])
    if (tool?.name) return tool.name
  }
  return seg.name
}

function toolSummary(seg) {
  if (!seg.input) return ''
  if (typeof seg.input === 'string') return seg.input.slice(0, 80)
  if (seg.name === 'execute_shell') {
    const cmd = seg.input.command || ''
    const rawArgs = seg.input.args || []
    const args = Array.isArray(rawArgs) ? rawArgs.join(' ') : String(rawArgs)
    const cmdStr = (cmd + ' ' + args).trim()
    if (seg.output !== undefined) return cmdStr.slice(0, 60)
    return cmdStr.slice(0, 80)
  }
  if (seg.name === 'dispatch_subagent') {
    const agentName = seg.input.agentName || seg.input.agent || seg.input.subagent || ''
    const spec = seg.input.specialization ? `[${seg.input.specialization}]` : ''
    const task = seg.input.task || ''
    const prefix = [agentName, spec].filter(Boolean).join(' ')
    const full = prefix ? `${prefix} ${task}` : task
    return full.length > 80 ? full.slice(0, 80) + '…' : full
  }
  if (seg.name === 'dispatch_subagents') {
    const agents = seg.input?.agents || []
    if (agents.length === 0) return ''
    const labels = agents.map(a => {
      const agentName = a.agentName || a.agent || a.subagent || ''
      const spec = a.specialization ? `[${a.specialization}]` : ''
      return [agentName, spec].filter(Boolean).join(' ')
    }).filter(Boolean)
    const tasks = agents.map(a => (a.task || '').slice(0, 30)).filter(Boolean).join(', ')
    return labels.length > 0 ? `${labels.join(' ')} — ${tasks}` : tasks
  }
  if (seg.name === 'background_task') {
    if (seg.input.action === 'start') {
      const cmd = seg.input.command || ''
      const rawArgs = seg.input.args || []
      const args = Array.isArray(rawArgs) ? rawArgs.join(' ') : String(rawArgs)
      return (cmd + ' ' + args).trim().slice(0, 80)
    }
    if (seg.input.taskId != null) return `${seg.input.action || ''} #${seg.input.taskId}`.trim()
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

function formatInput(input) {
  return typeof input === 'string' ? input : JSON.stringify(input, null, 2)
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
  animation: wave-oscillate 1.3s ease-in-out infinite, wave-hue 6s ease-in-out infinite;
  transition: background 1s ease, box-shadow 1s ease;
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

/* File path action buttons */
:deep(.file-path-btn) {
  border: none;
  background: transparent;
  cursor: pointer;
  font-size: 0.75rem;
  padding: 0 0.125rem;
  vertical-align: middle;
  opacity: 0.6;
  transition: opacity 0.15s;
}

:deep(.file-path-btn:hover) {
  opacity: 1;
}

/* Recommend-agent button (Clank's cross-agent recommendation).
   Black gradient — same primary visual signature as other CTAs in the app. */
:deep(.recommend-agent-btn) {
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  margin: 0.15rem 0.5rem 0.15rem 0;
  padding: 0.3rem 0.75rem;
  border-radius: 999px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151);
  color: #ffffff;
  cursor: pointer;
  font-size: 0.8rem;
  line-height: 1.3;
  font-weight: 500;
  transition: transform 0.12s ease, box-shadow 0.15s ease;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
  vertical-align: middle;
}

:deep(.recommend-agent-btn:hover) {
  transform: translateY(-1px);
  box-shadow: 0 4px 10px rgba(0, 0, 0, 0.25);
}

:deep(.recommend-agent-btn:active) {
  transform: translateY(0);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.18);
}

:deep(.recommend-agent-arrow) {
  font-size: 0.9rem;
  opacity: 0.9;
}

:deep(.recommend-agent-name) {
  font-weight: 600;
}

/* Description text rendered as a sibling AFTER the button — not part of the
   click target, just inline prose explaining why the recommendation fits. */
:deep(.recommend-agent-caption) {
  display: inline;
  margin-left: 0.1rem;
  color: var(--text-secondary, rgba(0, 0, 0, 0.6));
  font-size: 0.85rem;
  line-height: 1.4;
}

/* ── Spotlight scan animation ────────────────────────────────────────────────
   Uses translateX (not background-position) so direction is unambiguously
   left → right. mix-blend-mode makes the beam illuminate text/icons rather
   than paint a colour block on top of them.
   ─────────────────────────────────────────────────────────────────────────── */
@keyframes beam-sweep {
  from { transform: translateX(-100%); }
  to   { transform: translateX(200%); }
}

/* Shared ::before beam — white spotlight, narrow falloff */
.tool-header-running::before,
.tool-file-header-running::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(
    90deg,
    transparent           30%,
    rgba(255,255,255,0.85) 50%,
    transparent           70%
  );
  animation: beam-sweep 3.5s linear infinite;
  pointer-events: none;
}

/* Light header (generic tools) — overlay brightens dark text/icons */
.tool-header-running {
  background: #fffbeb;
  position: relative;
  overflow: hidden;
}
.tool-header-running::before {
  mix-blend-mode: overlay;
}
.tool-header-done {
  background: #F5F5F5;
}

/* Dark header (file write) — screen brightens light text/icons on dark bg */
.tool-file-header-running {
  background: #1C1C1E;
  position: relative;
  overflow: hidden;
}
.tool-file-header-running::before {
  mix-blend-mode: screen;
}
.tool-file-header-done {
  background: #1C1C1E;
}

/* ── Execution Steps collapse header ────────────────────────────────────────── */
.steps-header {
  display: flex;
  align-items: center;
  gap: 5px;
  cursor: pointer;
  user-select: none;
  color: #8C7E6A;
  font-size: 0.72rem;
  font-weight: 600;
  margin: 0.5rem 0;
  padding: 6px 10px;
  border-radius: 8px;
  background: #EBE7DF;
  border: none;
  transition: background 1s ease, color 1s ease;
  width: 100%;
  overflow: hidden;
}
.steps-header svg { transition: stroke 1s ease; }
.steps-header:hover {
  background: #E3DED4;
  color: #6B5F4D;
}
.steps-header:hover svg { stroke: #6B5F4D; }
.steps-header-running {
  background: #E8E3D8;
  color: #3D2B1E;
  font-weight: 700;
}
.steps-header-running svg { stroke: #3D2B1E; }
.steps-header-running:hover {
  background: #DED8CC;
  color: #2C1A0E;
}
.steps-badge {
  background: rgba(140,126,106,0.15);
  color: #8C7E6A;
  font-size: 0.67rem;
  font-weight: 700;
  padding: 0 5px;
  border-radius: 99px;
  line-height: 1.6;
  transition: background 1s ease, color 1s ease;
}
.steps-chevron {
  font-size: 0.65rem;
  color: #B0A48E;
  flex-shrink: 0;
  transition: color 1s ease;
}
.steps-ticker-clip {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  height: 100%;
  display: flex;
  align-items: center;
}
.steps-ticker-track {
  padding-left: 100%;
  white-space: nowrap;
  will-change: transform;
  flex-shrink: 0;
  font-weight: 500;
  animation: steps-ticker 12s linear infinite;
}
.steps-ticker-highlight {
  color: currentColor;
  display: inline-block;
}
@supports (-webkit-background-clip: text) {
  .steps-ticker-highlight {
    background-image: linear-gradient(
      90deg,
      rgba(139, 111, 94, 0.7) 28%,
      rgba(201, 184, 163, 1) 50%,
      rgba(139, 111, 94, 0.7) 72%
    );
    background-size: 240% 100%;
    background-position: 140% center;
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    animation: steps-text-sweep 2.8s linear infinite;
  }
}
@keyframes steps-ticker {
  from { transform: translateX(0); }
  to   { transform: translateX(-100%); }
}
@keyframes steps-text-sweep {
  from { background-position: 140% center; }
  to { background-position: -40% center; }
}
.steps-thinking-label {
  font-weight: 500;
  font-style: italic;
  opacity: 0.7;
  animation: steps-thinking-pulse 1.5s ease-in-out infinite;
}
@keyframes steps-thinking-pulse {
  0%, 100% { opacity: 0.4; }
  50% { opacity: 0.9; }
}

/* Wave bar row — text-only sweep via background-clip: no background changes */
.wavebar-scan {
  position: relative;
  border-radius: 0.375rem;
}

/* Token text: bright spot sweeps left→right over the characters only */
.wavebar-tokens {
  background-image: linear-gradient(
    90deg,
    var(--wb-color, #4c8446) 25%,
    var(--wb-bright, #4c844680) 50%,
    var(--wb-color, #4c8446) 75%
  );
  background-size: 300% 100%;
  background-position: 150% center;
  -webkit-background-clip: text;
  background-clip: text;
  transition: background-image 1s ease;
  -webkit-text-fill-color: transparent;
  animation: wavebar-text-sweep 3.5s linear infinite;
  line-height: 1;
}

@keyframes wavebar-text-sweep {
  from { background-position: 150% center; }
  to   { background-position: -50% center; }
}

/* ── Inline blob chip (sent messages) ── */
.msg-blob-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.2rem 0.5rem 0.2rem 0.4rem;
  background: rgba(255,255,255,0.15);
  border: 1px solid rgba(255,248,240,0.35);
  border-radius: 0.75rem;
  cursor: pointer;
  font-size: 0.78rem;
  color: #FFF8F0;
  vertical-align: middle;
  white-space: nowrap;
  transition: background 0.12s;
}
.msg-blob-chip:hover { background: rgba(255,255,255,0.25); }

/* ── Long input dialog ── */
.long-input-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.long-input-dialog {
  width: 70vw;
  max-width: 900px;
  height: 70vh;
  background: #0F0F0F;
  border-radius: 1.125rem;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  box-shadow: 0 4px 16px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.18), 0 20px 60px rgba(0,0,0,0.45);
}
.long-input-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid rgba(255,248,240,0.15);
  color: #FFF8F0;
  font-size: 0.875rem;
  font-weight: 600;
  flex-shrink: 0;
}
.long-input-dialog__close {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  background: rgba(255,248,240,0.12);
  border: none;
  color: rgba(255,248,240,0.8);
  font-size: 1rem;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
}
.long-input-dialog__close:hover { background: rgba(255,248,240,0.2); color: #FFF8F0; }
.long-input-dialog__body {
  flex: 1;
  overflow: auto;
  padding: 1rem 1.25rem;
}
.long-input-dialog__body pre {
  margin: 0;
  color: #FFF8F0;
  font-family: 'SF Mono', 'Fira Code', monospace;
  font-size: 0.78rem;
  white-space: pre-wrap;
  word-break: break-word;
  line-height: 1.6;
}

</style>
