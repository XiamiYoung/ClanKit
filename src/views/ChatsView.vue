<template>
  <div class="h-full flex chats-page">
    <!-- ── Chat List Sidebar ──────────────────────────────────────────────── -->
    <aside class="chat-sidebar">
      <!-- Header -->
      <div class="chat-sidebar-header">
        <span class="chat-sidebar-title">Chats</span>
        <button
          @click="newChat"
          class="chat-sidebar-new-btn"
          aria-label="New chat"
          title="New chat"
        >
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
      </div>

      <!-- Chat Items -->
      <div class="chat-sidebar-list">
        <div
          v-for="chat in chatsStore.chats"
          :key="chat.id"
          @click="chatsStore.setActiveChat(chat.id)"
          class="chat-sidebar-item group"
          :class="{ active: chat.id === chatsStore.activeChatId }"
        >
          <svg style="width:16px;height:16px;color:#64748B;opacity:0.7;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>

          <span class="chat-sidebar-item-title">{{ chat.title }}</span>

          <!-- Actions -->
          <div
            v-if="chat.id === chatsStore.activeChatId"
            class="chat-sidebar-item-actions"
          >
            <button @click.stop="startRename(chat)" class="chat-sidebar-action-btn" aria-label="Rename chat">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <button @click.stop="deleteChat(chat.id)" class="chat-sidebar-action-btn danger" aria-label="Delete chat">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

    </aside>

    <!-- ── Chat Window ─────────────────────────────────────────────────────── -->
    <div
      class="flex-1 min-w-0 flex flex-col relative chat-window"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <!-- Drag-over overlay (full chat window) -->
      <div
        v-if="isDragOver"
        class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
        style="background:rgba(59,130,246,0.08); border:2.5px dashed #3B82F6; border-radius:12px;"
      >
        <div class="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl" style="background:#EFF6FF; color:#1D4ED8; box-shadow:0 4px 24px rgba(59,130,246,0.15);">
          <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span style="font-size:var(--fs-body); font-weight:600;">Drop files here</span>
          <span style="font-size:var(--fs-caption); opacity:0.7;">or paste file paths into the text area</span>
        </div>
      </div>

      <template v-if="chatsStore.activeChat">
        <!-- Chat Header -->
        <div class="chat-header">
          <svg style="width:22px;height:22px;color:#6366F1;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          <h1 class="chat-header-title">{{ chatsStore.activeChat.title }}</h1>

          <!-- Tools section -->
          <div class="header-section tools-section">
            <button
              class="tools-chip-btn"
              @click="showToolsModal = true"
            >
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
              </svg>
              {{ enabledHttpTools.length }}/{{ toolsStore.tools.length }} tools
            </button>
          </div>

          <div class="header-divider"></div>

          <!-- Persona selectors -->
          <div class="header-section persona-section">
            <!-- System persona chip -->
            <div class="persona-chip-wrap" ref="sysChipWrap">
              <button
                class="persona-chip"
                :class="{ active: showSysPopover }"
                @click.stop="togglePopover('system')"
              >
                <div class="persona-chip-avatar">
                  <img v-if="activeSystemAvatarDataUri" :src="activeSystemAvatarDataUri" alt="" class="persona-chip-avatar-img" />
                  <div v-else class="persona-chip-avatar-default system">
                    <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 8V4H8M4 12h16M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1"/></svg>
                  </div>
                </div>
                <span class="persona-chip-name">{{ activeSystemPersonaName }}</span>
                <svg class="persona-chip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                <!-- Hover tooltip -->
                <div v-if="activeSystemPersona?.description" class="persona-tooltip">
                  <div class="persona-tooltip-title">{{ activeSystemPersona.name }}</div>
                  <div class="persona-tooltip-desc">{{ activeSystemPersona.description }}</div>
                </div>
              </button>
              <!-- System popover -->
              <div v-if="showSysPopover" class="persona-popover" @click.stop>
                <div class="persona-popover-header">AI Persona</div>
                <button
                  v-for="p in sortedSystemPersonas"
                  :key="p.id"
                  class="persona-popover-item has-description"
                  :class="{ selected: resolvedSystemPersonaId === p.id }"
                  @click="selectPersona('system', p.isDefault ? null : p.id)"
                >
                  <div class="persona-popover-avatar-wrap">
                    <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" style="width:36px;height:36px;border-radius:50%;" />
                    <span v-else class="persona-popover-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="persona-popover-item-text">
                    <span>{{ p.name }}</span>
                    <span v-if="p.description" class="persona-popover-item-desc">{{ p.description }}</span>
                  </div>
                </button>
              </div>
            </div>

            <!-- User persona chip -->
            <div class="persona-chip-wrap" ref="usrChipWrap">
              <button
                class="persona-chip"
                :class="{ active: showUsrPopover }"
                @click.stop="togglePopover('user')"
              >
                <div class="persona-chip-avatar">
                  <img v-if="activeUserAvatarDataUri" :src="activeUserAvatarDataUri" alt="" class="persona-chip-avatar-img" />
                  <div v-else class="persona-chip-avatar-default user">
                    <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                  </div>
                </div>
                <span class="persona-chip-name">{{ activeUserPersonaName }}</span>
                <svg class="persona-chip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                <!-- Hover tooltip -->
                <div v-if="activeUserPersona?.description" class="persona-tooltip">
                  <div class="persona-tooltip-title">{{ activeUserPersona.name }}</div>
                  <div class="persona-tooltip-desc">{{ activeUserPersona.description }}</div>
                </div>
              </button>
              <!-- User popover -->
              <div v-if="showUsrPopover" class="persona-popover" @click.stop>
                <div class="persona-popover-header">User Persona</div>
                <button
                  v-for="p in sortedUserPersonas"
                  :key="p.id"
                  class="persona-popover-item has-description"
                  :class="{ selected: resolvedUserPersonaId === p.id }"
                  @click="selectPersona('user', p.isDefault ? null : p.id)"
                >
                  <div class="persona-popover-avatar-wrap">
                    <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" style="width:36px;height:36px;border-radius:50%;" />
                    <span v-else class="persona-popover-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="persona-popover-item-text">
                    <span>{{ p.name }}</span>
                    <span v-if="p.description" class="persona-popover-item-desc">{{ p.description }}</span>
                  </div>
                </button>
              </div>
            </div>
          </div>

          <div class="header-divider"></div>

          <!-- Provider / Model selectors -->
          <div class="header-section provider-section">
            <!-- Provider chip -->
            <div class="persona-chip-wrap" ref="providerChipWrap">
              <button
                class="persona-chip"
                :class="{ active: showProviderPopover }"
                @click.stop="toggleProviderPopover"
                title="LLM Provider"
              >
                <div class="persona-chip-avatar">
                  <div class="persona-chip-avatar-default" :class="effectiveProvider === 'openrouter' ? 'user' : effectiveProvider === 'openai' ? 'user' : 'system'">
                    <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  </div>
                </div>
                <span class="persona-chip-name">{{ effectiveProvider === 'openrouter' ? 'OpenRouter' : effectiveProvider === 'openai' ? 'OpenAI' : 'Anthropic' }}</span>
                <svg class="persona-chip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div v-if="showProviderPopover" class="persona-popover" @click.stop>
                <div class="persona-popover-header">Provider</div>
                <button
                  class="persona-popover-item"
                  :class="{ selected: !chatsStore.activeChat?.provider || chatsStore.activeChat?.provider === 'anthropic' }"
                  @click="selectProvider(null)"
                >
                  <span>Default ({{ configStore.config.defaultProvider === 'openrouter' ? 'OpenRouter' : configStore.config.defaultProvider === 'openai' ? 'OpenAI' : 'Anthropic' }})</span>
                </button>
                <button
                  class="persona-popover-item"
                  :class="{ selected: chatsStore.activeChat?.provider === 'anthropic' }"
                  @click="selectProvider('anthropic')"
                >
                  <span>Anthropic</span>
                </button>
                <button
                  class="persona-popover-item"
                  :class="{ selected: chatsStore.activeChat?.provider === 'openrouter' }"
                  @click="selectProvider('openrouter')"
                >
                  <span>OpenRouter</span>
                </button>
                <button
                  class="persona-popover-item"
                  :class="{ selected: chatsStore.activeChat?.provider === 'openai' }"
                  @click="selectProvider('openai')"
                >
                  <span>OpenAI</span>
                </button>
              </div>
            </div>

            <!-- Model chip -->
            <div class="persona-chip-wrap" ref="modelChipWrap">
              <button
                class="persona-chip model-chip"
                :class="{ active: showModelPopover }"
                @click.stop="toggleModelPopover"
                title="Model"
              >
                <div class="model-chip-icon">
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2a4 4 0 0 0-4 4v2H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V10a2 2 0 0 0-2-2h-2V6a4 4 0 0 0-4-4z"/><circle cx="9" cy="15" r="1"/><circle cx="15" cy="15" r="1"/></svg>
                </div>
                <span class="model-chip-label">{{ effectiveModelLabel }}</span>
                <svg class="persona-chip-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
              </button>
              <div v-if="showModelPopover" class="persona-popover model-popover" @click.stop>
                <div class="persona-popover-header">Model</div>
                <!-- Filter input for model search -->
                <div v-if="effectiveProvider === 'openrouter' || effectiveProvider === 'openai'" style="padding:4px 6px;">
                  <input
                    v-model="chatModelFilter"
                    type="text"
                    placeholder="Search models..."
                    class="model-filter-input"
                    @click.stop
                  />
                </div>
                <div class="model-popover-list">
                  <!-- Default option -->
                  <button
                    class="model-popover-item"
                    :class="{ selected: !chatsStore.activeChat?.model }"
                    @click="selectModel(null)"
                  >
                    <div class="model-item-info">
                      <span class="model-item-name">Default</span>
                      <span class="model-item-id">{{ defaultModelLabel }}</span>
                    </div>
                    <svg v-if="!chatsStore.activeChat?.model" class="model-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>

                  <!-- OpenRouter models -->
                  <template v-if="effectiveProvider === 'openrouter'">
                    <div v-if="openRouterModelsLoading" class="model-popover-status">Loading models...</div>
                    <div v-else-if="filteredChatOpenRouterModels.length === 0" class="model-popover-status muted">No models match "{{ chatModelFilter }}"</div>
                    <button
                      v-for="m in filteredChatOpenRouterModels"
                      :key="m.id"
                      class="model-popover-item"
                      :class="{ selected: chatsStore.activeChat?.model === m.id }"
                      @click="selectModel(m.id)"
                    >
                      <div class="model-item-info">
                        <span class="model-item-name">{{ m.name }}</span>
                        <span class="model-item-id">{{ m.id }}</span>
                      </div>
                      <svg v-if="chatsStore.activeChat?.model === m.id" class="model-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                  </template>

                  <!-- OpenAI models -->
                  <template v-else-if="effectiveProvider === 'openai'">
                    <div v-if="openaiProviderModelsLoading" class="model-popover-status">Loading models...</div>
                    <div v-else-if="filteredChatOpenAIModels.length === 0" class="model-popover-status muted">No models match "{{ chatModelFilter }}"</div>
                    <button
                      v-for="m in filteredChatOpenAIModels"
                      :key="m.id"
                      class="model-popover-item"
                      :class="{ selected: chatsStore.activeChat?.model === m.id }"
                      @click="selectModel(m.id)"
                    >
                      <div class="model-item-info">
                        <span class="model-item-name">{{ m.name || m.id }}</span>
                        <span v-if="m.name" class="model-item-id">{{ m.id }}</span>
                      </div>
                      <svg v-if="chatsStore.activeChat?.model === m.id" class="model-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                  </template>

                  <!-- Anthropic models -->
                  <template v-else>
                    <button
                      v-for="opt in anthropicModelChoices"
                      :key="opt.id"
                      class="model-popover-item"
                      :class="{ selected: chatsStore.activeChat?.model === opt.id }"
                      @click="selectModel(opt.id)"
                    >
                      <div class="model-item-info">
                        <span class="model-item-name">{{ opt.label }}</span>
                        <span class="model-item-id">{{ opt.id }}</span>
                      </div>
                      <svg v-if="chatsStore.activeChat?.model === opt.id" class="model-item-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    </button>
                  </template>
                </div>
              </div>
            </div>
          </div>

        </div>

        <!-- ── Context Window Usage Bar (always visible) ────────────────────── -->
        <div class="chat-context-bar">
          <span style="color:#64748B; font-size:var(--fs-small); white-space:nowrap;">Context</span>
          <!-- Progress bar -->
          <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:#DBEAFE;">
            <div
              class="h-full rounded-full transition-all duration-500"
              :style="{
                width: Math.min(activeContextMetrics.percentage, 100) + '%',
                background: activeContextMetrics.percentage > 85 ? '#dc2626' : activeContextMetrics.percentage > 65 ? '#f59e0b' : '#3B82F6'
              }"
            />
          </div>
          <!-- Percentage and token counts -->
          <span style="font-size:var(--fs-small); white-space:nowrap;"
            :style="activeContextMetrics.percentage > 85 ? 'color:#dc2626;' : 'color:#64748B;'"
          >
            {{ Math.round(activeContextMetrics.percentage) }}%
          </span>
          <span style="color:#64748B; font-size:var(--fs-small); white-space:nowrap;">
            {{ formatTokenCount(activeContextMetrics.inputTokens) }} in / {{ formatTokenCount(activeContextMetrics.outputTokens) }} out
          </span>
          <span
            v-if="activeContextMetrics.compactionCount > 0"
            class="px-1.5 py-0.5 rounded-full"
            style="background:#fef3c7; color:#92400e; font-size:var(--fs-small); white-space:nowrap;"
          >
            {{ activeContextMetrics.compactionCount }}x compacted
          </span>
          <!-- Inspect button -->
          <button
            @click="inspectContext"
            :disabled="!hasContextData"
            class="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors cursor-pointer shrink-0"
            :style="hasContextData
              ? 'background:#EFF6FF; color:#3B82F6; border:1px solid #BFDBFE;'
              : 'background:#F1F5F9; color:#CBD5E1; border:1px solid #E2E8F0; cursor:not-allowed;'"
            @mouseenter="e => { if (hasContextData) e.currentTarget.style.background='#DBEAFE' }"
            @mouseleave="e => { if (hasContextData) e.currentTarget.style.background='#EFF6FF' }"
            :title="hasContextData ? 'Inspect context window contents' : 'Send a message first to inspect context'"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
            <span style="font-size:var(--fs-small);">Inspect</span>
          </button>
          <!-- Compact button -->
          <button
            @click="compactContext"
            :disabled="isCompacting || (!activeRunning && !hasContextData)"
            class="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors cursor-pointer shrink-0"
            :style="isCompacting
              ? 'background:#FEF3C7; color:#92400E; border:1px solid #FCD34D;'
              : (activeRunning || hasContextData)
                ? 'background:#EFF6FF; color:#3B82F6; border:1px solid #BFDBFE;'
                : 'background:#F1F5F9; color:#CBD5E1; border:1px solid #E2E8F0; cursor:not-allowed;'"
            @mouseenter="e => { if (!isCompacting && (activeRunning || hasContextData)) e.currentTarget.style.background='#DBEAFE' }"
            @mouseleave="e => { if (!isCompacting && (activeRunning || hasContextData)) e.currentTarget.style.background='#EFF6FF' }"
            :title="isCompacting ? 'Compacting…' : activeRunning ? 'Compact on next iteration' : 'Compact context window'"
          >
            <svg v-if="isCompacting" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
            <span style="font-size:var(--fs-small);">{{ isCompacting ? 'Compacting…' : 'Compact' }}</span>
          </button>
        </div>

        <!-- ── Context Inspector Modal ──────────────────────────────────────── -->
        <div
          v-if="showContextInspector"
          class="fixed inset-0 z-50 flex items-center justify-center"
          style="background:rgba(15,23,42,0.4);"
          @click.self="showContextInspector = false"
        >
          <div
            class="relative flex flex-col rounded-2xl overflow-hidden"
            style="background:#ffffff; width:680px; max-width:90vw; max-height:85vh; box-shadow:0 8px 32px rgba(15,23,42,0.18);"
          >
            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-3 shrink-0" style="border-bottom:1px solid #E2E8F0;">
              <div class="flex items-center gap-2">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#3B82F6" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <span class="font-semibold" style="font-family:'Figtree',sans-serif; color:#1E293B; font-size:var(--fs-subtitle);">Context Inspector</span>
                <span
                  v-if="contextSnapshot"
                  class="px-1.5 py-0.5 rounded-full"
                  style="background:#EFF6FF; color:#3B82F6; font-size:var(--fs-small);"
                >{{ contextSnapshot.model }}</span>
              </div>
              <button
                @click="showContextInspector = false"
                class="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                style="color:#64748B;"
                @mouseenter="e => e.currentTarget.style.background='#F1F5F9'"
                @mouseleave="e => e.currentTarget.style.background=''"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <!-- Body -->
            <div v-if="!contextSnapshot" class="flex-1 flex items-center justify-center py-16">
              <div class="text-center">
                <svg class="w-12 h-12 mx-auto mb-3" viewBox="0 0 24 24" fill="none" stroke="#CBD5E1" stroke-width="1.5">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <p style="color:#64748B; font-size:var(--fs-body);">No context data yet. Send a message first.</p>
              </div>
            </div>

            <div v-else class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <!-- Metrics section (expanded by default) -->
              <div style="border:1px solid #E2E8F0; border-radius:12px; overflow:hidden;">
                <button
                  @click="inspectorSections.metrics = !inspectorSections.metrics"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F8FAFC;"
                  @mouseenter="e => e.currentTarget.style.background='#F1F5F9'"
                  @mouseleave="e => e.currentTarget.style.background='#F8FAFC'"
                >
                  <span class="font-medium" style="color:#1E293B; font-size:var(--fs-body);">Metrics</span>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.metrics ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.metrics" class="px-4 py-3" style="border-top:1px solid #E2E8F0;">
                  <table style="width:100%; font-size:var(--fs-body); color:#1E293B;">
                    <tbody>
                      <tr style="border-bottom:1px solid #F1F5F9;">
                        <td class="py-1.5 pr-4" style="color:#64748B; white-space:nowrap;">Input tokens</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ activeContextMetrics.inputTokens?.toLocaleString() ?? '0' }}</td>
                      </tr>
                      <tr style="border-bottom:1px solid #F1F5F9;">
                        <td class="py-1.5 pr-4" style="color:#64748B; white-space:nowrap;">Max tokens</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (activeContextMetrics.maxTokens ?? 0).toLocaleString() }}</td>
                      </tr>
                      <tr style="border-bottom:1px solid #F1F5F9;">
                        <td class="py-1.5 pr-4" style="color:#64748B; white-space:nowrap;">Usage</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ Math.round(activeContextMetrics.percentage) }}%</td>
                      </tr>
                      <tr>
                        <td class="py-1.5 pr-4" style="color:#64748B; white-space:nowrap;">Compactions</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ activeContextMetrics.compactionCount ?? 0 }}</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- System Prompt section -->
              <div style="border:1px solid #E2E8F0; border-radius:12px; overflow:hidden;">
                <button
                  @click="inspectorSections.system = !inspectorSections.system"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F8FAFC;"
                  @mouseenter="e => e.currentTarget.style.background='#F1F5F9'"
                  @mouseleave="e => e.currentTarget.style.background='#F8FAFC'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1E293B; font-size:var(--fs-body);">System Prompt</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F1F5F9; color:#64748B; font-size:var(--fs-small);">
                      {{ (contextSnapshot.systemPrompt?.length ?? 0).toLocaleString() }} chars
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.system ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.system" class="px-4 py-3" style="border-top:1px solid #E2E8F0;">
                  <pre class="whitespace-pre-wrap text-xs leading-relaxed overflow-x-auto" style="font-family:'JetBrains Mono',monospace; color:#334155; max-height:300px; overflow-y:auto;">{{ contextSnapshot.systemPrompt }}</pre>
                </div>
              </div>

              <!-- Personas section -->
              <div v-if="contextSnapshot.personas?.systemPersonaPrompt || contextSnapshot.personas?.userPersonaPrompt" style="border:1px solid #E2E8F0; border-radius:12px; overflow:hidden;">
                <button
                  @click="inspectorSections.personas = !inspectorSections.personas"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F8FAFC;"
                  @mouseenter="e => e.currentTarget.style.background='#F1F5F9'"
                  @mouseleave="e => e.currentTarget.style.background='#F8FAFC'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1E293B; font-size:var(--fs-body);">Personas</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F1F5F9; color:#64748B; font-size:var(--fs-small);">
                      {{ (contextSnapshot.personas?.systemPersonaPrompt ? 1 : 0) + (contextSnapshot.personas?.userPersonaPrompt ? 1 : 0) }} active
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.personas ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.personas" style="border-top:1px solid #E2E8F0;">
                  <div v-if="contextSnapshot.personas?.systemPersonaPrompt" class="px-4 py-3" :style="contextSnapshot.personas?.userPersonaPrompt ? 'border-bottom:1px solid #F1F5F9;' : ''">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="px-1.5 py-0.5 rounded text-xs font-medium" style="background:#DBEAFE; color:#1E40AF;">System Persona</span>
                    </div>
                    <pre class="whitespace-pre-wrap text-xs leading-relaxed overflow-x-auto" style="font-family:'JetBrains Mono',monospace; color:#334155; max-height:200px; overflow-y:auto;">{{ contextSnapshot.personas.systemPersonaPrompt }}</pre>
                  </div>
                  <div v-if="contextSnapshot.personas?.userPersonaPrompt" class="px-4 py-3">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="px-1.5 py-0.5 rounded text-xs font-medium" style="background:#D1FAE5; color:#065F46;">User Persona</span>
                    </div>
                    <pre class="whitespace-pre-wrap text-xs leading-relaxed overflow-x-auto" style="font-family:'JetBrains Mono',monospace; color:#334155; max-height:200px; overflow-y:auto;">{{ contextSnapshot.personas.userPersonaPrompt }}</pre>
                  </div>
                </div>
              </div>

              <!-- Messages section -->
              <div style="border:1px solid #E2E8F0; border-radius:12px; overflow:hidden;">
                <button
                  @click="inspectorSections.messages = !inspectorSections.messages"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F8FAFC;"
                  @mouseenter="e => e.currentTarget.style.background='#F1F5F9'"
                  @mouseleave="e => e.currentTarget.style.background='#F8FAFC'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1E293B; font-size:var(--fs-body);">Messages</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F1F5F9; color:#64748B; font-size:var(--fs-small);">
                      {{ contextSnapshot.messages?.length ?? 0 }}
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.messages ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.messages" style="border-top:1px solid #E2E8F0; max-height:400px; overflow-y:auto;">
                  <div
                    v-for="(msg, idx) in contextSnapshot.messages"
                    :key="idx"
                    class="px-4 py-2.5"
                    :style="idx < contextSnapshot.messages.length - 1 ? 'border-bottom:1px solid #F1F5F9;' : ''"
                  >
                    <div class="flex items-center gap-2 mb-1">
                      <span
                        class="px-1.5 py-0.5 rounded text-xs font-medium"
                        :style="msg.role === 'user'
                          ? 'background:#DBEAFE; color:#1D4ED8;'
                          : 'background:#D1FAE5; color:#065F46;'"
                      >{{ msg.role }}</span>
                      <span style="color:#94A3B8; font-size:var(--fs-small);">{{ msg.contentLength?.toLocaleString() }} chars</span>
                    </div>
                    <div
                      class="text-xs cursor-pointer"
                      style="font-family:'JetBrains Mono',monospace; color:#475569;"
                      @click="expandedMessages[idx] = !expandedMessages[idx]"
                    >
                      <pre v-if="expandedMessages[idx]" class="whitespace-pre-wrap leading-relaxed overflow-x-auto" style="max-height:300px; overflow-y:auto;">{{ msg.fullContent }}</pre>
                      <span v-else>{{ msg.contentPreview }}<span v-if="msg.contentLength > 200" style="color:#3B82F6;"> ... (click to expand)</span></span>
                    </div>
                  </div>
                  <div v-if="!contextSnapshot.messages?.length" class="px-4 py-3" style="color:#94A3B8; font-size:var(--fs-body);">No messages</div>
                </div>
              </div>

              <!-- Tools section -->
              <div style="border:1px solid #E2E8F0; border-radius:12px; overflow:hidden;">
                <button
                  @click="inspectorSections.tools = !inspectorSections.tools"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F8FAFC;"
                  @mouseenter="e => e.currentTarget.style.background='#F1F5F9'"
                  @mouseleave="e => e.currentTarget.style.background='#F8FAFC'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1E293B; font-size:var(--fs-body);">Tools</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F1F5F9; color:#64748B; font-size:var(--fs-small);">
                      {{ contextSnapshot.tools?.length ?? 0 }}
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.tools ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.tools" style="border-top:1px solid #E2E8F0; max-height:300px; overflow-y:auto;">
                  <div
                    v-for="(tool, idx) in contextSnapshot.tools"
                    :key="idx"
                    class="px-4 py-2"
                    :style="idx < contextSnapshot.tools.length - 1 ? 'border-bottom:1px solid #F1F5F9;' : ''"
                  >
                    <span class="font-medium text-xs" style="font-family:'JetBrains Mono',monospace; color:#1E293B;">{{ tool.name }}</span>
                    <p v-if="tool.description" class="mt-0.5 text-xs" style="color:#64748B;">{{ tool.description.slice(0, 150) }}{{ tool.description.length > 150 ? '...' : '' }}</p>
                  </div>
                  <div v-if="!contextSnapshot.tools?.length" class="px-4 py-3" style="color:#94A3B8; font-size:var(--fs-body);">No tools</div>
                </div>
              </div>

              <!-- Debug Log section -->
              <div style="border:1px solid #E2E8F0; border-radius:12px; overflow:hidden;">
                <button
                  @click="inspectorSections.debugLog = !inspectorSections.debugLog"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F8FAFC;"
                  @mouseenter="e => e.currentTarget.style.background='#F1F5F9'"
                  @mouseleave="e => e.currentTarget.style.background='#F8FAFC'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1E293B; font-size:var(--fs-body);">Debug Log</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F1F5F9; color:#64748B; font-size:var(--fs-small);">
                      {{ debugLog.length }} entries
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.debugLog ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#64748B" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.debugLog" style="border-top:1px solid #E2E8F0;">
                  <!-- Info bar -->
                  <div class="px-4 py-2 flex items-center gap-3 flex-wrap" style="background:#F8FAFC; border-bottom:1px solid #F1F5F9;">
                    <span style="font-size:var(--fs-small); color:#64748B;">
                      Electron: <span :style="hasElectron ? 'color:#3B82F6; font-weight:600;' : 'color:#dc2626; font-weight:600;'">{{ hasElectron ? 'YES' : 'NO' }}</span>
                    </span>
                    <span style="font-size:var(--fs-small); color:#64748B;">
                      Model: <span style="color:#1E293B; font-weight:600;">{{ configStore.config.activeModel }} → {{ debugModelId }}</span>
                    </span>
                  </div>
                  <!-- Log entries (last 100) -->
                  <div style="max-height:300px; overflow-y:auto; background:#0F172A; font-family:'JetBrains Mono',monospace;">
                    <div class="px-3 py-2 space-y-0.5">
                      <div v-if="debugLog.length === 0" style="color:#475569; font-size:var(--fs-secondary);">No events yet — send a message to start logging.</div>
                      <div
                        v-for="(entry, i) in debugLog.slice(-100)"
                        :key="i"
                        style="font-size:var(--fs-secondary);"
                        :style="entry.level === 'error' ? 'color:#f87171;' : entry.level === 'warn' ? 'color:#fbbf24;' : entry.level === 'success' ? 'color:#86efac;' : entry.level === 'chunk' ? 'color:#93c5fd;' : 'color:#E2E8F0;'"
                      >
                        <span style="color:#475569; margin-right:6px; font-size:var(--fs-caption);">{{ entry.time }}</span>{{ entry.msg }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Activity Terminal Strip ─────────────────────────────────────── -->
<!-- Messages -->
        <div ref="messagesEl" class="chat-messages" @scroll="onMessagesScroll">
          <!-- Empty state -->
          <div v-if="chatsStore.activeChat.messages.length === 0" class="chat-empty-state">
            <div class="chat-empty-icon">
              <svg style="width:36px;height:36px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div>
              <p class="chat-empty-title">Start a conversation</p>
              <p class="chat-empty-subtitle">Type a message below to begin</p>
            </div>
          </div>

          <!-- Message list -->
          <template v-else>
            <!-- Load earlier messages -->
            <div v-if="hasHiddenMessages" class="flex justify-center pb-2">
              <button
                @click="loadMoreMessages"
                class="px-4 py-1.5 rounded-full text-xs font-medium transition-colors duration-150 cursor-pointer"
                style="background:#F1F5F9; color:#3B82F6; border:1px solid #E2E8F0;"
                @mouseenter="e => e.currentTarget.style.background='#DBEAFE'"
                @mouseleave="e => e.currentTarget.style.background='#F1F5F9'"
              >
                Show earlier messages ({{ chatsStore.activeChat.messages.length - visibleMessages.length }} hidden)
              </button>
            </div>
            <div
              v-for="msg in visibleMessages"
              :key="msg.id"
              :class="[
                'flex gap-3 animate-fade-in',
                msg.role === 'user' ? 'justify-end' : 'justify-start'
              ]"
            >
              <!-- Assistant avatar -->
              <div v-if="msg.role === 'assistant'" class="msg-avatar-wrap">
                <img v-if="activeSystemAvatarDataUri" :src="activeSystemAvatarDataUri" alt="" class="msg-avatar-img" />
                <div v-else class="msg-avatar-fallback system">
                  <svg style="width:22px;height:22px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M12 8V4H8M4 12h16M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1M9 16h0M15 16h0"/>
                  </svg>
                </div>
              </div>

              <!-- Message bubble -->
              <div
                :class="[
                  'relative group/bubble max-w-[75%]',
                  msg.role === 'assistant' ? 'min-w-[50%]' : ''
                ]"
              >
                <!-- Action buttons (top-right, visible on hover) -->
                <div
                  v-if="msg.content && !msg.streaming"
                  class="absolute -top-2 right-1 z-10 flex items-center gap-1 opacity-0 group-hover/bubble:opacity-100 transition-all duration-150"
                >
                  <!-- Quote button -->
                  <button
                    @click="quoteMessage(msg)"
                    class="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                    :style="msg.role === 'user'
                      ? 'background:#ffffff; color:#1D4ED8; border:1px solid rgba(255,255,255,0.6); box-shadow:0 1px 4px rgba(0,0,0,0.18);'
                      : 'background:#F1F5F9; color:#64748B; border:1px solid #E2E8F0;'"
                    title="Quote message"
                    aria-label="Quote message"
                  >
                    <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
                      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
                    </svg>
                  </button>
                  <!-- Copy button -->
                  <button
                    @click="copyMessage(msg)"
                    class="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
                    :style="msg.role === 'user'
                      ? 'background:#ffffff; color:#1D4ED8; border:1px solid rgba(255,255,255,0.6); box-shadow:0 1px 4px rgba(0,0,0,0.18);'
                      : 'background:#F1F5F9; color:#64748B; border:1px solid #E2E8F0;'"
                    :title="copiedId === msg.id ? 'Copied!' : 'Copy message'"
                    aria-label="Copy message"
                  >
                    <svg v-if="copiedId === msg.id" class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <polyline points="20 6 9 17 4 12"/>
                    </svg>
                    <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/>
                      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                    </svg>
                  </button>
                </div>

                <div
                  class="msg-bubble"
                  :class="msg.role === 'user' ? 'msg-bubble-user' : 'msg-bubble-assistant'"
                >
                  <MessageRenderer :message="msg" />
                  <div
                    class="mt-1 text-right"
                    :style="msg.role === 'user'
                      ? 'color:rgba(255,255,255,0.85); font-size:var(--fs-secondary);'
                      : 'color:#94A3B8; font-size:var(--fs-secondary);'"
                  >
                    {{ formatTime(msg.timestamp) }}
                  </div>
                </div>
              </div>

              <!-- User avatar -->
              <div v-if="msg.role === 'user'" class="msg-avatar-wrap">
                <img v-if="activeUserAvatarDataUri" :src="activeUserAvatarDataUri" alt="" class="msg-avatar-img" />
                <div v-else class="msg-avatar-fallback user">
                  <svg style="width:22px;height:22px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
                  </svg>
                </div>
              </div>
            </div>
          </template>
        </div>

        <!-- Queued prompts list -->
        <div
          v-if="pendingQueue.length > 0"
          class="shrink-0 px-4 py-2 space-y-1.5"
          style="background:#FFFBEB; border-top:1px solid #FCD34D;"
        >
          <div class="flex items-center gap-1.5" style="color:#92400E; font-size:var(--fs-small); font-weight:600;">
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
            </svg>
            Queued ({{ pendingQueue.length }})
          </div>
          <div
            v-for="(item, idx) in pendingQueue"
            :key="idx"
            class="flex items-center gap-2 px-3 py-1.5 rounded-lg"
            style="background:#FEF3C7; color:#92400E; border:1px solid #FDE68A; font-size:var(--fs-small);"
          >
            <span class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style="background:#FDE68A; font-size:10px; font-weight:600;">{{ idx + 1 }}</span>
            <span class="flex-1 truncate">{{ item.text.slice(0, 80) }}{{ item.text.length > 80 ? '…' : '' }}</span>
            <span v-if="item.attachments?.length" style="opacity:0.7;">{{ item.attachments.length }} file{{ item.attachments.length !== 1 ? 's' : '' }}</span>
            <button
              @click="removeFromQueue(idx)"
              class="shrink-0 cursor-pointer"
              style="color:#92400E; opacity:0.5;"
              @mouseenter="e => e.currentTarget.style.opacity='1'"
              @mouseleave="e => e.currentTarget.style.opacity='0.5'"
              title="Remove from queue"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- Input Area -->
        <div class="chat-input-area">
          <!-- Attachment preview strip -->
          <div
            v-if="attachments.length > 0"
            class="flex flex-wrap gap-1.5 mb-2 px-1"
          >
            <div
              v-for="att in attachments"
              :key="att.id"
              class="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs max-w-[200px]"
              :style="att.type === 'image'
                ? 'background:#DBEAFE; color:#1D4ED8; border:1px solid #93C5FD;'
                : att.type === 'folder'
                  ? 'background:#FEF3C7; color:#92400E; border:1px solid #FCD34D;'
                  : att.type === 'error'
                    ? 'background:#FEE2E2; color:#991B1B; border:1px solid #FCA5A5;'
                    : 'background:#F1F5F9; color:#475569; border:1px solid #E2E8F0;'"
            >
              <!-- Type icon -->
              <svg v-if="att.type === 'image'" class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/>
              </svg>
              <svg v-else-if="att.type === 'folder'" class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
              <svg v-else-if="att.type === 'error'" class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
              </svg>
              <svg v-else class="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span class="truncate">{{ att.name }}</span>
              <!-- Remove button -->
              <button
                @click="removeAttachment(att.id)"
                class="w-4 h-4 rounded flex items-center justify-center shrink-0 cursor-pointer transition-colors"
                style="color:inherit; opacity:0.6;"
                @mouseenter="e => e.currentTarget.style.opacity='1'"
                @mouseleave="e => e.currentTarget.style.opacity='0.6'"
                aria-label="Remove attachment"
              >
                <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
          </div>

          <!-- Quote preview -->
          <div
            v-if="quotedMessage"
            class="flex items-start gap-2 px-3 py-2 rounded-t-xl"
            style="background:#EFF6FF; border:1px solid #BFDBFE; border-bottom:none;"
          >
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-1.5 mb-0.5">
                <svg class="w-3.5 h-3.5 shrink-0" style="color:#3B82F6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
                  <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
                </svg>
                <span style="font-size:var(--fs-small); font-weight:600; color:#1D4ED8;">
                  {{ quotedMessage.role === 'user' ? 'You' : 'Assistant' }}
                </span>
              </div>
              <p class="truncate" style="font-size:var(--fs-secondary); color:#475569; margin:0;">
                {{ quotedMessage.content?.slice(0, 150) }}{{ (quotedMessage.content?.length ?? 0) > 150 ? '...' : '' }}
              </p>
            </div>
            <button
              @click="clearQuote"
              class="w-5 h-5 rounded flex items-center justify-center shrink-0 cursor-pointer"
              style="color:#64748B;"
              @mouseenter="e => e.currentTarget.style.color='#1E293B'"
              @mouseleave="e => e.currentTarget.style.color='#64748B'"
              aria-label="Remove quote"
              title="Remove quote"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>

          <div
            class="chat-input-box"
            :class="{ focused: inputFocused, 'has-quote': quotedMessage }"
          >
            <!-- Attach button -->
            <button
              @click="pickFiles"
              :disabled="activeRunning"
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer mb-0.5"
              style="background:#F1F5F9; color:#64748B;"
              @mouseenter="e => { if (!activeRunning) e.currentTarget.style.background='#DBEAFE'; e.currentTarget.style.color='#3B82F6'; }"
              @mouseleave="e => { e.currentTarget.style.background='#F1F5F9'; e.currentTarget.style.color='#64748B'; }"
              aria-label="Attach files"
              title="Attach files or folders"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
              </svg>
            </button>
            <textarea
              ref="inputEl"
              v-model="inputText"
              @keydown.enter.exact.prevent="sendMessage"
              @input="autoResize"
              @paste="onPaste"
              @focus="inputFocused = true"
              @blur="inputFocused = false"
              placeholder="Type your message here… (paste file paths to attach)"
              rows="3"
              class="flex-1 bg-transparent resize-none outline-none leading-relaxed overflow-y-auto"
              style="color:#1E293B; font-size:var(--fs-body); min-height:72px; max-height:200px;"
            />
            <!-- Stop button (visible while running) -->
            <button
              v-if="activeRunning"
              @click="stopAgent"
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer mb-0.5"
              style="background:#fee2e2; color:#dc2626; box-shadow:0 2px 8px rgba(220,38,38,0.18);"
              @mouseenter="e => e.currentTarget.style.background='#fecaca'"
              @mouseleave="e => e.currentTarget.style.background='#fee2e2'"
              aria-label="Stop agent"
              title="Stop agent"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
            </button>
            <!-- Send button (always visible) -->
            <button
              @click="sendMessage"
              :disabled="!inputText.trim() && attachments.length === 0"
              class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer mb-0.5"
              :style="inputText.trim() || attachments.length > 0
                ? 'background:#3B82F6; color:#ffffff; box-shadow:0 2px 8px rgba(59,130,246,0.25);'
                : 'background:#DBEAFE; color:#64748B; cursor:not-allowed;'"
              aria-label="Send message"
              :title="activeRunning ? 'Queue message (will send after current run)' : 'Send message'"
            >
              <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
          <div class="flex items-center justify-between mt-1.5 px-1">
            <div class="flex items-center gap-2 text-xs" style="color:#64748B;">
              <span>{{ enabledSkills.length }} skill{{ enabledSkills.length !== 1 ? 's' : '' }} active</span>
              <span v-if="attachments.length > 0" style="color:#3B82F6;">{{ attachments.length }} file{{ attachments.length !== 1 ? 's' : '' }} attached</span>
            </div>
            <p class="text-xs" style="color:#94A3B8;">
              Enter to send · Shift+Enter for newline · Ctrl+Shift+A attach
            </p>
          </div>
        </div>
      </template>

      <!-- No chat selected -->
      <div v-else class="chat-no-selection">
        <div class="chat-empty-icon" style="width:56px;height:56px;border-radius:14px;">
          <svg style="width:28px;height:28px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <p style="font-family:'Figtree',sans-serif; font-size:var(--fs-subtitle); font-weight:600; color:#475569; margin:12px 0 0;">Select or create a chat to begin</p>
      </div>
    </div>

    <!-- ── Tools Selection Modal ──────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showToolsModal" class="tools-select-backdrop" @click.self="showToolsModal = false">
        <div class="tools-select-modal">
          <!-- Header -->
          <div class="tools-select-header">
            <div class="tools-select-header-left">
              <div class="tools-select-header-icon">
                <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/>
                </svg>
              </div>
              <h2 class="tools-select-title">Select Tools</h2>
              <span class="tools-select-count">{{ enabledHttpTools.length }} enabled</span>
            </div>
            <button class="tools-select-close" @click="showToolsModal = false">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <!-- Filter bar -->
          <div class="tools-select-filters">
            <div class="tools-select-search-wrap">
              <svg style="width:14px;height:14px;color:#94A3B8;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                v-model="toolsSearchQuery"
                type="text"
                placeholder="Filter tools..."
                class="tools-select-search"
              />
            </div>
            <div class="tools-select-actions">
              <button class="tools-select-action-btn" @click="enableAllTools">Enable All</button>
              <button class="tools-select-action-btn" @click="disableAllTools">Disable All</button>
            </div>
          </div>

          <!-- Category chips -->
          <div v-if="toolsCategories.length > 1" class="tools-select-categories">
            <button
              class="tools-cat-chip"
              :class="{ active: !toolsCategoryFilter }"
              @click="toolsCategoryFilter = ''"
            >All</button>
            <button
              v-for="cat in toolsCategories"
              :key="cat"
              class="tools-cat-chip"
              :class="{ active: toolsCategoryFilter === cat }"
              @click="toolsCategoryFilter = toolsCategoryFilter === cat ? '' : cat"
            >{{ cat }}</button>
          </div>

          <!-- Tool list -->
          <div class="tools-select-list">
            <div v-if="toolsStore.tools.length === 0" class="tools-select-empty">
              <p>No tools configured. Go to the Tools page to add HTTP tools.</p>
            </div>
            <div v-else-if="filteredModalTools.length === 0" class="tools-select-empty">
              <p>No tools match your filter.</p>
            </div>
            <label
              v-for="tool in filteredModalTools"
              :key="tool.id"
              class="tools-select-row"
              :class="{ enabled: chatEnabledToolIds.has(tool.id) }"
            >
              <input
                type="checkbox"
                :checked="chatEnabledToolIds.has(tool.id)"
                @change="toggleTool(tool.id)"
                class="tools-select-checkbox"
              />
              <div class="tools-select-row-info">
                <span class="tools-select-row-name">{{ tool.name }}</span>
                <span class="tools-select-row-desc">{{ tool.description || 'No description' }}</span>
              </div>
              <span class="tools-select-row-cat">{{ tool.category || 'HTTP' }}</span>
            </label>
          </div>

          <!-- Footer -->
          <div class="tools-select-footer">
            <button class="tools-select-done-btn" @click="showToolsModal = false">Done</button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Rename Chat Modal ─────────────────────────────────────────────── -->
    <div v-if="showRenameModal" class="rename-backdrop">
      <div class="rename-modal" @keydown.escape="cancelRename">
        <div class="rename-header">
          <h3 class="rename-title">Rename Chat</h3>
          <button class="rename-close-btn" @click="cancelRename" aria-label="Close">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="rename-body">
          <textarea
            ref="renameInput"
            v-model="editingTitle"
            @keydown.enter.exact="onRenameKeydown"
            @compositionstart="renameComposing = true"
            @compositionend="renameComposing = false"
            class="rename-input"
            placeholder="Enter chat name"
            rows="1"
          ></textarea>
        </div>
        <div class="rename-actions">
          <button class="rename-btn secondary" @click="cancelRename">Cancel</button>
          <button class="rename-btn primary" :disabled="!editingTitle.trim()" @click="confirmRename">Save</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted, onErrorCaptured, watch } from 'vue'
import { useChatsStore } from '../stores/chats'
import { useSkillsStore } from '../stores/skills'
import { useConfigStore } from '../stores/config'
import { usePersonasStore } from '../stores/personas'
import { useMcpStore } from '../stores/mcp'
import { useToolsStore } from '../stores/tools'
import { getAvatarDataUri } from '../components/personas/personaAvatars'
import MessageRenderer from '../components/chat/MessageRenderer.vue'
import { v4 as uuidv4 } from 'uuid'

const chatsStore = useChatsStore()
const skillsStore = useSkillsStore()
const configStore = useConfigStore()
const personasStore = usePersonasStore()
const mcpStore = useMcpStore()
const toolsStore = useToolsStore()

const inputText = ref('')
const attachments = ref([])
const isDragOver = ref(false)
const inputEl = ref(null)
const messagesEl = ref(null)
const renameInput = ref(null)
const showRenameModal = ref(false)
const editingChatId = ref(null)
const editingTitle = ref('')
const renameComposing = ref(false)
const inputFocused = ref(false)
const perChatActivityLines = reactive(new Map())
const copiedId = ref(null)
const quotedMessage = ref(null)  // { role, content } of the message being quoted
const userScrolled = ref(false)  // true when user manually scrolled up during streaming
let programmaticScrollCount = 0   // counter to ignore scroll events triggered by scrollToBottom
const visibleLimit = ref(25)     // show last N messages (~1000 lines); user can load more
// Per-chat transient state (not persisted)
const perChatDebugLogs = reactive(new Map())    // chatId → [{time, msg, level}]
const perChatSnapshots = reactive(new Map())    // chatId → snapshot object
const debugLog = computed(() => perChatDebugLogs.get(chatsStore.activeChatId) ?? [])
const showContextInspector = ref(false)
const contextSnapshot = computed(() => perChatSnapshots.get(chatsStore.activeChatId) ?? null)
const expandedMessages = reactive({})
const inspectorSections = reactive({ metrics: true, system: false, personas: false, messages: false, tools: false, debugLog: false })
const perChatQueue = reactive(new Map()) // chatId → [{text, attachments}]
const pendingQueue = computed(() => perChatQueue.get(chatsStore.activeChatId) ?? [])
const isCompacting = ref(false)

// ── HTTP Tools modal state ──
const showToolsModal = ref(false)
const chatEnabledToolIds = ref(new Set())
const toolsSearchQuery = ref('')
const toolsCategoryFilter = ref('')

// Default all tools to enabled when tools list changes
watch(() => toolsStore.tools.length, (len) => {
  if (len > 0 && chatEnabledToolIds.value.size === 0) {
    chatEnabledToolIds.value = new Set(toolsStore.tools.map(t => t.id))
  }
})

const toolsCategories = computed(() => {
  const cats = new Set()
  for (const t of toolsStore.tools) {
    cats.add(t.category || 'HTTP')
  }
  return [...cats].sort()
})

const filteredModalTools = computed(() => {
  let list = toolsStore.tools
  if (toolsCategoryFilter.value) {
    list = list.filter(t => (t.category || 'HTTP') === toolsCategoryFilter.value)
  }
  const q = toolsSearchQuery.value.toLowerCase()
  if (q) {
    list = list.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q)
    )
  }
  return list
})

const enabledHttpTools = computed(() =>
  toolsStore.tools.filter(t => chatEnabledToolIds.value.has(t.id))
)

function toggleTool(id) {
  const s = new Set(chatEnabledToolIds.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  chatEnabledToolIds.value = s
}
function enableAllTools() {
  chatEnabledToolIds.value = new Set(toolsStore.tools.map(t => t.id))
}
function disableAllTools() {
  chatEnabledToolIds.value = new Set()
}

// Per-chat state — reads from the active chat object in the store
const activeRunning = computed(() => chatsStore.activeChat?.isRunning ?? false)
const activeContextMetrics = computed(() => chatsStore.activeChat?.contextMetrics ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, maxTokens: 200000, percentage: 0, compactionCount: 0 })
const hasContextData = computed(() => activeContextMetrics.value.inputTokens > 0)

const hasElectron = !!(typeof window !== 'undefined' && window.electronAPI)

// Catch rendering errors from child components (e.g. MessageRenderer) to prevent silent breakage
onErrorCaptured((err, instance, info) => {
  console.error('[ChatsView] Render error caught:', err, '\nComponent:', instance?.$options?.name || instance, '\nInfo:', info)
  dbg(`RENDER ERROR: ${err.message} (${info})`, 'error')
  return false // don't propagate — keep the parent alive
})

const enabledSkills = computed(() => skillsStore.skills.map(s => s.id))
const enabledSkillObjects = computed(() => skillsStore.allSkillObjects)
const debugModelId = computed(() => {
  const c = configStore.config
  if (c.activeModel === 'opus')  return c.opusModel  || '(unset)'
  if (c.activeModel === 'haiku') return c.haikuModel || '(unset)'
  return c.sonnetModel || '(unset)'
})

// Visible messages: show last N messages, but always include the final user+assistant pair
const visibleMessages = computed(() => {
  const all = chatsStore.activeChat?.messages ?? []
  if (all.length <= visibleLimit.value) return all
  return all.slice(all.length - visibleLimit.value)
})
const hasHiddenMessages = computed(() => {
  const all = chatsStore.activeChat?.messages ?? []
  return all.length > visibleLimit.value
})
function loadMoreMessages() {
  visibleLimit.value += 25
}

function dbg(msg, level = 'info', chatId = null) {
  const cid = chatId || chatsStore.activeChatId
  if (!cid) return
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (!perChatDebugLogs.has(cid)) perChatDebugLogs.set(cid, [])
  perChatDebugLogs.get(cid).push({ time, msg, level })
  // Also mirror to DevTools console for Electron debugging
  const consoleFn = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log
  consoleFn(`[sparkai:${level}] ${msg}`)
}

// ── Rename ───────────────────────────────────────────────────────────────────
function startRename(chat) {
  editingChatId.value = chat.id
  editingTitle.value = chat.title
  showRenameModal.value = true
  nextTick(() => renameInput.value?.focus())
}

async function confirmRename() {
  if (editingChatId.value && editingTitle.value.trim()) {
    await chatsStore.renameChat(editingChatId.value, editingTitle.value.trim())
  }
  showRenameModal.value = false
  editingChatId.value = null
}

function cancelRename() {
  showRenameModal.value = false
  editingChatId.value = null
}

function onRenameKeydown(e) {
  // Ignore Enter during IME composition (e.g. Chinese input)
  if (e.isComposing || renameComposing.value) return
  confirmRename()
}

// ── Chat Management ──────────────────────────────────────────────────────────
async function newChat() {
  await chatsStore.createChat()
  nextTick(() => inputEl.value?.focus())
}

async function deleteChat(id) {
  await chatsStore.removeChat(id)
}

// ── Persona chip popovers ───────────────────────────────────────────────
const showSysPopover = ref(false)
const showUsrPopover = ref(false)
const sysChipWrap = ref(null)
const usrChipWrap = ref(null)

function togglePopover(type) {
  if (type === 'system') {
    showSysPopover.value = !showSysPopover.value
    showUsrPopover.value = false
  } else {
    showUsrPopover.value = !showUsrPopover.value
    showSysPopover.value = false
  }
}

function selectPersona(type, id) {
  if (chatsStore.activeChatId) chatsStore.setChatPersona(chatsStore.activeChatId, type, id)
  showSysPopover.value = false
  showUsrPopover.value = false
}

function getAvatarDataUriForPersona(persona) {
  if (!persona?.avatar) return null
  return getAvatarDataUri(persona.avatar)
}

const activeSystemPersona = computed(() => {
  const id = chatsStore.activeChat?.systemPersonaId
  return id ? personasStore.getPersonaById(id) : personasStore.defaultSystemPersona
})
const activeUserPersona = computed(() => {
  const id = chatsStore.activeChat?.userPersonaId
  return id ? personasStore.getPersonaById(id) : personasStore.defaultUserPersona
})
const activeSystemAvatarDataUri = computed(() => getAvatarDataUriForPersona(activeSystemPersona.value))
const activeUserAvatarDataUri = computed(() => getAvatarDataUriForPersona(activeUserPersona.value))
const activeSystemPersonaName = computed(() => activeSystemPersona.value?.name || 'Default')
const activeUserPersonaName = computed(() => activeUserPersona.value?.name || 'Default')

// Resolved persona IDs (for popover selection highlight)
const resolvedSystemPersonaId = computed(() => {
  const id = chatsStore.activeChat?.systemPersonaId
  return id || personasStore.defaultSystemPersona?.id || null
})
const resolvedUserPersonaId = computed(() => {
  const id = chatsStore.activeChat?.userPersonaId
  return id || personasStore.defaultUserPersona?.id || null
})

// Sorted persona lists (default first)
const sortedSystemPersonas = computed(() =>
  [...personasStore.systemPersonas].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)
const sortedUserPersonas = computed(() =>
  [...personasStore.userPersonas].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)

// ── Provider / Model chip popovers ────────────────────────────────────────
const showProviderPopover = ref(false)
const showModelPopover = ref(false)
const providerChipWrap = ref(null)
const modelChipWrap = ref(null)
const openRouterModels = ref([])
const openRouterModelsLoading = ref(false)
const openRouterModelsCached = ref(false)
const chatModelFilter = ref('')

// OpenAI models
const openaiProviderModels = ref([])
const openaiProviderModelsLoading = ref(false)
const openaiProviderModelsCached = ref(false)

const filteredChatOpenRouterModels = computed(() => {
  const q = chatModelFilter.value.trim().toLowerCase()
  if (!q) return openRouterModels.value
  return openRouterModels.value.filter(m =>
    m.name.toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
  )
})

const filteredChatOpenAIModels = computed(() => {
  const q = chatModelFilter.value.trim().toLowerCase()
  if (!q) return openaiProviderModels.value
  return openaiProviderModels.value.filter(m =>
    (m.name || '').toLowerCase().includes(q) || m.id.toLowerCase().includes(q)
  )
})

const effectiveProvider = computed(() => {
  const chatProvider = chatsStore.activeChat?.provider
  if (chatProvider) return chatProvider
  return configStore.config.defaultProvider || 'anthropic'
})

const anthropicModelChoices = computed(() => {
  const c = configStore.config
  return [
    { id: c.sonnetModel || 'claude-sonnet-4-5', label: 'Sonnet' },
    { id: c.opusModel || 'claude-opus-4-6', label: 'Opus' },
    { id: c.haikuModel || 'claude-haiku-4-5', label: 'Haiku' },
  ]
})

const defaultModelLabel = computed(() => {
  const c = configStore.config
  if (c.activeModel === 'opus') return c.opusModel || 'claude-opus-4-6'
  if (c.activeModel === 'haiku') return c.haikuModel || 'claude-haiku-4-5'
  return c.sonnetModel || 'claude-sonnet-4-5'
})

const effectiveModelLabel = computed(() => {
  const model = chatsStore.activeChat?.model
  if (!model) return 'Default'
  // Try to find a friendly name from OpenRouter models cache
  const orMatch = openRouterModels.value.find(m => m.id === model)
  if (orMatch) return orMatch.name
  // Try OpenAI models cache
  const openaiMatch = openaiProviderModels.value.find(m => m.id === model)
  if (openaiMatch) return openaiMatch.name || openaiMatch.id
  // Try Anthropic model choices
  const anMatch = anthropicModelChoices.value.find(m => m.id === model)
  if (anMatch) return anMatch.label
  // Shorten the model ID for display
  return model.length > 30 ? '…' + model.slice(-28) : model
})

function toggleProviderPopover() {
  showProviderPopover.value = !showProviderPopover.value
  showModelPopover.value = false
  showSysPopover.value = false
  showUsrPopover.value = false
}

function toggleModelPopover() {
  showModelPopover.value = !showModelPopover.value
  showProviderPopover.value = false
  showSysPopover.value = false
  showUsrPopover.value = false
  chatModelFilter.value = ''
  // Fetch models if needed
  if (showModelPopover.value && effectiveProvider.value === 'openrouter' && !openRouterModelsCached.value) {
    fetchOpenRouterModels()
  }
  if (showModelPopover.value && effectiveProvider.value === 'openai' && !openaiProviderModelsCached.value) {
    fetchOpenAIProviderModels()
  }
}

function selectProvider(provider) {
  if (chatsStore.activeChatId) {
    chatsStore.setChatProvider(chatsStore.activeChatId, provider)
    // Clear per-chat model when switching providers
    chatsStore.setChatModel(chatsStore.activeChatId, null)
  }
  showProviderPopover.value = false
}

function selectModel(model) {
  if (chatsStore.activeChatId) {
    chatsStore.setChatModel(chatsStore.activeChatId, model)
  }
  showModelPopover.value = false
}

async function fetchOpenRouterModels() {
  if (!window.electronAPI?.fetchOpenRouterModels) return
  openRouterModelsLoading.value = true
  try {
    const result = await window.electronAPI.fetchOpenRouterModels({
      apiKey: configStore.config.openrouterApiKey,
      baseURL: configStore.config.openrouterBaseURL
    })
    if (result.success) {
      openRouterModels.value = result.models
      openRouterModelsCached.value = true
    }
  } catch (err) {
    console.error('Failed to fetch OpenRouter models:', err)
  } finally {
    openRouterModelsLoading.value = false
  }
}

async function fetchOpenAIProviderModels() {
  if (!window.electronAPI?.fetchOpenAIModels) return
  openaiProviderModelsLoading.value = true
  try {
    const result = await window.electronAPI.fetchOpenAIModels({
      apiKey: configStore.config.openaiApiKey,
      baseURL: configStore.config.openaiBaseURL
    })
    if (result.success) {
      openaiProviderModels.value = result.models
      openaiProviderModelsCached.value = true
    }
  } catch (err) {
    console.error('Failed to fetch OpenAI models:', err)
  } finally {
    openaiProviderModelsLoading.value = false
  }
}

// Close popovers on outside click
function handlePopoverOutsideClick(e) {
  if (sysChipWrap.value && !sysChipWrap.value.contains(e.target)) showSysPopover.value = false
  if (usrChipWrap.value && !usrChipWrap.value.contains(e.target)) showUsrPopover.value = false
  if (providerChipWrap.value && !providerChipWrap.value.contains(e.target)) showProviderPopover.value = false
  if (modelChipWrap.value && !modelChipWrap.value.contains(e.target)) showModelPopover.value = false
}



// ── Input ─────────────────────────────────────────────────────────────────────
function autoResize(e) {
  const el = e.target
  el.style.height = 'auto'
  el.style.height = Math.min(el.scrollHeight, 200) + 'px'
}

// ── Attachments / Drag-and-Drop ──────────────────────────────────────────────
// NOTE: On WSL2, native file DnD from Windows Explorer does NOT work because
// WSLg doesn't bridge OLE/COM file drops to Wayland. Use: (1) attach button /
// Ctrl+Shift+A, (2) paste file paths (Ctrl+V), (3) Linux file manager drag.
function onDragEnter(e) {
  isDragOver.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
  const dt = e.dataTransfer
  if (dt) {
    dbg(`DragEnter: types=[${Array.from(dt.types || []).join(', ')}] files=${dt.files?.length ?? 0}`, 'info')
  }
}
function onDragOver(e) {
  isDragOver.value = true
  if (e.dataTransfer) e.dataTransfer.dropEffect = 'copy'
}
function onDragLeave(e) {
  // Only leave if we actually left the container (not a child)
  const rect = e.currentTarget.getBoundingClientRect()
  if (e.clientX <= rect.left || e.clientX >= rect.right || e.clientY <= rect.top || e.clientY >= rect.bottom) {
    isDragOver.value = false
  }
}

/**
 * Extract file paths from a drop event using multiple strategies.
 * WSLg doesn't reliably bridge Windows Explorer DnD, so we try:
 * 1. dataTransfer.files[].path (Electron native — works for Linux files)
 * 2. text/uri-list (may contain file:///C:/... URIs from Windows)
 * 3. text/plain (may contain raw Windows paths)
 */
function extractDropPaths(e) {
  const paths = []
  const dt = e.dataTransfer

  // Strategy 1: Electron file.path (works for native Linux drops)
  if (dt?.files) {
    for (const file of dt.files) {
      if (file.path) paths.push(file.path)
    }
  }

  // Strategy 2: text/uri-list (Windows file URIs via WSLg)
  if (paths.length === 0) {
    try {
      const uriList = dt?.getData('text/uri-list') || ''
      for (const line of uriList.split(/[\r\n]+/)) {
        const trimmed = line.trim()
        if (!trimmed || trimmed.startsWith('#')) continue
        if (trimmed.startsWith('file://')) {
          paths.push(trimmed)  // main process handles file:// URI conversion
        }
      }
    } catch {}
  }

  // Strategy 3: text/plain (raw Windows paths like C:\Users\...)
  if (paths.length === 0) {
    try {
      const plain = dt?.getData('text/plain') || dt?.getData('text') || ''
      for (const line of plain.split(/[\r\n]+/)) {
        const trimmed = line.trim()
        if (!trimmed) continue
        // Looks like a Windows path (drive letter) or Linux absolute path
        if (/^[A-Za-z]:[/\\]/.test(trimmed) || trimmed.startsWith('/')) {
          paths.push(trimmed)
        }
      }
    } catch {}
  }

  return paths
}

async function onDrop(e) {
  isDragOver.value = false
  if (!window.electronAPI?.resolveDropPaths) return

  // Debug: log everything in the dataTransfer
  const dt = e.dataTransfer
  const types = dt ? Array.from(dt.types || []) : []
  const fileCount = dt?.files?.length ?? 0
  const filePaths = dt?.files ? Array.from(dt.files).map(f => f.path || '(empty)') : []
  dbg(`Drop event: types=[${types.join(', ')}] files=${fileCount} paths=[${filePaths.join(', ')}]`)
  for (const t of types) {
    try {
      const val = dt.getData(t)
      if (val) dbg(`  dataTransfer["${t}"] = ${val.slice(0, 120)}`, 'chunk')
    } catch {}
  }

  const rawPaths = extractDropPaths(e)
  dbg(`Drop: ${rawPaths.length} path(s) extracted: ${rawPaths.map(p => p.slice(0, 60)).join(', ')}`)

  if (rawPaths.length === 0) {
    dbg('Drop: no file paths found in dataTransfer. On WSL2, drag-and-drop from Windows Explorer is not supported by WSLg. Use the attach button (paperclip) or paste file paths instead.', 'warn')
    return
  }

  try {
    // Send all paths to main process for WSL path conversion + reading
    const results = await window.electronAPI.resolveDropPaths(rawPaths)
    if (results && results.length > 0) {
      attachments.value.push(...results)
    }
  } catch (err) {
    dbg(`Drop resolve error: ${err.message}`, 'error')
  }
}

/**
 * Handle paste events on the input — detect pasted file paths and
 * offer to attach them instead of inserting as text.
 */
async function onPaste(e) {
  if (!window.electronAPI?.resolveDropPaths) return

  const pasted = e.clipboardData?.getData('text/plain') || ''
  const lines = pasted.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)

  // Check if ALL pasted lines look like file paths
  const pathLines = lines.filter(l =>
    /^[A-Za-z]:[/\\]/.test(l) ||           // Windows: C:\foo or C:/foo
    l.startsWith('/') ||                     // Linux: /home/...
    l.startsWith('file://') ||               // URI: file:///C:/...
    l.startsWith('\\\\')                     // UNC: \\server\share
  )

  // Only treat as file paths if every line matches and there's at least one
  if (pathLines.length > 0 && pathLines.length === lines.length) {
    e.preventDefault()  // Don't paste as text
    dbg(`Paste: ${pathLines.length} path(s) detected, attaching...`)
    try {
      const results = await window.electronAPI.resolveDropPaths(pathLines)
      if (results && results.length > 0) {
        attachments.value.push(...results)
      }
    } catch (err) {
      dbg(`Paste attach error: ${err.message}`, 'error')
    }
  }
  // Otherwise let the default paste behavior handle it (insert text)
}

async function pickFiles() {
  if (!window.electronAPI?.pickFiles) return
  try {
    const results = await window.electronAPI.pickFiles()
    if (results && results.length > 0) {
      attachments.value.push(...results)
    }
  } catch (err) {
    dbg(`pickFiles error: ${err.message}`, 'error')
  }
}

function removeAttachment(id) {
  attachments.value = attachments.value.filter(a => a.id !== id)
}

function removeFromQueue(idx) {
  const cid = chatsStore.activeChatId
  if (!cid) return
  const queue = perChatQueue.get(cid)
  if (queue) {
    queue.splice(idx, 1)
    if (queue.length === 0) perChatQueue.delete(cid)
  }
}

function scrollToBottom (force = false, forChatId = null) {
  // If called for a specific chat, only scroll if that chat is currently visible
  if (forChatId && forChatId !== chatsStore.activeChatId) return
  if (!force && userScrolled.value) return   // user scrolled up — don't force scroll
  programmaticScrollCount++
  // Double nextTick: first waits for Vue reactivity, second waits for DOM render
  nextTick(() => {
    nextTick(() => {
      if (messagesEl.value) {
        messagesEl.value.scrollTop = messagesEl.value.scrollHeight
      }
      // Decrement after the browser processes the scroll event
      requestAnimationFrame(() => { programmaticScrollCount = Math.max(0, programmaticScrollCount - 1) })
    })
  })
}

// Detect manual scroll: if user scrolls up during streaming, pause auto-scroll.
// Ignores scroll events triggered programmatically by scrollToBottom.
function onMessagesScroll () {
  if (programmaticScrollCount > 0) return
  const el = messagesEl.value
  if (!el) return
  const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight
  // If more than 60px from bottom, user scrolled up intentionally
  userScrolled.value = distFromBottom > 60
}

async function copyMessage(msg) {
  try {
    let text = msg.content || ''
    if (msg.segments && msg.segments.length > 0) {
      text = msg.segments.filter(s => s.type === 'text').map(s => s.content).join('\n\n').trim()
    }
    await navigator.clipboard.writeText(text)
    copiedId.value = msg.id
    setTimeout(() => { copiedId.value = null }, 2000)
  } catch (e) {
    console.error('Copy failed', e)
  }
}

function quoteMessage(msg) {
  const content = msg.content || ''
  quotedMessage.value = { role: msg.role, content }
  nextTick(() => inputEl.value?.focus())
}

function clearQuote() {
  quotedMessage.value = null
}

function formatTime(ts) {
  if (!ts) return ''
  return new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
}

function formatTokenCount(n) {
  if (!n || n === 0) return '0'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

// ── Send / Agent Loop ─────────────────────────────────────────────────────────
let chunkUnsubscribe = null
const perChatStreamingMsgId = new Map()    // chatId → string
const perChatStreamingSegments = new Map() // chatId → segment[]
const streamingSeconds = ref(0)
let streamingTimer = null

// Helper: get or create last text segment for a chat
function lastTextSeg(chatId) {
  const segments = perChatStreamingSegments.get(chatId) || []
  if (segments.length > 0 && segments[segments.length - 1].type === 'text') {
    return segments[segments.length - 1]
  }
  const seg = { type: 'text', content: '' }
  segments.push(seg)
  perChatStreamingSegments.set(chatId, segments)
  return seg
}

// Helper: find last tool segment (waiting for result) for a chat
function lastToolSeg(chatId) {
  const segments = perChatStreamingSegments.get(chatId) || []
  for (let i = segments.length - 1; i >= 0; i--) {
    if (segments[i].type === 'tool') return segments[i]
  }
  return null
}

// Helper: push segments to the live streaming message for a chat
function flushSegments(chatId) {
  const chat = chatsStore.chats.find(c => c.id === chatId)
  if (!chat) return
  const msgId = perChatStreamingMsgId.get(chatId)
  const segments = perChatStreamingSegments.get(chatId) || []
  const msg = chat.messages.find(m => m.id === msgId)
  if (!msg) return
  msg.segments = segments.map(s => ({ ...s }))
  msg.content = segments.filter(s => s.type === 'text').map(s => s.content).join('')
  msg.streaming = true
}

function handleChunk(cId, chunk) {
  const targetChat = chatsStore.chats.find(c => c.id === cId)
  if (!targetChat) return

  if (chunk.type === 'text') {
    targetChat.isThinking = false
    lastTextSeg(cId).content += chunk.text
    flushSegments(cId)
    scrollToBottom(false, cId)
  } else if (chunk.type === 'tool_call') {
    dbg(`tool_call: ${chunk.name} input=${JSON.stringify(chunk.input).slice(0,80)}`, 'warn')
    const segments = perChatStreamingSegments.get(cId) || []
    segments.push({ type: 'tool', name: chunk.name, input: chunk.input ?? {}, output: undefined })
    perChatStreamingSegments.set(cId, segments)
    flushSegments(cId)
    scrollToBottom(false, cId)
  } else if (chunk.type === 'tool_result') {
    dbg(`tool_result: ${chunk.name} result=${JSON.stringify(chunk.result).slice(0,80)}`, 'warn')
    const toolSeg = lastToolSeg(cId)
    if (toolSeg) {
      toolSeg.output = typeof chunk.result === 'string' ? chunk.result : JSON.stringify(chunk.result, null, 2)
      // Images — push a single inline image segment (deduplicated)
      if (chunk.images && chunk.images.length > 0) {
        // Deduplicate images by size+type (same base64 length + mimeType = same image)
        const seen = new Set()
        const unique = chunk.images.filter(img => {
          const key = img.url || `${img.mimeType}:${(img.data || '').length}`
          if (seen.has(key)) return false
          seen.add(key)
          return true
        })
        if (unique.length > 0) {
          const imgSegments = perChatStreamingSegments.get(cId) || []
          imgSegments.push({ type: 'image', images: unique, source: chunk.name })
          perChatStreamingSegments.set(cId, imgSegments)
        }
      }
    }
    flushSegments(cId)
    scrollToBottom(false, cId)
  } else if (chunk.type === 'context_update') {
    if (chunk.metrics) {
      targetChat.contextMetrics = { ...chunk.metrics }
    }
    dbg(`context: ${chunk.metrics?.percentage ?? 0}% used (${chunk.metrics?.inputTokens ?? 0} in / ${chunk.metrics?.outputTokens ?? 0} out) compactions=${chunk.metrics?.compactionCount ?? 0}`, 'info')
  } else if (chunk.type === 'thinking_start') {
    targetChat.isThinking = true
    dbg('thinking started…', 'info')
  } else if (chunk.type === 'thinking') {
    dbg(`thinking: ${chunk.text?.slice(0,60) ?? ''}…`, 'chunk')
  } else if (chunk.type === 'compaction') {
    dbg(`compaction: ${chunk.message || 'context compacted'}`, 'warn')
  } else if (chunk.type === 'subagent_progress') {
    dbg(`subagent: ${chunk.agent || 'unknown'} — ${chunk.status || JSON.stringify(chunk).slice(0,60)}`, 'info')
  }
}

async function sendMessage() {
  const rawText = inputText.value.trim()
  const hasAttachments = attachments.value.length > 0
  dbg(`sendMessage called: text="${rawText.slice(0,30)}" attachments=${attachments.value.length} isRunning=${activeRunning.value} activeChatId=${chatsStore.activeChatId}`)
  if (!rawText && !hasAttachments) {
    dbg('sendMessage early return: nothing to send', 'warn')
    return
  }

  // Prepend quoted message if present
  let text = rawText
  const pendingQuote = quotedMessage.value
  if (pendingQuote) {
    const quotedRole = pendingQuote.role === 'user' ? 'You' : 'Assistant'
    text = `> **${quotedRole}:** ${pendingQuote.content.slice(0, 500)}${pendingQuote.content.length > 500 ? '...' : ''}\n\n${rawText}`
    quotedMessage.value = null
  }

  // Queue the prompt if THIS chat's agent is already running — it will be picked up after completion
  const cid = chatsStore.activeChatId
  const thisChat = chatsStore.chats.find(c => c.id === cid)
  if (thisChat?.isRunning) {
    if (!cid) return
    if (!perChatQueue.has(cid)) perChatQueue.set(cid, [])
    perChatQueue.get(cid).push({ text, attachments: [...attachments.value] })
    inputText.value = ''
    attachments.value = []
    if (inputEl.value) inputEl.value.style.height = 'auto'
    // Resume auto-scroll: user sent a new prompt, so re-engage scrolling for the current stream
    userScrolled.value = false
    scrollToBottom(true, cid)
    dbg(`Prompt queued (#${perChatQueue.get(cid).length}): "${text.slice(0,30)}…"`, 'info')
    return
  }

  const chatId = chatsStore.activeChatId
  if (!chatId) {
    dbg('sendMessage early return: no activeChatId', 'error')
    return
  }

  // Guard: agent loop only works in Electron
  if (!window.electronAPI?.runAgent) {
    dbg('ERROR: window.electronAPI is not available — running in browser, not Electron', 'error')
    await chatsStore.addMessage(chatId, { role: 'user', content: text })
    await chatsStore.addMessage(chatId, {
      role: 'assistant',
      content: 'Agent loop is not available in browser mode. Please open the app via `npm run dev` in WSL and use the Electron window (not localhost:5173 in a browser).'
    })
    scrollToBottom()
    return
  }

  // Capture and clear attachments before resetting UI
  const pendingAttachments = [...attachments.value]
  attachments.value = []
  inputText.value = ''
  if (inputEl.value) {
    inputEl.value.style.height = 'auto'
  }

  try {
  // Reset scroll-lock for this new answer
  userScrolled.value = false

  // Build display content — append [Attached: name] labels for text-based display
  let displayContent = text
  if (pendingAttachments.length > 0) {
    const labels = pendingAttachments.map(a => `[Attached: ${a.name}]`).join(' ')
    displayContent = displayContent ? `${displayContent}\n${labels}` : labels
  }

  // Store attachment metadata (without heavy base64 data) on the user message for display
  const attachmentMeta = pendingAttachments.map(a => ({
    id: a.id, name: a.name, type: a.type, path: a.path, size: a.size, preview: a.preview, mediaType: a.mediaType
  }))

  // Guard: suppress onMessagesScroll from re-setting userScrolled while we add messages.
  // Adding messages changes scrollHeight without scrollTop, which fires a scroll event
  // that would otherwise re-enable the scroll lock before scrollToBottom runs.
  programmaticScrollCount++

  // Add user message
  dbg('adding user message…')
  await chatsStore.addMessage(chatId, {
    role: 'user',
    content: displayContent,
    ...(attachmentMeta.length > 0 ? { attachments: attachmentMeta } : {})
  })

  // Clear any stale streaming flags from previous runs that didn't finish cleanly
  const currentChat = chatsStore.chats.find(c => c.id === chatId)
  if (currentChat) {
    for (const m of currentChat.messages) {
      if (m.streaming) m.streaming = false
    }
  }

  // Add streaming assistant placeholder
  const streamingMsgId = uuidv4()
  perChatStreamingMsgId.set(chatId, streamingMsgId)
  // Start streaming timer
  streamingSeconds.value = 0
  streamingTimer = setInterval(() => { streamingSeconds.value++ }, 1000)
  perChatStreamingSegments.set(chatId, [])
  dbg('adding streaming placeholder…')
  await chatsStore.addMessage(chatId, {
    id: streamingMsgId,
    role: 'assistant',
    content: '',
    streaming: true,
    streamingStartedAt: Date.now()
  })

  // Release the guard and force-scroll to show the new messages
  programmaticScrollCount = Math.max(0, programmaticScrollCount - 1)
  scrollToBottom(true)

  // Mark THIS chat as running (per-chat state, not global)
  const targetChat = chatsStore.chats.find(c => c.id === chatId)
  if (!targetChat) throw new Error('targetChat is null after addMessage')
  targetChat.isRunning = true

  // Build messages for API (only user/assistant, no tool indicators)
  dbg(`targetChat=${targetChat.id} messages=${targetChat.messages?.length ?? 'N/A'}`)

  const apiMessages = targetChat.messages
    .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming && m.content))
    .map(m => ({ role: m.role, content: m.content }))

  const cfg = { ...configStore.config }
  // Resolve per-chat provider/model overrides
  const chatProvider = targetChat.provider || cfg.defaultProvider || 'anthropic'
  if (chatProvider === 'openrouter') {
    cfg.apiKey = cfg.openrouterApiKey
    cfg.baseURL = cfg.openrouterBaseURL
  } else if (chatProvider === 'openai') {
    cfg.openaiApiKey = cfg.openaiApiKey || ''
    cfg.openaiBaseURL = cfg.openaiBaseURL || 'https://mlaas.virtuosgames.com'
    cfg._resolvedProvider = 'openai'
    cfg.defaultProvider = 'openai'
  }
  if (targetChat.model) {
    cfg.customModel = targetChat.model
  }
  dbg(`runAgent → chatId=${chatId} provider=${chatProvider} model=${targetChat.model || cfg.activeModel} msgs=${apiMessages.length} skills=[${enabledSkills.value.join(',')||'none'}]`)
  dbg(`config → baseURL=${cfg.baseURL} apiKey=${cfg.apiKey ? cfg.apiKey.slice(0,8)+'…' : '(empty)'} sonnet=${cfg.sonnetModel}`)

  // Chunks are handled by the persistent handleChunk listener registered in onMounted

  try {
    // Resolve persona prompts for this chat
    const resolvedPersonaPrompts = {}
    const sysPersonaId = targetChat.systemPersonaId
    const usrPersonaId = targetChat.userPersonaId
    const sysPersona = sysPersonaId
      ? personasStore.getPersonaById(sysPersonaId)
      : personasStore.defaultSystemPersona
    const usrPersona = usrPersonaId
      ? personasStore.getPersonaById(usrPersonaId)
      : personasStore.defaultUserPersona
    if (sysPersona?.prompt) resolvedPersonaPrompts.systemPersonaPrompt = sysPersona.prompt
    if (usrPersona?.prompt) resolvedPersonaPrompts.userPersonaPrompt = usrPersona.prompt

    dbg('Invoking window.electronAPI.runAgent…')
    const res = await window.electronAPI.runAgent({
      chatId,
      messages: JSON.parse(JSON.stringify(apiMessages)),
      config: JSON.parse(JSON.stringify(cfg)),
      enabledAgents: [],
      enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value)),
      ...(pendingAttachments.length > 0 ? { currentAttachments: JSON.parse(JSON.stringify(pendingAttachments)) } : {}),
      personaPrompts: resolvedPersonaPrompts,
      mcpServers: JSON.parse(JSON.stringify(mcpStore.servers)),
      httpTools: JSON.parse(JSON.stringify(enabledHttpTools.value)),
    })

    dbg(`runAgent returned → success=${res.success} resultLen=${res.result?.length ?? 0} error=${res.error ?? 'none'}`, res.success ? 'success' : 'error')

    // Finalize streaming message
    const finalSegments = perChatStreamingSegments.get(chatId) || []
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (chat) {
      const msg = chat.messages.find(m => m.id === streamingMsgId)
      if (msg) {
        if (res.success) {
          msg.segments = finalSegments.map(s => ({ ...s }))
          msg.content = finalSegments.filter(s => s.type === 'text').map(s => s.content).join('')
          if (!msg.content && res.result) {
            msg.segments = [{ type: 'text', content: res.result }]
            msg.content = res.result
          }
        } else {
          msg.segments = [{ type: 'text', content: `Error: ${res.error}` }]
          msg.content = `Error: ${res.error}`
        }
        msg.streaming = false
        if (streamingTimer) { clearInterval(streamingTimer); streamingTimer = null; streamingSeconds.value = 0 }
        if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
      }
    }
    await chatsStore.persist?.()
    scrollToBottom()
  } catch (err) {
    dbg(`EXCEPTION in runAgent: ${err.message}`, 'error')
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (chat) {
      const msg = chat.messages.find(m => m.id === streamingMsgId)
      if (msg) {
        msg.content = `Error: ${err.message}`
        msg.streaming = false
        if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
      }
    }
  } finally {
    dbg('Agent loop done. isRunning → false')
    targetChat.isRunning = false
    targetChat.isThinking = false
    perChatStreamingMsgId.delete(chatId)
    perChatStreamingSegments.delete(chatId)

    // Auto-save context snapshot for this chat
    if (window.electronAPI?.getContextSnapshot) {
      try {
        const snap = await window.electronAPI.getContextSnapshot(chatId)
        if (snap) perChatSnapshots.set(chatId, snap)
      } catch {}
    }

    // Pick up next queued prompt for this chat if any
    const queue = perChatQueue.get(chatId)
    if (queue && queue.length > 0) {
      const queued = queue.shift()
      if (queue.length === 0) perChatQueue.delete(chatId)
      dbg(`Picking up queued prompt (#${(queue?.length ?? 0) + 1} remaining): "${queued.text.slice(0,30)}…"`, 'info')
      // Reset scroll-lock so the new round auto-scrolls
      userScrolled.value = false
      inputText.value = queued.text
      attachments.value = queued.attachments || []
      await nextTick()
      sendMessage()
    }
  }
  } catch (outerErr) {
    // Catch errors from addMessage, activeChat access, etc.
    dbg(`OUTER EXCEPTION: ${outerErr.message}\n${outerErr.stack?.split('\n').slice(0,3).join(' | ')}`, 'error')
    // Clear running state on the target chat
    const errChat = chatsStore.chats.find(c => c.id === chatId)
    if (errChat) {
      errChat.isRunning = false
      errChat.isThinking = false
    }
    // Clear streaming flag on the message so the indicator stops
    const outerMsgId = perChatStreamingMsgId.get(chatId)
    if (outerMsgId) {
      if (errChat) {
        const msg = errChat.messages.find(m => m.id === outerMsgId)
        if (msg) {
          msg.streaming = false
          if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
        }
      }
    }
    perChatStreamingMsgId.delete(chatId)
    perChatStreamingSegments.delete(chatId)
  }
}

async function stopAgent() {
  const chatId = chatsStore.activeChatId
  if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(chatId)
  // Clear state on the active chat's running loop
  const runningChat = chatsStore.chats.find(c => c.id === chatId && c.isRunning)
  if (runningChat) {
    runningChat.isRunning = false
    runningChat.isThinking = false
    for (const msg of runningChat.messages) {
      if (msg.streaming) msg.streaming = false
    }
  }
}

async function compactContext() {
  const chatId = chatsStore.activeChatId
  if (!chatId) return

  // If agent is running, set the flag for next iteration (existing behavior)
  if (activeRunning.value) {
    if (window.electronAPI?.compactContext) {
      dbg('Requesting in-loop compaction…', 'info')
      await window.electronAPI.compactContext(chatId)
    }
    return
  }

  // Standalone compaction when not running
  if (!window.electronAPI?.compactContextStandalone) return

  isCompacting.value = true
  dbg('Starting standalone compaction…', 'info')

  try {
    const targetChat = chatsStore.chats.find(c => c.id === chatId)
    if (!targetChat) return

    const apiMessages = targetChat.messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming && m.content))
      .map(m => ({ role: m.role, content: m.content }))

    const cfg = { ...configStore.config }
    const res = await window.electronAPI.compactContextStandalone({
      chatId,
      messages: JSON.parse(JSON.stringify(apiMessages)),
      config: JSON.parse(JSON.stringify(cfg)),
      enabledAgents: [],
      enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value))
    })

    if (res.success) {
      dbg(`Compaction done — input tokens: ${res.metrics?.inputTokens?.toLocaleString() ?? '?'}`, 'success')

      // Update context metrics on the chat
      if (res.metrics) targetChat.contextMetrics = { ...res.metrics }

      // Add the compaction exchange to the chat so the model's summary is preserved
      await chatsStore.addMessage(chatId, {
        role: 'user',
        content: '[Context compaction requested]',
        compaction: true
      })
      await chatsStore.addMessage(chatId, {
        role: 'assistant',
        content: res.assistantContent || '[Context compacted]',
        compaction: true
      })
      scrollToBottom()
    } else {
      dbg(`Compaction failed: ${res.error}`, 'error')
    }
  } catch (err) {
    dbg(`Compaction error: ${err.message}`, 'error')
  } finally {
    isCompacting.value = false
  }
}

function inspectContext() {
  // Only uses the per-chat cached snapshot (populated by auto-save after each run)
  Object.keys(expandedMessages).forEach(k => delete expandedMessages[k])
  showContextInspector.value = true
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(() => chatsStore.activeChatId, () => {
  userScrolled.value = false
  visibleLimit.value = 25
  showContextInspector.value = false
  quotedMessage.value = null

  // clear activity strip for new chat
  scrollToBottom(true)
  nextTick(() => {
    inputEl.value?.focus()
  })
})

// ── Document-level drag/drop prevention ──────────────────────────────────────
// Without these, Electron/Chromium navigates to dropped files instead of firing
// the HTML5 drop event. These must be on `document`, not just on Vue elements.
// Ctrl+Shift+A keyboard shortcut for file picker
function handleGlobalKeydown(e) {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    e.preventDefault()
    pickFiles()
  }
}

function preventNav(e) {
  e.preventDefault()
  // Signal that we accept drops (shows copy cursor instead of no-drop)
  if (e.type === 'dragover' && e.dataTransfer) {
    e.dataTransfer.dropEffect = 'copy'
  }
}

// Handle file drops intercepted by Electron's will-navigate (main process sends
// the file:// URL back to us via IPC when the normal DnD pathway is blocked).
let fileDropUnsubscribe = null

async function handleInterceptedFileDrop(url) {
  if (!window.electronAPI?.resolveDropPaths) return
  dbg(`Intercepted file drop from main process: ${url}`)
  try {
    const results = await window.electronAPI.resolveDropPaths([url])
    if (results && results.length > 0) {
      attachments.value.push(...results)
    }
  } catch (err) {
    dbg(`Intercepted drop error: ${err.message}`, 'error')
  }
}

onMounted(async () => {
  personasStore.loadPersonas()
  await toolsStore.loadTools()
  // Default: enable all tools
  if (toolsStore.tools.length > 0 && chatEnabledToolIds.value.size === 0) {
    chatEnabledToolIds.value = new Set(toolsStore.tools.map(t => t.id))
  }
  scrollToBottom()
  nextTick(() => inputEl.value?.focus())
  document.addEventListener('click', handlePopoverOutsideClick)

  // Register persistent chunk listener for all concurrent agent loops
  if (window.electronAPI?.onAgentChunk) {
    chunkUnsubscribe = window.electronAPI.onAgentChunk(({ chatId: cId, chunk }) => {
      handleChunk(cId, chunk)
    })
  }

  // Prevent Electron from navigating when files are dropped anywhere on the page
  document.addEventListener('dragover', preventNav)
  document.addEventListener('drop', preventNav)

  // Ctrl+Shift+A shortcut to open file picker (fast alternative to drag-drop on WSL2)
  document.addEventListener('keydown', handleGlobalKeydown)

  // Listen for file drops intercepted by the main process (will-navigate handler)
  if (window.electronAPI?.onFileDropped) {
    fileDropUnsubscribe = window.electronAPI.onFileDropped(handleInterceptedFileDrop)
  }
})

onUnmounted(() => {
  if (chunkUnsubscribe) chunkUnsubscribe()

  document.removeEventListener('click', handlePopoverOutsideClick)
  document.removeEventListener('dragover', preventNav)
  document.removeEventListener('drop', preventNav)
  document.removeEventListener('keydown', handleGlobalKeydown)

  if (fileDropUnsubscribe) {
    fileDropUnsubscribe()
    fileDropUnsubscribe = null
  }
})
</script>

<style scoped>

/* ══════════════════════════════════════════════════════════════════════════
   CHATS PAGE — Glassmorphism Design (matching Skills & Personas pages)
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Page shell ─────────────────────────────────────────────────────────── */
.chats-page {
  background:
    radial-gradient(ellipse at 15% 10%, rgba(59, 130, 246, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 85% 20%, rgba(99, 102, 241, 0.06) 0%, transparent 45%),
    radial-gradient(ellipse at 50% 80%, rgba(16, 185, 129, 0.05) 0%, transparent 50%),
    #F8FAFC;
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.chat-sidebar {
  width: 240px;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background:
    linear-gradient(180deg, rgba(255, 255, 255, 0.85) 0%, rgba(248, 250, 252, 0.75) 100%);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-right: 1px solid rgba(226, 232, 240, 0.6);
}
.chat-sidebar-header {
  padding: 14px 16px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid rgba(226, 232, 240, 0.5);
}
.chat-sidebar-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #0F172A;
}
.chat-sidebar-new-btn {
  width: 34px;
  height: 34px;
  border-radius: 10px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: linear-gradient(135deg, #3B82F6, #6366F1);
  color: #fff;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(59, 130, 246, 0.25);
}
.chat-sidebar-new-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(59, 130, 246, 0.35);
}
.chat-sidebar-new-btn:active {
  transform: translateY(0);
}
.chat-sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px;
  scrollbar-width: thin;
}
.chat-sidebar-item {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  border: 1px solid transparent;
  margin-bottom: 2px;
}
.chat-sidebar-item:hover {
  background: rgba(241, 245, 249, 0.8);
}
.chat-sidebar-item.active {
  background: rgba(99, 102, 241, 0.08);
  border-color: rgba(99, 102, 241, 0.2);
}
.chat-sidebar-item-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  color: #1E293B;
}
.chat-sidebar-item.active .chat-sidebar-item-title {
  color: #6366F1;
  font-weight: 600;
}
.chat-sidebar-item-actions {
  display: flex;
  align-items: center;
  gap: 2px;
  opacity: 0;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.chat-sidebar-item:hover .chat-sidebar-item-actions {
  opacity: 1;
}
.chat-sidebar-action-btn {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #64748B;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.chat-sidebar-action-btn:hover {
  background: #F1F5F9;
  color: #3B82F6;
}
.chat-sidebar-action-btn.danger:hover {
  background: #FEE2E2;
  color: #DC2626;
}
/* ── Chat window ────────────────────────────────────────────────────────── */
.chat-window {
  background:
    radial-gradient(ellipse at 20% 15%, rgba(99, 102, 241, 0.05) 0%, transparent 50%),
    radial-gradient(ellipse at 80% 70%, rgba(59, 130, 246, 0.04) 0%, transparent 45%),
    #F8FAFC;
}

/* ── Chat header ────────────────────────────────────────────────────────── */
.chat-header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 12px 20px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.5);
  position: relative;
  z-index: 20;
}
.chat-header-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #0F172A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
}
.chat-header-btn {
  padding: 5px 12px;
  border-radius: 8px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #64748B;
  background: rgba(241, 245, 249, 0.8);
  border: 1px solid rgba(226, 232, 240, 0.6);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.chat-header-btn:hover {
  background: rgba(226, 232, 240, 0.9);
  color: #1E293B;
}
.chat-header-btn.active {
  background: rgba(99, 102, 241, 0.1);
  color: #6366F1;
  border-color: rgba(99, 102, 241, 0.3);
}

/* ── Context bar ────────────────────────────────────────────────────────── */
.chat-context-bar {
  flex-shrink: 0;
  padding: 6px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  background: rgba(255, 255, 255, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.4);
}

/* ── Messages area ──────────────────────────────────────────────────────── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 20px 24px;
  display: flex;
  flex-direction: column;
  gap: 16px;
  scrollbar-width: thin;
}

/* ── Empty state ────────────────────────────────────────────────────────── */
.chat-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 16px;
  text-align: center;
}
.chat-empty-icon {
  width: 64px;
  height: 64px;
  border-radius: 18px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #3B82F6, #6366F1);
  box-shadow: 0 8px 24px rgba(99, 102, 241, 0.25);
}
.chat-empty-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #0F172A;
  margin: 0;
}
.chat-empty-subtitle {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  color: #64748B;
  margin: 4px 0 0;
}

/* ── No selection state ─────────────────────────────────────────────────── */
.chat-no-selection {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

/* ── Message avatars ────────────────────────────────────────────────────── */
.msg-avatar-wrap {
  flex-shrink: 0;
  margin-top: 2px;
}
.msg-avatar-img {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.msg-avatar-fallback {
  width: 44px;
  height: 44px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.msg-avatar-fallback.system {
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
}
.msg-avatar-fallback.user {
  background: linear-gradient(135deg, #10B981, #059669);
}

/* ── Message bubbles ────────────────────────────────────────────────────── */
.msg-bubble {
  padding: 14px 18px;
  line-height: 1.65;
  border-radius: 18px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
}
.msg-bubble-user {
  background: linear-gradient(135deg, #3B82F6, #6366F1);
  color: #ffffff;
  border-bottom-right-radius: 6px;
}
.msg-bubble-assistant {
  background: #F1F5F9;
  border: 1px solid #E2E8F0;
  color: #1E293B;
  box-shadow:
    0 2px 6px rgba(15, 23, 42, 0.05),
    0 4px 12px rgba(15, 23, 42, 0.03);
  border-bottom-left-radius: 6px;
}

/* ── Input area ─────────────────────────────────────────────────────────── */
.chat-input-area {
  padding: 12px 20px 16px;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-top: 1px solid rgba(226, 232, 240, 0.5);
}
.chat-input-box {
  display: flex;
  gap: 8px;
  align-items: flex-end;
  border-radius: 16px;
  padding: 12px 16px;
  background: rgba(255, 255, 255, 0.85);
  border: 1.5px solid rgba(226, 232, 240, 0.6);
  box-shadow:
    0 2px 8px rgba(15, 23, 42, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.chat-input-box.has-quote {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-top: none;
}
.chat-input-box.focused {
  border-color: rgba(99, 102, 241, 0.5);
  box-shadow:
    0 0 0 3px rgba(99, 102, 241, 0.1),
    0 2px 8px rgba(15, 23, 42, 0.04);
}

/* ── Header sections ────────────────────────────────────────────────────── */
.header-section {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-section:first-of-type {
  margin-left: auto;
}
.header-divider {
  width: 1px;
  height: 24px;
  background: #E2E8F0;
  flex-shrink: 0;
}
.tools-section .tools-chip-btn {
  font-size: var(--fs-small, 12px);
}
.persona-section {
  gap: 6px;
}
.provider-section {
  gap: 6px;
}

/* ── Persona bar (shared wrapper) ───────────────────────────────────────── */
.persona-bar {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-left: auto;
  margin-right: 8px;
}

/* ── Persona chip ─────────────────────────────────────────────────────── */
.persona-chip-wrap {
  position: relative;
}
.persona-chip {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 12px 4px 4px;
  border-radius: 9999px;
  border: 1px solid rgba(226, 232, 240, 0.6);
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  cursor: pointer;
  transition: border-color 0.15s, box-shadow 0.15s, background 0.15s;
  font-family: 'Noto Sans', sans-serif;
}
.persona-chip:hover {
  border-color: #94A3B8;
  background: rgba(255, 255, 255, 0.9);
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.06);
}
.persona-chip.active {
  border-color: #6366F1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.15);
}
.persona-chip-avatar {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.persona-chip-avatar-img {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  object-fit: cover;
}
.persona-chip-avatar-default {
  width: 34px;
  height: 34px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.persona-chip-avatar-default.system {
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
}
.persona-chip-avatar-default.user {
  background: linear-gradient(135deg, #10B981, #059669);
}
.persona-chip-name {
  font-size: 13px;
  font-weight: 600;
  color: #1E293B;
  max-width: 220px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.persona-chip-arrow {
  width: 14px;
  height: 14px;
  color: #94A3B8;
  flex-shrink: 0;
}

/* ── Popover dropdown ─────────────────────────────────────────────────── */
.persona-popover {
  position: absolute;
  top: calc(100% + 6px);
  right: 0;
  min-width: 280px;
  max-height: 360px;
  overflow-y: auto;
  background: rgba(255, 255, 255, 0.92);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(226, 232, 240, 0.5);
  border-radius: 14px;
  box-shadow:
    0 12px 40px rgba(15, 23, 42, 0.12),
    0 4px 16px rgba(99, 102, 241, 0.06);
  z-index: 50;
  padding: 6px;
  scrollbar-width: thin;
}
.persona-popover-header {
  font-family: 'Noto Sans', sans-serif;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #94A3B8;
  padding: 8px 10px 4px;
}
.persona-popover-item {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 10px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: 'Noto Sans', sans-serif;
  font-size: 14px;
  font-weight: 500;
  color: #1E293B;
  transition: background 0.12s;
  text-align: left;
}
.persona-popover-item:hover {
  background: rgba(241, 245, 249, 0.8);
}
.persona-popover-item.selected {
  background: rgba(99, 102, 241, 0.08);
  color: #6366F1;
  font-weight: 600;
}
.persona-popover-avatar {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.persona-popover-avatar-wrap {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.persona-popover-avatar-fallback {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: #94A3B8;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 13px;
  font-weight: 700;
  color: #fff;
}

/* ── Popover item with description ─────────────────────────────────────── */
.persona-popover-item.has-description {
  align-items: flex-start;
  padding: 10px;
}
.persona-popover-item-text {
  display: flex;
  flex-direction: column;
  gap: 2px;
  min-width: 0;
}
.persona-popover-item-desc {
  font-size: 11px;
  font-weight: 400;
  color: #64748B;
  line-height: 1.4;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  text-overflow: ellipsis;
}
.persona-popover-item.selected .persona-popover-item-desc {
  color: #818CF8;
}

/* ── Persona hover tooltip ─────────────────────────────────────────────── */
.persona-tooltip {
  display: none;
  position: absolute;
  top: calc(100% + 8px);
  left: 50%;
  transform: translateX(-50%);
  min-width: 220px;
  max-width: 320px;
  padding: 10px 14px;
  background: rgba(15, 23, 42, 0.92);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 10px;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.2);
  z-index: 60;
  pointer-events: none;
  text-align: left;
}
.persona-tooltip::before {
  content: '';
  position: absolute;
  top: -5px;
  left: 50%;
  transform: translateX(-50%);
  border-left: 6px solid transparent;
  border-right: 6px solid transparent;
  border-bottom: 5px solid rgba(15, 23, 42, 0.92);
}
.persona-chip:hover .persona-tooltip {
  display: block;
}
.persona-chip.active:hover .persona-tooltip {
  display: none;
}
.persona-tooltip-title {
  font-size: 12px;
  font-weight: 700;
  color: #F1F5F9;
  margin-bottom: 4px;
  letter-spacing: 0.01em;
}
.persona-tooltip-desc {
  font-size: 12px;
  font-weight: 400;
  color: #CBD5E1;
  line-height: 1.5;
}

/* ── Model chip ────────────────────────────────────────────────────────── */
.model-chip {
  padding: 4px 10px 4px 8px;
  gap: 6px;
}
.model-chip-icon {
  width: 26px;
  height: 26px;
  border-radius: 6px;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
}
.model-chip-label {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: #1E293B;
  max-width: 200px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Model popover (wider, with scrollable list) ───────────────────────── */
.model-popover {
  min-width: 380px;
  max-height: 420px;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.model-popover-list {
  overflow-y: auto;
  flex: 1;
  padding: 2px 0;
  scrollbar-width: thin;
}
.model-popover-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 8px;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: 'Noto Sans', sans-serif;
  text-align: left;
  transition: background 0.12s;
}
.model-popover-item:hover {
  background: rgba(241, 245, 249, 0.8);
}
.model-popover-item.selected {
  background: rgba(99, 102, 241, 0.08);
}
.model-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 1px;
}
.model-item-name {
  font-size: 13px;
  font-weight: 500;
  color: #1E293B;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-popover-item.selected .model-item-name {
  color: #6366F1;
  font-weight: 600;
}
.model-item-id {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 11px;
  color: #94A3B8;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-popover-item.selected .model-item-id {
  color: #818CF8;
}
.model-item-check {
  width: 16px;
  height: 16px;
  color: #6366F1;
  flex-shrink: 0;
}
.model-popover-status {
  color: #64748B;
  font-size: 12px;
  padding: 10px 12px;
}
.model-popover-status.muted {
  color: #94A3B8;
}
.model-filter-input {
  width: 100%;
  padding: 7px 10px;
  border: 1px solid #E2E8F0;
  border-radius: 8px;
  font-size: 13px;
  font-family: 'Noto Sans', sans-serif;
  outline: none;
  background: rgba(248, 250, 252, 0.8);
  color: #1E293B;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.model-filter-input::placeholder {
  color: #94A3B8;
}
.model-filter-input:focus {
  border-color: #6366F1;
  box-shadow: 0 0 0 2px rgba(99, 102, 241, 0.1);
}

/* ── Animations ─────────────────────────────────────────────────────────── */
@keyframes pulse-green {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px #3fb950; }
  50%       { opacity: 0.5; box-shadow: 0 0 10px #3fb950, 0 0 20px #3fb95055; }
}

/* ── Tools chip button (status line) ────────────────────────────────────── */
.tools-chip-btn {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  border-radius: 6px;
  font-family: 'Noto Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  background: #FEF3C7;
  color: #92400E;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
}
.tools-chip-btn:hover { background: #FDE68A; }

/* ── Tools selection modal ─────────────────────────────────────────────── */
.tools-select-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.tools-select-modal {
  width: min(560px, 95vw);
  max-height: 80vh;
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 18px;
  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.18),
    0 8px 32px rgba(217, 119, 6, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.tools-select-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #E2E8F0;
}
.tools-select-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.tools-select-header-icon {
  width: 30px; height: 30px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  flex-shrink: 0;
  background: #D97706;
}
.tools-select-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #0F172A;
  margin: 0;
}
.tools-select-count {
  font-family: 'Noto Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  color: #92400E;
  background: #FEF3C7;
  padding: 2px 8px;
  border-radius: 6px;
}
.tools-select-close {
  width: 32px; height: 32px;
  border-radius: 8px;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #64748B; cursor: pointer;
  transition: background 0.15s;
}
.tools-select-close:hover { background: #F1F5F9; }

.tools-select-filters {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px 20px;
  border-bottom: 1px solid #F1F5F9;
}
.tools-select-search-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 12px;
  border-radius: 8px;
  border: 1px solid #E2E8F0;
  background: #fff;
}
.tools-select-search {
  flex: 1;
  border: none;
  outline: none;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  color: #1E293B;
  background: transparent;
}
.tools-select-search::placeholder { color: #94A3B8; }
.tools-select-actions {
  display: flex;
  gap: 6px;
}
.tools-select-action-btn {
  padding: 5px 10px;
  border-radius: 6px;
  font-family: 'Noto Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #E2E8F0;
  background: #F8FAFC;
  color: #475569;
  cursor: pointer;
  transition: background 0.15s;
  white-space: nowrap;
}
.tools-select-action-btn:hover { background: #E2E8F0; }

.tools-select-categories {
  display: flex;
  gap: 6px;
  padding: 8px 20px;
  border-bottom: 1px solid #F1F5F9;
  flex-wrap: wrap;
}
.tools-cat-chip {
  padding: 3px 10px;
  border-radius: 6px;
  font-family: 'Noto Sans', sans-serif;
  font-size: 11px;
  font-weight: 600;
  border: 1px solid #E2E8F0;
  background: #F8FAFC;
  color: #64748B;
  cursor: pointer;
  transition: all 0.15s;
}
.tools-cat-chip.active {
  background: #D97706;
  color: #fff;
  border-color: #D97706;
}
.tools-cat-chip:hover:not(.active) { background: #E2E8F0; }

.tools-select-list {
  flex: 1;
  overflow-y: auto;
  padding: 8px 12px;
  scrollbar-width: thin;
}
.tools-select-empty {
  padding: 32px 20px;
  text-align: center;
}
.tools-select-empty p {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  color: #94A3B8;
  margin: 0;
}
.tools-select-row {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 10px 12px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.15s;
  border: 1px solid transparent;
}
.tools-select-row:hover { background: #F8FAFC; }
.tools-select-row.enabled {
  background: #FFFBEB;
  border-color: rgba(217, 119, 6, 0.2);
}
.tools-select-checkbox {
  width: 16px; height: 16px;
  accent-color: #D97706;
  flex-shrink: 0;
  cursor: pointer;
}
.tools-select-row-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.tools-select-row-name {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  color: #1E293B;
}
.tools-select-row-desc {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-caption);
  color: #64748B;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tools-select-row-cat {
  font-family: 'Noto Sans', sans-serif;
  font-size: 10px;
  font-weight: 600;
  color: #92400E;
  background: #FEF3C7;
  padding: 2px 6px;
  border-radius: 4px;
  flex-shrink: 0;
}
.tools-select-footer {
  display: flex;
  justify-content: flex-end;
  padding: 12px 20px;
  border-top: 1px solid #E2E8F0;
}
.tools-select-done-btn {
  padding: 8px 22px;
  border-radius: 8px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  background: #D97706;
  color: #fff;
  border: none;
  cursor: pointer;
  transition: background 0.15s;
  box-shadow: 0 2px 6px rgba(217, 119, 6, 0.25);
}
.tools-select-done-btn:hover { background: #B45309; }

/* ── Reduced motion ─────────────────────────────────────────────────────── */
/* ── Rename modal ───────────────────────────────────────────────────────── */
.rename-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(15, 23, 42, 0.45);
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
}
.rename-modal {
  width: min(420px, 90vw);
  background: rgba(255, 255, 255, 0.95);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 16px;
  box-shadow:
    0 25px 60px rgba(0, 0, 0, 0.18),
    0 8px 32px rgba(99, 102, 241, 0.08),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
  overflow: hidden;
}
.rename-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 16px 20px;
  border-bottom: 1px solid #E2E8F0;
}
.rename-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #0F172A;
  margin: 0;
}
.rename-close-btn {
  width: 32px;
  height: 32px;
  border-radius: 8px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #64748B;
  cursor: pointer;
  transition: background 0.15s;
}
.rename-close-btn:hover { background: #F1F5F9; }
.rename-body {
  padding: 16px 20px;
}
.rename-input {
  width: 100%;
  padding: 10px 14px;
  border: 1.5px solid #E2E8F0;
  border-radius: 10px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  color: #1E293B;
  background: #fff;
  outline: none;
  resize: none;
  line-height: 1.5;
  box-sizing: border-box;
  transition: border-color 0.15s;
}
.rename-input:focus { border-color: #6366F1; }
.rename-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 20px 16px;
}
.rename-btn {
  padding: 8px 18px;
  border-radius: 8px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s;
}
.rename-btn.primary { background: #3B82F6; color: #fff; }
.rename-btn.primary:hover { background: #2563EB; }
.rename-btn.primary:disabled { background: #94A3B8; cursor: not-allowed; }
.rename-btn.secondary { background: #F1F5F9; color: #475569; }
.rename-btn.secondary:hover { background: #E2E8F0; }

@media (prefers-reduced-motion: reduce) {
  .chat-sidebar-new-btn,
  .chat-sidebar-item,
  .chat-sidebar-action-btn,
  .persona-chip,
  .persona-popover-item,
  .chat-header-btn,
  .chat-input-box,
  .rename-btn,
  .rename-close-btn {
    transition: none;
  }
  .chat-sidebar-new-btn:hover {
    transform: none;
  }
}
</style>
