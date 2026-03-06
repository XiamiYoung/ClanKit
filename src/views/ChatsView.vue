<template>
  <div class="h-full flex chats-page" v-bind="$attrs">
    <!-- ── Grid Mode ──────────────────────────────────────────────────────── -->
    <ChatGridLayout
      v-if="gridMode"
      class="flex-1 min-w-0"
      :gridCount="gridCount"
      :gridChatIds="gridChatIds"
      :toastMsg="gridToastMsg"
      @update:gridCount="gridCount = $event"
      @exit-grid="exitGridMode"
      @new-chat="gridNewChat"
      @select-chat="gridSelectChat"
      @swap-chat="gridSwapChat"
      @maximize-chat="gridMaximizeChat"
      @open-chat-settings="gridOpenChatSettings"
      @open-soul-viewer="(id, type, name) => openSoulViewer(id, type, name)"
      @remove-group-persona="(cId, pid) => requestRemoveGroupPersona(cId, pid)"
      @start-call="handleStartCall"
    />

    <!-- ── Chat List Sidebar (single mode) ────────────────────────────────── -->
    <aside v-if="!gridMode" class="chat-sidebar" :style="{ width: chatSidebarCollapsed ? '0' : sidebarWidth + 'px', minWidth: chatSidebarCollapsed ? '0' : undefined, overflow: chatSidebarCollapsed ? 'hidden' : undefined }">
      <!-- Header -->
      <div class="chat-sidebar-header">
        <span class="chat-sidebar-title">Chats</span>
        <div class="flex items-center gap-1">
          <!-- New Folder button -->
          <button
            @click="(e) => openCtxDialog('newFolder', '', selectedFolderId ?? chatsStore.activeFolderId ?? null, e.clientX, e.clientY)"
            class="chat-sidebar-new-btn"
            aria-label="New folder"
            title="New folder"
          >
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
            </svg>
          </button>
          <button
            @click="newChat()"
            class="chat-sidebar-new-btn"
            aria-label="New chat"
            title="New chat"
          >
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
              <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- Search Filter -->
      <div class="chat-sidebar-filter">
        <svg class="chat-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="chatFilterQuery"
          type="text"
          placeholder="Search chats..."
          class="chat-filter-input"
        />
        <button v-if="chatFilterQuery" class="chat-filter-clear" @click="chatFilterQuery = ''">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <!-- Chat Tree / Filtered List -->
      <div
        class="chat-sidebar-list"
        @dragover.prevent="onRootDragOver"
        @dragleave="onRootDragLeave"
        @drop.prevent="onRootDrop"
        @contextmenu.prevent="openTreeContextMenu($event, null)"
        :class="{ 'root-drag-over': rootDragOver }"
      >
        <!-- Sidebar loading indicator -->
        <div v-if="chatsStore.isLoading" class="chat-sidebar-loading">
          <div class="chat-sidebar-spinner"></div>
          <span style="font-size:var(--fs-small); color:#9CA3AF;">Loading chats</span>
        </div>

        <!-- Search mode: flat filtered list -->
        <template v-if="chatFilterQuery.trim()">
          <div
            v-for="chat in filteredChats"
            :key="chat.id"
            @click="chatsStore.setActiveChat(chat.id); chatsStore.markAsRead(chat.id)"
            class="chat-sidebar-item group"
            :class="{ active: chat.id === chatsStore.activeChatId }"
          >
            <svg style="width:16px;height:16px;color:#9CA3AF;opacity:0.7;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span v-if="((chat.isRunning && chat.id !== chatsStore.activeChatId) || chatsStore.unreadChatIds.has(chat.id)) && !chatsStore.completedChatIds.has(chat.id) && !chatsStore.pendingPermissionChatIds.has(chat.id)" class="chat-unread-spinner"></span>
            <span class="chat-sidebar-item-title">{{ chat.title }}</span>
            <!-- Folder badge in search mode -->
            <span v-if="chat._folderName" class="chat-folder-badge">{{ chat._folderName }}</span>
            <span v-if="chatsStore.pendingPermissionChatIds.has(chat.id) && chat.id !== chatsStore.activeChatId" class="chat-approval-chip">Approval</span>
            <span v-else-if="chatsStore.completedChatIds.has(chat.id) && chat.id !== chatsStore.activeChatId" class="chat-completed-chip">Done</span>
            <div class="chat-sidebar-item-actions">
              <button @click.stop="startRename(chat)" class="chat-sidebar-action-btn" aria-label="Rename chat">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              </button>
              <button @click.stop="requestDeleteChat(chat.id)" class="chat-sidebar-action-btn danger" aria-label="Delete chat">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
              </button>
            </div>
          </div>
        </template>

        <!-- Tree mode: root folder row + recursive node rendering -->
        <template v-else>
          <!-- Root folder row -->
          <div class="chat-root-row">
            <div class="chat-root-row-left" @click="rootExpanded = !rootExpanded">
              <svg class="chat-root-chevron" :style="{ transform: rootExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <svg style="width:16px;height:16px;flex-shrink:0;color:#6B7280;" viewBox="0 0 24 24" fill="currentColor">
                <path d="M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z"/>
              </svg>
              <span class="chat-root-label">All Chats</span>
            </div>
            <!-- Fold/Unfold all folders button — only visible when folders exist -->
            <button
              v-if="hasFolders"
              class="chat-root-fold-btn"
              :title="anyFolderExpanded ? 'Collapse all folders' : 'Expand all folders'"
              @click.stop="chatsStore.setAllFoldersExpanded(!anyFolderExpanded)"
            >
              <svg v-if="anyFolderExpanded" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="18 15 12 9 6 15"/>
              </svg>
              <svg v-else style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </button>
          </div>

          <!-- Tree nodes (visible when root is expanded) -->
          <template v-if="rootExpanded">
            <ChatTreeNodeView
              v-for="node in chatsStore.chatTree"
              :key="node.id"
              :node="node"
              :depth="1"
              :activeChatId="chatsStore.activeChatId"
              :unreadChatIds="chatsStore.unreadChatIds"
              :completedChatIds="chatsStore.completedChatIds"
              :pendingPermissionChatIds="chatsStore.pendingPermissionChatIds"
              :draggingId="draggingNodeId"
              :selectedFolderId="selectedFolderId"
              @select-chat="(id) => { chatsStore.setActiveChat(id); chatsStore.markAsRead(id); selectedFolderId = null; treeLastSelected = { type: 'chat', id } }"
              @toggle-folder="(id) => { chatsStore.toggleFolder(id); selectedFolderId = id; treeLastSelected = { type: 'folder', id } }"

              @rename-chat="(chat) => startRename(chat)"
              @delete-chat="(id) => requestDeleteChat(id)"
              @context-menu="(e, node, action) => openTreeContextMenu(e, node, action)"
              @drag-start="(id) => { draggingNodeId = id }"
              @drag-end="() => { draggingNodeId = null; treeDropTarget = null }"
              @drop-into="(nodeId, targetId) => onTreeDrop(nodeId, targetId, 'inside')"
              @drop-before="(nodeId, targetId) => onTreeDrop(nodeId, targetId, 'before')"
              @drop-after="(nodeId, targetId) => onTreeDrop(nodeId, targetId, 'after')"
            />
          </template>
        </template>
      </div>

      <!-- Tree Context Menu (Teleported) -->
      <Teleport to="body">
        <div v-if="treeCtxMenu.visible" class="chat-ctx-overlay" @click="closeTreeCtxMenu" @contextmenu.prevent="closeTreeCtxMenu" />
        <div v-if="treeCtxMenu.visible" class="chat-ctx-menu" :style="{ top: treeCtxMenu.y + 'px', left: treeCtxMenu.x + 'px' }" @click.stop>
          <!-- Create actions -->
          <button class="chat-ctx-item" @click="ctxNewChat()">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><line x1="12" y1="9" x2="12" y2="15"/><line x1="9" y1="12" x2="15" y2="12"/></svg>
            New Chat
          </button>
          <button class="chat-ctx-item" @click="ctxNewFolder()">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/></svg>
            New Folder
          </button>
        </div>
        <!-- Rename dialog (dark floating input, DocsView style) -->
        <div v-if="treeCtxDialog.visible" class="chat-ctx-dialog" :style="{ top: treeCtxDialog.y + 'px', left: treeCtxDialog.x + 'px' }" @click.stop @keydown.escape="cancelCtxDialog">
          <div class="chat-ctx-dialog-title">{{ treeCtxDialog.title }}</div>
          <input ref="ctxDialogInputRef" v-model="treeCtxDialog.value" class="chat-ctx-dialog-input" :placeholder="treeCtxDialog.placeholder" @keydown.enter="commitCtxDialog" @keydown.escape="cancelCtxDialog" />
          <div class="chat-ctx-dialog-footer">
            <button class="chat-ctx-dialog-cancel" @click="cancelCtxDialog">Cancel</button>
            <button class="chat-ctx-dialog-confirm" @click="commitCtxDialog">{{ treeCtxDialog.type === 'rename' ? 'Rename' : 'Create' }}</button>
          </div>
        </div>
      </Teleport>
    </aside>

    <!-- Resize handle -->
    <div
      v-if="!gridMode && !chatSidebarCollapsed"
      class="chat-sidebar-resize"
      @mousedown.prevent="startResize"
    ></div>

    <!-- ── Chat Window (single mode) ──────────────────────────────────────── -->
    <div
      v-if="!gridMode"
      class="flex-1 min-w-0 flex flex-col relative chat-window"
      @dragenter.prevent="onDragEnter"
      @dragover.prevent="onDragOver"
      @dragleave.prevent="onDragLeave"
      @drop.prevent="onDrop"
    >
      <!-- Hamburger toggle tab -->
      <button
        @click="chatSidebarCollapsed = !chatSidebarCollapsed"
        class="chat-sidebar-expand-tab"
        :title="chatSidebarCollapsed ? 'Expand chat list' : 'Collapse chat list'"
        :aria-label="chatSidebarCollapsed ? 'Expand chat list' : 'Collapse chat list'"
      >
        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
        </svg>
      </button>

      <!-- Drag-over overlay (full chat window) -->
      <div
        v-if="isDragOver"
        class="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
        style="background:rgba(0,122,255,0.08); border:2.5px dashed #1A1A1A; border-radius:16px;"
      >
        <div class="flex flex-col items-center gap-2 px-6 py-4 rounded-2xl" style="background:rgba(0,122,255,0.06); color:#0056CC; box-shadow:0 1px 3px rgba(0,0,0,0.04);">
          <svg class="w-8 h-8" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/>
          </svg>
          <span style="font-size:var(--fs-body); font-weight:600;">Drop files here</span>
          <span style="font-size:var(--fs-caption); opacity:0.7;">or paste file paths into the text area</span>
        </div>
      </div>

      <template v-if="chatsStore.activeChat">
        <!-- Chat Header (shared component) -->
        <ChatHeader
          ref="chatHeaderRef"
          :chatId="chatsStore.activeChatId"
          @open-chat-settings="showChatConfigModal = true"
          @open-soul-viewer="(id, type, name) => openSoulViewer(id, type, name)"
          @remove-group-persona="(cId, pid) => requestRemoveGroupPersona(cId, pid)"
          @start-call="handleStartCall"
          @enter-grid="enterGridMode"
        />

        <!-- ── Context Window Usage Bar (always visible) ────────────────────── -->
        <div class="chat-context-bar-wrap">
        <div class="chat-context-bar">
          <span style="color:#6B7280; font-size:var(--fs-small); white-space:nowrap;">Context</span>
          <!-- Progress bar -->
          <div class="flex-1 h-1.5 rounded-full overflow-hidden" style="background:#E5E5EA;">
            <div
              class="h-full rounded-full transition-all duration-500"
              :style="{
                width: Math.min(activeContextMetrics.percentage, 100) + '%',
                background: activeContextMetrics.percentage > 85 ? '#FF3B30' : activeContextMetrics.percentage > 65 ? '#FF9500' : '#1A1A1A'
              }"
            />
          </div>
          <!-- Percentage and token counts -->
          <span style="font-size:var(--fs-small); white-space:nowrap;"
            :style="activeContextMetrics.percentage > 85 ? 'color:#dc2626;' : 'color:#9CA3AF;'"
          >
            {{ Math.round(activeContextMetrics.percentage) }}%
          </span>
          <span style="color:#9CA3AF; font-size:var(--fs-small); white-space:nowrap;">
            {{ formatTokenCount(activeContextMetrics.inputTokens) }} in / {{ formatTokenCount(activeContextMetrics.outputTokens) }} out
          </span>
          <!-- Cost + Inspect button -->
          <div style="position:relative; display:flex; align-items:center; gap:0.25rem;"
               @mouseenter="showInspectTooltip = true; refreshCostOnHover()"
               @mouseleave="showInspectTooltip = false">
            <span v-if="activeChatCost" class="ict-inline-cost">{{ formatCost(activeChatCost.usd) }}</span>
            <button
              @click="inspectContext"
              :disabled="!hasContextData"
              class="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors cursor-pointer shrink-0"
              :style="hasContextData
                ? 'background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color:#FFFFFF; border:1px solid #1A1A1A; box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);'
                : 'background:#F5F5F5; color:#D1D1D6; border:1px solid #E5E5EA; cursor:not-allowed;'"
              @mouseenter="e => { if (hasContextData) e.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)' }"
              @mouseleave="e => { if (hasContextData) e.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)' }"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
              </svg>
              <span style="font-size:var(--fs-small);">Inspect</span>
            </button>

            <!-- Cost breakdown tooltip -->
            <div v-if="showInspectTooltip" class="inspect-cost-tooltip">
              <!-- Header: model + total cost badge (badge only when there's cost data) -->
              <div class="ict-header">
                <div class="ict-header-left">
                  <svg style="width:11px;height:11px;flex-shrink:0;opacity:0.5;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>
                  <span class="ict-model-name">{{ activeChatModel || 'Unknown model' }}</span>
                </div>
                <span v-if="activeChatCost" class="ict-total-badge">{{ formatCost(activeChatCost.all?.USD ?? 0, 'USD') }}</span>
              </div>

              <!-- LLM section -->
              <div class="ict-section">
                <div class="ict-section-label">LLM Cost</div>
                <template v-if="activeChatCost?.hasPricing">
                  <div class="ict-row">
                    <span>Input tokens</span>
                    <span>{{ formatCost(activeChatCost.inputUsd) }}</span>
                  </div>
                  <div class="ict-row">
                    <span>Output tokens</span>
                    <span>{{ formatCost(activeChatCost.outputUsd) }}</span>
                  </div>
                  <div v-if="(activeChatCost.cacheWriteUsd ?? 0) > 0" class="ict-row">
                    <span>Cache write</span>
                    <span>{{ formatCost(activeChatCost.cacheWriteUsd) }}</span>
                  </div>
                  <div v-if="(activeChatCost.cacheReadUsd ?? 0) > 0" class="ict-row">
                    <span>Cache read</span>
                    <span>{{ formatCost(activeChatCost.cacheReadUsd) }}</span>
                  </div>
                  <div class="ict-row ict-row-sub">
                    <span>Subtotal</span>
                    <span>{{ formatCost(activeChatCost.llmUsd) }}</span>
                  </div>
                </template>
                <template v-else-if="activeChatCost && !activeChatCost.hasPricing">
                  <div class="ict-row">
                    <span style="font-style:italic; opacity:0.5;">Price not configured</span>
                  </div>
                </template>
                <template v-else>
                  <!-- no messages yet: blank rows -->
                  <div class="ict-row">
                    <span>Input tokens</span><span class="ict-blank">—</span>
                  </div>
                  <div class="ict-row">
                    <span>Output tokens</span><span class="ict-blank">—</span>
                  </div>
                </template>
              </div>

              <!-- Voice / Whisper section — always shown -->
              <div class="ict-section">
                <div class="ict-section-label">Voice · Whisper</div>
                <div class="ict-row">
                  <span>{{ activeChatUsage?.whisperCalls ? `${activeChatUsage.whisperCalls} rounds · ${(activeChatUsage.whisperSecs || 0).toFixed(1)}s` : 'No rounds' }}</span>
                  <span v-if="activeChatCost">{{ formatCost(activeChatCost.whisperUsd) }}</span>
                  <span v-else class="ict-blank">—</span>
                </div>
              </div>

              <!-- Total row -->
              <div class="ict-total">
                <div class="ict-total-row">
                  <span class="ict-total-label">Total (USD / CNY / SGD)</span>
                </div>
                <div v-if="activeChatCost" class="ict-total-amounts">
                  <span><span class="ict-amount">{{ formatCost(activeChatCost.all?.USD ?? 0) }}</span> <span class="ict-cur">USD</span></span>
                  <span class="ict-sep">/</span>
                  <span><span class="ict-amount">{{ formatCost(activeChatCost.all?.CNY ?? 0, 'CNY') }}</span> <span class="ict-cur">CNY</span></span>
                  <span class="ict-sep">/</span>
                  <span><span class="ict-amount">{{ formatCost(activeChatCost.all?.SGD ?? 0, 'SGD') }}</span> <span class="ict-cur">SGD</span></span>
                </div>
                <div v-else class="ict-blank" style="padding-top:0.125rem;">—</div>
              </div>
            </div>
          </div>

          <!-- Compact button -->
          <button
            @click="compactContext"
            :disabled="isCompacting || (!activeRunning && !hasContextData)"
            class="flex items-center gap-1 px-2 py-0.5 rounded-md transition-colors cursor-pointer shrink-0"
            :style="isCompacting
              ? 'background:#F5F5F5; color:#6B7280; border:1px solid #E5E5EA;'
              : (activeRunning || hasContextData)
                ? 'background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color:#FFFFFF; border:1px solid #1A1A1A; box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);'
                : 'background:#F5F5F5; color:#D1D1D6; border:1px solid #E5E5EA; cursor:not-allowed;'"
            @mouseenter="e => { if (!isCompacting && (activeRunning || hasContextData)) e.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)' }"
            @mouseleave="e => { if (!isCompacting && (activeRunning || hasContextData)) e.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)' }"
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
        <!-- Tab below context bar -->
        <button
          class="ctx-header-tab"
          :title="chatHeaderRef?.headerExpanded ? 'Collapse header' : 'Expand header'"
          @click.stop="chatHeaderRef && (chatHeaderRef.headerExpanded = !chatHeaderRef.headerExpanded)"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
          </svg>
        </button>
        </div>

        <!-- ── Context Inspector Modal ──────────────────────────────────────── -->
        <div
          v-if="showContextInspector"
          class="fixed inset-0 z-50 flex items-center justify-center"
          style="background:rgba(0,0,0,0.3);"
          @click.self="showContextInspector = false"
        >
          <div
            class="relative flex flex-col rounded-2xl overflow-hidden"
            style="background:#FFFFFF; border:1px solid #E5E5EA; border-radius:16px; width:80vw; max-height:85vh; box-shadow:0 8px 32px rgba(0,0,0,0.12);"
          >
            <!-- Header -->
            <div class="flex items-center justify-between px-5 py-3 shrink-0" style="border-bottom:1px solid #E5E5EA;">
              <div class="flex items-center gap-2">
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="#1A1A1A" stroke-width="2">
                  <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                </svg>
                <span class="font-semibold" style="font-family:'Inter',sans-serif; color:#1A1A1A; font-size:var(--fs-subtitle);">Context Inspector</span>
                <span
                  v-if="activeChatModel"
                  class="px-1.5 py-0.5 rounded-full"
                  style="background:#F5F5F5; color:#6B7280; font-size:var(--fs-small);"
                >{{ activeChatModel }}</span>
              </div>
              <button
                @click="showContextInspector = false"
                class="w-8 h-8 rounded-lg flex items-center justify-center cursor-pointer transition-colors"
                style="color:#9CA3AF;"
                @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
                @mouseleave="e => e.currentTarget.style.background=''"
              >
                <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>

            <!-- Body -->
            <div class="flex-1 overflow-y-auto px-5 py-4 space-y-3">
              <!-- Metrics section (expanded by default) -->
              <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
                <button
                  @click="inspectorSections.metrics = !inspectorSections.metrics"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F2F2F7;"
                  @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
                  @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
                >
                  <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">Metrics</span>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.metrics ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.metrics" class="px-4 py-3" style="border-top:1px solid #E5E5EA;">
                  <table style="width:100%; font-size:var(--fs-body); color:#1A1A1A;">
                    <tbody>
                      <tr style="border-bottom:1px solid #F5F5F5;">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Input tokens</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ activeContextMetrics.inputTokens?.toLocaleString() ?? '0' }}</td>
                      </tr>
                      <tr style="border-bottom:1px solid #F5F5F5;">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Max tokens</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (activeContextMetrics.maxTokens ?? 0).toLocaleString() }}</td>
                      </tr>
                      <tr style="border-bottom:1px solid #F5F5F5;">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Usage</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ Math.round(activeContextMetrics.percentage) }}%</td>
                      </tr>
                      <tr :style="(activeContextMetrics.voiceInputTokens || activeContextMetrics.voiceOutputTokens) ? 'border-bottom:1px solid #F5F5F5;' : ''">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Compactions</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ activeContextMetrics.compactionCount ?? 0 }}</td>
                      </tr>
                      <template v-if="activeContextMetrics.voiceInputTokens || activeContextMetrics.voiceOutputTokens">
                        <tr style="border-bottom:1px solid #F5F5F5;">
                          <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Voice in</td>
                          <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (activeContextMetrics.voiceInputTokens ?? 0).toLocaleString() }} tok</td>
                        </tr>
                        <tr :style="(activeContextMetrics.whisperCalls) ? 'border-bottom:1px solid #F5F5F5;' : ''">
                          <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Voice out</td>
                          <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (activeContextMetrics.voiceOutputTokens ?? 0).toLocaleString() }} tok</td>
                        </tr>
                      </template>
                      <tr v-if="activeContextMetrics.whisperCalls">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Whisper STT</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ activeContextMetrics.whisperCalls }} rounds, {{ (activeContextMetrics.whisperSecs ?? 0).toFixed(1) }}s audio</td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- Usage (cumulative) section -->
              <div v-if="activeChatUsage" style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
                <button
                  @click="inspectorSections.cost = !inspectorSections.cost"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F2F2F7;"
                  @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
                  @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">Usage (cumulative)</span>
                    <span v-if="activeChatCost" class="px-1.5 py-0.5 rounded-full" style="background:#F0FDF4; color:#15803D; font-size:var(--fs-small); font-weight:600;">
                      {{ formatCost(activeChatCost.usd, 'USD') }}
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.cost ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.cost" class="px-4 py-3" style="border-top:1px solid #E5E5EA;">
                  <table style="width:100%; font-size:var(--fs-body); color:#1A1A1A;">
                    <tbody>
                      <tr style="border-bottom:1px solid #F5F5F5;">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Input tokens</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (activeChatUsage.inputTokens || 0).toLocaleString() }}</td>
                      </tr>
                      <tr style="border-bottom:1px solid #F5F5F5;">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Output tokens</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (activeChatUsage.outputTokens || 0).toLocaleString() }}</td>
                      </tr>
                      <tr v-if="activeChatUsage.cacheCreationTokens" style="border-bottom:1px solid #F5F5F5;">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Cache writes</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (activeChatUsage.cacheCreationTokens || 0).toLocaleString() }}</td>
                      </tr>
                      <tr v-if="activeChatUsage.cacheReadTokens" style="border-bottom:1px solid #F5F5F5;">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Cache reads</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ (activeChatUsage.cacheReadTokens || 0).toLocaleString() }}</td>
                      </tr>
                      <tr v-if="activeChatUsage.whisperCalls" style="border-bottom:1px solid #F5F5F5;">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF; white-space:nowrap;">Whisper STT</td>
                        <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;">{{ activeChatUsage.whisperCalls }} rounds, {{ (activeChatUsage.whisperSecs || 0).toFixed(1) }}s</td>
                      </tr>
                      <template v-if="activeChatCost">
                        <tr style="border-top:2px solid #E5E5EA;">
                          <td class="py-1.5 pr-4 font-semibold" style="color:#1A1A1A; white-space:nowrap;">Est. Cost</td>
                          <td class="py-1.5 font-semibold" style="font-family:'JetBrains Mono',monospace; color:#1A1A1A;">
                            {{ formatCost(activeChatCost.all.USD, 'USD') }}<span style="color:#9CA3AF;font-size:0.85em;font-weight:400;"> USD</span>
                            &nbsp;/&nbsp;
                            {{ formatCost(activeChatCost.all.CNY, 'CNY') }}<span style="color:#9CA3AF;font-size:0.85em;font-weight:400;"> CNY</span>
                            &nbsp;/&nbsp;
                            {{ formatCost(activeChatCost.all.SGD, 'SGD') }}<span style="color:#9CA3AF;font-size:0.85em;font-weight:400;"> SGD</span>
                          </td>
                        </tr>
                      </template>
                      <tr v-else-if="activeChatUsage.inputTokens || activeChatUsage.outputTokens">
                        <td class="py-1.5 pr-4" style="color:#9CA3AF;">Est. Cost</td>
                        <td class="py-1.5" style="color:#9CA3AF; font-size:var(--fs-small);">
                          Price not configured for "{{ activeChatModel || '?' }}" — set it in Config → AI → Pricing
                        </td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>

              <!-- System Prompt section -->
              <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
                <button
                  @click="inspectorSections.system = !inspectorSections.system"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F2F2F7;"
                  @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
                  @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">System Prompt</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                      {{ contextSnapshot ? (contextSnapshot.systemPrompt?.length ?? 0).toLocaleString() + ' chars' : 'not yet loaded' }}
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.system ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.system" class="px-4 py-3" style="border-top:1px solid #E5E5EA;">
                  <pre v-if="contextSnapshot?.systemPrompt" class="whitespace-pre-wrap text-xs leading-relaxed overflow-x-auto" style="font-family:'JetBrains Mono',monospace; color:#1A1A1A; max-height:300px; overflow-y:auto;">{{ contextSnapshot.systemPrompt }}</pre>
                  <p v-else style="color:#9CA3AF; font-size:var(--fs-small);">Available after the first message is sent.</p>
                </div>
              </div>

              <!-- Personas section — uses store data before first message, snapshot prompts after -->
              <div v-if="inspectorPersonas" style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
                <button
                  @click="inspectorSections.personas = !inspectorSections.personas"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F2F2F7;"
                  @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
                  @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">Personas</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                      {{ (inspectorPersonas.systemPersonaPrompt || inspectorPersonas.systemPersonaName ? 1 : 0) + (inspectorPersonas.userPersonaPrompt || inspectorPersonas.userPersonaName ? 1 : 0) }} active
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.personas ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.personas" style="border-top:1px solid #E5E5EA;">
                  <!-- System persona -->
                  <div
                    v-if="inspectorPersonas.systemPersonaPrompt || inspectorPersonas.systemPersonaName"
                    class="px-4 py-3"
                    :style="(inspectorPersonas.userPersonaPrompt || inspectorPersonas.userPersonaName) ? 'border-bottom:1px solid #F5F5F5;' : ''"
                  >
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="px-1.5 py-0.5 rounded text-xs font-medium" style="background:rgba(0,122,255,0.1); color:#0056CC;">System Persona</span>
                      <span v-if="inspectorPersonas.systemPersonaName" style="color:#6B7280; font-size:var(--fs-small);">{{ inspectorPersonas.systemPersonaName }}</span>
                    </div>
                    <pre v-if="inspectorPersonas.systemPersonaPrompt" class="whitespace-pre-wrap text-xs leading-relaxed overflow-x-auto" style="font-family:'JetBrains Mono',monospace; color:#1A1A1A; max-height:200px; overflow-y:auto;">{{ inspectorPersonas.systemPersonaPrompt }}</pre>
                    <p v-else style="color:#9CA3AF; font-size:var(--fs-small);">Prompt available after first message.</p>
                  </div>
                  <!-- User persona -->
                  <div v-if="inspectorPersonas.userPersonaPrompt || inspectorPersonas.userPersonaName" class="px-4 py-3">
                    <div class="flex items-center gap-2 mb-1.5">
                      <span class="px-1.5 py-0.5 rounded text-xs font-medium" style="background:#D1FAE5; color:#065F46;">User Persona</span>
                      <span v-if="inspectorPersonas.userPersonaName" style="color:#6B7280; font-size:var(--fs-small);">{{ inspectorPersonas.userPersonaName }}</span>
                    </div>
                    <pre v-if="inspectorPersonas.userPersonaPrompt" class="whitespace-pre-wrap text-xs leading-relaxed overflow-x-auto" style="font-family:'JetBrains Mono',monospace; color:#1A1A1A; max-height:200px; overflow-y:auto;">{{ inspectorPersonas.userPersonaPrompt }}</pre>
                    <p v-else style="color:#9CA3AF; font-size:var(--fs-small);">Prompt available after first message.</p>
                  </div>
                </div>
              </div>

              <!-- Messages section -->
              <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
                <button
                  @click="inspectorSections.messages = !inspectorSections.messages"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F2F2F7;"
                  @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
                  @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">Messages</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                      {{ contextSnapshot?.messages?.length ?? 0 }}
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.messages ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.messages" style="border-top:1px solid #E5E5EA; max-height:400px; overflow-y:auto;">
                  <template v-if="contextSnapshot?.messages?.length">
                    <div
                      v-for="(msg, idx) in contextSnapshot.messages"
                      :key="idx"
                      class="px-4 py-2.5"
                      :style="idx < contextSnapshot.messages.length - 1 ? 'border-bottom:1px solid #F5F5F5;' : ''"
                    >
                      <div class="flex items-center gap-2 mb-1">
                        <span
                          class="px-1.5 py-0.5 rounded text-xs font-medium"
                          :style="msg.role === 'user'
                            ? 'background:rgba(0,122,255,0.1); color:#0056CC;'
                            : 'background:#D1FAE5; color:#065F46;'"
                        >{{ msg.role }}</span>
                        <span style="color:#9CA3AF; font-size:var(--fs-small);">{{ msg.contentLength?.toLocaleString() }} chars</span>
                      </div>
                      <div
                        class="text-xs cursor-pointer"
                        style="font-family:'JetBrains Mono',monospace; color:#6B7280;"
                        @click="expandedMessages[idx] = !expandedMessages[idx]"
                      >
                        <pre v-if="expandedMessages[idx]" class="whitespace-pre-wrap leading-relaxed overflow-x-auto" style="max-height:300px; overflow-y:auto;">{{ msg.fullContent }}</pre>
                        <span v-else>{{ msg.contentPreview }}<span v-if="msg.contentLength > 200" style="color:#007AFF;"> ... (click to expand)</span></span>
                      </div>
                    </div>
                  </template>
                  <div v-else class="px-4 py-3" style="color:#9CA3AF; font-size:var(--fs-body);">{{ contextSnapshot ? 'No messages' : 'Available after the first message is sent.' }}</div>
                </div>
              </div>

              <!-- Tools section -->
              <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
                <button
                  @click="inspectorSections.tools = !inspectorSections.tools"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F2F2F7;"
                  @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
                  @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">Tools</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                      {{ contextSnapshot?.tools?.length ?? 0 }}
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.tools ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.tools" style="border-top:1px solid #E5E5EA; max-height:300px; overflow-y:auto;">
                  <template v-if="contextSnapshot?.tools?.length">
                    <div
                      v-for="(tool, idx) in contextSnapshot.tools"
                      :key="idx"
                      class="px-4 py-2"
                      :style="idx < contextSnapshot.tools.length - 1 ? 'border-bottom:1px solid #F5F5F5;' : ''"
                    >
                      <span class="font-medium text-xs" style="font-family:'JetBrains Mono',monospace; color:#1A1A1A;">{{ tool.name }}</span>
                      <p v-if="tool.description" class="mt-0.5 text-xs" style="color:#9CA3AF;">{{ tool.description.slice(0, 150) }}{{ tool.description.length > 150 ? '...' : '' }}</p>
                    </div>
                  </template>
                  <div v-else class="px-4 py-3" style="color:#9CA3AF; font-size:var(--fs-body);">{{ contextSnapshot ? 'No tools' : 'Available after the first message is sent.' }}</div>
                </div>
              </div>

              <!-- Debug Log section -->
              <div style="border:1px solid #E5E5EA; border-radius:16px; overflow:hidden;">
                <button
                  @click="inspectorSections.debugLog = !inspectorSections.debugLog"
                  class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer transition-colors"
                  style="background:#F2F2F7;"
                  @mouseenter="e => e.currentTarget.style.background='#F5F5F5'"
                  @mouseleave="e => e.currentTarget.style.background='#F2F2F7'"
                >
                  <div class="flex items-center gap-2">
                    <span class="font-medium" style="color:#1A1A1A; font-size:var(--fs-body);">Debug Log</span>
                    <span class="px-1.5 py-0.5 rounded-full" style="background:#F5F5F5; color:#9CA3AF; font-size:var(--fs-small);">
                      {{ debugLog.length }} entries
                    </span>
                  </div>
                  <svg class="w-4 h-4 transition-transform" :style="inspectorSections.debugLog ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#9CA3AF" stroke-width="2">
                    <polyline points="6 9 12 15 18 9"/>
                  </svg>
                </button>
                <div v-if="inspectorSections.debugLog" style="border-top:1px solid #E5E5EA;">
                  <!-- Info bar -->
                  <div class="px-4 py-2 flex items-center gap-3 flex-wrap" style="background:#F2F2F7; border-bottom:1px solid #F5F5F5;">
                    <span style="font-size:var(--fs-small); color:#9CA3AF;">
                      Electron: <span :style="hasElectron ? 'color:#007AFF; font-weight:600;' : 'color:#dc2626; font-weight:600;'">{{ hasElectron ? 'YES' : 'NO' }}</span>
                    </span>
                    <span style="font-size:var(--fs-small); color:#9CA3AF;">
                      Model: <span style="color:#1A1A1A; font-weight:600;">{{ debugModelId }}</span>
                    </span>
                  </div>
                  <!-- Log entries (last 100) -->
                  <div ref="debugLogEl" style="max-height:300px; overflow-y:auto; background:#1A1A1A; font-family:'JetBrains Mono',monospace;">
                    <div class="px-3 py-2 space-y-0.5">
                      <div v-if="debugLog.length === 0" style="color:#6B7280; font-size:var(--fs-secondary);">No events yet — send a message to start logging.</div>
                      <div
                        v-for="(entry, i) in debugLog.slice(-100)"
                        :key="i"
                        style="font-size:var(--fs-secondary);"
                        :style="entry.level === 'error' ? 'color:#f87171;' : entry.level === 'warn' ? 'color:#fbbf24;' : entry.level === 'success' ? 'color:#86efac;' : entry.level === 'chunk' ? 'color:#93c5fd;' : 'color:#E5E5EA;'"
                      >
                        <span style="color:#6B7280; margin-right:6px; font-size:var(--fs-caption);">{{ entry.time }}</span>{{ entry.msg }}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

        <!-- ── Messages (shared ChatWindow) + Input ────────────────────────── -->
        <ChatWindow
          ref="chatWindowRef"
          :chatId="chatsStore.activeChatId"
          :showQuote="true"
          :showDelete="true"
          @send="handleChatWindowSend"
          @pause="pauseAgent(chatsStore.activeChatId)"
          @stop="stopAgent(chatsStore.activeChatId)"
          @quote="quoteMessage"
          @delete-message="requestDeleteMessage"
          :on-approve-plan="approvePlan"
          :on-reject-plan="rejectPlan"
          :on-refine-plan="refinePlan"
        >
          <template #input>
            <!-- Queued prompts list -->
            <div
              v-if="pendingQueue.length > 0"
              class="shrink-0 px-4 py-2 space-y-1.5"
              style="background:#F5F5F5; border-top:1px solid #E5E5EA;"
            >
              <div class="flex items-center gap-1.5" style="color:#6B7280; font-size:var(--fs-small); font-weight:600;">
                <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                Queued ({{ pendingQueue.length }})
              </div>
              <div
                v-for="(item, idx) in pendingQueue"
                :key="idx"
                class="flex items-center gap-2 px-3 py-1.5 rounded-lg"
                style="background:#FFFFFF; color:#6B7280; border:1px solid #E5E5EA; font-size:var(--fs-small);"
              >
                <span class="shrink-0 w-5 h-5 rounded-full flex items-center justify-center" style="background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color:#fff; font-size:10px; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);">{{ idx + 1 }}</span>
                <span class="flex-1 truncate">{{ item.text.slice(0, 80) }}{{ item.text.length > 80 ? '…' : '' }}</span>
                <span v-if="item.attachments?.length" style="opacity:0.7;">{{ item.attachments.length }} file{{ item.attachments.length !== 1 ? 's' : '' }}</span>
                <button
                  @click="removeFromQueue(idx)"
                  class="shrink-0 cursor-pointer"
                  style="color:#9CA3AF; opacity:0.5;"
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

            <!-- Memory Suggestions Banner -->
            <Transition name="memory-banner">
              <div
                v-if="pendingMemorySuggestions.length > 0"
                class="memory-banner"
              >
                <div class="memory-banner-header">
                  <div class="memory-banner-title">
                    <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                      <line x1="10" y1="22" x2="14" y2="22"/>
                    </svg>
                    <span>Memories detected</span>
                    <span class="memory-banner-count">{{ pendingMemorySuggestions.length }}</span>
                  </div>
                  <div class="memory-banner-actions">
                    <button class="memory-banner-btn accept-all" @click="acceptAllMemories">Accept All</button>
                    <button class="memory-banner-btn dismiss-all" @click="dismissAllMemories">Dismiss All</button>
                  </div>
                </div>
                <div class="memory-banner-list">
                  <div
                    v-for="item in pendingMemorySuggestions"
                    :key="item.id"
                    class="memory-banner-item"
                  >
                    <div class="memory-banner-item-content">
                      <span class="memory-banner-target" :class="item.target">{{ item.target === 'user' ? 'You' : 'AI' }}</span>
                      <span class="memory-banner-section">{{ item.section }}</span>
                      <span class="memory-banner-entry">{{ item.entry }}</span>
                    </div>
                    <div class="memory-banner-item-actions">
                      <button class="memory-item-btn accept" @click="acceptMemory(item)" title="Accept">
                        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                      </button>
                      <button class="memory-item-btn dismiss" @click="dismissMemory(item)" title="Dismiss">
                        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            </Transition>

            <!-- Input Area -->
            <div class="chat-input-area">
              <!-- Attachment preview strip -->
              <div
                v-if="attachments.length > 0"
                class="flex flex-wrap gap-2 mb-2 px-1"
              >
                <template v-for="att in attachments" :key="att.id">
                  <!-- Image attachment: thumbnail card -->
                  <div
                    v-if="att.type === 'image' && att.preview"
                    class="relative rounded-xl overflow-hidden shrink-0"
                    style="width:80px; height:80px; border:1px solid #93C5FD; background:#EFF6FF;"
                  >
                    <img
                      :src="att.preview"
                      :alt="att.name"
                      style="width:100%; height:100%; object-fit:cover; display:block;"
                    />
                    <!-- Remove overlay -->
                    <button
                      @click="removeAttachment(att.id)"
                      class="absolute top-0.5 right-0.5 w-5 h-5 rounded-full flex items-center justify-center cursor-pointer"
                      style="background:rgba(0,0,0,0.55); color:#fff; border:none;"
                      aria-label="Remove image"
                    >
                      <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                      </svg>
                    </button>
                  </div>
                  <!-- Non-image attachment: chip -->
                  <div
                    v-else
                    class="flex items-center gap-1.5 pl-2 pr-1 py-1 rounded-lg text-xs max-w-[200px]"
                    :style="att.type === 'image'
                      ? 'background:rgba(0,122,255,0.1); color:#0056CC; border:1px solid #93C5FD;'
                      : att.type === 'folder'
                        ? 'background:#F5F5F5; color:#6B7280; border:1px solid #E5E5EA;'
                        : att.type === 'error'
                          ? 'background:#FEE2E2; color:#991B1B; border:1px solid #FCA5A5;'
                          : 'background:#F5F5F5; color:#6B7280; border:1px solid #E5E5EA;'"
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
                </template>
              </div>

              <!-- Quote preview -->
              <div
                v-if="quotedMessage"
                class="flex items-start gap-2 px-3 py-2 rounded-t-xl"
                style="background:rgba(0,122,255,0.06); border:1px solid #E5E5EA; border-bottom:none;"
              >
                <div class="flex-1 min-w-0">
                  <div class="flex items-center gap-1.5 mb-0.5">
                    <svg class="w-3.5 h-3.5 shrink-0" style="color:#1A1A1A;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <path d="M3 21c3 0 7-1 7-8V5c0-1.25-.756-2.017-2-2H4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2 1 0 1 0 1 1v1c0 1-1 2-2 2s-1 .008-1 1.031V21z"/>
                      <path d="M15 21c3 0 7-1 7-8V5c0-1.25-.757-2.017-2-2h-4c-1.25 0-2 .75-2 1.972V11c0 1.25.75 2 2 2h.75c0 2.25.25 4-2.75 4v3z"/>
                    </svg>
                    <span style="font-size:var(--fs-small); font-weight:600; color:#0056CC;">
                      {{ getQuotedSenderName(quotedMessage) }}
                    </span>
                  </div>
                  <p class="truncate" style="font-size:var(--fs-secondary); color:#6B7280; margin:0;">
                    {{ quotedMessage.content?.slice(0, 150) }}{{ (quotedMessage.content?.length ?? 0) > 150 ? '...' : '' }}
                  </p>
                </div>
                <button
                  @click="clearQuote"
                  class="w-5 h-5 rounded flex items-center justify-center shrink-0 cursor-pointer"
                  style="color:#9CA3AF;"
                  @mouseenter="e => e.currentTarget.style.color='#1A1A1A'"
                  @mouseleave="e => e.currentTarget.style.color='#9CA3AF'"
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
                  style="background:#F5F5F5; color:#9CA3AF;"
                  @mouseenter="e => { if (!activeRunning) e.currentTarget.style.background='#E5E5EA'; e.currentTarget.style.color='#1A1A1A'; }"
                  @mouseleave="e => { e.currentTarget.style.background='#F5F5F5'; e.currentTarget.style.color='#9CA3AF'; }"
                  aria-label="Attach files"
                  title="Attach files or folders"
                >
                  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <ChatMentionInput
                  ref="mentionInputRef"
                  v-model="inputText"
                  :personaIds="activeSystemPersonaIds"
                  :isGroupChat="isGroupChat"
                  :isRunning="activeRunning"
                  @send="sendMessage"
                  @focus="inputFocused = true"
                  @blur="onInputBlur"
                  @attach="atts => attachments.push(...atts)"
                />
                <!-- Pause / Stop buttons (visible while running) -->
                <template v-if="activeRunning">
                  <button
                    @click="pauseAgent(chatsStore.activeChatId)"
                    class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer mb-0.5"
                    style="background:rgba(255,59,48,0.08); color:#FF3B30; box-shadow:0 1px 3px rgba(0,0,0,0.04);"
                    @mouseenter="e => e.currentTarget.style.background='rgba(255,59,48,0.12)'"
                    @mouseleave="e => e.currentTarget.style.background='rgba(255,59,48,0.08)'"
                    aria-label="Pause agent"
                    title="Pause (Esc) — interrupt but keep queue"
                  >
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
                  </button>
                  <button
                    @click="stopAgent(chatsStore.activeChatId)"
                    class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer mb-0.5"
                    style="background:rgba(255,59,48,0.08); color:#FF3B30; box-shadow:0 1px 3px rgba(0,0,0,0.04);"
                    @mouseenter="e => e.currentTarget.style.background='rgba(255,59,48,0.12)'"
                    @mouseleave="e => e.currentTarget.style.background='rgba(255,59,48,0.08)'"
                    aria-label="Stop agent"
                    title="Stop — interrupt and clear queue"
                  >
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>
                  </button>
                </template>
                <!-- Send button (always visible) -->
                <button
                  @click="sendMessage"
                  :disabled="!inputText.trim() && attachments.length === 0"
                  class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer mb-0.5"
                  :style="inputText.trim() || attachments.length > 0
                    ? 'background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color:#ffffff; box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);'
                    : 'background:#E5E5EA; color:#9CA3AF; cursor:not-allowed;'"
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
                <div class="flex items-center gap-2 text-xs" style="color:#9CA3AF;">
                  <span>{{ enabledSkills.length }} skill{{ enabledSkills.length !== 1 ? 's' : '' }} active</span>
                  <span v-if="attachments.length > 0" style="color:#1A1A1A; font-weight:500;">{{ attachments.length }} file{{ attachments.length !== 1 ? 's' : '' }} attached</span>
                  <span v-if="isGroupChat && stickyTargetLabel" class="sticky-target-indicator">
                    <span class="sticky-target-label">Talking to <strong>{{ stickyTargetLabel }}</strong></span>
                    <button class="sticky-target-clear" @click="clearStickyTarget" title="Reset to all">
                      <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </span>
                </div>
                <p class="text-xs" style="color:#9CA3AF;">
                  Enter to send · Shift+Enter for newline · Ctrl+Shift+A attach
                </p>
              </div>
            </div>
          </template>
        </ChatWindow>
      </template>

      <!-- No chat selected / loading -->
      <div v-else class="chat-no-selection">
        <template v-if="chatsStore.isLoading">
          <div class="chat-loading-spinner"></div>
          <span class="chat-loading-text">Loading chats</span>
        </template>
        <template v-else>
          <div class="chat-empty-icon" style="width:56px;height:56px;border-radius:16px;">
            <svg style="width:28px;height:28px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-subtitle); font-weight:600; color:#6B7280; margin:12px 0 0;">Select or create a chat to begin</p>
        </template>
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
              <svg style="width:14px;height:14px;color:#9CA3AF;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
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
              <p>No HTTP tools configured. Go to the Tools page to add some.</p>
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
              <span class="tools-select-row-cat" :class="'tools-select-type-' + (tool.type || 'http')">{{ {http:'HTTP',code:'Code',prompt:'Prompt',smtp:'SMTP'}[tool.type || 'http'] }}</span>
            </label>
          </div>

          <!-- Footer -->
          <div class="tools-select-footer">
            <AppButton size="modal" @click="showToolsModal = false">Done</AppButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── MCP Selection Modal ──────────────────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showMcpModal" class="tools-select-backdrop" @click.self="showMcpModal = false">
        <div class="tools-select-modal">
          <!-- Header -->
          <div class="tools-select-header">
            <div class="tools-select-header-left">
              <div class="tools-select-header-icon">
                <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/>
                  <circle cx="12" cy="12" r="3"/>
                </svg>
              </div>
              <h2 class="tools-select-title">Select MCP Servers</h2>
              <span class="tools-select-count">{{ enabledMcpServers.length }} enabled</span>
            </div>
            <button class="tools-select-close" @click="showMcpModal = false">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <!-- Filter bar -->
          <div class="tools-select-filters">
            <div class="tools-select-search-wrap">
              <svg style="width:14px;height:14px;color:#9CA3AF;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                v-model="mcpSearchQuery"
                type="text"
                placeholder="Filter servers..."
                class="tools-select-search"
              />
            </div>
            <div class="tools-select-actions">
              <button class="tools-select-action-btn" @click="enableAllMcp">Enable All</button>
              <button class="tools-select-action-btn" @click="disableAllMcp">Disable All</button>
            </div>
          </div>

          <!-- Server list -->
          <div class="tools-select-list">
            <div v-if="mcpStore.servers.length === 0" class="tools-select-empty">
              <p>No MCP servers configured. Go to the MCP page to add servers.</p>
            </div>
            <div v-else-if="filteredModalMcpServers.length === 0" class="tools-select-empty">
              <p>No servers match your filter.</p>
            </div>
            <label
              v-for="server in filteredModalMcpServers"
              :key="server.id"
              class="tools-select-row"
              :class="{ enabled: chatEnabledMcpIds.has(server.id) }"
            >
              <input
                type="checkbox"
                :checked="chatEnabledMcpIds.has(server.id)"
                @change="toggleMcp(server.id)"
                class="tools-select-checkbox"
              />
              <div class="tools-select-row-info">
                <span class="tools-select-row-name">{{ server.name }}</span>
                <span class="tools-select-row-desc">{{ server.description || 'No description' }}</span>
              </div>
              <span class="tools-select-row-cat tools-select-type-http" style="font-size:10px;">
                {{ mcpStore.runningStatus[server.id] ? 'Running' : 'Stopped' }}
              </span>
            </label>
          </div>

          <!-- Footer -->
          <div class="tools-select-footer">
            <span style="font-family:'JetBrains Mono',monospace; font-size:var(--fs-caption); color:#9CA3AF;">
              {{ formatTokens(mcpTokenEstimate) }} tokens ({{ tokenPercentage(mcpTokenEstimate) }}%)
            </span>
            <AppButton size="modal" @click="showMcpModal = false">Done</AppButton>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Chat Settings Modal (dark theme) ──────────────────────────────── -->
    <Teleport to="body">
      <div v-if="showChatConfigModal" class="ccm-backdrop">
        <div class="ccm-dialog">
          <!-- Header -->
          <div class="ccm-header">
            <div class="ccm-header-left">
              <div class="ccm-header-icon">
                <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
              </div>
              <h2 class="ccm-title">Chat Settings</h2>
            </div>
            <button class="ccm-close" @click="cancelChatSettings">
              <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>

          <!-- Tab bar -->
          <div class="ccm-tabs">
            <button class="ccm-tab" :class="{ active: ccmActiveTab === 'general' }" @click="ccmActiveTab = 'general'">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              General
            </button>
            <button class="ccm-tab" :class="{ active: ccmActiveTab === 'permissions' }" @click="ccmActiveTab = 'permissions'">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
              Permissions
            </button>
            <button class="ccm-tab" :class="{ active: ccmActiveTab === 'tools' }" @click="ccmActiveTab = 'tools'">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>
              Tools
              <span class="ccm-tab-badge">{{ enabledHttpTools.length }}/{{ toolsStore.tools.length }}</span>
            </button>
            <button class="ccm-tab" :class="{ active: ccmActiveTab === 'mcp' }" @click="ccmActiveTab = 'mcp'">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83"/><circle cx="12" cy="12" r="3"/></svg>
              MCP
              <span class="ccm-tab-badge">{{ enabledMcpServers.length }}/{{ mcpStore.servers.length }}</span>
            </button>
            <button class="ccm-tab" :class="{ active: ccmActiveTab === 'rag' }" @click="ccmActiveTab = 'rag'">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/></svg>
              RAG
            </button>
          </div>

          <!-- Body -->
          <div class="ccm-body">

            <!-- ═══ GENERAL TAB ═══ -->
            <div v-if="ccmActiveTab === 'general'" class="ccm-tab-content">
              <div class="ccm-dark-section">
                <div class="ccm-dark-section-label">Working Path <span class="ccm-dark-badge">Artifact Directory</span></div>
                <div class="ccm-working-path-row">
                  <input
                    v-model="draftWorkingPath"
                    type="text"
                    :placeholder="configStore.config.artyfactPath || '~/.sparkai/artyfact'"
                    class="ccm-working-path-input"
                  />
                  <button class="ccm-working-path-browse" @click="browseWorkingPath" title="Browse folder">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
                  </button>
                </div>
                <span class="ccm-working-path-hint">Leave empty to use the global default path.</span>
              </div>

              <!-- Coding Mode toggle + provider selector -->
              <div class="ccm-dark-section">
                <div class="ccm-dark-section-label">
                  Coding Mode
                  <!-- Info chip with tooltip -->
                  <span class="ccm-coding-info-chip" @mouseenter="showCodingInfoTooltip = true" @mouseleave="showCodingInfoTooltip = false">
                    <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <div v-if="showCodingInfoTooltip" class="ccm-coding-tooltip">
                      <div class="ccm-coding-tooltip-title">What is Coding Mode?</div>
                      <div class="ccm-coding-tooltip-body">Activates project-aware AI assistance. When enabled, SparkAI reads <code>CLAUDE.md</code> instruction files from your project hierarchy and injects them into the system prompt — the same way Claude Code does. Files are watched for changes and context updates automatically.</div>
                      <div class="ccm-coding-tooltip-hint">Set your project root as the Working Path above, then select a coding provider.</div>
                    </div>
                  </span>
                </div>

                <!-- Toggle row: label + switch -->
                <div class="ccm-coding-toggle-row">
                  <span class="ccm-coding-toggle-label">Enable coding mode for this chat</span>
                  <label class="ccm-coding-switch" @click.stop>
                    <input type="checkbox" v-model="draftCodingMode" />
                    <span class="ccm-coding-switch-track"><span class="ccm-coding-switch-thumb"></span></span>
                  </label>
                </div>

                <!-- Provider dropdown (only visible when coding mode is on) -->
                <div v-if="draftCodingMode" class="ccm-working-path-row" style="margin-top:10px;">
                  <label style="font-size:var(--fs-small);color:#9CA3AF;min-width:90px;">Provider</label>
                  <select
                    v-model="draftCodingProvider"
                    class="ccm-working-path-input"
                    style="max-width:200px; cursor:pointer;"
                  >
                    <option value="claude-code">Claude Code</option>
                  </select>
                  <!-- Info icon showing what files are loaded for this provider -->
                  <span class="ccm-provider-info-anchor" @mouseenter="showProviderInfoTooltip = true" @mouseleave="showProviderInfoTooltip = false">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                    </svg>
                    <div v-if="showProviderInfoTooltip" class="ccm-coding-tooltip ccm-coding-tooltip-right">
                      <div class="ccm-coding-tooltip-title">{{ codingProviderInfo.label }}</div>
                      <div class="ccm-coding-tooltip-body">{{ codingProviderInfo.description }}</div>
                      <div class="ccm-coding-tooltip-files">
                        <div class="ccm-coding-tooltip-files-label">Files loaded (in order):</div>
                        <div v-for="f in codingProviderInfo.files" :key="f" class="ccm-coding-tooltip-file">
                          <svg style="width:10px;height:10px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                          <code>{{ f }}</code>
                        </div>
                      </div>
                    </div>
                  </span>
                </div>
              </div>

              <div class="ccm-dark-section">
                <div class="ccm-dark-section-label">
                  Maximum Persona Chat Rounds
                  <span class="ccm-dark-badge">Group Chat</span>
                </div>
                <div class="ccm-stepper-row">
                  <button class="ccm-stepper-btn" @click="draftMaxPersonaRounds = Math.max(1, draftMaxPersonaRounds - 1)">−</button>
                  <input
                    v-model.number="draftMaxPersonaRounds"
                    type="number"
                    min="1"
                    max="100"
                    class="ccm-stepper-input"
                    @blur="draftMaxPersonaRounds = Math.min(100, Math.max(1, Number(draftMaxPersonaRounds) || 10))"
                  />
                  <button class="ccm-stepper-btn" @click="draftMaxPersonaRounds = Math.min(100, draftMaxPersonaRounds + 1)">+</button>
                </div>
                <span class="ccm-working-path-hint">How many back-and-forth rounds personas can run in one message. Default: 10. Hard limit: 100.</span>
              </div>

              <div class="ccm-dark-section">
                <div class="ccm-dark-section-label">
                  Max Output Tokens
                  <span class="ccm-dark-badge">{{ draftMaxOutputTokens ? draftMaxOutputTokens.toLocaleString() + ' tokens' : 'Global default' }}</span>
                </div>
                <div class="ccm-stepper-row">
                  <button class="ccm-stepper-btn" @click="draftMaxOutputTokens = Math.max(1024, (draftMaxOutputTokens ?? configStore.config.maxOutputTokens ?? 32768) - 1024)">−</button>
                  <input
                    :value="draftMaxOutputTokens ?? configStore.config.maxOutputTokens ?? 32768"
                    type="number"
                    min="1024"
                    max="98304"
                    class="ccm-stepper-input ccm-stepper-input--wide"
                    @input="draftMaxOutputTokens = Number($event.target.value) || null"
                    @blur="draftMaxOutputTokens = draftMaxOutputTokens ? Math.min(98304, Math.max(1024, Number(draftMaxOutputTokens))) : null"
                  />
                  <button class="ccm-stepper-btn" @click="draftMaxOutputTokens = Math.min(98304, (draftMaxOutputTokens ?? configStore.config.maxOutputTokens ?? 32768) + 1024)">+</button>
                  <button
                    v-if="draftMaxOutputTokens"
                    class="ccm-stepper-reset"
                    @click="draftMaxOutputTokens = null"
                    title="Reset to global default"
                  >
                    Reset
                  </button>
                </div>
                <span class="ccm-working-path-hint">
                  Global default: {{ (configStore.config.maxOutputTokens ?? 32768).toLocaleString() }} tokens. Hard limit: 98,304 (96k). Leave empty to inherit.
                </span>
              </div>
            </div>

            <!-- ═══ TOOLS TAB ═══ -->
            <div v-else-if="ccmActiveTab === 'tools'" class="ccm-tab-content">
              <!-- Search + actions bar -->
              <div class="ccm-list-toolbar">
                <div class="ccm-list-search-wrap">
                  <svg style="width:14px;height:14px;color:#6B7280;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input v-model="ccmToolSearch" type="text" placeholder="Search tools..." class="ccm-list-search" />
                </div>
                <div class="ccm-list-actions">
                  <button class="ccm-list-action-btn" @click="enableAllTools">All</button>
                  <button class="ccm-list-action-btn" @click="disableAllTools">None</button>
                </div>
                <span class="ccm-list-summary">{{ enabledHttpTools.length }}/{{ toolsStore.tools.length }} enabled · {{ formatTokens(toolsTokenEstimate) }}</span>
              </div>
              <!-- Grouped tool list -->
              <div class="ccm-item-list">
                <div v-if="toolsStore.tools.length === 0" class="ccm-list-empty">No tools configured. Go to the Tools page to add some.</div>
                <div v-else-if="ccmGroupedTools.length === 0 && ccmToolSearch" class="ccm-list-empty">No tools match "{{ ccmToolSearch }}"</div>
                <template v-else v-for="group in ccmGroupedTools" :key="group.type">
                  <!-- Category header -->
                  <div class="ccm-group-header">
                    <span class="ccm-group-label">{{ group.label }}</span>
                    <span class="ccm-group-count">{{ group.enabledCount }}/{{ group.tools.length }} enabled</span>
                  </div>
                  <!-- Tools in this group -->
                  <div
                    v-for="t in group.tools"
                    :key="t.id"
                    class="ccm-item-row"
                    :class="{ enabled: chatEnabledToolIds.has(t.id) }"
                    @click="toggleTool(t.id)"
                  >
                    <input
                      type="checkbox"
                      :checked="chatEnabledToolIds.has(t.id)"
                      @change="toggleTool(t.id)"
                      @click.stop
                      class="ccm-row-checkbox"
                    />
                    <div class="ccm-row-info">
                      <span class="ccm-row-name">{{ t.name }}</span>
                      <span class="ccm-row-desc">{{ t.description || 'No description' }}</span>
                    </div>
                  </div>
                </template>
              </div>
            </div>

            <!-- ═══ MCP TAB ═══ -->
            <div v-else-if="ccmActiveTab === 'mcp'" class="ccm-tab-content">
              <!-- Search + actions bar -->
              <div class="ccm-list-toolbar">
                <div class="ccm-list-search-wrap">
                  <svg style="width:14px;height:14px;color:#6B7280;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
                  <input v-model="ccmMcpSearch" type="text" placeholder="Search MCP servers..." class="ccm-list-search" />
                </div>
                <div class="ccm-list-actions">
                  <button class="ccm-list-action-btn" @click="enableAllMcp">All</button>
                  <button class="ccm-list-action-btn" @click="disableAllMcp">None</button>
                </div>
                <span class="ccm-list-summary">{{ enabledMcpServers.length }}/{{ mcpStore.servers.length }} enabled · {{ formatTokens(mcpTokenEstimate) }}</span>
              </div>
              <!-- MCP list -->
              <div class="ccm-item-list">
                <div v-if="mcpStore.servers.length === 0" class="ccm-list-empty">No MCP servers configured. Go to the MCP page to add servers.</div>
                <div v-else-if="ccmFilteredMcp.length === 0" class="ccm-list-empty">No servers match "{{ ccmMcpSearch }}"</div>
                <div
                  v-for="s in ccmFilteredMcp"
                  :key="s.id"
                  class="ccm-item-card"
                  :class="{ enabled: chatEnabledMcpIds.has(s.id) }"
                  @click="toggleMcp(s.id)"
                >
                  <div class="ccm-item-card-info">
                    <div class="ccm-item-card-top">
                      <span class="ccm-item-card-name">{{ s.name }}</span>
                      <span class="ccm-item-card-status" :class="mcpStore.runningStatus[s.id] ? 'status-running' : 'status-stopped'">
                        <span class="ccm-status-dot"></span>
                        {{ mcpStore.runningStatus[s.id] ? 'Running' : 'Stopped' }}
                      </span>
                    </div>
                    <span class="ccm-item-card-desc">{{ s.description || 'No description' }}</span>
                  </div>
                  <label class="ccm-toggle" @click.stop>
                    <input type="checkbox" :checked="chatEnabledMcpIds.has(s.id)" @change="toggleMcp(s.id)" />
                    <span class="ccm-toggle-track"><span class="ccm-toggle-thumb"></span></span>
                  </label>
                </div>
              </div>
            </div>

            <!-- ═══ RAG TAB ═══ -->
            <div v-else-if="ccmActiveTab === 'rag'" class="ccm-tab-content">
              <div class="ccm-dark-section">
                <div class="ccm-dark-section-label">
                  Knowledge Base
                  <span class="ccm-dark-badge" :class="knowledgeStore.ragEnabled ? 'badge-on' : 'badge-off'">{{ knowledgeStore.ragEnabled ? 'Enabled' : 'Disabled' }}</span>
                </div>
                <div v-if="ragEnabledIndexes.length === 0" class="ccm-list-empty" style="margin-top:12px;">No indexes enabled. Go to Knowledge page to configure.</div>
                <div v-else class="ccm-rag-list">
                  <div v-for="idx in ragEnabledIndexes" :key="idx.name" class="ccm-rag-item">
                    <span class="ccm-rag-name">{{ idx.name }}</span>
                    <span class="ccm-rag-meta">{{ idx.embeddingProvider === 'openrouter' ? 'OpenRouter' : 'OpenAI' }} / {{ idx.embeddingModel }}</span>
                  </div>
                </div>
              </div>
            </div>
            <!-- ═══ PERMISSIONS TAB ═══ -->
            <div v-else-if="ccmActiveTab === 'permissions'" class="ccm-tab-content">
              <!-- Mode selector -->
              <div class="ccm-dark-section">
                <div class="ccm-dark-section-label">Permission Mode</div>
                <div class="ccm-provider-btns">
                  <button v-for="m in [{ id: 'inherit', label: 'Inherit' }, { id: 'chat_only', label: 'Chat Only' }, { id: 'all_permissions', label: 'All Permissions' }]"
                    :key="m.id"
                    class="ccm-provider-btn" :class="{ active: draftPermissionMode === m.id }"
                    @click="draftPermissionMode = m.id">{{ m.label }}</button>
                </div>
                <p class="ccm-perm-mode-hint">
                  <template v-if="draftPermissionMode === 'inherit'">Uses the global mode from Config → Security. Chat allow list runs on top.</template>
                  <template v-else-if="draftPermissionMode === 'chat_only'">Agent must ask permission before running shell commands or writing files. Only this chat's allow list applies.</template>
                  <template v-else>Agent can run any tool without asking. Danger blocks below still apply unless removed for this chat.</template>
                </p>
              </div>

              <!-- INHERIT: Chat allow list on top, then global allow list (read-only) -->
              <template v-if="draftPermissionMode === 'inherit'">
                <!-- Chat Allow List (editable) -->
                <div class="ccm-dark-section" style="flex:0 0 auto;">
                  <div class="ccm-dark-section-label">Chat Allow List <span class="ccm-dark-badge">{{ draftChatAllowList.length }}</span></div>
                  <p class="ccm-perm-mode-hint" style="margin-bottom:8px;">Commands allowed for this chat only, in addition to the global list.</p>
                  <div class="ccm-allow-list">
                    <div v-if="draftChatAllowList.length === 0" class="ccm-list-empty">No entries yet.</div>
                    <div v-for="(entry, idx) in draftChatAllowList" :key="entry.id || idx" class="ccm-allow-entry">
                      <div class="ccm-allow-entry-info">
                        <span class="ccm-allow-pattern">{{ entry.pattern }}</span>
                        <span v-if="entry.description" class="ccm-allow-desc">{{ entry.description }}</span>
                      </div>
                      <button class="ccm-allow-delete" @click="removeChatAllowEntry(idx)" title="Remove">
                        <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>
                  <div class="ccm-allow-add-row">
                    <input v-model="newAllowPattern" type="text" placeholder="Pattern (e.g. ls *)" class="ccm-allow-input" @keydown.enter.prevent="addChatAllowEntry" />
                    <input v-model="newAllowDesc" type="text" placeholder="Description" class="ccm-allow-input" @keydown.enter.prevent="addChatAllowEntry" />
                    <button class="ccm-allow-add-btn" @click="addChatAllowEntry" :disabled="!newAllowPattern.trim()">Add</button>
                  </div>
                </div>
                <!-- Global Allow List (read-only) -->
                <div class="ccm-dark-section" style="flex:1; display:flex; flex-direction:column; min-height:0;">
                  <div class="ccm-dark-section-label">
                    Global Allow List <span class="ccm-dark-badge">{{ (configStore.config.sandboxConfig?.sandboxAllowList || []).length }}</span>
                  </div>
                  <p class="ccm-perm-mode-hint" style="margin-bottom:8px;">Inherited from Config → Security. Edit there to change.</p>
                  <div class="ccm-allow-list">
                    <div v-if="!(configStore.config.sandboxConfig?.sandboxAllowList || []).length" class="ccm-list-empty">No global entries yet.</div>
                    <div v-for="entry in (configStore.config.sandboxConfig?.sandboxAllowList || [])" :key="entry.id" class="ccm-allow-entry ccm-allow-entry-readonly">
                      <div class="ccm-allow-entry-info">
                        <span class="ccm-allow-pattern">{{ entry.pattern }}</span>
                        <span v-if="entry.description" class="ccm-allow-desc">{{ entry.description }}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </template>

              <!-- CHAT ONLY: Chat Allow List only -->
              <div v-else-if="draftPermissionMode === 'chat_only'" class="ccm-dark-section" style="flex:1; display:flex; flex-direction:column; min-height:0;">
                <div class="ccm-dark-section-label">Chat Allow List <span class="ccm-dark-badge">{{ draftChatAllowList.length }}</span></div>
                <p class="ccm-perm-mode-hint" style="margin-bottom:8px;">Commands that bypass permission prompts for this chat only.</p>
                <div class="ccm-allow-list">
                  <div v-if="draftChatAllowList.length === 0" class="ccm-list-empty">No entries yet.</div>
                  <div v-for="(entry, idx) in draftChatAllowList" :key="entry.id || idx" class="ccm-allow-entry">
                    <div class="ccm-allow-entry-info">
                      <span class="ccm-allow-pattern">{{ entry.pattern }}</span>
                      <span v-if="entry.description" class="ccm-allow-desc">{{ entry.description }}</span>
                    </div>
                    <button class="ccm-allow-delete" @click="removeChatAllowEntry(idx)" title="Remove">
                      <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                </div>
                <div class="ccm-allow-add-row">
                  <input v-model="newAllowPattern" type="text" placeholder="Pattern (e.g. ls *)" class="ccm-allow-input" @keydown.enter.prevent="addChatAllowEntry" />
                  <input v-model="newAllowDesc" type="text" placeholder="Description" class="ccm-allow-input" @keydown.enter.prevent="addChatAllowEntry" />
                  <button class="ccm-allow-add-btn" @click="addChatAllowEntry" :disabled="!newAllowPattern.trim()">Add</button>
                </div>
              </div>

              <!-- ALL PERMISSIONS: Danger block list with per-chat removals -->
              <div v-else class="ccm-dark-section" style="flex:1; display:flex; flex-direction:column; min-height:0;">
                <div class="ccm-dark-section-label">
                  Danger Block List
                  <span class="ccm-dark-badge" style="background:rgba(239,68,68,0.2);color:#f87171;">{{ (configStore.config.sandboxConfig?.dangerBlockList || []).length }}</span>
                </div>
                <p class="ccm-perm-mode-hint" style="margin-bottom:8px;">These are still blocked even in All Permissions mode. Remove an entry to allow it for this chat only — does not affect global config.</p>
                <div class="ccm-allow-list">
                  <div v-if="!(configStore.config.sandboxConfig?.dangerBlockList || []).length" class="ccm-list-empty">No danger block entries in global config.</div>
                  <div v-for="entry in (configStore.config.sandboxConfig?.dangerBlockList || [])" :key="entry.id"
                    class="ccm-allow-entry"
                    :class="draftChatDangerOverrides.includes(entry.pattern) ? 'ccm-danger-overridden' : ''">
                    <div class="ccm-allow-entry-info">
                      <span class="ccm-allow-pattern" style="color:#f87171;">{{ entry.pattern }}</span>
                      <span v-if="entry.description" class="ccm-allow-desc">{{ entry.description }}</span>
                    </div>
                    <!-- Not yet overridden: show "Remove for this chat" -->
                    <button v-if="!draftChatDangerOverrides.includes(entry.pattern)"
                      class="ccm-allow-delete ccm-danger-remove-btn"
                      @click="addChatDangerOverride(entry.pattern)"
                      title="Allow for this chat">
                      <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <!-- Already overridden: show "Undo" -->
                    <button v-else
                      class="ccm-allow-add-btn"
                      style="font-size:0.65rem;padding:3px 8px;"
                      @click="removeChatDangerOverride(entry.pattern)">
                      Undo
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Footer -->
          <div class="ccm-footer">
            <span class="ccm-footer-tokens">{{ formatTokens(toolsTokenEstimate + mcpTokenEstimate) }} tokens total ({{ tokenPercentage(toolsTokenEstimate + mcpTokenEstimate) }}% of context)</span>
            <div class="ccm-footer-actions">
              <button class="ccm-cancel-btn" @click="cancelChatSettings">Cancel</button>
              <button class="ccm-save-btn" @click="saveChatSettings">Save</button>
            </div>
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
          <AppButton variant="secondary" size="modal" @click="cancelRename">Cancel</AppButton>
          <AppButton size="modal" :disabled="!editingTitle.trim()" @click="confirmRename">Save</AppButton>
        </div>
      </div>
    </div>
  </div>

  <!-- New Chat Modal -->
    <div v-if="showNewChatModal" class="rename-backdrop">
      <div class="rename-modal" style="width:min(460px, 90vw);" @keydown.escape="cancelNewChat" @keydown.enter.prevent="confirmNewChat">
        <div class="rename-header">
          <h3 class="rename-title">New Chat</h3>
          <button class="rename-close-btn" @click="cancelNewChat" aria-label="Close">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div style="padding:1rem 1.25rem 1.25rem; display:flex; flex-direction:column; gap:0.875rem;">
          <!-- Row 1: Chat name + persona picker -->
          <div class="newchat-name-row-v2">
            <svg style="width:16px;height:16px;flex-shrink:0;color:#6B7280;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <input
              ref="newChatNameInputRef"
              v-model="newChatName"
              type="text"
              placeholder="Chat name (optional)"
              class="newchat-name-input"
            />
            <button class="newchat-persona-cfg-btn" @click.stop="showNewChatPersonaPopover = true" title="Configure personas">
              <div class="newchat-persona-cfg-avatars" v-if="newChatPersonaIds.length > 0">
                <template v-for="(pid, i) in newChatPersonaIds.slice(0, 3)" :key="pid">
                  <img v-if="getAvatarDataUriForPersona(personasStore.getPersonaById(pid))" :src="getAvatarDataUriForPersona(personasStore.getPersonaById(pid))" alt="" class="newchat-persona-cfg-avatar-img" :style="{ zIndex: 10 - i }" />
                  <span v-else class="newchat-persona-cfg-avatar-fb" :style="{ zIndex: 10 - i }">{{ (personasStore.getPersonaById(pid)?.name || '?').charAt(0) }}</span>
                </template>
                <span v-if="newChatPersonaIds.length > 3" class="newchat-persona-cfg-avatar-fb newchat-persona-cfg-overflow" :style="{ zIndex: 5 }">+{{ newChatPersonaIds.length - 3 }}</span>
              </div>
              <svg v-else style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
              </svg>
            </button>
          </div>
          <!-- Row 2: Folder tree selector -->
          <div v-if="chatsStore.chatTree.some(n => n.type === 'folder')" class="newchat-folder-tree-wrap">
            <div class="newchat-folder-tree-label">Save to folder</div>
            <div class="newchat-folder-tree">
              <!-- Root option -->
              <button
                class="newchat-ftree-item"
                v-bind="newChatFolderId === null ? { 'data-active': '' } : {}"
                @click="newChatFolderId = null"
              >
                <svg style="width:14px;height:14px;flex-shrink:0;opacity:0.75;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
                <span>Root (no folder)</span>
              </button>
              <!-- Recursive folder tree -->
              <template v-for="node in chatsStore.chatTree" :key="node.id">
                <FolderTreeItem
                  v-if="node.type === 'folder'"
                  :node="node"
                  :depth="0"
                  :selected-id="newChatFolderId"
                  :expanded-ids="newChatFolderTreeExpanded"
                  @select="newChatFolderId = $event"
                  @toggle="toggleNewChatFolderExpand($event)"
                />
              </template>
            </div>
          </div>
        </div>
        <div class="rename-actions">
          <AppButton variant="secondary" size="modal" @click="cancelNewChat">Cancel</AppButton>
          <AppButton size="modal" @click="confirmNewChat">Create</AppButton>
        </div>
      </div>
    </div>

  <!-- New Chat Persona Picker Dialog (dark, CCM-style) -->
  <Teleport to="body">
    <div v-if="showNewChatPersonaPopover" class="ncp-backdrop" @click.self="showNewChatPersonaPopover = false">
      <div class="ncp-dialog">
        <!-- Header -->
        <div class="ncp-header">
          <div class="ncp-header-left">
            <div class="ncp-header-icon">
              <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h2 class="ncp-title">Choose Personas</h2>
            <span class="ncp-badge">{{ newChatPersonaIds.length }} selected</span>
          </div>
          <button class="ncp-close" @click="showNewChatPersonaPopover = false">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- Search -->
        <div class="ncp-search-bar">
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref="newChatPersonaSearchEl"
            v-model="newChatPersonaSearch"
            type="text"
            placeholder="Search personas..."
            class="ncp-search-input"
            @keydown.stop
          />
          <button v-if="newChatPersonaSearch" class="ncp-search-clear" @click="newChatPersonaSearch = ''">
            <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- Persona list -->
        <div class="ncp-list">
          <!-- When searching: flat filtered list -->
          <template v-if="newChatPersonaSearch.trim()">
            <label
              v-for="p in filteredNewChatPersonas"
              :key="p.id"
              class="ncp-item"
              :class="{ selected: newChatPersonaIds.includes(p.id) }"
            >
              <div class="ncp-check">
                <input type="checkbox" :checked="newChatPersonaIds.includes(p.id)" @change="toggleNewChatPersona(p.id)" />
                <svg v-if="newChatPersonaIds.includes(p.id)" class="ncp-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="ncp-avatar">
                <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" class="ncp-avatar-img" />
                <span v-else class="ncp-avatar-fallback">{{ p.name.charAt(0) }}</span>
              </div>
              <div class="ncp-info">
                <span class="ncp-name">{{ p.name }}</span>
                <span v-if="p.description" class="ncp-desc">{{ p.description }}</span>
              </div>
            </label>
            <div v-if="filteredNewChatPersonas.length === 0" class="ncp-empty">No personas match your search</div>
          </template>
          <!-- No search: category tree -->
          <template v-else>
            <!-- System categories -->
            <div v-for="cat in personasStore.systemCategories" :key="cat.id" class="ncp-cat-section">
              <button class="ncp-cat-header" @click="toggleNcpCat(cat.id)">
                <svg class="ncp-cat-chevron" :class="{ expanded: ncpExpandedCatIds.has(cat.id) }" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span v-if="cat.emoji" class="ncp-cat-emoji">{{ cat.emoji }}</span>
                <span class="ncp-cat-name">{{ cat.name }}</span>
                <span class="ncp-cat-count">{{ personasStore.personasInCategory(cat.id).length }}</span>
              </button>
              <div v-if="ncpExpandedCatIds.has(cat.id)" class="ncp-cat-items">
                <label
                  v-for="p in personasStore.personasInCategory(cat.id)"
                  :key="p.id"
                  class="ncp-item"
                  :class="{ selected: newChatPersonaIds.includes(p.id) }"
                >
                  <div class="ncp-check">
                    <input type="checkbox" :checked="newChatPersonaIds.includes(p.id)" @change="toggleNewChatPersona(p.id)" />
                    <svg v-if="newChatPersonaIds.includes(p.id)" class="ncp-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ncp-avatar">
                    <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" class="ncp-avatar-img" />
                    <span v-else class="ncp-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="ncp-info">
                    <span class="ncp-name">{{ p.name }}</span>
                    <span v-if="p.description" class="ncp-desc">{{ p.description }}</span>
                  </div>
                </label>
                <div v-if="personasStore.personasInCategory(cat.id).length === 0" class="ncp-empty" style="padding: 0.375rem 0.5rem; font-size: 0.75rem; font-style: italic;">No personas</div>
              </div>
            </div>
            <!-- All (fallback) section — always last -->
            <div class="ncp-cat-section">
              <button class="ncp-cat-header" @click="toggleNcpCat('__all__')">
                <svg class="ncp-cat-chevron" :class="{ expanded: ncpExpandedCatIds.has('__all__') }" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span class="ncp-cat-name">All</span>
                <span class="ncp-cat-count">{{ sortedSystemPersonas.length }}</span>
              </button>
              <div v-if="ncpExpandedCatIds.has('__all__')" class="ncp-cat-items">
                <label
                  v-for="p in sortedSystemPersonas"
                  :key="p.id"
                  class="ncp-item"
                  :class="{ selected: newChatPersonaIds.includes(p.id) }"
                >
                  <div class="ncp-check">
                    <input type="checkbox" :checked="newChatPersonaIds.includes(p.id)" @change="toggleNewChatPersona(p.id)" />
                    <svg v-if="newChatPersonaIds.includes(p.id)" class="ncp-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ncp-avatar">
                    <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" class="ncp-avatar-img" />
                    <span v-else class="ncp-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="ncp-info">
                    <span class="ncp-name">{{ p.name }}</span>
                    <span v-if="p.description" class="ncp-desc">{{ p.description }}</span>
                  </div>
                </label>
              </div>
            </div>
          </template>
        </div>

        <!-- Footer -->
        <div class="ncp-footer">
          <span class="ncp-footer-hint">{{ newChatPersonaIds.length === 0 ? 'Default persona' : newChatPersonaIds.length === 1 ? '1 persona (single mode)' : newChatPersonaIds.length + ' personas (group mode)' }}</span>
          <button class="ncp-done-btn" @click="showNewChatPersonaPopover = false">Done</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Soul Viewer Modal -->
  <SoulViewer
    v-if="soulViewerTarget"
    :personaId="soulViewerTarget.personaId"
    :personaType="soulViewerTarget.personaType"
    :personaName="soulViewerTarget.personaName"
    :personaDescription="soulViewerTarget.personaDescription"
    :personaPrompt="soulViewerTarget.personaPrompt"
    :personaProviderId="soulViewerTarget.personaProviderId"
    :personaModelId="soulViewerTarget.personaModelId"
    :personaVoiceId="soulViewerTarget.personaVoiceId"
    :personaAvatar="soulViewerTarget.personaAvatar"
    :readOnly="true"
    @close="closeSoulViewer"
    @update-persona="handleSoulViewerUpdatePersona"
  />

  <!-- Confirm Delete Modal -->
  <ConfirmModal
    v-if="confirmDeleteTarget"
    :title="confirmDeleteTarget.type === 'message' ? 'Delete Message' : confirmDeleteTarget.type === 'chat' ? 'Delete Chat' : confirmDeleteTarget.type === 'folder' ? 'Delete Folder' : 'Remove Persona'"
    :message="confirmDeleteTarget.type === 'message'
      ? 'Are you sure you want to delete this message? It will be removed from the chat history and context window.'
      : confirmDeleteTarget.type === 'chat'
        ? `Are you sure you want to delete &quot;${confirmDeleteTarget.label}&quot;? This action cannot be undone.`
        : confirmDeleteTarget.type === 'folder'
          ? `Delete the folder &quot;${confirmDeleteTarget.label}&quot;? The folder will be removed.`
          : `Remove &quot;${confirmDeleteTarget.label}&quot; from this group chat?`"
    :confirm-text="'Delete'"
    confirm-class="danger"
    @confirm="executeConfirmedDelete"
    @close="confirmDeleteTarget = null"
  />

  <!-- Non-empty folder alert -->
  <ConfirmModal
    v-if="folderNonEmptyAlert"
    title="Cannot Delete Folder"
    :message="`&quot;${folderNonEmptyAlert}&quot; is not empty. Only empty folders can be deleted — move or delete all chats and subfolders inside it first.`"
    confirm-text="OK"
    confirm-class="primary"
    cancel-text="Close"
    @confirm="folderNonEmptyAlert = null"
    @close="folderNonEmptyAlert = null"
  />

  <!-- Tree item name tooltip (teleported — escapes sidebar overflow clip) -->
  <Teleport to="body">
    <div
      v-if="treeTooltip.visible"
      class="tree-name-tooltip"
      :style="{ right: treeTooltip.right + 'px', top: (treeTooltip.top - 4) + 'px' }"
    >{{ treeTooltip.text }}</div>
  </Teleport>

  <!-- Teleport tooltips to body so they escape all stacking contexts -->
  <Teleport to="body">
    <!-- Header persona tooltip now handled by ChatHeader component -->
    <div
      v-if="mentionTooltip.visible && mentionTooltip.source === 'message'"
      :class="['msg-avatar-tooltip-fixed', mentionTooltip.side === 'left' ? 'tooltip-left' : 'tooltip-right']"
      :style="{ top: mentionTooltip.y + 'px', left: mentionTooltip.x + 'px' }"
    >
      <div class="persona-header-tooltip-name">{{ mentionTooltip.name }}</div>
      <div v-if="mentionTooltip.text" class="persona-header-tooltip-text">{{ mentionTooltip.text }}</div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted, onActivated, onDeactivated, onErrorCaptured, watch, defineComponent, h } from 'vue'
defineOptions({ name: 'ChatsView', inheritAttrs: false })
import { useChatsStore } from '../stores/chats'
import { useSkillsStore } from '../stores/skills'
import { useConfigStore } from '../stores/config'
import { usePersonasStore } from '../stores/personas'
import { useMcpStore } from '../stores/mcp'
import { useToolsStore } from '../stores/tools'
import { useModelsStore } from '../stores/models'
import { useKnowledgeStore } from '../stores/knowledge'
import { useVoiceStore } from '../stores/voice'
import { getAvatarDataUri } from '../components/personas/personaAvatars'
import SoulViewer from '../components/personas/SoulViewer.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import MessageRenderer from '../components/chat/MessageRenderer.vue'
import ChatWindow from '../components/chat/ChatWindow.vue'
import ChatHeader from '../components/chat/ChatHeader.vue'
import { parseMentions } from '../utils/mentions'
import { v4 as uuidv4 } from 'uuid'
import AppButton from '../components/common/AppButton.vue'
import ChatGridLayout from '../components/chat/ChatGridLayout.vue'
import ChatMentionInput from '../components/chat/ChatMentionInput.vue'
import { estimateToolTokens, estimateMcpTokens, formatTokens, tokenPercentage } from '../utils/tokenEstimate'
import { resolveModelPrice, calcCostUSD, convertCurrencies, formatCost } from '../utils/pricing.js'

// ── FolderTreeItem — recursive folder picker for new chat modal ──────────────
const FolderTreeItem = defineComponent({
  name: 'FolderTreeItem',
  props: {
    node:        { type: Object,  required: true },
    depth:       { type: Number,  default: 0 },
    selectedId:  { type: String,  default: null },
    expandedIds: { type: Set,     required: true },
  },
  emits: ['select', 'toggle'],
  setup(props, { emit }) {
    return () => {
      const { node, depth, selectedId, expandedIds } = props
      const isExpanded = expandedIds.has(node.id)
      const isSelected = selectedId === node.id
      const indent = depth * 14

      const row = h('button', {
        class: 'newchat-ftree-item',
        style: { paddingLeft: (10 + indent) + 'px' },
        'data-active': isSelected ? '' : undefined,
        onClick: () => emit('select', node.id),
      }, [
        // Chevron — only if has sub-folders; uses currentColor so it inherits text color
        node.children?.some(c => c.type === 'folder')
          ? h('svg', {
              style: { width: '12px', height: '12px', flexShrink: 0, opacity: 0.6, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' },
              viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5',
              onClick: (e) => { e.stopPropagation(); emit('toggle', node.id) },
            }, [h('polyline', { points: '9 18 15 12 9 6' })])
          : h('span', { style: 'width:12px;display:inline-block;flex-shrink:0;' }),
        // Folder icon — inherits currentColor
        h('svg', {
          style: { width: '14px', height: '14px', flexShrink: 0, opacity: 0.75 },
          viewBox: '0 0 24 24', fill: 'currentColor',
        }, [h('path', { d: 'M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z' })]),
        // Name — inherits currentColor
        h('span', { style: { flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, node.name),
      ])

      const children = (isExpanded && node.children?.length)
        ? node.children
            .filter(c => c.type === 'folder')
            .map(child => h(FolderTreeItem, {
              node: child,
              depth: depth + 1,
              selectedId,
              expandedIds,
              onSelect: (id) => emit('select', id),
              onToggle: (id) => emit('toggle', id),
            }))
        : []

      return h('div', null, [row, ...children])
    }
  },
})

// ── ChatTreeNodeView — recursive component for chat tree (DocsView style) ────
const ChatTreeNodeView = defineComponent({
  name: 'ChatTreeNodeView',
  props: {
    node: { type: Object, required: true },
    depth: { type: Number, default: 0 },
    activeChatId: { type: String, default: null },
    unreadChatIds: { type: Object, default: () => new Set() },
    completedChatIds: { type: Object, default: () => new Set() },
    pendingPermissionChatIds: { type: Object, default: () => new Set() },
    draggingId: { type: String, default: null },
    selectedFolderId: { type: String, default: null },
  },
  emits: [
    'select-chat', 'toggle-folder',
    'rename-chat', 'delete-chat',
    'context-menu',
    'drag-start', 'drag-end',
    'drop-into', 'drop-before', 'drop-after',
  ],
  setup(props, { emit }) {
    const dragOver = ref(null) // 'top' | 'middle' | 'bottom' | null
    const hovered = ref(false)

    function onDragStart(e) {
      e.stopPropagation()
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', props.node.id)
      emit('drag-start', props.node.id)
      e.currentTarget.classList.add('chat-tree-dragging')
    }

    function onDragEnd(e) {
      e.currentTarget.classList.remove('chat-tree-dragging')
      dragOver.value = null
      emit('drag-end')
    }

    function onDragOver(e) {
      if (!props.draggingId || props.draggingId === props.node.id) return
      e.preventDefault()
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      const y = e.clientY - rect.top
      const rowH = rect.height
      if (props.node.type === 'folder') {
        if (y < rowH * 0.25) dragOver.value = 'top'
        else if (y > rowH * 0.75) dragOver.value = 'bottom'
        else dragOver.value = 'middle'
      } else {
        dragOver.value = y < rowH / 2 ? 'top' : 'bottom'
      }
    }

    function onDragLeave(e) {
      if (!e.currentTarget.contains(e.relatedTarget)) dragOver.value = null
    }

    function onDrop(e) {
      e.preventDefault()
      e.stopPropagation()
      const nodeId = props.draggingId || e.dataTransfer.getData('text/plain')
      if (!nodeId || nodeId === props.node.id) { dragOver.value = null; return }
      const zone = dragOver.value
      dragOver.value = null
      if (zone === 'middle' && props.node.type === 'folder') emit('drop-into', nodeId, props.node.id)
      else if (zone === 'top') emit('drop-before', nodeId, props.node.id)
      else emit('drop-after', nodeId, props.node.id)
    }

    // Shared child props passthrough
    function childProps(child) {
      return {
        key: child.id,
        node: child,
        depth: props.depth + 1,
        activeChatId: props.activeChatId,
        unreadChatIds: props.unreadChatIds,
        completedChatIds: props.completedChatIds,
        pendingPermissionChatIds: props.pendingPermissionChatIds,
        draggingId: props.draggingId,
        selectedFolderId: props.selectedFolderId,
        onSelectChat: (id) => emit('select-chat', id),
        onToggleFolder: (id) => emit('toggle-folder', id),
        onRenameChat: (chat) => emit('rename-chat', chat),
        onDeleteChat: (id) => emit('delete-chat', id),
        onContextMenu: (e, node, action) => emit('context-menu', e, node, action),
        onDragStart: (id) => emit('drag-start', id),
        onDragEnd: () => emit('drag-end'),
        onDropInto: (nId, tId) => emit('drop-into', nId, tId),
        onDropBefore: (nId, tId) => emit('drop-before', nId, tId),
        onDropAfter: (nId, tId) => emit('drop-after', nId, tId),
      }
    }

    return () => {
      const { node, depth, activeChatId, unreadChatIds, completedChatIds, pendingPermissionChatIds, selectedFolderId } = props
      // DocsView indent: 12 + depth * 18
      const indent = 12 + depth * 18

      const dragAttrs = {
        draggable: true,
        onDragstart: onDragStart,
        onDragend: onDragEnd,
        onDragover: onDragOver,
        onDragleave: onDragLeave,
        onDrop: onDrop,
      }

      // Helper: recursively check if any chat in subtree is running
      function subtreeHasRunning(n) {
        if (n.type === 'chat') return !!n.isRunning
        for (const child of (n.children || [])) {
          if (subtreeHasRunning(child)) return true
        }
        return false
      }

      if (node.type === 'folder') {
        const isExpanded = node.expanded
        const isSelected = node.id === selectedFolderId
        const dragOverFolder = dragOver.value === 'middle'
        let rowBg = isSelected
          ? 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'
          : hovered.value
            ? 'linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)'
            : 'transparent'
        if (dragOverFolder) rowBg = 'rgba(0, 122, 255, 0.08)'
        const isDark = isSelected || hovered.value
        const isHoveredOrDrag = isDark || dragOverFolder
        const textColor = isHoveredOrDrag && !dragOverFolder ? '#fff' : '#1A1A1A'

        const folderRow = h('div', {
          class: 'flex items-center gap-1 py-0.5 pr-2 cursor-pointer group relative chat-tree-row',
          style: {
            paddingLeft: indent + 'px',
            background: rowBg,
            color: textColor,
            boxShadow: isSelected ? '0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)' : 'none',
            borderRadius: '6px',
            margin: '3px 2px',
            fontFamily: "'Inter',sans-serif",
            fontSize: 'var(--fs-secondary)',
            transition: 'background 0.15s, color 0.15s',
            // Use individual border properties — never mix with shorthand to avoid height shifts
            borderTop: dragOver.value === 'top' ? '2px solid #1A1A1A' : '2px solid transparent',
            borderRight: '0px solid transparent',
            borderBottom: dragOver.value === 'bottom' ? '2px solid #1A1A1A' : '2px solid transparent',
            borderLeft: '0px solid transparent',
            // Drag-over-folder shown via outline (doesn't affect layout)
            outline: dragOverFolder ? '1px dashed #007AFF' : 'none',
          },
          onClick: () => emit('toggle-folder', node.id),
          onContextmenu: (e) => { e.preventDefault(); e.stopPropagation(); emit('context-menu', e, node) },
          onMouseenter: (e) => {
            hovered.value = true
            const nameEl = e.currentTarget.querySelector('.truncate')
            if (nameEl && nameEl.scrollWidth > nameEl.clientWidth) {
              const rect = e.currentTarget.getBoundingClientRect()
              treeTooltip.value = { visible: true, text: node.name, right: (globalThis.innerWidth ?? document.documentElement.clientWidth) - rect.right, top: rect.top }
            }
          },
          onMouseleave: () => { hovered.value = false; treeTooltip.value.visible = false },
          ...dragAttrs,
        }, [
          // Chevron
          h('svg', {
            style: { width: '14px', height: '14px', flexShrink: 0, color: isDark ? 'rgba(255,255,255,0.5)' : '#9CA3AF', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s, color 0.15s' },
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
          }, [h('polyline', { points: '9 18 15 12 9 6' })]),
          // Folder icon (filled, DocsView style)
          h('svg', {
            style: { width: '16px', height: '16px', flexShrink: 0, color: isDark ? 'rgba(255,255,255,0.7)' : '#6B7280', transition: 'color 0.15s' },
            viewBox: '0 0 24 24', fill: 'currentColor',
          }, [h('path', { d: 'M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z' })]),
          // Spinner: show when folder is collapsed and has a running chat inside
          (!isExpanded && subtreeHasRunning(node))
            ? h('span', { class: isDark ? 'chat-unread-spinner chat-unread-spinner--light' : 'chat-unread-spinner' })
            : null,
          // Name
          h('span', {
            class: 'truncate flex-1',
            style: { fontWeight: '600', color: isDark ? '#fff' : '#1A1A1A', userSelect: 'none', transition: 'color 0.15s' },
          }, node.name),
          // Hover action buttons — rename + delete (same style as chat items)
          h('div', { class: 'chat-tree-folder-actions' }, [
            h('button', {
              class: 'chat-sidebar-action-btn',
              title: 'Rename folder',
              onClick: (e) => { e.stopPropagation(); emit('context-menu', e, node, 'rename') },
            }, [
              h('svg', { style: { width: '13px', height: '13px' }, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                h('path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }),
                h('path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }),
              ]),
            ]),
            h('button', {
              class: 'chat-sidebar-action-btn danger',
              title: 'Delete folder',
              onClick: (e) => { e.stopPropagation(); emit('context-menu', e, node, 'delete') },
            }, [
              h('svg', { style: { width: '13px', height: '13px' }, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                h('polyline', { points: '3 6 5 6 21 6' }),
                h('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
                h('path', { d: 'M10 11v6M14 11v6' }),
              ]),
            ]),
          ]),
        ])

        const childNodes = (isExpanded && node.children?.length)
          ? node.children.map(child => h(ChatTreeNodeView, childProps(child)))
          : []

        return h('div', { style: { marginTop: depth === 0 ? '6px' : '0' } }, [folderRow, ...childNodes])

      } else {
        // Chat row — DocsView style (active = black gradient)
        const isActive = node.id === activeChatId
        const isUnread = unreadChatIds.has(node.id)
        const isCompleted = completedChatIds.has(node.id)
        const isPendingPermission = pendingPermissionChatIds.has(node.id)
        const showSpinner = (isUnread || (node.isRunning && !isActive)) && !isCompleted && !isPendingPermission

        const isDark = isActive || hovered.value
        const rowBg = isActive
          ? 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'
          : hovered.value
            ? 'linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)'
            : 'transparent'

        return h('div', {
          class: 'flex items-center gap-1 py-0.5 pr-2 cursor-pointer group relative chat-tree-row',
          style: {
            paddingLeft: indent + 'px',
            background: rowBg,
            color: isDark ? '#fff' : '#1A1A1A',
            boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)' : 'none',
            borderRadius: '6px',
            margin: '3px 2px',
            fontFamily: "'Inter',sans-serif",
            fontSize: 'var(--fs-secondary)',
            transition: 'background 0.15s, color 0.15s',
            // Individual border properties — never mix with shorthand to avoid height shifts
            borderTop: dragOver.value === 'top' ? '2px solid #fff' : '2px solid transparent',
            borderRight: '0px solid transparent',
            borderBottom: dragOver.value === 'bottom' ? '2px solid #fff' : '2px solid transparent',
            borderLeft: '0px solid transparent',
          },
          onClick: () => emit('select-chat', node.id),
          onContextmenu: (e) => { e.preventDefault(); e.stopPropagation(); emit('context-menu', e, node) },
          onMouseenter: (e) => {
            hovered.value = true
            const nameEl = e.currentTarget.querySelector('.truncate')
            if (nameEl && nameEl.scrollWidth > nameEl.clientWidth) {
              const rect = e.currentTarget.getBoundingClientRect()
              treeTooltip.value = { visible: true, text: node.title, right: (globalThis.innerWidth ?? document.documentElement.clientWidth) - rect.right, top: rect.top }
            }
          },
          onMouseleave: () => { hovered.value = false; treeTooltip.value.visible = false },
          ...dragAttrs,
        }, [
          // Spacer aligned with folder chevron
          h('span', { style: 'width:14px;display:inline-block;flex-shrink:0;' }),
          // Chat icon
          h('svg', {
            style: { width: '16px', height: '16px', flexShrink: 0, color: isDark ? 'rgba(255,255,255,0.7)' : '#9CA3AF', transition: 'color 0.15s' },
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
          }, [h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })]),
          showSpinner ? h('span', { class: isDark ? 'chat-unread-spinner chat-unread-spinner--light' : 'chat-unread-spinner' }) : null,
          h('span', { class: 'truncate flex-1', style: { fontWeight: isActive ? '600' : '400', color: isDark ? '#fff' : '#1A1A1A', transition: 'color 0.15s' } }, node.title),
          // Status chips
          isPendingPermission && !isActive ? h('span', { class: 'chat-approval-chip' }, 'Approval') : null,
          (!isPendingPermission && isCompleted && !isActive) ? h('span', { class: 'chat-completed-chip' }, 'Done') : null,
          // Action buttons — always rendered, shown only on row hover via CSS
          h('div', { class: 'chat-sidebar-item-actions' }, [
            h('button', {
              class: 'chat-sidebar-action-btn',
              'aria-label': 'Rename chat',
              onClick: (e) => { e.stopPropagation(); emit('rename-chat', node) },
            }, [
              h('svg', { style: { width: '13px', height: '13px' }, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                h('path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }),
                h('path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }),
              ]),
            ]),
            h('button', {
              class: 'chat-sidebar-action-btn danger',
              'aria-label': 'Delete chat',
              onClick: (e) => { e.stopPropagation(); emit('delete-chat', node.id) },
            }, [
              h('svg', { style: { width: '13px', height: '13px' }, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                h('polyline', { points: '3 6 5 6 21 6' }),
                h('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
                h('path', { d: 'M10 11v6M14 11v6' }),
                h('path', { d: 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' }),
              ]),
            ]),
          ]),
        ])
      }
    }
  }
})

const chatsStore = useChatsStore()
const skillsStore = useSkillsStore()
const configStore = useConfigStore()
const personasStore = usePersonasStore()
const mcpStore = useMcpStore()
const toolsStore = useToolsStore()
const modelsStore = useModelsStore()
const knowledgeStore = useKnowledgeStore()
const voiceStore = useVoiceStore()

// ── Voice call ──
async function handleStartCall(chatId) {
  const chat = chatsStore.chats.find(c => c.id === chatId)
  if (!chat) return
  // Use active persona count, not isGroupChat flag (which stays true after removing personas)
  const activeCount = chat.groupPersonaIds?.length > 0 ? chat.groupPersonaIds.length : 1
  if (activeCount > 1) return
  if (voiceStore.isCallActive) return

  // Resolve system persona — use same logic as activeSystemPersonaIds in ChatHeader
  const personaId = (chat.groupPersonaIds?.length > 0 ? chat.groupPersonaIds[0] : null)
    || chat.systemPersonaId
    || personasStore.defaultSystemPersona?.id
  const persona = personaId ? personasStore.getPersonaById(personaId) : null

  // Resolve user persona
  const userPersonaId = chat.userPersonaId || personasStore.defaultUserPersona?.id
  const userPersona = userPersonaId ? personasStore.getPersonaById(userPersonaId) : null

  // Resolve provider/model from persona (provider is always on the persona now)
  const chatProvider = persona?.providerId || 'anthropic'
  const chatModel = persona?.modelId || ''

  // Ensure messages loaded
  await chatsStore.ensureMessages(chatId)
  const history = (chat.messages || []).map(m => ({
    role: m.role,
    content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
  }))

  // Resolve Whisper config
  const vc = configStore.config.voiceCall || {}
  const whisperConfig = {
    apiKey: vc.whisperApiKey || '',
    baseURL: vc.whisperBaseURL || 'https://api.openai.com',
    language: vc.language || '',
  }

  // Update voice store
  voiceStore.startCall(chatId, personaId, persona?.name || 'AI', chatModel)

  // Start backend voice session
  if (window.electronAPI?.voice?.start) {
    await window.electronAPI.voice.start({
      chatId,
      personaId,
      history,
      voiceConfig: { provider: chatProvider, model: chatModel },
      persona: {
        id: personaId,
        name: persona?.name,
        description: persona?.description,
        systemPrompt: persona?.systemPrompt,
      },
      userPersona: {
        id: userPersonaId || '__default_user__',
        name: userPersona?.name,
        description: userPersona?.description,
        systemPrompt: userPersona?.systemPrompt,
      },
      whisperConfig,
    })
  }

  // Subscribe to voice events
  setupVoiceListeners()

  // Start mic capture (MediaRecorder + VAD → audio chunks to backend Whisper)
  startMicCapture()
}

// ── Mic capture with VAD (sends audio chunks to backend for Whisper STT) ──
let micStream = null
let micRecorder = null
let micAnalyser = null
let micAnimFrame = null
let micSilenceStart = 0
let micIsRecording = false
let micSpeechFrames = 0    // frames where isSpeaking=true during current recording
let micBargeInStart = 0    // timestamp when continuous barge-in speech started (0 = none)
// VAD constants — read from config at call-start time via vadParam() below
const MIN_RECORDING_MS = 500
const MAX_RECORDING_MS = 30000 // Cap at 30s to limit Whisper cost
function vadParam(key, fallback) {
  return configStore.config.voiceCall?.[key] ?? fallback
}

async function startMicCapture() {
  try {
    const deviceId = voiceStore.selectedMicId
    const audioConstraints = { echoCancellation: true, noiseSuppression: true, autoGainControl: true }
    if (deviceId) audioConstraints.deviceId = { exact: deviceId }
    micStream = await navigator.mediaDevices.getUserMedia({ audio: audioConstraints })
    const actx = new AudioContext()
    const source = actx.createMediaStreamSource(micStream)
    micAnalyser = actx.createAnalyser()
    micAnalyser.fftSize = 2048
    source.connect(micAnalyser)

    // Log AudioContext state changes — suspension after browser inactivity kills the VAD loop

    // VAD params are read live from config on every frame so slider changes take
    // effect immediately without restarting the call.

    // Dynamic noise floor: tracks ambient background level with a slow EMA.
    // Only updated while NOT recording, so the user's own voice doesn't raise it.
    // Effective threshold = max(SILENCE_THRESHOLD, ambientFloor × PROXIMITY_MULTIPLIER).
    // This means if background people are chatting at RMS 0.025, the trigger
    // rises to ~0.062 — your voice directly into the mic comfortably exceeds that.
    let ambientFloor = vadParam('vadAmplitude', 0.018) * 0.5  // conservative starting estimate
    const AMBIENT_ALPHA = 0.003  // slow adaptation (~330 frames to fully update)

    // Pre-compute voice-band bin range once (300–3400 Hz).
    // Human speech energy concentrates here. Keyboard clicks and background hiss
    // have proportionally more energy outside this range (especially above 4kHz).
    const binHz = actx.sampleRate / micAnalyser.fftSize
    const voiceLowBin  = Math.round(300  / binHz)
    const voiceHighBin = Math.round(3400 / binHz)
    const fftArray = new Float32Array(micAnalyser.frequencyBinCount)

    const dataArray = new Float32Array(micAnalyser.fftSize)
    let chunks = []
    let recordingStartTime = 0

    micRecorder = new MediaRecorder(micStream, { mimeType: 'audio/webm;codecs=opus' })
    micRecorder.ondataavailable = (e) => {
      if (e.data.size > 0) chunks.push(e.data)
    }
    micRecorder.onstop = async () => {
      const duration = Date.now() - recordingStartTime
      const speechFrames = micSpeechFrames
      micSpeechFrames = 0
      if (chunks.length === 0 || duration < MIN_RECORDING_MS) {
        chunks = []
        return
      }
      if (speechFrames < vadParam('vadSpeechFrames', 20)) {
        chunks = []
        return
      }
      const blob = new Blob(chunks, { type: 'audio/webm' })
      chunks = []
      const arrayBuf = await blob.arrayBuffer()
      if (window.electronAPI?.voice?.audioChunk && voiceStore.isCallActive) {
        window.electronAPI.voice.audioChunk(Array.from(new Uint8Array(arrayBuf)))
      }
    }

    function isVoiceBand() {
      // Second gate: require that ≥25% of audio energy sits in the 300–3400 Hz voice band.
      // Keyboard clicks are broadband transients; their voice-band ratio is typically <15%.
      // Real speech always concentrates significant energy in this range.
      micAnalyser.getFloatFrequencyData(fftArray) // values in dB, typically -100..0
      let voicePower = 0
      let totalPower = 0
      for (let i = 1; i < fftArray.length; i++) {
        const p = Math.pow(10, fftArray[i] / 10) // dB → linear power
        totalPower += p
        if (i >= voiceLowBin && i <= voiceHighBin) voicePower += p
      }
      return totalPower > 0 && (voicePower / totalPower) >= vadParam('vadVoiceBandRatio', 0.25)
    }

    function vadLoop() {
      if (!voiceStore.isCallActive) { stopMicCapture(); return }
      // AudioContext can be suspended by the browser after inactivity — resume it silently
      if (actx.state === 'suspended') {
        actx.resume()
      }
      micAnalyser.getFloatTimeDomainData(dataArray)
      let sum = 0
      for (let i = 0; i < dataArray.length; i++) sum += dataArray[i] * dataArray[i]
      const rms = Math.sqrt(sum / dataArray.length)

      // Update ambient floor only when quiet (not recording, not in cooldown).
      // This tracks background chatter level so the dynamic threshold rises with it.
      // Cap at 3× the base threshold so loud background noise can't make the mic
      // completely deaf to the user's voice — this is the safety ceiling.
      if (!micIsRecording && Date.now() >= micCooldownUntil) {
        const newFloor = ambientFloor * (1 - AMBIENT_ALPHA) + rms * AMBIENT_ALPHA
        const floorCeiling = vadParam('vadAmplitude', 0.018) * 3
        ambientFloor = Math.min(newFloor, floorCeiling)
      }

      // Effective threshold: must beat both the fixed floor AND the ambient × multiplier.
      // If background people chat at RMS ~0.025, threshold lifts to ~0.062 —
      // your voice directly into the mic easily clears that.
      const dynamicThreshold = Math.max(
        vadParam('vadAmplitude', 0.018),
        ambientFloor * vadParam('vadProximityMult', 2.5)
      )

      // Gate 1: dynamic amplitude  Gate 2: voice-band frequency ratio
      const isSpeaking = rms > dynamicThreshold && isVoiceBand()
      const isMuted = voiceStore.isMuted
      const inCooldown = Date.now() < micCooldownUntil

      // Barge-in: user speaks while AI is speaking → stop TTS.
      // Require continuous speech for 1s before cutting — prevents a single noise
      // spike or clap from interrupting. The timer resets if speech drops below threshold.
      // Use ttsIsSpeaking (not voiceStore.status) so the timer persists across the brief
      // standby gap between consecutive sentences.
      if (isSpeaking && !isMuted && ttsIsSpeaking) {
        if (!micBargeInStart) micBargeInStart = Date.now()
        if (Date.now() - micBargeInStart >= 500) {
          stopSpeaking()
          micCooldownUntil = 0
          micBargeInStart = 0
        }
      } else {
        micBargeInStart = 0  // reset if speech drops — noise burst didn't sustain
      }

      // Never gate mic on 'processing' — voice LLM and chat agent run independently.
      // VoiceSession.processAudio guards itself; mic must stay open during agent tasks.
      if (isSpeaking && !isMuted && !inCooldown) {
        micSilenceStart = 0
        if (!micIsRecording) {
          micIsRecording = true
          micSpeechFrames = 0
          recordingStartTime = Date.now()
          chunks = []
          if (micRecorder.state === 'inactive') micRecorder.start()
          // Status: actively capturing user speech
          voiceStore.setStatus('listening')
        }
        micSpeechFrames++
      } else if (micIsRecording) {
        if (!micSilenceStart) micSilenceStart = Date.now()
        if (Date.now() - micSilenceStart > vadParam('vadSilenceMs', 700)) {
          micIsRecording = false
          micSilenceStart = 0
          if (micRecorder.state === 'recording') micRecorder.stop()
        }
      } else {
        // Not recording and no speech detected.
        // VAD clears 'listening' if it got stuck.
        // It also clears 'processing' once the backend is done — the backend
        // tries to set 'standby' but that's now blocked, so the VAD does it instead
        // once the mic is idle (not cooldown, not speaking).
        const s = voiceStore.status
        const backendIdle = s !== 'speaking' && s !== 'idle' && Date.now() >= micCooldownUntil
        if ((s === 'listening' || s === 'processing') && backendIdle) {
          voiceStore.setStatus('standby')
        }
      }
      // Hard cap: stop recording after MAX_RECORDING_MS to limit Whisper cost
      if (micIsRecording && (Date.now() - recordingStartTime > MAX_RECORDING_MS)) {
        micIsRecording = false
        micSilenceStart = 0
        if (micRecorder.state === 'recording') micRecorder.stop()
      }
      micAnimFrame = requestAnimationFrame(vadLoop)
    }
    micAnimFrame = requestAnimationFrame(vadLoop)
  } catch (err) {
    console.error('Mic capture failed:', err)
  }
}

function stopMicCapture() {
  if (micAnimFrame) { cancelAnimationFrame(micAnimFrame); micAnimFrame = null }
  if (micRecorder && micRecorder.state !== 'inactive') { try { micRecorder.stop() } catch {} }
  micRecorder = null
  if (micStream) { micStream.getTracks().forEach(t => t.stop()); micStream = null }
  micAnalyser = null
  micIsRecording = false
  micSilenceStart = 0
  micBargeInStart = 0
}

// ── TTS ──
// 'browser' = free SpeechSynthesis, 'openai-hd' = OpenAI TTS HD (uses Whisper API key)
let activeAudioEl = null
let micCooldownUntil = 0  // timestamp: ignore VAD triggers until this time (post-TTS debounce)
const MIC_COOLDOWN_MS = 400

// TTS serial queue — ensures one utterance plays after the previous finishes.
// Prefetch: audio is fetched concurrently while prior sentence plays, so playback
// is gapless. ttsIsSpeaking stays true across sentence boundaries so barge-in
// detection isn't confused by the brief standby between two sentences.
let ttsQueue = Promise.resolve()
let ttsIsSpeaking = false  // true whenever audio is queued or playing
let ttsPending = 0          // count of sentences not yet finished playing
let ttsGeneration = 0       // incremented on stopSpeaking — invalidates all in-flight items

function speakText(text) {
  if (!text) return
  ttsIsSpeaking = true
  ttsPending++
  const gen = ttsGeneration  // capture generation at enqueue time
  // Kick off TTS fetch immediately (runs concurrently with whatever is currently playing)
  const audioReady = _fetchTTSAudio(text)
  // Chain playback onto the serial queue — waits for prior sentence to finish, then plays
  ttsQueue = ttsQueue.then(() => _playTTSAudio(text, audioReady, gen))
  return ttsQueue
}

// Fetch TTS audio now (does NOT wait for previous sentence to finish).
// Returns a Promise that resolves to { audioUrl } for OpenAI TTS, or null for browser TTS.
async function _fetchTTSAudio(text) {
  const vc = configStore.config.voiceCall || {}
  const useOpenAITTS = (vc.ttsMode === 'openai' || vc.ttsMode === 'openai-hd') && vc.whisperApiKey
  if (!useOpenAITTS || !window.electronAPI?.voice?.tts) return null
  try {
    const persona = personasStore.getPersonaById(voiceStore.activePersonaId)
    const voiceId = persona?.voiceId || 'alloy'
    const result = await window.electronAPI.voice.tts({
      text,
      apiKey: vc.whisperApiKey,
      baseURL: vc.whisperBaseURL || 'https://api.openai.com',
      model: vc.ttsMode === 'openai-hd' ? 'tts-1-hd' : 'tts-1',
      voice: voiceId,
    })
    if (result.success && result.audio) {
      // Record TTS character count for cost tracking
      const chatId = activeChatId.value
      if (chatId && text.length > 0) {
        window.electronAPI?.voice?.accumulateUsage?.(chatId, { ttsChars: text.length })
      }
      return `data:audio/${result.format || 'mp3'};base64,${result.audio}`
    }
  } catch { /* fall through — playback will use browser TTS */ }
  return null
}

// Play audio for a sentence. audioReady is the Promise from _fetchTTSAudio (may already be resolved).
// gen must match ttsGeneration at play time — if stopSpeaking() fired since enqueue, drop silently.
async function _playTTSAudio(text, audioReady, gen) {
  const isStale = () => gen !== ttsGeneration || !voiceStore.isCallActive

  if (isStale()) {
    ttsPending = Math.max(0, ttsPending - 1)
    if (ttsPending === 0) ttsIsSpeaking = false
    return
  }

  const done = () => {
    ttsPending = Math.max(0, ttsPending - 1)
    if (ttsPending === 0) ttsIsSpeaking = false
    micCooldownUntil = Date.now() + MIC_COOLDOWN_MS
    if (voiceStore.isCallActive) voiceStore.setStatus('standby')
  }

  // Await the prefetched audio (usually already resolved at this point)
  const audioUrl = await audioReady

  // Re-check after await — stopSpeaking() may have fired while fetch was in-flight
  if (isStale()) {
    ttsPending = Math.max(0, ttsPending - 1)
    if (ttsPending === 0) ttsIsSpeaking = false
    return
  }

  if (audioUrl) {
    return new Promise((resolve) => {
      activeAudioEl = new Audio(audioUrl)
      const speakerId = voiceStore.selectedSpeakerId
      if (speakerId && typeof activeAudioEl.setSinkId === 'function') {
        activeAudioEl.setSinkId(speakerId).catch(() => {})
      }
      const finish = () => {
        activeAudioEl = null
        done()
        resolve()
      }
      activeAudioEl.onended = finish
      activeAudioEl.onerror = () => finish()
      voiceStore.setStatus('speaking')
      activeAudioEl.play()
    })
  }

  // Browser SpeechSynthesis fallback
  if (!window.speechSynthesis) { done(); return }
  return new Promise((resolve) => {
    window.speechSynthesis.cancel()
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = 1.0
    utterance.pitch = 1.0
    utterance.volume = 1.0
    const finish = () => { done(); resolve() }
    utterance.onend = finish
    utterance.onerror = () => finish()
    voiceStore.setStatus('speaking')
    window.speechSynthesis.speak(utterance)
  })
}

// Cancel currently playing audio only — does NOT reset the queue.
function cancelCurrentSpeech() {
  if (window.speechSynthesis) window.speechSynthesis.cancel()
  if (activeAudioEl) { activeAudioEl.pause(); activeAudioEl = null }
}

// Full stop: cancel audio AND discard all queued utterances.
// Used for barge-in interruptions and call end.
function stopSpeaking() {
  cancelCurrentSpeech()
  ttsGeneration++              // invalidate all in-flight _playTTSAudio calls
  ttsQueue = Promise.resolve() // discard any queued utterances
  ttsPending = 0
  ttsIsSpeaking = false
  // Clear speaking status — the VAD loop will set standby/listening on its next frame
  if (voiceStore.status === 'speaking') voiceStore.setStatus('standby')
}

// ── Voice event listeners ──
let voiceCleanups = []
function setupVoiceListeners() {
  voiceCleanups.forEach(fn => fn())
  voiceCleanups = []

  const api = window.electronAPI?.voice
  if (!api) return

  voiceCleanups.push(api.onStatus((status) => {
    // The VAD loop exclusively owns 'listening' and 'standby' — it runs at 60fps
    // and knows exactly whether the mic is recording. Letting the backend also write
    // these states causes races (backend 'standby' arrives late, VAD sees stale value).
    // The backend only owns 'processing', 'speaking', and 'idle'.
    if (status === 'listening' || status === 'standby') return
    voiceStore.setStatus(status)
  }))

  // Whisper transcript from backend
  voiceCleanups.push(api.onTranscription(({ text }) => {
    voiceStore.setTranscript(text)
  }))

  // AI response — speak it; don't add to chat (voice is ephemeral, task results go to chat via agent)
  voiceCleanups.push(api.onAiText(({ text, taskSummary }) => {
    voiceStore.setAiText(text)
    if (!taskSummary) {
      speakText(text)
    } else {
      // Task summary: only speak if nothing is currently playing — otherwise drop it.
      // The full result is already visible in the chat; voice is a courtesy notice only.
      if (voiceStore.status !== 'speaking') {
        speakText(text)
      }
    }
  }))

  voiceCleanups.push(api.onError(({ message }) => {
    console.error('Voice error:', message)
  }))
  voiceCleanups.push(api.onTaskTriggered(({ instruction }) => handleVoiceTask(instruction)))

  // Accumulate voice + Whisper usage into the active chat's contextMetrics and voice store (for real-time cost)
  if (api.onUsage) {
    voiceCleanups.push(api.onUsage((usage) => {
      voiceStore.addCallUsage(usage)
      const chatId = voiceStore.activeChatId
      if (!chatId) return
      const chat = chatsStore.chats.find(c => c.id === chatId)
      if (!chat) return
      const m = chat.contextMetrics
      if (usage.whisperCalls) m.whisperCalls = (m.whisperCalls || 0) + usage.whisperCalls
      if (usage.whisperSecs)  m.whisperSecs  = (m.whisperSecs  || 0) + usage.whisperSecs
      if (usage.voiceInputTokens)  m.voiceInputTokens  = (m.voiceInputTokens  || 0) + usage.voiceInputTokens
      if (usage.voiceOutputTokens) m.voiceOutputTokens = (m.voiceOutputTokens || 0) + usage.voiceOutputTokens
    }))
  }
}

// Add a voice exchange message to the active call's chat
function addVoiceMessageToChat(role, content) {
  const chatId = voiceStore.activeChatId
  if (!chatId || !content) return
  chatsStore.addMessage(chatId, { role, content, fromVoice: true })
  // If the call's chat isn't the one currently visible, switch to it
  if (chatsStore.activeChatId !== chatId) {
    chatsStore.setActiveChat(chatId)
  }
}

// Handle task triggered from voice call.
// The persona's own agent model runs the task via sendMessage().
// Voice only speaks a brief completion/failure notice — never the full agent response.
async function handleVoiceTask(instruction) {
  const chatId = voiceStore.activeChatId
  if (!chatId) return
  if (chatsStore.activeChatId !== chatId) chatsStore.activeChatId = chatId

  // Inject instruction and await the agent run
  inputText.value = instruction
  await nextTick()
  await sendMessage()

  // sendMessage is now done — get the last assistant message as the completion summary
  if (!voiceStore.isCallActive) return
  const chat = chatsStore.chats.find(c => c.id === chatId)
  const lastAssistant = chat?.messages
    ? [...chat.messages].reverse().find(m => m.role === 'assistant' && !m.streaming)
    : null

  // Pass full content — VoiceSession will use the LLM to produce a complete spoken summary
  const summary = lastAssistant?.content || null

  // Push updated chat history back to the voice session so it stays aware of new messages
  const updatedChat = chatsStore.chats.find(c => c.id === chatId)
  if (updatedChat?.messages && window.electronAPI?.voice?.updateHistory) {
    const updatedHistory = updatedChat.messages.map(m => ({
      role: m.role,
      content: typeof m.content === 'string' ? m.content : JSON.stringify(m.content),
    }))
    window.electronAPI.voice.updateHistory(updatedHistory)
  }

  if (window.electronAPI?.voice?.notifyTaskComplete) {
    window.electronAPI.voice.notifyTaskComplete(summary)
  }
}

// ── Grid mode state ──
const gridMode = ref(false)
const gridCount = ref(4)
const gridChatIds = ref([])

function refreshGridChatIds() {
  const sorted = [...chatsStore.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  gridChatIds.value = sorted.slice(0, gridCount.value).map(c => c.id)
}

watch(gridCount, (newCount) => {
  // When count increases, fill new slots from recent chats not already in grid
  // When count decreases, truncate
  const current = gridChatIds.value
  if (newCount <= current.length) {
    gridChatIds.value = current.slice(0, newCount)
  } else {
    const sorted = [...chatsStore.chats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
    const extras = sorted.filter(c => !current.includes(c.id)).map(c => c.id)
    gridChatIds.value = [...current, ...extras].slice(0, newCount)
  }
})

function enterGridMode() {
  refreshGridChatIds()
  gridMode.value = true
}

function exitGridMode() {
  gridMode.value = false
}

function gridMaximizeChat(chatId) {
  // Switch to single view with this chat selected, preserving grid order
  chatsStore.setActiveChat(chatId)
  gridMode.value = false
}

const gridToastMsg = ref('')
let gridToastTimer = null

function showGridToast(msg) {
  gridToastMsg.value = msg
  clearTimeout(gridToastTimer)
  gridToastTimer = setTimeout(() => { gridToastMsg.value = '' }, 2500)
}

async function gridNewChat() {
  const chat = await chatsStore.createChat('New Chat')
  if (chat) {
    chatsStore.setActiveChat(chat.id)
    gridChatIds.value = [chat.id, ...gridChatIds.value.filter(id => id !== chat.id)].slice(0, gridCount.value)
    showGridToast('New chat created')
  }
}

function gridSelectChat(chatId) {
  chatsStore.setActiveChat(chatId)
}

function gridSwapChat(oldChatId, newChatId) {
  const idx = gridChatIds.value.indexOf(oldChatId)
  if (idx === -1) return
  const newIds = [...gridChatIds.value]
  newIds[idx] = newChatId
  gridChatIds.value = newIds
}

function gridOpenChatSettings(chatId) {
  chatsStore.setActiveChat(chatId)
  showChatConfigModal.value = true
}

const inputText = ref('')
const attachments = ref([])
const isDragOver = ref(false)
const inputEl = ref(null) // legacy: no longer bound to a DOM element; use mentionInputRef
const mentionInputRef = ref(null)
const messagesEl = ref(null)
const chatWindowRef = ref(null)
const renameInput = ref(null)
const showRenameModal = ref(false)
const editingChatId = ref(null)
const editingTitle = ref('')
const renameComposing = ref(false)
const inputFocused = ref(false)
const perChatActivityLines = reactive(new Map())
const copiedId = ref(null)
const quotedMessage = ref(null)  // { role, content } of the message being quoted

// ── Memory suggestions (post-turn extraction) ──────────────────────────────
const memorySuggestions = ref(new Map()) // chatId → [{id, target, personaType, personaId, section, entry, status}]
let memoryAutoDismissTimer = null

// ── Drag & drop (tree-based) ──────────────────────────────────────────────────
const draggingNodeId = ref(null)
const treeDropTarget = ref(null)
const rootDragOver = ref(false)

function onTreeDrop(nodeId, targetId, position) {
  if (!nodeId) return
  chatsStore.reorderNode(nodeId, targetId, position)
  draggingNodeId.value = null
  treeDropTarget.value = null
}

function onRootDragOver(e) {
  if (!draggingNodeId.value) return
  e.preventDefault()
  rootDragOver.value = true
}

function onRootDragLeave(e) {
  // Only clear if leaving the list entirely (not entering a child)
  if (!e.currentTarget.contains(e.relatedTarget)) {
    rootDragOver.value = false
  }
}

function onRootDrop(e) {
  if (!draggingNodeId.value) return
  rootDragOver.value = false
  // Drop onto root area = move to root
  chatsStore.moveNodeToFolder(draggingNodeId.value, null)
  draggingNodeId.value = null
}
const userScrolled = ref(false)  // true when user manually scrolled up during streaming
let programmaticScrollCount = 0   // counter to ignore scroll events triggered by scrollToBottom
const visibleLimit = ref(25)     // show last N messages (~1000 lines); user can load more
// Per-chat transient state (not persisted)
const perChatDebugLogs = reactive(new Map())    // chatId → [{time, msg, level}]
const perChatSnapshots = reactive(new Map())    // chatId → snapshot object
const debugLog = computed(() => perChatDebugLogs.get(chatsStore.activeChatId) ?? [])
const showContextInspector  = ref(false)
const showInspectTooltip    = ref(false)
const inspectorUsage        = ref(null)   // usage loaded fresh from disk when inspector opens
const contextSnapshot = computed(() => perChatSnapshots.get(chatsStore.activeChatId) ?? null)

const activeChatUsage = computed(() => {
  const chat = chatsStore.activeChat
  // Base: fresh disk copy when available (inspector opened / hover refresh),
  // otherwise the store copy written by the agent chunk stream.
  const base = inspectorUsage.value || chat?.usage || null
  // contextMetrics holds the live in-memory whisper/voice totals updated by onUsage
  // events during a call. chat.usage (on disk) is also updated by accumulateUsage
  // but only after a round-trip through the main process. Use max() to always show
  // the most up-to-date value without double-counting.
  const m = chat?.contextMetrics
  if (!m) return base
  const liveWhisper = (m.whisperCalls || 0) + (m.whisperSecs || 0)
  const liveVoice   = (m.voiceInputTokens || 0) + (m.voiceOutputTokens || 0)
  if (!liveWhisper && !liveVoice) return base
  return {
    ...(base || {}),
    whisperCalls:      Math.max(base?.whisperCalls      || 0, m.whisperCalls      || 0),
    whisperSecs:       Math.max(base?.whisperSecs        || 0, m.whisperSecs       || 0),
    voiceInputTokens:  Math.max(base?.voiceInputTokens   || 0, m.voiceInputTokens  || 0),
    voiceOutputTokens: Math.max(base?.voiceOutputTokens  || 0, m.voiceOutputTokens || 0),
  }
})

// Resolved model for the active chat: persona modelId → chat.model → contextSnapshot
const activeChatModel = computed(() => {
  const chat = chatsStore.activeChat
  if (!chat) return ''
  const personaId = (chat.groupPersonaIds?.length > 0 ? chat.groupPersonaIds[0] : null)
    || chat.systemPersonaId
  const persona = personaId ? personasStore.getPersonaById(personaId) : null
  return persona?.modelId || chat.model || contextSnapshot.value?.model || ''
})

// Persona info for the inspector — prefers snapshot data (has prompts), falls back to store (has names)
const inspectorPersonas = computed(() => {
  // If snapshot has persona prompts, use them (richer data)
  if (contextSnapshot.value?.personas?.systemPersonaPrompt || contextSnapshot.value?.personas?.userPersonaPrompt) {
    return contextSnapshot.value.personas
  }
  // Fall back to store data — return name info so inspector can show the personas even before first message
  const chat = chatsStore.activeChat
  if (!chat) return null
  const sysId = (chat.groupPersonaIds?.length > 0 ? chat.groupPersonaIds[0] : null) || chat.systemPersonaId
  const sysPersona = sysId ? personasStore.getPersonaById(sysId) : personasStore.defaultSystemPersona
  const usrId = chat.userPersonaId
  const usrPersona = usrId ? personasStore.getPersonaById(usrId) : personasStore.defaultUserPersona
  if (!sysPersona && !usrPersona) return null
  return {
    systemPersonaName: sysPersona?.name || null,
    systemPersonaPrompt: null, // not yet available until first message
    userPersonaName: usrPersona?.name || null,
    userPersonaPrompt: null,
  }
})

const activeChatCost = computed(() => {
  const usage   = activeChatUsage.value
  const chat    = chatsStore.activeChat
  if (!usage || !chat) return null
  // Must have at least some token or voice activity
  const hasActivity = (usage.inputTokens || 0) + (usage.outputTokens || 0) + (usage.whisperCalls || 0) > 0
  if (!hasActivity) return null
  const modelId = activeChatModel.value
  const price   = resolveModelPrice(modelId, configStore.config.pricing)
  // LLM costs — zero when price not configured (whisper cost still computable)
  const M = 1_000_000
  const inputUsd      = price ? (((usage.inputTokens  || 0) + (usage.voiceInputTokens  || 0)) / M) * (price.input      || 0) : 0
  const outputUsd     = price ? (((usage.outputTokens || 0) + (usage.voiceOutputTokens || 0)) / M) * (price.output     || 0) : 0
  const cacheWriteUsd = price ? ((usage.cacheCreationTokens || 0) / M) * (price.cacheWrite || 0) : 0
  const cacheReadUsd  = price ? ((usage.cacheReadTokens     || 0) / M) * (price.cacheRead  || 0) : 0
  const llmUsd = inputUsd + outputUsd + cacheWriteUsd + cacheReadUsd
  const whisperPrice = resolveModelPrice('whisper-1', configStore.config.pricing)
  const whisperUsd   = ((usage.whisperSecs || 0)) * (whisperPrice?.perSec || 0.0001)
  const usd = llmUsd + whisperUsd
  const all = convertCurrencies(usd, configStore.config.pricing?.currencyRates)
  return { usd, all, modelId, hasPricing: !!price, llmUsd, whisperUsd, inputUsd, outputUsd, cacheWriteUsd, cacheReadUsd }
})

const expandedMessages = reactive({})
const inspectorSections = reactive({ metrics: true, system: false, personas: false, messages: false, tools: false, debugLog: false, cost: true })
const debugLogEl = ref(null)

function scrollDebugToBottom() {
  nextTick(() => {
    if (debugLogEl.value) debugLogEl.value.scrollTop = debugLogEl.value.scrollHeight
  })
}

// Auto-scroll debug log: on new entries (when section is open)
watch(debugLog, () => { if (inspectorSections.debugLog) scrollDebugToBottom() }, { deep: true })
// Auto-scroll debug log: when section is expanded
watch(() => inspectorSections.debugLog, (open) => { if (open) scrollDebugToBottom() })
// Auto-scroll debug log: when inspector dialog opens (if section is already open)
watch(showContextInspector, (open) => { if (open && inspectorSections.debugLog) scrollDebugToBottom() })

const perChatQueue = reactive(new Map()) // chatId → [{text, attachments}]
const pendingQueue = computed(() => perChatQueue.get(chatsStore.activeChatId) ?? [])
const isCompacting = ref(false)

// ── Resizable sidebar ────────────────────────────────────────────────────────
function getDefaultSidebarWidth() {
  if (window.innerWidth >= 2560) return 340
  if (window.innerWidth >= 1920) return 300
  return 260
}
const sidebarWidth = ref(getDefaultSidebarWidth())
const chatSidebarCollapsed = ref(false)
const chatHeaderRef = ref(null)
// Tracks the last-clicked tree node: { type: 'folder'|'chat', id }
const treeLastSelected = ref(null)
const selectedFolderId = ref(null)
const rootExpanded = ref(true)
const isResizing = ref(false)

const anyFolderExpanded = computed(() => {
  function check(nodes) {
    for (const node of nodes) {
      if (node.type === 'folder') {
        if (node.expanded) return true
        if (node.children?.length && check(node.children)) return true
      }
    }
    return false
  }
  return check(chatsStore.chatTree)
})

const hasFolders = computed(() => {
  function has(nodes) {
    for (const node of nodes) {
      if (node.type === 'folder') return true
    }
    return false
  }
  return has(chatsStore.chatTree)
})

function startResize(e) {
  isResizing.value = true
  const startX = e.clientX
  const startWidth = sidebarWidth.value

  function onMouseMove(e) {
    const delta = e.clientX - startX
    const minW = window.innerWidth >= 2560 ? 200 : 180
    const maxW = window.innerWidth >= 2560 ? 480 : 400
    sidebarWidth.value = Math.max(minW, Math.min(maxW, startWidth + delta))
  }

  function onMouseUp() {
    isResizing.value = false
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }

  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
}

// Group chat popover state moved to ChatHeader
const showGroupPersonaConfigId = ref(null)

// Tooltip state for message avatars and user avatar (shared across tooltip handlers)
const mentionTooltip = reactive({ visible: false, source: '', text: '', name: '', x: 0, y: 0, side: 'right' })

// Persona header tooltip moved to ChatHeader (has its own tooltip state)

// Chat message avatar tooltip
function showMsgAvatarTooltip(event, msg) {
  const pid = msg.personaId || activeSystemPersonaIds.value[0]
  const persona = pid ? personasStore.getPersonaById(pid) : null
  const name = persona?.name || msg.personaName || 'Assistant'
  const desc = persona?.description || ''
  if (!name) return
  const rect = event.currentTarget.getBoundingClientRect()
  mentionTooltip.source = 'message'
  mentionTooltip.name = name
  mentionTooltip.text = desc
  mentionTooltip.side = 'right'
  mentionTooltip.x = rect.right + 10
  mentionTooltip.y = rect.top + rect.height / 2
  mentionTooltip.visible = true
}

function hideMsgAvatarTooltip() {
  mentionTooltip.visible = false
}

// User avatar tooltip (shows user persona description — positioned to the left)
function showUserAvatarTooltip(event) {
  const persona = activeUserPersona.value
  const name = persona?.name || 'User'
  const desc = persona?.description || ''
  if (!name) return
  const rect = event.currentTarget.getBoundingClientRect()
  mentionTooltip.source = 'message'
  mentionTooltip.name = name
  mentionTooltip.text = desc
  mentionTooltip.side = 'left'
  mentionTooltip.x = rect.left - 10
  mentionTooltip.y = rect.top + rect.height / 2
  mentionTooltip.visible = true
}

// Get assistant display name for a message
function getMsgAssistantName(msg) {
  const pid = msg.personaId || activeSystemPersonaIds.value[0]
  const persona = pid ? personasStore.getPersonaById(pid) : null
  return persona?.name || msg.personaName || 'Assistant'
}

const isGroupChat = computed(() => chatsStore.activeChat?.isGroupChat ?? false)

// Sticky @mention target: persists across messages until explicitly changed
// null = all personas, string[] = specific persona IDs
const stickyTarget = ref(null)

function clearStickyTarget() {
  stickyTarget.value = null
}

const stickyTargetLabel = computed(() => {
  if (!stickyTarget.value || stickyTarget.value.length === 0) return null
  return stickyTarget.value
    .map(id => personasStore.getPersonaById(id)?.name || 'Unknown')
    .join(', ')
})


// ── HTTP Tools modal state ──
const showToolsModal = ref(false)
const showChatConfigModal = ref(false)
const ccmActiveTab = ref('general')
const ccmToolSearch = ref('')
const ccmMcpSearch = ref('')

// ── General tab draft state ──
const draftMaxPersonaRounds = ref(10)
const draftMaxOutputTokens = ref(null)  // null = use global default

// ── Permissions tab draft state ──
const draftPermissionMode = ref('inherit')
const draftChatAllowList = ref([])
const draftChatDangerOverrides = ref([]) // patterns un-blocked for this chat in all_permissions mode
const newAllowPattern = ref('')
const newAllowDesc = ref('')

function addChatAllowEntry() {
  const pattern = newAllowPattern.value.trim()
  if (!pattern) return
  draftChatAllowList.value.push({ id: `chat-allow-${Date.now()}`, pattern, description: newAllowDesc.value.trim() })
  newAllowPattern.value = ''
  newAllowDesc.value = ''
}

function removeChatAllowEntry(idx) {
  draftChatAllowList.value.splice(idx, 1)
}

function addChatDangerOverride(pattern) {
  if (!draftChatDangerOverrides.value.includes(pattern))
    draftChatDangerOverrides.value.push(pattern)
}

function removeChatDangerOverride(pattern) {
  const idx = draftChatDangerOverrides.value.indexOf(pattern)
  if (idx !== -1) draftChatDangerOverrides.value.splice(idx, 1)
}

const ccmFilteredTools = computed(() => {
  const q = ccmToolSearch.value.toLowerCase()
  let list = toolsStore.tools
  if (q) {
    list = list.filter(t =>
      t.name?.toLowerCase().includes(q) ||
      t.description?.toLowerCase().includes(q) ||
      (t.type || 'http').includes(q)
    )
  }
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
})

// Group filtered tools by type for the grouped-by-category UI
const TYPE_LABELS = { http: 'HTTP', code: 'Code', prompt: 'Prompt', smtp: 'SMTP' }
const TYPE_ORDER = ['http', 'code', 'prompt', 'smtp']
const ccmGroupedTools = computed(() => {
  const groups = {}
  for (const t of ccmFilteredTools.value) {
    const type = t.type || 'http'
    if (!groups[type]) groups[type] = []
    groups[type].push(t)
  }
  return TYPE_ORDER
    .filter(k => groups[k])
    .map(k => ({
      type: k,
      label: TYPE_LABELS[k] || k,
      tools: groups[k],
      enabledCount: groups[k].filter(t => chatEnabledToolIds.value.has(t.id)).length
    }))
})

const ccmFilteredMcp = computed(() => {
  const q = ccmMcpSearch.value.toLowerCase()
  let list = mcpStore.servers
  if (q) {
    list = list.filter(s =>
      s.name?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q)
    )
  }
  return [...list].sort((a, b) => (a.name || '').localeCompare(b.name || ''))
})

// Snapshot of draft state before modal opens (for cancel/revert)
let _draftSnapshot = null

// Fetch models when config modal opens (for OpenRouter/OpenAI providers)
watch(showChatConfigModal, (open) => {
  if (!open) return
  ccmActiveTab.value = 'general'
  _loadDraftFromChat()
  // Snapshot for cancel
  _draftSnapshot = {
    enabledToolIds: new Set(chatEnabledToolIds.value),
    enabledMcpIds: new Set(chatEnabledMcpIds.value),
    workingPath: draftWorkingPath.value,
    codingMode: draftCodingMode.value,
    codingProvider: draftCodingProvider.value,
    maxPersonaRounds: draftMaxPersonaRounds.value,
    maxOutputTokens: draftMaxOutputTokens.value,
    permissionMode: draftPermissionMode.value,
    chatAllowList: JSON.parse(JSON.stringify(draftChatAllowList.value)),
    chatDangerOverrides: JSON.parse(JSON.stringify(draftChatDangerOverrides.value)),
  }
})

function saveChatSettings() {
  const chatId = chatsStore.activeChatId
  if (!chatId) return
  const rawRounds = Number(draftMaxPersonaRounds.value)
  const clampedRounds = Number.isFinite(rawRounds) ? Math.min(100, Math.max(1, rawRounds)) : 10
  const rawMaxOutput = Number(draftMaxOutputTokens.value)
  const clampedMaxOutput = draftMaxOutputTokens.value ? Math.min(98304, Math.max(1024, rawMaxOutput)) : null
  chatsStore.setChatSettings(chatId, {
    enabledToolIds: [...chatEnabledToolIds.value],
    enabledMcpIds: [...chatEnabledMcpIds.value],
    workingPath: draftWorkingPath.value || null,
    codingMode: draftCodingMode.value,
    codingProvider: draftCodingProvider.value,
    maxPersonaRounds: clampedRounds,
    maxOutputTokens: clampedMaxOutput,
    permissionMode: draftPermissionMode.value,
    chatAllowList: JSON.parse(JSON.stringify(draftChatAllowList.value)),
    chatDangerOverrides: JSON.parse(JSON.stringify(draftChatDangerOverrides.value)),
  })
  // If the agent is currently running, push the new permission mode to it immediately
  // so it takes effect for any pending/future tool calls in the current run.
  const runningChat = chatsStore.chats.find(c => c.id === chatId && c.isRunning)
  if (runningChat && window.electronAPI?.updatePermissionMode) {
    window.electronAPI.updatePermissionMode(chatId, {
      chatMode: draftPermissionMode.value,
      chatAllowList: JSON.parse(JSON.stringify(draftChatAllowList.value)),
    })
  }
  _draftSnapshot = null
  showChatConfigModal.value = false
}

function cancelChatSettings() {
  // Revert draft to snapshot
  if (_draftSnapshot) {
    chatEnabledToolIds.value = _draftSnapshot.enabledToolIds
    chatEnabledMcpIds.value = _draftSnapshot.enabledMcpIds
    draftWorkingPath.value = _draftSnapshot.workingPath
    draftCodingMode.value = _draftSnapshot.codingMode ?? false
    draftCodingProvider.value = _draftSnapshot.codingProvider ?? 'claude-code'
    draftMaxPersonaRounds.value = _draftSnapshot.maxPersonaRounds
    draftMaxOutputTokens.value = _draftSnapshot.maxOutputTokens ?? null
    draftPermissionMode.value = _draftSnapshot.permissionMode
    draftChatAllowList.value = _draftSnapshot.chatAllowList
    draftChatDangerOverrides.value = _draftSnapshot.chatDangerOverrides
  }
  _draftSnapshot = null
  showChatConfigModal.value = false
}

async function browseWorkingPath() {
  if (!window.electronAPI?.obsidian?.pickFolder) return
  const result = await window.electronAPI.obsidian.pickFolder()
  if (result) draftWorkingPath.value = result
}
const chatEnabledToolIds = ref(new Set())
const toolsSearchQuery = ref('')
const toolsCategoryFilter = ref('')
const draftWorkingPath = ref('')
const draftCodingMode = ref(false)
const draftCodingProvider = ref('claude-code')

// ── Coding mode tooltip state ──
const showCodingInfoTooltip = ref(false)
const showProviderInfoTooltip = ref(false)

const codingProviderInfo = computed(() => {
  const providers = {
    'claude-code': {
      label: 'Claude Code',
      description: 'Loads CLAUDE.md instruction files from your project hierarchy, identical to how the Claude Code CLI works. Each file is watched for live changes.',
      files: [
        '~/.claude/CLAUDE.md (global)',
        '<parent-dirs>/CLAUDE.md (ancestors)',
        '<working-path>/CLAUDE.md (project root)',
        '<working-path>/**/CLAUDE.md (sub-dirs, if any)',
      ],
    },
  }
  return providers[draftCodingProvider.value] || providers['claude-code']
})

// Resolve default tool IDs (global defaults or all tools)
function _defaultToolIds() {
  const allIds = toolsStore.tools.map(t => t.id)
  const defaults = configStore.config.defaultToolIds
  return defaults
    ? new Set(defaults.filter(id => allIds.includes(id)))
    : new Set(allIds)
}
// Resolve default MCP IDs (global defaults or all servers)
function _defaultMcpIds() {
  const allIds = mcpStore.servers.map(s => s.id)
  const defaults = configStore.config.defaultMcpServerIds
  return defaults
    ? new Set(defaults.filter(id => allIds.includes(id)))
    : new Set(allIds)
}

// Load draft state from the active chat's persisted settings
function _loadDraftFromChat() {
  const chat = chatsStore.activeChat
  if (!chat) return
  // Tools
  const allToolIds = toolsStore.tools.map(t => t.id)
  if (chat.enabledToolIds) {
    chatEnabledToolIds.value = new Set(
      chat.enabledToolIds.filter(id => allToolIds.includes(id))
    )
  } else {
    chatEnabledToolIds.value = _defaultToolIds()
  }
  // MCP
  const allMcpIds = mcpStore.servers.map(s => s.id)
  if (chat.enabledMcpIds) {
    chatEnabledMcpIds.value = new Set(chat.enabledMcpIds.filter(id => allMcpIds.includes(id)))
  } else {
    chatEnabledMcpIds.value = _defaultMcpIds()
  }
  // Working path
  draftWorkingPath.value = chat.workingPath || ''
  draftCodingMode.value = chat.codingMode ?? false
  draftCodingProvider.value = chat.codingProvider ?? 'claude-code'
  // Max persona rounds (null in JSON = use default 10)
  draftMaxPersonaRounds.value = chat.maxPersonaRounds ?? 10
  // Max output tokens (null = use global default)
  draftMaxOutputTokens.value = chat.maxOutputTokens ?? null
  // Permissions
  draftPermissionMode.value = chat.permissionMode || 'inherit'
  draftChatAllowList.value = JSON.parse(JSON.stringify(chat.chatAllowList || []))
  draftChatDangerOverrides.value = JSON.parse(JSON.stringify(chat.chatDangerOverrides || []))
  newAllowPattern.value = ''
  newAllowDesc.value = ''
}

// Auto-enable tools: initialize from chat or global defaults, add newly discovered tools
watch(() => toolsStore.tools.map(t => t.id), (allIds) => {
  if (allIds.length === 0) return
  const chat = chatsStore.activeChat
  if (chat?.enabledToolIds) {
    chatEnabledToolIds.value = new Set(
      chat.enabledToolIds.filter(id => allIds.includes(id))
    )
  } else if (chatEnabledToolIds.value.size === 0) {
    chatEnabledToolIds.value = _defaultToolIds()
  } else {
    // Add any new tools that weren't in the set yet
    const s = new Set(chatEnabledToolIds.value)
    for (const id of allIds) {
      if (!s.has(id)) s.add(id)
    }
    chatEnabledToolIds.value = s
  }
}, { deep: true })

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

// Token estimate for tools chip tooltip
const toolsTokenEstimate = computed(() =>
  enabledHttpTools.value.reduce((sum, t) => sum + estimateToolTokens(t), 0)
)

// ── MCP Selection modal state ──
const showMcpModal = ref(false)
const chatEnabledMcpIds = ref(new Set())
const mcpSearchQuery = ref('')

// Auto-enable MCP servers: initialize from chat or global defaults
watch(() => mcpStore.servers.map(s => s.id), (allIds) => {
  if (allIds.length === 0) return
  const chat = chatsStore.activeChat
  if (chat?.enabledMcpIds) {
    chatEnabledMcpIds.value = new Set(chat.enabledMcpIds.filter(id => allIds.includes(id)))
  } else if (chatEnabledMcpIds.value.size === 0) {
    chatEnabledMcpIds.value = _defaultMcpIds()
  } else {
    // Add any new servers that weren't in the set yet
    const s = new Set(chatEnabledMcpIds.value)
    for (const id of allIds) {
      if (!s.has(id)) s.add(id)
    }
    chatEnabledMcpIds.value = s
  }
}, { deep: true })

const enabledMcpServers = computed(() =>
  mcpStore.servers.filter(s => chatEnabledMcpIds.value.has(s.id))
)

const filteredModalMcpServers = computed(() => {
  const q = mcpSearchQuery.value.toLowerCase()
  if (!q) return mcpStore.servers
  return mcpStore.servers.filter(s =>
    s.name?.toLowerCase().includes(q) ||
    s.description?.toLowerCase().includes(q)
  )
})

function toggleMcp(id) {
  const s = new Set(chatEnabledMcpIds.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  chatEnabledMcpIds.value = s
}
function enableAllMcp() {
  chatEnabledMcpIds.value = new Set(mcpStore.servers.map(s => s.id))
}
function disableAllMcp() {
  chatEnabledMcpIds.value = new Set()
}

// Token estimate for MCP chip tooltip
const mcpTokenEstimate = computed(() =>
  enabledMcpServers.value.reduce((sum, s) => {
    const status = mcpStore.runningStatus[s.id]
    const toolCount = status?.toolCount ?? 10
    return sum + estimateMcpTokens(s, toolCount)
  }, 0)
)

// Persisted per-chat tool/MCP selections — used by runAgent() (reads from chat object, not draft)
const persistedEnabledToolIds = computed(() => {
  const chat = chatsStore.activeChat
  if (chat?.enabledToolIds) return new Set(chat.enabledToolIds)
  return _defaultToolIds()
})
const persistedEnabledHttpTools = computed(() =>
  toolsStore.tools.filter(t => persistedEnabledToolIds.value.has(t.id))
)
const persistedEnabledMcpIds = computed(() => {
  const chat = chatsStore.activeChat
  if (chat?.enabledMcpIds) return new Set(chat.enabledMcpIds)
  return _defaultMcpIds()
})
const persistedEnabledMcpServers = computed(() =>
  mcpStore.servers.filter(s => persistedEnabledMcpIds.value.has(s.id))
)
const persistedWorkingPath = computed(() => {
  const chat = chatsStore.activeChat
  return chat?.workingPath || configStore.config.artyfactPath || ''
})

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
  const a = configStore.config.anthropic || {}
  return a.utilityModel || a.sonnetModel || '(unset)'
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

// ── Chat Filter ─────────────────────────────────────────────────────────────
const chatFilterQuery = ref('')
const chatSearchCache = ref({}) // { chatId: 'lowercased message text' }

// Load messages and cache searchable text for a chat
async function ensureChatSearchable(chatId) {
  if (chatSearchCache.value[chatId] !== undefined) return
  const chat = chatsStore.chats.find(c => c.id === chatId)
  if (!chat) return
  if (chat.messages === null) {
    await chatsStore.ensureMessages(chatId)
  }
  const msgs = chat.messages || []
  chatSearchCache.value[chatId] = msgs
    .map(m => {
      if (typeof m.content === 'string') return m.content
      if (m.segments) return m.segments.filter(s => s.type === 'text').map(s => s.content).join(' ')
      return ''
    })
    .join(' ')
    .toLowerCase()
}

// When filter query changes, preload message history for all chats
watch(chatFilterQuery, async (q) => {
  if (!q.trim()) return
  for (const chat of chatsStore.chats) {
    if (chatSearchCache.value[chat.id] === undefined) {
      ensureChatSearchable(chat.id)
    }
  }
})

// Build a map of chatId → folderName for search badges
function _buildFolderNameMap(nodes, parentName = null, result = {}) {
  for (const node of nodes) {
    if (node.type === 'folder') {
      _buildFolderNameMap(node.children || [], node.name, result)
    } else {
      result[node.id] = parentName
    }
  }
  return result
}

const filteredChats = computed(() => {
  const q = chatFilterQuery.value.trim().toLowerCase()
  const allChats = chatsStore.chats
  if (!q) return allChats
  const folderNameMap = _buildFolderNameMap(chatsStore.chatTree)
  const sorted = [...allChats].sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0))
  return sorted
    .filter(chat => {
      if (chat.title.toLowerCase().includes(q)) return true
      const cached = chatSearchCache.value[chat.id]
      if (cached && cached.includes(q)) return true
      return false
    })
    .map(chat => ({ ...chat, _folderName: folderNameMap[chat.id] || null }))
})

// ── Tree Context Menu (DocsView pattern) ──────────────────────────────────────
const treeCtxMenu = ref({ visible: false, x: 0, y: 0, node: null })
const treeCtxDialog = ref({ visible: false, type: '', title: '', placeholder: '', value: '', x: 0, y: 0, folderId: null })
const ctxDialogInputRef = ref(null)
const treeTooltip = ref({ visible: false, text: '', right: 0, top: 0 })

function openTreeContextMenu(e, node, action = null) {
  e.preventDefault?.()
  e.stopPropagation?.()
  const x = Math.min(e.clientX, window.innerWidth - 220)
  const y = Math.min(e.clientY, window.innerHeight - 200)
  // Select the node on right-click (same as left-click selection)
  if (node?.type === 'folder') {
    selectedFolderId.value = node.id
    treeLastSelected.value = { type: 'folder', id: node.id }
  } else if (node?.type === 'chat') {
    selectedFolderId.value = null
    chatsStore.setActiveChat(node.id)
    treeLastSelected.value = { type: 'chat', id: node.id }
  }
  // If an action was passed directly (from hover button click), run it immediately
  if (action === 'rename' && node?.type === 'folder') {
    openCtxDialog('rename', node.name, node.id, x, y)
    return
  }
  if (action === 'delete' && node?.type === 'folder') {
    closeTreeCtxMenu()
    doDeleteFolder(node.id)
    return
  }
  treeCtxMenu.value = { visible: true, x, y, node }
}

function closeTreeCtxMenu() {
  treeCtxMenu.value.visible = false
}

function openCtxDialog(type, defaultValue, folderId, x, y) {
  closeTreeCtxMenu()
  const titles = { rename: 'Rename Folder', newFolder: 'New Folder', newChat: 'New Chat' }
  const placeholders = { rename: 'Folder name', newFolder: 'Folder name', newChat: 'Chat name' }
  treeCtxDialog.value = {
    visible: true, type,
    title: titles[type] || type,
    placeholder: placeholders[type] || '',
    value: defaultValue || '',
    x: Math.min(x, window.innerWidth - 240),
    y: Math.min(y, window.innerHeight - 160),
    folderId,
  }
  nextTick(() => {
    ctxDialogInputRef.value?.focus()
    ctxDialogInputRef.value?.select()
  })
}

function cancelCtxDialog() {
  treeCtxDialog.value.visible = false
}

async function commitCtxDialog() {
  const { type, value, folderId } = treeCtxDialog.value
  const name = value.trim()
  treeCtxDialog.value.visible = false
  if (!name) return
  if (type === 'rename') {
    await chatsStore.renameFolder(folderId, name)
  } else if (type === 'newFolder') {
    await chatsStore.createFolder(name, folderId)
  }
}

// Context menu action handlers
function ctxNewChat() {
  const node = treeCtxMenu.value.node
  const folderId = node?.type === 'folder' ? node.id : null
  closeTreeCtxMenu()
  // Open the standard new-chat modal (persona selection) with folder context
  newChat(folderId)
}

function ctxNewFolder() {
  const node = treeCtxMenu.value.node
  const parentFolderId = node?.type === 'folder' ? node.id : null
  const pos = { x: treeCtxMenu.value.x, y: treeCtxMenu.value.y }
  closeTreeCtxMenu()
  openCtxDialog('newFolder', '', parentFolderId, pos.x, pos.y)
}

function ctxRenameFolder() {
  const node = treeCtxMenu.value.node
  const pos = { x: treeCtxMenu.value.x, y: treeCtxMenu.value.y }
  closeTreeCtxMenu()
  if (node?.type === 'folder') openCtxDialog('rename', node.name, node.id, pos.x, pos.y)
}

function ctxDeleteFolder() {
  const node = treeCtxMenu.value.node
  closeTreeCtxMenu()
  if (node?.type === 'folder') doDeleteFolder(node.id)
}

function doDeleteFolder(folderId) {
  const node = _findFolderNodeById(folderId)
  if (node && node.children && node.children.length > 0) {
    folderNonEmptyAlert.value = node.name
    return
  }
  confirmDeleteTarget.value = { type: 'folder', id: folderId, label: node?.name || 'this folder' }
}

function _findFolderNodeById(folderId) {
  function walk(nodes) {
    for (const n of nodes) {
      if (n.id === folderId) return n
      if (n.children?.length) { const r = walk(n.children); if (r) return r }
    }
    return null
  }
  return walk(chatsStore.chatTree)
}

const folderNonEmptyAlert = ref(null)

// ── Chat Management ──────────────────────────────────────────────────────────
const showNewChatModal = ref(false)
const newChatName = ref('')
const newChatFolderId = ref(null)
const newChatNameInputRef = ref(null)
const newChatPersonaIds = ref([])
const showNewChatPersonaPopover = ref(false)
const newChatPersonaSearch = ref('')
const newChatPersonaSearchEl = ref(null)
const newChatFolderTreeExpanded = ref(new Set())
const ncpExpandedCatIds = ref(new Set())

function toggleNcpCat(id) {
  const s = new Set(ncpExpandedCatIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  ncpExpandedCatIds.value = s
}

function toggleNewChatFolderExpand(folderId) {
  const s = newChatFolderTreeExpanded.value
  if (s.has(folderId)) s.delete(folderId)
  else s.add(folderId)
  // Trigger reactivity
  newChatFolderTreeExpanded.value = new Set(s)
}

const filteredNewChatPersonas = computed(() => {
  const q = newChatPersonaSearch.value.toLowerCase().trim()
  const list = sortedSystemPersonas.value
  if (!q) return list
  return list.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.description && p.description.toLowerCase().includes(q))
  )
})

watch(showNewChatPersonaPopover, (open) => {
  if (open) {
    newChatPersonaSearch.value = ''
    ncpExpandedCatIds.value = new Set()
    nextTick(() => newChatPersonaSearchEl.value?.focus())
  }
})

function defaultPersonaIds() {
  const def = personasStore.defaultSystemPersona
  return def ? [def.id] : []
}

function toggleNewChatPersona(personaId) {
  const idx = newChatPersonaIds.value.indexOf(personaId)
  if (idx >= 0) {
    newChatPersonaIds.value.splice(idx, 1)
  } else {
    newChatPersonaIds.value.push(personaId)
  }
}

// folderId: null = root, undefined = use active folder context
function newChat(folderId) {
  const resolvedFolder = folderId !== undefined ? folderId : (chatsStore.activeFolderId?.value ?? null)
  showNewChatModal.value = true
  newChatName.value = ''
  newChatFolderId.value = resolvedFolder
  newChatPersonaIds.value = defaultPersonaIds()
  showNewChatPersonaPopover.value = false
  newChatPersonaSearch.value = ''
  // Pre-expand ancestors of pre-selected folder
  newChatFolderTreeExpanded.value = new Set(getAncestorFolderIds(resolvedFolder, chatsStore.chatTree))
  nextTick(() => newChatNameInputRef.value?.focus())
}

function getAncestorFolderIds(targetId, nodes, path = []) {
  if (!targetId) return []
  for (const n of nodes) {
    if (n.type !== 'folder') continue
    if (n.id === targetId) return path.map(p => p.id)
    if (n.children?.length) {
      const found = getAncestorFolderIds(targetId, n.children, [...path, n])
      if (found !== null) return found
    }
  }
  return null
}

async function confirmNewChat() {
  showNewChatModal.value = false
  const title = newChatName.value.trim() || 'New Chat'
  const personaCfg = newChatPersonaIds.value.length > 0 ? [...newChatPersonaIds.value] : null
  await chatsStore.createChat(title, personaCfg, newChatFolderId.value)
  nextTick(() => mentionInputRef.value?.focus())
}

function cancelNewChat() {
  showNewChatModal.value = false
  newChatName.value = ''
  newChatFolderId.value = null
  newChatPersonaIds.value = []
  showNewChatPersonaPopover.value = false
  newChatPersonaSearch.value = ''
}

const confirmDeleteTarget = ref(null) // { type: 'chat'|'groupPersona', id, pid?, label }

function requestDeleteChat(id) {
  if (voiceStore.isCallActive && voiceStore.activeChatId === id) return
  const chat = chatsStore.chats.find(c => c.id === id)
  confirmDeleteTarget.value = {
    type: 'chat',
    id,
    label: chat?.title || 'this chat',
  }
}

function requestRemoveGroupPersona(chatId, pid) {
  const persona = personasStore.getPersonaById(pid)
  confirmDeleteTarget.value = {
    type: 'groupPersona',
    id: chatId,
    pid,
    label: persona?.name || 'this persona',
  }
}

async function executeConfirmedDelete() {
  if (!confirmDeleteTarget.value) return
  const target = confirmDeleteTarget.value
  confirmDeleteTarget.value = null

  if (target.type === 'chat') {
    await chatsStore.removeChat(target.id)
  } else if (target.type === 'groupPersona') {
    chatsStore.removeGroupPersona(target.id, target.pid)
  } else if (target.type === 'message') {
    await chatsStore.deleteMessage(target.id, target.msgId)
  } else if (target.type === 'folder') {
    await chatsStore.deleteFolder(target.id)
  }
}

// ── Soul Viewer modal state ──────────────────────────────────────────────
const soulViewerTarget = ref(null) // { personaId, personaType, personaName }

function openSoulViewer(personaId, personaType, personaName) {
  const persona = personasStore.getPersonaById(personaId)
  soulViewerTarget.value = {
    personaId,
    personaType,
    personaName: persona?.name || personaName || 'Persona',
    personaDescription: persona?.description || '',
    personaPrompt: persona?.prompt || '',
    personaProviderId: persona?.providerId || null,
    personaModelId: persona?.modelId || null,
    personaVoiceId: persona?.voiceId || null,
    personaAvatar: persona?.avatar || null,
  }
}

function closeSoulViewer() {
  soulViewerTarget.value = null
}

async function handleSoulViewerUpdatePersona(updates) {
  if (!soulViewerTarget.value) return
  const pid = soulViewerTarget.value.personaId
  const persona = personasStore.getPersonaById(pid)
  if (!persona) return
  const updated = { ...persona, ...updates }
  await personasStore.savePersona(updated)
  // Re-check after await — viewer may have been closed while save was in flight
  if (!soulViewerTarget.value) return
  soulViewerTarget.value.personaPrompt = updated.prompt ?? soulViewerTarget.value.personaPrompt
  soulViewerTarget.value.personaDescription = updated.description ?? soulViewerTarget.value.personaDescription
  if (updates.providerId !== undefined) soulViewerTarget.value.personaProviderId = updated.providerId ?? null
  if (updates.modelId !== undefined) soulViewerTarget.value.personaModelId = updated.modelId ?? null
  if (updates.voiceId !== undefined) soulViewerTarget.value.personaVoiceId = updated.voiceId ?? null
}

// System persona config popover state moved to ChatHeader

// ── Persona chip popovers (moved to ChatHeader) ──

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
// Header-only display computed removed (moved to ChatHeader):
// activeSystemAvatarDataUri, activeUserAvatarDataUri, activeSystemPersonaName, activeUserPersonaName
// resolvedSystemPersonaId, resolvedUserPersonaId, sortedSystemPersonas, sortedUserPersonas

// ── Active system persona IDs (unified — single or multi) ────────────────
const activeSystemPersonaIds = computed(() => {
  const chat = chatsStore.activeChat
  if (!chat) return []
  // If group mode with explicit IDs, use those
  if (chat.groupPersonaIds?.length > 0) return [...chat.groupPersonaIds]
  // Otherwise, single persona mode: use systemPersonaId or default
  const id = chat.systemPersonaId || personasStore.defaultSystemPersona?.id
  return id ? [id] : []
})

// MAX_VISIBLE_AVATARS, visibleSystemPersonaIds, overflowSystemCount moved to ChatHeader

// toggleSystemPersona moved to ChatHeader

// getPersonaProviderLabel kept — also used in mention popup
function getPersonaProviderLabel(personaId) {
  const persona = personasStore.getPersonaById(personaId)
  if (!persona) return 'Default'
  const provider = persona.providerId || 'anthropic'
  const model = persona.modelId || ''
  if (model) {
    const short = model.split('/').pop().split(':')[0]
    return `${provider} · ${short}`
  }
  return provider
}

// sortedSystemPersonas kept — used in new chat persona picker
const sortedSystemPersonas = computed(() =>
  [...personasStore.systemPersonas].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)

// ── RAG chip popover ──────────────────────────────────────────────────────
const showRagPopover = ref(false)
const ragChipWrap = ref(null)

const ragEnabledCount = computed(() => {
  const configs = knowledgeStore.indexConfigs
  return Object.values(configs).filter(c => c.enabled).length
})

const ragEnabledIndexes = computed(() => {
  const configs = knowledgeStore.indexConfigs
  return Object.entries(configs)
    .filter(([, cfg]) => cfg.enabled)
    .map(([name, cfg]) => ({
      name,
      embeddingProvider: cfg.embeddingProvider || 'openai',
      embeddingModel: cfg.embeddingModel || 'text-embedding-3-small'
    }))
})


// Close popovers on outside click (persona header popovers now handled by ChatHeader)
function handlePopoverOutsideClick(e) {
  if (ragChipWrap.value && !ragChipWrap.value.contains(e.target)) showRagPopover.value = false
  if (showGroupPersonaConfigId.value) {
    const configPopover = document.querySelector('.group-persona-config-popover')
    if (configPopover && !configPopover.contains(e.target)) showGroupPersonaConfigId.value = null
  }
}



// ── Group Chat Functions ──────────────────────────────────────────────────────
function toggleGroupMode() {
  const chatId = chatsStore.activeChatId
  if (!chatId) return
  chatsStore.toggleGroupMode(chatId, !isGroupChat.value)
}

function toggleGroupPersona(personaId) {
  const chatId = chatsStore.activeChatId
  if (!chatId) return
  const ids = chatsStore.activeChat?.groupPersonaIds || []
  if (ids.includes(personaId)) {
    requestRemoveGroupPersona(chatId, personaId)
  } else {
    chatsStore.addGroupPersona(chatId, personaId)
  }
}

function openGroupPersonaConfig(personaId) {
  showGroupPersonaConfigId.value = showGroupPersonaConfigId.value === personaId ? null : personaId
}

function getGroupPersonaOverride(personaId, field) {
  const overrides = chatsStore.activeChat?.groupPersonaOverrides?.[personaId]
  if (!overrides) {
    // Fall back to persona defaults
    const persona = personasStore.getPersonaById(personaId)
    return persona?.[field] || ''
  }
  return overrides[field] || ''
}

function setGroupPersonaOverrideField(personaId, field, value) {
  const chatId = chatsStore.activeChatId
  if (!chatId) return
  const existing = chatsStore.activeChat?.groupPersonaOverrides?.[personaId] || {}
  chatsStore.setGroupPersonaOverride(chatId, personaId, { ...existing, [field]: value })
}

function onInputBlur() {
  inputFocused.value = false
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
 * Append resolved attachment paths to the textarea text.
 */
function appendPathsToInput(results) {
  const paths = results.filter(r => r.path).map(r => r.path)
  if (paths.length === 0) return
  const prefix = inputText.value.trimEnd()
  inputText.value = prefix ? `${prefix}\n${paths.join('\n')}` : paths.join('\n')
}

/**
 * Handle paste events on the input.
 * Order: (1) cd.files with .path [Explorer Ctrl+C], (2) text/plain path strings,
 * (3) clipboard image [PrtSc], (4) default text paste.
 */
async function onPaste(e) {
  const cd = e.clipboardData

  if (window.electronAPI?.resolveDropPaths) {
    // 1. Files copied from OS (Windows Explorer Ctrl+C) — .path exposed by Electron
    const filePaths = Array.from(cd?.files || []).map(f => f.path).filter(Boolean)
    if (filePaths.length > 0) {
      e.preventDefault()
      try {
        const results = await window.electronAPI.resolveDropPaths(filePaths)
        if (results?.length > 0) {
          attachments.value.push(...results)
          appendPathsToInput(results)
        }
      } catch (err) {
        dbg(`Paste attach error: ${err.message}`, 'error')
      }
      return
    }

    // 2. Manually pasted path strings in text/plain
    const pasted = cd?.getData('text/plain') || ''
    const lines = pasted.split(/[\r\n]+/).map(l => l.trim()).filter(Boolean)
    const pathLines = lines.filter(l =>
      /^[A-Za-z]:[/\\]/.test(l) ||   // Windows: C:\foo or C:/foo
      l.startsWith('/') ||             // Linux: /home/...
      l.startsWith('file://') ||       // URI: file:///C:/...
      l.startsWith('\\\\')             // UNC: \\server\share
    )
    if (pathLines.length > 0 && pathLines.length === lines.length) {
      e.preventDefault()
      try {
        const results = await window.electronAPI.resolveDropPaths(pathLines)
        if (results?.length > 0) {
          attachments.value.push(...results)
          appendPathsToInput(results)
        }
      } catch (err) {
        dbg(`Paste attach error: ${err.message}`, 'error')
      }
      return
    }
  }

  // 3. Clipboard image (PrtSc / screenshot tool)
  const items = cd?.items
  if (items) {
    for (const item of items) {
      if (item.kind === 'file' && item.type.startsWith('image/')) {
        e.preventDefault()
        const file = item.getAsFile()
        if (!file) continue
        const mediaType = item.type
        const ext = mediaType.split('/')[1] || 'png'
        const name = `screenshot-${Date.now()}.${ext}`
        const reader = new FileReader()
        reader.onload = (ev) => {
          const dataUri = ev.target.result
          const base64 = dataUri.split(',')[1]
          attachments.value.push({
            id: uuidv4(), name, type: 'image',
            base64, mediaType, preview: dataUri,
            size: file.size, path: null
          })
        }
        reader.readAsDataURL(file)
        return
      }
    }
  }
  // 4. Default: let browser paste text normally
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
  // Delegate to ChatWindow's exposed scrollToBottom if available
  if (chatWindowRef.value?.scrollToBottom) {
    chatWindowRef.value.scrollToBottom(force)
    return
  }
  // Fallback: direct scroll (for cases where ChatWindow isn't mounted yet)
  if (!force && userScrolled.value) return
  programmaticScrollCount++
  nextTick(() => {
    nextTick(() => {
      if (messagesEl.value) {
        messagesEl.value.scrollTop = messagesEl.value.scrollHeight
      }
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

function requestDeleteMessage(msg) {
  if (!chatsStore.activeChatId) return
  confirmDeleteTarget.value = {
    type: 'message',
    id: chatsStore.activeChatId,
    msgId: msg.id,
    label: (msg.content || '').slice(0, 60) || '(empty message)',
  }
}

function quoteMessage(msg) {
  const content = msg.content || ''
  quotedMessage.value = { role: msg.role, content, personaId: msg.personaId || null }
  nextTick(() => mentionInputRef.value?.focus())
}

function getQuotedSenderName(q) {
  if (!q) return 'Assistant'
  const ac = chatsStore.activeChat
  if (q.role === 'user') {
    const uid = ac?.userPersonaId
    const up = uid ? personasStore.getPersonaById(uid) : personasStore.defaultUserPersona
    return up?.name || 'You'
  }
  if (q.personaId) {
    const p = personasStore.getPersonaById(q.personaId)
    if (p?.name) return p.name
  }
  const sysId = ac?.systemPersonaId
  if (sysId) {
    const p = personasStore.getPersonaById(sysId)
    if (p?.name) return p.name
  }
  return personasStore.defaultSystemPersona?.name || 'Assistant'
}

function clearQuote() {
  quotedMessage.value = null
}

function formatTime(ts) {
  if (!ts) return ''
  const d = new Date(ts)
  const Y = d.getFullYear()
  const M = String(d.getMonth() + 1).padStart(2, '0')
  const D = String(d.getDate()).padStart(2, '0')
  const h = String(d.getHours()).padStart(2, '0')
  const m = String(d.getMinutes()).padStart(2, '0')
  return `${Y}-${M}-${D} ${h}:${m}`
}

function formatTokenCount(n) {
  if (!n || n === 0) return '0'
  if (n >= 1000) return (n / 1000).toFixed(1) + 'k'
  return String(n)
}

// ── Send / Agent Loop ─────────────────────────────────────────────────────────
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

// Helper: push segments to the live streaming message for a chat or persona
// key can be chatId or chatId:personaId
function flushSegments(key) {
  const chatId = key.includes(':') ? key.split(':')[0] : key
  const chat = chatsStore.chats.find(c => c.id === chatId)
  if (!chat || !chat.messages) return
  const msgId = perChatStreamingMsgId.get(key)
  const segments = perChatStreamingSegments.get(key) || []
  const msg = chat.messages.find(m => m.id === msgId)
  if (!msg) return
  // Preserve resolved permission statuses — the user may have clicked a button before
  // the agent finishes, mutating msg.segments[i].status. Don't overwrite with 'pending'.
  const prevSegs = msg.segments || []
  msg.segments = segments.map(s => {
    if (s.type === 'permission') {
      const live = prevSegs.find(p => p.type === 'permission' && p.blockId === s.blockId)
      if (live && live.status !== 'pending') return { ...s, status: live.status }
    }
    return { ...s }
  })
  msg.content = segments.filter(s => s.type === 'text').map(s => s.content).join('')
  msg.streaming = true
}

function handleChunk(cId, chunk) {
  // ── Memory suggestions (post-turn extraction) ──
  if (chunk.type === 'memory_suggestions') {
    const items = (chunk.items || []).map((m, idx) => ({
      id: `${cId}-mem-${Date.now()}-${idx}`,
      target: m.target,
      personaType: m.personaType,
      personaId: m.personaId,
      section: m.section,
      entry: m.entry,
      status: 'pending',
    }))
    if (items.length > 0) {
      memorySuggestions.value.set(cId, items)
      scheduleMemoryAutoDismiss(cId)
    }
    return
  }

  if (chunk.type === 'plan_submitted') {
    const chat = chatsStore.chats.find(c => c.id === cId)
    if (chat?.messages) {
      const msg = [...chat.messages].reverse().find(m => m.role === 'assistant' && m.streaming)
      if (msg) {
        msg.planData  = chunk.plan
        msg.planState = 'pending'
      }
    }
    return
  }

  const targetChat = chatsStore.chats.find(c => c.id === cId)
  if (!targetChat || !targetChat.messages) return

  // ── Group chat: persona_start / persona_end bracket each persona's response ──
  if (chunk.type === 'persona_start') {
    const personaKey = `${cId}:${chunk.personaId}`
    // Guard: skip if a streaming message already exists for this persona (prevent duplicates)
    if (perChatStreamingMsgId.has(personaKey)) {
      dbg(`persona_start DUPLICATE skipped: ${chunk.personaName} (${chunk.personaId})`, 'warn')
      return
    }
    const msgId = uuidv4()
    perChatStreamingMsgId.set(personaKey, msgId)
    perChatStreamingSegments.set(personaKey, [])
    // Add a streaming placeholder message for this persona
    targetChat.messages.push({
      id: msgId,
      role: 'assistant',
      content: '',
      streaming: true,
      streamingStartedAt: Date.now(),
      personaId: chunk.personaId,
      personaName: chunk.personaName,
      segments: []
    })
    dbg(`persona_start: ${chunk.personaName} (${chunk.personaId})`, 'info')
    scrollToBottom(false, cId)
    return
  }

  if (chunk.type === 'persona_end') {
    const personaKey = `${cId}:${chunk.personaId}`
    const msgId = perChatStreamingMsgId.get(personaKey)
    if (msgId) {
      const msg = targetChat.messages.find(m => m.id === msgId)
      if (msg) {
        msg.streaming = false
        if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
        // If content is empty, show indicator
        if (!msg.content && (!msg.segments || msg.segments.length === 0)) {
          msg.content = '_No response_'
          msg.segments = [{ type: 'text', content: '_No response_' }]
        }
      }
    }
    perChatStreamingMsgId.delete(personaKey)
    perChatStreamingSegments.delete(personaKey)
    dbg(`persona_end: ${chunk.personaName}`, 'info')
    scrollToBottom(false, cId)
    return
  }

  // For group chat chunks tagged with personaId, route to the right persona's streaming message
  const routeKey = chunk.personaId ? `${cId}:${chunk.personaId}` : cId

  if (chunk.type === 'text') {
    targetChat.isThinking = false
    lastTextSeg(routeKey).content += chunk.text
    flushSegments(routeKey)
    scrollToBottom(false, cId)
  } else if (chunk.type === 'tool_call') {
    dbg(`tool_call: ${chunk.name} input=${JSON.stringify(chunk.input).slice(0,80)}`, 'warn')
    const segments = perChatStreamingSegments.get(routeKey) || []
    segments.push({ type: 'tool', name: chunk.name, input: chunk.input ?? {}, output: undefined })
    perChatStreamingSegments.set(routeKey, segments)
    flushSegments(routeKey)
    scrollToBottom(false, cId)
  } else if (chunk.type === 'tool_result') {
    dbg(`tool_result: ${chunk.name} result=${JSON.stringify(chunk.result).slice(0,80)}`, 'warn')
    const toolSeg = lastToolSeg(routeKey)
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
          const imgSegments = perChatStreamingSegments.get(routeKey) || []
          imgSegments.push({ type: 'image', images: unique, source: chunk.name })
          perChatStreamingSegments.set(routeKey, imgSegments)
        }
      }
    }
    flushSegments(routeKey)
    scrollToBottom(false, cId)
  } else if (chunk.type === 'permission_request') {
    const segments = perChatStreamingSegments.get(routeKey) || []
    segments.push({
      type: 'permission',
      blockId: chunk.blockId,
      toolName: chunk.toolName,
      command: chunk.command,
      toolInput: chunk.toolInput,
      chatId: cId,
      status: 'pending',
    })
    perChatStreamingSegments.set(routeKey, segments)
    flushSegments(routeKey)
    scrollToBottom(false, cId)
    chatsStore.markPermissionPending(cId)
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
  } else if (chunk.type === 'max_tokens_reached') {
    dbg(`max_tokens reached (limit=${chunk.limit})`, 'warn')
  } else if (chunk.type === 'subagent_progress') {
    dbg(`subagent: ${chunk.agent || 'unknown'} — ${chunk.status || JSON.stringify(chunk).slice(0,60)}`, 'info')
  }
}

// flushSegments for group chat needs to find message by routeKey (chatId:personaId)
// Override flushSegments to handle both single and group keys

// ── Memory suggestions helpers ─────────────────────────────────────────────
const pendingMemorySuggestions = computed(() => {
  const items = memorySuggestions.value.get(chatsStore.activeChatId) || []
  return items.filter(i => i.status === 'pending')
})

function scheduleMemoryAutoDismiss(chatId) {
  if (memoryAutoDismissTimer) clearTimeout(memoryAutoDismissTimer)
  memoryAutoDismissTimer = setTimeout(() => {
    const items = memorySuggestions.value.get(chatId)
    if (items) {
      items.forEach(i => { if (i.status === 'pending') i.status = 'dismissed' })
    }
  }, 30000)
}

async function acceptMemory(item) {
  if (!window.electronAPI?.memory?.accept) return
  item.status = 'accepted'
  try {
    await window.electronAPI.memory.accept({
      personaId: item.personaId,
      personaType: item.personaType,
      section: item.section,
      entry: item.entry,
    })
  } catch (err) {
    dbg(`Memory accept failed: ${err.message}`, 'error')
  }
}

function dismissMemory(item) {
  item.status = 'dismissed'
}

async function acceptAllMemories() {
  const items = memorySuggestions.value.get(chatsStore.activeChatId) || []
  for (const item of items) {
    if (item.status === 'pending') await acceptMemory(item)
  }
}

function dismissAllMemories() {
  const items = memorySuggestions.value.get(chatsStore.activeChatId) || []
  items.forEach(i => { if (i.status === 'pending') i.status = 'dismissed' })
}

// Bridge for ChatWindow's send event (only fires if default input is used)
function handleChatWindowSend(text) {
  if (text) inputText.value = text
  sendMessage()
}

// ── Group chat collaboration helpers ──────────────────────────────────────────

/**
 * Build the personaRuns array for a group agent call.
 * Extracted so it can be reused by both the initial user-triggered run and
 * subsequent persona-to-persona collaboration rounds.
 */
function buildPersonaRuns(respondingIds, groupIds, cfg, targetChat, userPersonaPrompt, usrPersona) {
  return respondingIds.map(pid => {
    const persona = personasStore.getPersonaById(pid)
    if (!persona) return null

    const personaCfg = { ...cfg }
    const resolvedProvider = persona.providerId || 'anthropic'
    if (resolvedProvider === 'anthropic') {
      personaCfg.apiKey = cfg.anthropic?.apiKey || ''
      personaCfg.baseURL = cfg.anthropic?.baseURL || ''
    } else if (resolvedProvider === 'openrouter') {
      personaCfg.apiKey = cfg.openrouter?.apiKey || ''
      personaCfg.baseURL = cfg.openrouter?.baseURL || ''
    } else if (resolvedProvider === 'openai') {
      personaCfg.openaiApiKey = cfg.openai?.apiKey || ''
      personaCfg.openaiBaseURL = cfg.openai?.baseURL || ''
      personaCfg._resolvedProvider = 'openai'
      personaCfg.defaultProvider = 'openai'
    } else if (resolvedProvider === 'deepseek') {
      personaCfg.openaiApiKey = cfg.deepseek?.apiKey || ''
      personaCfg.openaiBaseURL = (cfg.deepseek?.baseURL || '').replace(/\/+$/, '')
      personaCfg._resolvedProvider = 'openai'
      personaCfg._directAuth = true
      personaCfg.defaultProvider = 'openai'
    }
    // Model: chat override > persona.modelId
    const resolvedModel = targetChat.personaModelOverrides?.[pid] || persona.modelId || null
    if (resolvedModel) personaCfg.customModel = resolvedModel

    const otherParticipants = groupIds
      .filter(id => id !== pid)
      .map(id => {
        const p = personasStore.getPersonaById(id)
        return { id, name: p?.name || 'Unknown', description: p?.description || '', prompt: p?.prompt || '' }
      })
    const personaPrompts = {
      systemPersonaPrompt: persona.prompt || '',
      userPersonaPrompt: userPersonaPrompt || '',
      systemPersonaId: pid,
      userPersonaId: usrPersona?.id || '__default_user__',
      groupChatContext: { personaName: persona.name, personaDescription: persona.description || '', otherParticipants }
    }

    return {
      personaId: pid,
      personaName: persona.name,
      config: JSON.parse(JSON.stringify(personaCfg)),
      enabledAgents: [],
      enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value)),
      personaPrompts,
      mcpServers: JSON.parse(JSON.stringify(persistedEnabledMcpServers.value)),
      httpTools: JSON.parse(JSON.stringify(persistedEnabledHttpTools.value)),
    }
  }).filter(Boolean)
}

/**
 * Fire the group runAgent call and finalize any errored streaming messages.
 * Returns the raw result from electronAPI.runAgent.
 */
async function runGroupPersonas(chatId, targetChat, personaRuns, apiMessages, cfg, pendingAttachments) {
  const res = await window.electronAPI.runAgent({
    chatId,
    messages: JSON.parse(JSON.stringify(apiMessages)),
    config: JSON.parse(JSON.stringify(cfg)),
    enabledAgents: [],
    enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value)),
    ...(pendingAttachments.length > 0 ? { currentAttachments: JSON.parse(JSON.stringify(pendingAttachments)) } : {}),
    mcpServers: JSON.parse(JSON.stringify(persistedEnabledMcpServers.value)),
    httpTools: JSON.parse(JSON.stringify(persistedEnabledHttpTools.value)),
    personaRuns,
    chatPermissionMode: targetChat.permissionMode || 'inherit',
    chatAllowList: JSON.parse(JSON.stringify(targetChat.chatAllowList || [])),
    chatDangerOverrides: JSON.parse(JSON.stringify(targetChat.chatDangerOverrides || [])),
    maxOutputTokens: targetChat.maxOutputTokens || null,
    knowledgeConfig: {
      ragEnabled: knowledgeStore.ragEnabled,
      pineconeApiKey: knowledgeStore.pineconeApiKey,
      pineconeIndexName: knowledgeStore.pineconeIndexName,
      embeddingProvider: knowledgeStore.embeddingProvider,
      embeddingModel: knowledgeStore.embeddingModel,
      indexConfigs: JSON.parse(JSON.stringify(knowledgeStore.indexConfigs))
    },
  })

  dbg(`Group runAgent returned → success=${res.success} results=${res.results?.length ?? 0}`, res.success ? 'success' : 'error')

  if (res.results) {
    for (const r of res.results) {
      if (!r.success) {
        const msg = targetChat.messages.findLast(m => m.personaId === r.personaId && m.role === 'assistant')
        if (msg && !msg.content) {
          msg.content = `Error: ${r.error}`
          msg.segments = [{ type: 'text', content: `Error: ${r.error}` }]
        }
      }
    }
  }

  return res
}


/**
 * Inject a special system-style message when the collaboration loop reaches
 * the iteration limit.
 */
function injectCollaborationSummary(targetChat, iterationCount) {
  const summaryMsg = {
    id: uuidv4(),
    role: 'assistant',
    content: `**Collaboration reached the maximum of ${iterationCount} iterations.** The personas were unable to reach a final resolution within the limit. Please review the conversation and decide how to proceed.`,
    segments: [{ type: 'text', content: `**Collaboration reached the maximum of ${iterationCount} iterations.** The personas were unable to reach a final resolution within the limit. Please review the conversation and decide how to proceed.` }],
    isCollaborationSummary: true,
    streaming: false,
  }
  targetChat.messages.push(summaryMsg)
}

/**
 * After each group-chat round, scan ONLY the messages added in that round
 * (slice from prevMessagesLength) for @mentions of other personas, and trigger
 * those personas to respond — creating a persona-to-persona collaboration loop.
 *
 * Runs recursively until no new @mentions are found or MAX_ITERATIONS is hit.
 * The iteration counter and prevMessagesLength are passed through recursion
 * (no global state). prevMessagesLength ensures we never re-scan earlier
 * rounds' messages and accidentally re-trigger personas that were already done.
 */
async function triggerPersonaCollaboration(chatId, groupIds, cfg, userPersonaPrompt, usrPersona, iterationCount, prevMessagesLength) {
  const targetChat = chatsStore.chats.find(c => c.id === chatId)
  if (!targetChat || !targetChat.messages) return

  // Per-chat limit; fall back to 10 if not set. Hard cap at 100.
  const MAX_ITERATIONS = Math.min(100, Math.max(1, targetChat.maxPersonaRounds ?? 10))

  const groupPersonas = groupIds.map(id => personasStore.getPersonaById(id)).filter(Boolean)

  // Only examine messages added in the most recent runGroupPersonas call
  const newMessages = targetChat.messages
    .slice(prevMessagesLength)
    .filter(m => m.role === 'assistant' && m.personaId && groupIds.includes(m.personaId) && !m.streaming)

  // For each new message, resolve which @mentioned personas are actually being
  // addressed (vs. merely referenced). Mirrors the user→persona routing logic.
  const nextRespondingSet = new Set()
  for (const msg of newMessages) {
    const { mentions } = parseMentions(msg.content || '', groupPersonas)
    // Exclude the sender itself
    const others = mentions.filter(id => id !== msg.personaId)
    if (others.length === 0) continue

    let addressees = others
    if (others.length >= 2) {
      // 2+ mentions — ask the LLM which ones are actually being addressed
      try {
        const mentionedPersonas = others.map(id => {
          const p = personasStore.getPersonaById(id)
          return p ? { id, name: p.name } : null
        }).filter(Boolean)
        const result = await window.electronAPI.resolveAddressees({
          message: msg.content,
          personas: mentionedPersonas,
          config: JSON.parse(JSON.stringify(cfg)),
        })
        if (result?.addresseeIds?.length > 0) addressees = result.addresseeIds
      } catch (err) {
        dbg('resolveAddressees failed in collaboration loop, using all mentions:', err?.message)
      }
    }

    for (const id of addressees) nextRespondingSet.add(id)
  }

  if (nextRespondingSet.size === 0) return  // No more collaboration needed

  dbg(`Persona collaboration round ${iterationCount + 1}: [${[...nextRespondingSet].join(', ')}] are the addressees`)

  if (iterationCount >= MAX_ITERATIONS) {
    injectCollaborationSummary(targetChat, iterationCount)
    scrollToBottom(false, chatId)
    await chatsStore.persist?.()
    return
  }

  // Run each addressed persona SEQUENTIALLY so messages appear in logical
  // conversation order (A responds → B sees A's response → B responds).
  // This prevents the visual chaos of concurrent streaming in collaboration rounds.
  const respondingIds = [...nextRespondingSet]
  dbg(`Collaboration run (sequential): ${respondingIds.length} persona(s): ${respondingIds.map(id => personasStore.getPersonaById(id)?.name).join(', ')}`)

  const nextLength = targetChat.messages.length

  for (let i = 0; i < respondingIds.length; i++) {
    const pid = respondingIds[i]
    const persona = personasStore.getPersonaById(pid)
    if (!persona) continue

    // Rebuild apiMessages before each persona so it sees prior personas' output
    const seqApiMessages = targetChat.messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming && m.content))
      .map(m => ({ role: m.role, content: m.content }))

    // Ensure conversation ends with a user message (API requirement)
    if (seqApiMessages.length > 0 && seqApiMessages[seqApiMessages.length - 1].role === 'assistant') {
      seqApiMessages.push({
        role: 'user',
        content: `[${persona.name}, you have been addressed above. Please respond now as ${persona.name}.]`
      })
    }

    const personaRuns = buildPersonaRuns([pid], groupIds, cfg, targetChat, userPersonaPrompt, usrPersona)
    await runGroupPersonas(chatId, targetChat, personaRuns, seqApiMessages, cfg, [])
    scrollToBottom(false, chatId)
  }

  await chatsStore.persist?.()

  // Recurse — pass nextLength so the next call only scans THIS round's output
  await triggerPersonaCollaboration(chatId, groupIds, cfg, userPersonaPrompt, usrPersona, iterationCount + 1, nextLength)
}

// ─────────────────────────────────────────────────────────────────────────────

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
    const quotedName = getQuotedSenderName(pendingQuote)
    text = `> **${quotedName}:** ${pendingQuote.content.slice(0, 500)}${pendingQuote.content.length > 500 ? '...' : ''}\n\n${rawText}`
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
    mentionInputRef.value?.resetHeight()
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
  mentionInputRef.value?.resetHeight()

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

  // Mark THIS chat as running (per-chat state, not global)
  const targetChat = chatsStore.chats.find(c => c.id === chatId)
  if (!targetChat) throw new Error('targetChat is null after addMessage')

  // Detect group chat mode — unified: multiple system personas = group
  const isGroup = activeSystemPersonaIds.value.length > 1

  // ── Single-persona mode: add streaming placeholder as before ──
  let streamingMsgId = null
  if (!isGroup) {
    streamingMsgId = uuidv4()
    perChatStreamingMsgId.set(chatId, streamingMsgId)
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
  } else {
    // Group mode: streaming placeholders are created by handleChunk(persona_start)
    streamingSeconds.value = 0
    streamingTimer = setInterval(() => { streamingSeconds.value++ }, 1000)
  }

  // Release the guard and force-scroll to show the new messages
  programmaticScrollCount = Math.max(0, programmaticScrollCount - 1)
  scrollToBottom(true)

  // Flush Vue's DOM update so the streaming bubble (spinner) renders immediately
  // before the synchronous config-building work below blocks the JS thread.
  await nextTick()

  targetChat.isRunning = true

  // Build messages for API (only user/assistant, no tool indicators)
  dbg(`targetChat=${targetChat.id} messages=${targetChat.messages?.length ?? 'N/A'}`)

  const apiMessages = targetChat.messages
    .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming && m.content))
    .map(m => ({ role: m.role, content: m.content }))

  // Resolve persona for this run
  const sysPersonaId = isGroup
    ? null  // group path resolves per-persona below
    : (targetChat.systemPersonaId || personasStore.defaultSystemPersona?.id)
  const sysPersona = sysPersonaId ? personasStore.getPersonaById(sysPersonaId) : personasStore.defaultSystemPersona

  const chatProvider = sysPersona?.providerId || 'anthropic'
  const cfg = { ...configStore.config }

  if (chatProvider === 'anthropic') {
    cfg.apiKey = cfg.anthropic?.apiKey || ''
    cfg.baseURL = cfg.anthropic?.baseURL || ''
  } else if (chatProvider === 'openrouter') {
    cfg.apiKey = cfg.openrouter?.apiKey || ''
    cfg.baseURL = cfg.openrouter?.baseURL || ''
  } else if (chatProvider === 'openai') {
    cfg.openaiApiKey = cfg.openai?.apiKey || ''
    cfg.openaiBaseURL = cfg.openai?.baseURL || ''
    cfg._resolvedProvider = 'openai'
    cfg.defaultProvider = 'openai'
  } else if (chatProvider === 'deepseek') {
    cfg.openaiApiKey = cfg.deepseek?.apiKey || ''
    cfg.openaiBaseURL = (cfg.deepseek?.baseURL || '').replace(/\/+$/, '')
    cfg._resolvedProvider = 'openai'
    cfg._directAuth = true
    cfg.defaultProvider = 'openai'
  }

  // Model: chat override takes priority over persona.modelId
  const chatOverrideModel = targetChat.personaModelOverrides?.[sysPersonaId] || null
  const resolvedModel = chatOverrideModel || sysPersona?.modelId || null
  if (resolvedModel) cfg.customModel = resolvedModel

  // isActive guard
  if (!isGroup && !configStore.config[chatProvider]?.isActive) {
    await chatsStore.addMessage(chatId, {
      role: 'assistant',
      content: `⚠️ Provider **${chatProvider}** is not active. Go to **Configuration** and run Test Connection to activate it.`,
    })
    targetChat.isRunning = false
    return
  }
  // Per-chat working path (artifact directory)
  if (targetChat.workingPath) {
    cfg.chatWorkingPath = targetChat.workingPath
  }
  // Coding Mode: inject CLAUDE.md context into cfg.
  // Primary: use watcher-cached context (_codingModeContext) which updates automatically on file change.
  // Fallback: one-shot IPC read for the first send before the watcher has fired.
  if (targetChat.codingMode && targetChat.workingPath) {
    try {
      // Use watcher cache if available (avoids redundant file I/O)
      const cached = targetChat.id === chatsStore.activeChatId ? _codingModeContext.value : null
      const claudeCtx = cached ?? (
        window.electronAPI?.claude?.loadContext
          ? await window.electronAPI.claude.loadContext(targetChat.workingPath)
          : null
      )
      if (claudeCtx) cfg.claudeContext = claudeCtx
    } catch (err) {
      console.warn('[CodingMode] Failed to load CLAUDE.md context:', err)
    }
  }
  dbg(`runAgent → chatId=${chatId} provider=${chatProvider} model=${resolvedModel || '(default)'} msgs=${apiMessages.length} skills=[${enabledSkills.value.join(',')||'none'}] group=${isGroup}`)
  dbg(`config → baseURL=${cfg.baseURL} apiKey=${cfg.apiKey ? cfg.apiKey.slice(0,8)+'…' : '(empty)'} sonnet=${cfg.anthropic?.sonnetModel}`)

  // Chunks are handled by the persistent handleChunk listener registered in onMounted

  try {
    // Resolve user persona prompt (shared across all personas)
    const usrPersonaId = targetChat.userPersonaId
    const usrPersona = usrPersonaId
      ? personasStore.getPersonaById(usrPersonaId)
      : personasStore.defaultUserPersona
    const userPersonaPrompt = usrPersona?.prompt || null

    if (isGroup) {
      // ── GROUP CHAT PATH ──
      // Parse @mentions to determine which personas respond
      const groupIds = activeSystemPersonaIds.value
      const groupPersonas = groupIds.map(id => personasStore.getPersonaById(id)).filter(Boolean)
      const { mentions, mentionAll } = parseMentions(text, groupPersonas)

      // When 2+ personas are @mentioned, ask the LLM to determine which ones are
      // actually being spoken TO vs. merely referenced (e.g. "say hi to @Bob").
      // For 0 or 1 mentions, skip the extra call — no ambiguity.
      let addressees = mentions
      if (!mentionAll && mentions.length >= 2) {
        try {
          const mentionedPersonas = mentions.map(id => {
            const p = personasStore.getPersonaById(id)
            return p ? { id, name: p.name } : null
          }).filter(Boolean)
          const result = await window.electronAPI.resolveAddressees({
            message: text,
            personas: mentionedPersonas,
            config: JSON.parse(JSON.stringify(cfg)),
          })
          // Only use AI result if it returned at least one addressee; otherwise
          // fall back to all mentions (prevents silencing everyone on bad parse).
          if (result?.addresseeIds?.length > 0) {
            addressees = result.addresseeIds
          }
        } catch (err) {
          dbg('resolveAddressees failed, falling back to all mentions:', err?.message)
        }
      }

      // Determine responding personas with sticky targeting:
      // 1. Explicit @all → target all, clear sticky
      // 2. Addressees resolved above → target those, update sticky
      // 3. No mentions → use sticky target if set, otherwise all
      let respondingIds
      if (mentionAll) {
        respondingIds = [...groupIds]
        stickyTarget.value = null
      } else if (addressees.length > 0) {
        respondingIds = [...new Set(addressees)]
        stickyTarget.value = [...respondingIds]
      } else if (stickyTarget.value && stickyTarget.value.length > 0) {
        // Use sticky target, but only personas still in the group
        respondingIds = stickyTarget.value.filter(id => groupIds.includes(id))
        if (respondingIds.length === 0) {
          respondingIds = [...groupIds]
          stickyTarget.value = null
        }
      } else {
        respondingIds = [...groupIds]
      }

      dbg(`Group targeting: mentions=${mentions.length} addressees=${addressees.length} mentionAll=${mentionAll} sticky=${stickyTarget.value?.length ?? 'null'} responding=${respondingIds.length}`)

      // Store mention data on user message (all mentions, not just addressees)
      const userMsg = targetChat.messages.findLast(m => m.role === 'user')
      if (userMsg) {
        userMsg.mentions = mentions
        userMsg.mentionAll = mentionAll
      }

      // Build personaRuns[]
      const personaRuns = buildPersonaRuns(respondingIds, groupIds, cfg, targetChat, userPersonaPrompt, usrPersona)

      dbg(`Group run: ${personaRuns.length} persona(s) responding: ${personaRuns.map(r => r.personaName).join(', ')}`)

      const msgCountBeforeRun = targetChat.messages.length
      await runGroupPersonas(chatId, targetChat, personaRuns, apiMessages, cfg, pendingAttachments)

      // After the initial group run, check for persona→persona @mentions and loop.
      // Pass the pre-run message count so we only scan THIS round's new messages.
      await triggerPersonaCollaboration(chatId, groupIds, cfg, userPersonaPrompt, usrPersona, 0, msgCountBeforeRun)

    } else {
      // ── SINGLE PERSONA PATH ──
      const resolvedPersonaPrompts = {}
      const sysPersonaId = activeSystemPersonaIds.value[0] || targetChat.systemPersonaId
      const sysPersona = sysPersonaId
        ? personasStore.getPersonaById(sysPersonaId)
        : personasStore.defaultSystemPersona
      if (sysPersona?.prompt) resolvedPersonaPrompts.systemPersonaPrompt = sysPersona.prompt
      if (userPersonaPrompt) resolvedPersonaPrompts.userPersonaPrompt = userPersonaPrompt
      // Pass persona IDs for soul memory system
      resolvedPersonaPrompts.systemPersonaId = sysPersona?.id || '__default_system__'
      resolvedPersonaPrompts.userPersonaId = usrPersona?.id || '__default_user__'

      // cfg already has provider creds + customModel resolved above

      dbg('Invoking window.electronAPI.runAgent…')
      const agentRunParams = {
        chatId,
        messages: JSON.parse(JSON.stringify(apiMessages)),
        config: JSON.parse(JSON.stringify(cfg)),
        enabledAgents: [],
        enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value)),
        ...(pendingAttachments.length > 0 ? { currentAttachments: JSON.parse(JSON.stringify(pendingAttachments)) } : {}),
        personaPrompts: resolvedPersonaPrompts,
        mcpServers: JSON.parse(JSON.stringify(persistedEnabledMcpServers.value)),
        httpTools: JSON.parse(JSON.stringify(persistedEnabledHttpTools.value)),
        chatPermissionMode: targetChat.permissionMode || 'inherit',
        chatAllowList: JSON.parse(JSON.stringify(targetChat.chatAllowList || [])),
        chatDangerOverrides: JSON.parse(JSON.stringify(targetChat.chatDangerOverrides || [])),
        maxOutputTokens: targetChat.maxOutputTokens || null,
        knowledgeConfig: {
          ragEnabled: knowledgeStore.ragEnabled,
          pineconeApiKey: knowledgeStore.pineconeApiKey,
          pineconeIndexName: knowledgeStore.pineconeIndexName,
          embeddingProvider: knowledgeStore.embeddingProvider,
          embeddingModel: knowledgeStore.embeddingModel,
          indexConfigs: JSON.parse(JSON.stringify(knowledgeStore.indexConfigs))
        },
      }
      chatsStore.storePlanRunParams(chatId, agentRunParams)
      const res = await window.electronAPI.runAgent(agentRunParams)

      dbg(`runAgent returned → success=${res.success} resultLen=${res.result?.length ?? 0} error=${res.error ?? 'none'}`, res.success ? 'success' : 'error')

      // Finalize streaming message
      const finalSegments = perChatStreamingSegments.get(chatId) || []
      const chat = chatsStore.chats.find(c => c.id === chatId)
      if (chat && chat.messages) {
        const msg = chat.messages.find(m => m.id === streamingMsgId)
        if (msg) {
          if (res.success) {
            // Merge permission segment statuses from the live msg (user may have clicked buttons
            // during the run, mutating msg.segments[i].status). perChatStreamingSegments still
            // holds the original 'pending' status, so we carry over the resolved status here.
            const prevSegs = msg.segments || []
            msg.segments = finalSegments.map((s, i) => {
              if (s.type === 'permission') {
                const live = prevSegs.find(p => p.type === 'permission' && p.blockId === s.blockId)
                if (live && live.status !== 'pending') return { ...s, status: live.status }
              }
              return { ...s }
            })
            msg.content = finalSegments.filter(s => s.type === 'text').map(s => s.content).join('')
            if (!msg.content && res.result) {
              // Append text segment rather than replacing so permission/tool segments are kept
              msg.segments.push({ type: 'text', content: res.result })
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
    }

    await chatsStore.persist?.()
    scrollToBottom()
  } catch (err) {
    dbg(`EXCEPTION in runAgent: ${err.message}`, 'error')
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (chat && chat.messages) {
      if (streamingMsgId) {
        const msg = chat.messages.find(m => m.id === streamingMsgId)
        if (msg) {
          msg.content = `Error: ${err.message}`
          msg.streaming = false
          if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
        }
      }
      // Also stop any streaming group messages
      for (const m of chat.messages) {
        if (m.streaming) m.streaming = false
      }
    }
  } finally {
    dbg('Agent loop done. isRunning → false')
    if (streamingTimer) { clearInterval(streamingTimer); streamingTimer = null; streamingSeconds.value = 0 }

    // Use fresh lookup to guarantee we clear the live reactive object
    // (targetChat ref could theoretically become stale if the array was mutated)
    const finChat = chatsStore.chats.find(c => c.id === chatId)
    if (finChat) {
      finChat.isRunning = false
      finChat.isThinking = false
    }
    targetChat.isRunning = false
    targetChat.isThinking = false

    // If this chat is not active, show a "Completed" chip (and stop the unread pulse)
    if (chatId !== chatsStore.activeChatId) {
      chatsStore.markCompleted(chatId)
    }

    perChatStreamingMsgId.delete(chatId)
    perChatStreamingSegments.delete(chatId)
    // Clean up any group persona keys
    for (const key of [...perChatStreamingMsgId.keys()]) {
      if (key.startsWith(chatId + ':')) {
        perChatStreamingMsgId.delete(key)
        perChatStreamingSegments.delete(key)
      }
    }

    // Also clear streaming flag on any remaining streaming messages (safety net)
    if (finChat?.messages) {
      for (const m of finChat.messages) {
        if (m.streaming) {
          m.streaming = false
          if (m.streamingStartedAt) m.durationMs = Date.now() - m.streamingStartedAt
        }
      }
    }

    // Notify voice session that the agent task completed (for verbal notification)
    if (voiceStore.isCallActive && voiceStore.activeChatId === chatId) {
      // Get the last assistant message as a brief summary
      const lastMsg = finChat?.messages?.filter(m => m.role === 'assistant').pop()
      // Pass full content — VoiceSession will LLM-summarise into a spoken reply
      const summary = (typeof lastMsg?.content === 'string' ? lastMsg.content : null)
      // Fire and forget — voice session will speak the notification
      if (window.electronAPI?.voice?.notifyTaskComplete) {
        window.electronAPI.voice.notifyTaskComplete(summary)
      }
    }

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
      if (errChat && errChat.messages) {
        const msg = errChat.messages.find(m => m.id === outerMsgId)
        if (msg) {
          msg.streaming = false
          if (msg.streamingStartedAt) msg.durationMs = Date.now() - msg.streamingStartedAt
        }
      }
    }
    perChatStreamingMsgId.delete(chatId)
    perChatStreamingSegments.delete(chatId)
  } finally {
    // Last-resort safety net: always ensure isRunning is cleared for this chat
    const safetyChat = chatsStore.chats.find(c => c.id === chatId)
    if (safetyChat && safetyChat.isRunning) {
      dbg('SAFETY NET: isRunning was still true after outer catch — force-clearing', 'warn')
      safetyChat.isRunning = false
      safetyChat.isThinking = false
    }
  }
}

// Returns the last active message to append an interrupt marker to.
// Prefers the currently-streaming message; falls back to last assistant message.
function getLastActiveMessage(chatId) {
  const chat = chatsStore.chats.find(c => c.id === chatId)
  if (!chat?.messages?.length) return { chat: null, msg: null }
  const streaming = [...chat.messages].reverse().find(m => m.streaming)
  return { chat, msg: streaming ?? ([...chat.messages].reverse().find(m => m.role === 'assistant') ?? null) }
}

// If the message has content: append inline marker (LLM sees it on resume).
// If the message is empty (agent stopped before outputting anything): delete the
// pointless placeholder and push a system bubble instead.
// type: 'pause' — queue preserved, will auto-continue
//       'stop'  — queue cleared, waiting for user input
function _applyInterrupt(chat, msg, type) {
  const inlineMarker = type === 'stop'
    ? '[Request interrupted by user. Queue cleared.]'
    : '[Request interrupted by user]'
  const bubbleText = type === 'stop'
    ? 'Request stopped by user. Queue cleared — type a new message to continue.'
    : 'Request interrupted by user. Queued prompts will resume automatically.'

  if (!msg) {
    chat?.messages?.push({
      id: uuidv4(), role: 'system', interruptType: type, content: bubbleText,
      segments: [{ type: 'text', content: bubbleText }],
      streaming: false, timestamp: Date.now(),
    })
    return
  }

  const hasContent = msg.content?.trim().length > 0
  if (hasContent) {
    msg.content += `\n\n${inlineMarker}`
    msg.streaming = false
  } else {
    const idx = chat?.messages?.indexOf(msg) ?? -1
    if (idx !== -1) chat.messages.splice(idx, 1)
    chat?.messages?.push({
      id: uuidv4(), role: 'system', interruptType: type, content: bubbleText,
      segments: [{ type: 'text', content: bubbleText }],
      streaming: false, timestamp: Date.now(),
    })
  }
}

// Pause (Esc equivalent): interrupt the agent but preserve the queue so it drains automatically.
async function pauseAgent(chatId) {
  if (!chatId) chatId = chatsStore.activeChatId
  if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(chatId)
  const { chat, msg } = getLastActiveMessage(chatId)
  _applyInterrupt(chat, msg, 'pause')
}

// Stop (hard stop): clear the queue first, then interrupt — nothing auto-runs afterwards.
async function stopAgent(chatId) {
  if (!chatId) chatId = chatsStore.activeChatId
  perChatQueue.delete(chatId)
  if (window.electronAPI?.stopAgent) await window.electronAPI.stopAgent(chatId)
  const { chat, msg } = getLastActiveMessage(chatId)
  _applyInterrupt(chat, msg, 'stop')
}

// ── Plan Approval Functions ────────────────────────────────────────────────────
async function approvePlan(msg) {
  const chatId = chatsStore.activeChatId
  chatsStore.setPlanState(chatId, msg.id, 'approved')

  const savedParams = chatsStore.getPlanRunParams(chatId)
  if (!savedParams) return

  // Format plan as injected text
  const injectedPlan = `Title: ${msg.planData.title}\n` +
    msg.planData.steps.map((s, i) => `${i + 1}. ${s.label}`).join('\n')

  // Create a new streaming assistant message
  const newMsgId = uuidv4()
  const chat = chatsStore.chats.find(c => c.id === chatId)
  if (!chat?.messages) return

  chat.messages.push({
    id: newMsgId,
    role: 'assistant',
    content: '',
    streaming: true,
    streamingStartedAt: Date.now(),
    segments: []
  })
  chat.isRunning = true
  perChatStreamingSegments.set(chatId, [])
  perChatStreamingMsgId.set(chatId, newMsgId)
  scrollToBottom()

  try {
    const res = await window.electronAPI.runAgent({ ...savedParams, injectedPlan })

    const finalSegments = perChatStreamingSegments.get(chatId) || []
    const execMsg = chat.messages.find(m => m.id === newMsgId)
    if (execMsg) {
      execMsg.streaming = false
      execMsg.segments = finalSegments.map(s => ({ ...s }))
      execMsg.content = finalSegments.filter(s => s.type === 'text').map(s => s.content).join('')
      if (!execMsg.content && res.result) {
        execMsg.segments = [{ type: 'text', content: res.result }]
        execMsg.content = res.result
      }
      if (!res.success) {
        execMsg.segments = [{ type: 'text', content: `Error: ${res.error}` }]
        execMsg.content = `Error: ${res.error}`
      }
      if (execMsg.streamingStartedAt) execMsg.durationMs = Date.now() - execMsg.streamingStartedAt
    }
  } catch (err) {
    const execMsg = chat.messages.find(m => m.id === newMsgId)
    if (execMsg) {
      execMsg.streaming = false
      execMsg.segments = [{ type: 'text', content: `Error: ${err.message}` }]
      execMsg.content = `Error: ${err.message}`
    }
  } finally {
    chat.isRunning = false
    perChatStreamingMsgId.delete(chatId)
    perChatStreamingSegments.delete(chatId)
    await chatsStore.persist?.()
    scrollToBottom()
  }
}

function rejectPlan(msg) {
  chatsStore.setPlanState(chatsStore.activeChatId, msg.id, 'rejected')
}

function refinePlan(msg) {
  chatsStore.setPlanState(chatsStore.activeChatId, msg.id, 'rejected')
  // Pre-fill the textarea with a refinement prompt and focus
  inputText.value = 'Refine the plan: '
  nextTick(() => mentionInputRef.value?.focus())
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

  const targetChat = chatsStore.chats.find(c => c.id === chatId)
  if (!targetChat || !targetChat.messages) return

  const tokensBefore = targetChat.contextMetrics?.inputTokens || 0

  isCompacting.value = true
  dbg('Starting standalone compaction…', 'info')

  try {
    const apiMessages = targetChat.messages
      .filter(m => m.role === 'user' || (m.role === 'assistant' && !m.streaming && m.content))
      .map(m => ({ role: m.role, content: m.content }))

    // Build a flat config the AgentLoop constructor expects (same pattern as sendMessage).
    // AnthropicClient reads config.apiKey / config.baseURL at the top level.
    const raw = configStore.config
    const sysPersonaId = targetChat.systemPersonaId || personasStore.defaultSystemPersona?.id
    const sysPersona = sysPersonaId ? personasStore.getPersonaById(sysPersonaId) : personasStore.defaultSystemPersona
    const chatProvider = sysPersona?.providerId || 'anthropic'
    const cfg = { ...raw }
    if (chatProvider === 'anthropic') {
      cfg.apiKey = raw.anthropic?.apiKey || ''
      cfg.baseURL = raw.anthropic?.baseURL || ''
    } else if (chatProvider === 'openrouter') {
      cfg.apiKey = raw.openrouter?.apiKey || ''
      cfg.baseURL = raw.openrouter?.baseURL || ''
    } else if (chatProvider === 'openai') {
      cfg.openaiApiKey = raw.openai?.apiKey || ''
      cfg.openaiBaseURL = raw.openai?.baseURL || ''
      cfg._resolvedProvider = 'openai'
      cfg.defaultProvider = 'openai'
    } else if (chatProvider === 'deepseek') {
      cfg.openaiApiKey = raw.deepseek?.apiKey || ''
      cfg.openaiBaseURL = (raw.deepseek?.baseURL || '').replace(/\/+$/, '')
      cfg._resolvedProvider = 'openai'
      cfg._directAuth = true
      cfg.defaultProvider = 'openai'
    }
    const resolvedModel = targetChat.personaModelOverrides?.[sysPersonaId] || sysPersona?.modelId || null
    if (resolvedModel) cfg.customModel = resolvedModel

    const res = await window.electronAPI.compactContextStandalone({
      chatId,
      messages: JSON.parse(JSON.stringify(apiMessages)),
      config: JSON.parse(JSON.stringify(cfg)),
      enabledAgents: [],
      enabledSkills: JSON.parse(JSON.stringify(enabledSkillObjects.value))
    })

    if (res.success) {
      dbg(`Compaction done — input tokens: ${res.metrics?.inputTokens?.toLocaleString() ?? '?'}`, 'success')

      if (res.metrics) targetChat.contextMetrics = { ...res.metrics }

      // Hidden user/assistant pair preserves the compaction exchange in LLM context,
      // while the visible system banner is the only thing shown in the UI.
      await chatsStore.addMessage(chatId, {
        role: 'user',
        content: '[Context compaction requested]',
        compaction: true,
        hidden: true,
      })
      await chatsStore.addMessage(chatId, {
        role: 'assistant',
        content: res.assistantContent || '[Context compacted]',
        compaction: true,
        hidden: true,
      })
      // Visible indicator shown in chat
      const tokensAfter = res.metrics?.inputTokens || 0
      await chatsStore.addMessage(chatId, {
        role: 'system',
        compaction: true,
        tokensBefore,
        tokensAfter,
        content: 'Context compacted',
        segments: [{ type: 'text', content: 'Context compacted' }],
        streaming: false,
      })
      scrollToBottom()
    } else {
      dbg(`Compaction failed: ${res.error}`, 'error')
      // Surface the error to the user
      const errMsg = res.error || 'Compaction failed'
      await chatsStore.addMessage(chatId, {
        role: 'system',
        content: `Context compaction failed: ${errMsg}`
      })
    }
  } catch (err) {
    dbg(`Compaction error: ${err.message}`, 'error')
  } finally {
    isCompacting.value = false
  }
}

async function refreshCostOnHover() {
  // Fetch latest usage from disk so tooltip cost is always current
  const chatId = chatsStore.activeChatId
  if (!chatId) return
  try {
    const freshChat = await window.electronAPI.getChat(chatId)
    if (freshChat?.usage) inspectorUsage.value = freshChat.usage
  } catch {}
}

async function inspectContext() {
  Object.keys(expandedMessages).forEach(k => delete expandedMessages[k])
  showContextInspector.value = true
  // Fetch live snapshot and fresh usage from disk in parallel
  // (main process writes usage independently, store copy is stale)
  const [, freshChat] = await Promise.all([
    refreshContextSnapshot(),
    window.electronAPI.getChat(chatsStore.activeChatId),
  ])
  if (freshChat?.usage) inspectorUsage.value = freshChat.usage
}

async function refreshContextSnapshot() {
  const chatId = chatsStore.activeChatId
  if (!chatId || !window.electronAPI?.getContextSnapshot) return
  try {
    const snap = await window.electronAPI.getContextSnapshot(chatId)
    if (snap) perChatSnapshots.set(chatId, snap)
  } catch {}
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(() => chatsStore.activeChatId, () => {
  userScrolled.value = false
  visibleLimit.value = 25
  showContextInspector.value = false
  inspectorUsage.value = null
  quotedMessage.value = null
  stickyTarget.value = null

  // Reload per-chat tool/MCP/workingPath draft state from the new chat
  _loadDraftFromChat()

  // Scroll after messages are rendered (handles both already-loaded and lazy-loaded cases)
  scrollToBottom(true)
  nextTick(() => {
    mentionInputRef.value?.focus()
  })
})

// Refresh inspector snapshot when context metrics update during an open inspector
watch(() => activeContextMetrics.value.inputTokens, () => {
  if (showContextInspector.value) refreshContextSnapshot()
})

// When messages finish lazy-loading (null → array), scroll to bottom
watch(() => chatsStore.activeChat?.messages, (msgs, oldMsgs) => {
  if (oldMsgs === null && Array.isArray(msgs)) {
    scrollToBottom(true)
  }
})

// ── Document-level drag/drop prevention ──────────────────────────────────────
// Without these, Electron/Chromium navigates to dropped files instead of firing
// the HTML5 drop event. These must be on `document`, not just on Vue elements.
// Ctrl+Shift+A keyboard shortcut for file picker
function handleGlobalKeydown(e) {
  if (e.ctrlKey && e.shiftKey && e.key === 'A') {
    e.preventDefault()
    pickFiles()
    return
  }
  if (e.key === 'Escape' && activeRunning.value) {
    e.preventDefault()
    pauseAgent(chatsStore.activeChatId)
  }
}

function preventNav(e) {
  // Only intercept file drops — skip internal chat reorder drags
  if (e.dataTransfer && e.dataTransfer.effectAllowed === 'move') return
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

// --- Coding Mode: CLAUDE.md file watcher lifecycle ----------------------------
// Mirrors Claude Code: watches the full CLAUDE.md hierarchy for the active chat.
// When a file changes, main pushes claude:context-updated -> we store merged
// context in _codingModeContext so it is used on the NEXT send automatically.
const _codingModeContext = ref(null)  // most-recently-pushed context for active chat
let _codingModeContextHandler = null  // IPC listener reference for cleanup

// Sync watcher whenever the active chat or its coding settings change
watch(
  () => [chatsStore.activeChatId, chatsStore.activeChat?.codingMode, chatsStore.activeChat?.workingPath],
  async ([chatId, codingMode, workingPath]) => {
    // Tear down previous listener
    if (_codingModeContextHandler && window.electronAPI?.claude?.offContextUpdated) {
      window.electronAPI.claude.offContextUpdated(_codingModeContextHandler)
      _codingModeContextHandler = null
    }
    _codingModeContext.value = null

    if (!chatId || !codingMode || !workingPath || !window.electronAPI?.claude) return

    // Start watching (main process, debounced 300ms)
    try {
      await window.electronAPI.claude.watchContext(chatId, workingPath)
    } catch (err) {
      console.warn('[CodingMode] watchContext failed:', err)
      return
    }

    // Subscribe to push events from main
    _codingModeContextHandler = (payload) => {
      if (payload?.chatId === chatId) {
        _codingModeContext.value = payload.context ?? null
      }
    }
    window.electronAPI.claude.onContextUpdated(_codingModeContextHandler)
  },
  { immediate: true }
)

// KeepAlive lifecycle: fires every time the user navigates back to /chats
onActivated(() => {
  if (voiceStore.isCallActive && voiceStore.isPip) voiceStore.setPip(false)
})

// KeepAlive lifecycle: fires when user navigates away — keep mic/TTS running, just show PiP
onDeactivated(() => {
  if (voiceStore.isCallActive) voiceStore.setPip(true)
})

onMounted(async () => {
  // On first mount, also restore PiP (onActivated fires after onMounted on first render)
  // — nothing extra needed here; onActivated handles it.

  personasStore.loadPersonas()
  await knowledgeStore.loadConfig()
  // Load tools in background — then sync draft from active chat
  toolsStore.loadTools().then(() => {
    _loadDraftFromChat()
  })
  // Initialize MCP from active chat or defaults
  _loadDraftFromChat()
  scrollToBottom()
  nextTick(() => mentionInputRef.value?.focus())
  document.addEventListener('click', handlePopoverOutsideClick)

  // Register UI chunk callback with the store (store owns the persistent IPC listener)
  chatsStore.setUiChunkCallback((cId, chunk) => {
    handleChunk(cId, chunk)
  })

  // Mark current chat as read on mount
  if (chatsStore.activeChatId) chatsStore.markAsRead(chatsStore.activeChatId)

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

// Stop speech recognition and TTS when call ends (from any source)
watch(() => voiceStore.isCallActive, (active) => {
  if (!active) {
    stopMicCapture()
    stopSpeaking()
    voiceCleanups.forEach(fn => fn())
    voiceCleanups = []
  }
})

// Restart mic capture when user picks a different microphone during a call
watch(() => voiceStore.selectedMicId, (newId, oldId) => {
  if (newId === oldId || !voiceStore.isCallActive) return
  stopMicCapture()
  startMicCapture()
})

onUnmounted(() => {
  // Clean voice listeners, mic capture, and TTS on true app teardown.
  // PiP transition on navigation is handled by onDeactivated above.
  stopMicCapture()
  stopSpeaking()
  voiceCleanups.forEach(fn => fn())
  voiceCleanups = []

  // Tear down CLAUDE.md file watcher + IPC listener
  if (_codingModeContextHandler && window.electronAPI?.claude?.offContextUpdated) {
    window.electronAPI.claude.offContextUpdated(_codingModeContextHandler)
    _codingModeContextHandler = null
  }
  if (chatsStore.activeChatId && window.electronAPI?.claude?.unwatchContext) {
    window.electronAPI.claude.unwatchContext(chatsStore.activeChatId)
  }

  chatsStore.clearUiChunkCallback()

  document.removeEventListener('click', handlePopoverOutsideClick)
  document.removeEventListener('dragover', preventNav)
  document.removeEventListener('drop', preventNav)
  document.removeEventListener('keydown', handleGlobalKeydown)

  if (fileDropUnsubscribe) {
    fileDropUnsubscribe()
    fileDropUnsubscribe = null
  }

  if (memoryAutoDismissTimer) {
    clearTimeout(memoryAutoDismissTimer)
    memoryAutoDismissTimer = null
  }
})
</script>

<style scoped>

/* ══════════════════════════════════════════════════════════════════════════
   CHATS PAGE — Premium Minimalist iOS-inspired Design
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Page shell ─────────────────────────────────────────────────────────── */
.chats-page {
  background: #F2F2F7;
}

/* ── Sidebar ────────────────────────────────────────────────────────────── */
.chat-sidebar {
  min-width: 11.25rem;
  max-width: 25rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  background: #FFFFFF;
  border-right: 1px solid #E5E5EA;
  transition: width 0.2s ease, min-width 0.2s ease;
}
.chat-sidebar-expand-tab {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 3rem;
  border: none;
  border-radius: 0 0.5rem 0.5rem 0;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  cursor: pointer;
  box-shadow: 2px 0 8px rgba(0,0,0,0.12);
  transition: width 0.15s ease, background 0.15s ease;
}
.chat-sidebar-expand-tab:hover {
  width: 1.875rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.chat-sidebar-resize {
  width: 4px;
  cursor: col-resize;
  background: transparent;
  transition: background 0.15s;
  flex-shrink: 0;
  position: relative;
  z-index: 5;
}
.chat-sidebar-resize:hover,
.chat-sidebar-resize:active {
  background: #D1D1D6;
}
.chat-sidebar-header {
  padding: 0.875rem 1rem;
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-bottom: 1px solid #E5E5EA;
}
.chat-sidebar-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: #1A1A1A;
}
.chat-sidebar-new-btn {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  cursor: pointer;
  transition: transform 0.15s, box-shadow 0.2s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.chat-sidebar-new-btn:hover {
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.16), 0 2px 4px rgba(0,0,0,0.1);
}
.chat-sidebar-new-btn:active {
  transform: translateY(0);
}
.chat-sidebar-new-btn.grid-toggle-active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 0 0 2px rgba(0,122,255,0.4), 0 2px 8px rgba(0,0,0,0.12);
}
/* ── Root folder row ─────────────────────────────────────────────────── */
.chat-root-row {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3125rem 0.5rem 0.3125rem 0.75rem;
  margin: 0.25rem 0.125rem 0.125rem;
  border-radius: 0.375rem;
  cursor: pointer;
  user-select: none;
}
.chat-root-row:hover {
  background: #F5F5F5;
}
.chat-root-row-left {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
  cursor: pointer;
}
.chat-root-chevron {
  width: 14px;
  height: 14px;
  flex-shrink: 0;
  color: #9CA3AF;
  transition: transform 0.15s;
}
.chat-root-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #6B7280;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-root-fold-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  border-radius: 0.375rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  cursor: pointer;
  flex-shrink: 0;
  box-shadow: 0 1px 4px rgba(0,0,0,0.15);
  transition: background 0.15s, box-shadow 0.15s;
}
.chat-root-fold-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
/* ── Chat filter ────────────────────────────────────────────────────────── */
.chat-sidebar-filter {
  padding: 0.5rem 0.625rem;
  position: relative;
  flex-shrink: 0;
}
.chat-filter-input {
  width: 100%;
  padding: 0.5625rem 2rem 0.5625rem 2.375rem;
  border: 1px solid #E5E5EA;
  border-radius: 0.625rem;
  background: rgba(255, 255, 255, 0.8);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 400;
  color: #1A1A1A;
  outline: none;
  box-sizing: border-box;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.chat-filter-input::placeholder {
  color: #9CA3AF;
}
.chat-filter-input:hover {
  border-color: #9CA3AF;
}
.chat-filter-input:focus {
  border-color: #007AFF;
  box-shadow: 0 0 0 3px rgba(0, 122, 255, 0.1);
}
.chat-filter-icon {
  position: absolute;
  left: 1.375rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1rem;
  height: 1rem;
  color: #9CA3AF;
  pointer-events: none;
  transition: color 0.2s;
}
.chat-sidebar-filter:focus-within .chat-filter-icon {
  color: #007AFF;
}
.chat-filter-clear {
  position: absolute;
  right: 1.125rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.375rem;
  height: 1.375rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: #9CA3AF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.chat-filter-clear:hover {
  background: #F5F5F5;
  color: #6B7280;
}

.chat-sidebar-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  scrollbar-width: thin;
}
.chat-sidebar-loading {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 2rem 0;
}
.chat-sidebar-spinner {
  width: 1.25rem;
  height: 1.25rem;
  border: 2px solid #E5E5EA;
  border-top-color: #1A1A1A;
  border-radius: 50%;
  animation: chat-spin 0.7s linear infinite;
}
.chat-sidebar-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  border-radius: 0.625rem;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  border: 1px solid transparent;
  margin-bottom: 0.125rem;
}
.chat-sidebar-item:hover {
  background: #F5F5F5;
}
.chat-sidebar-item.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  color: white;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.chat-sidebar-item-title {
  flex: 1;
  min-width: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
}
.chat-sidebar-item.active .chat-sidebar-item-title {
  color: #ffffff;
  font-weight: 600;
}
.chat-sidebar-item[draggable="true"] {
  cursor: grab;
}
.chat-sidebar-item[draggable="true"]:active {
  cursor: grabbing;
}
.chat-sidebar-item.drag-over {
  border-top: 2px solid #1A1A1A;
}

/* Root drop zone highlight */
.root-drag-over {
  background: rgba(0, 122, 255, 0.04);
}

/* Tree item name tooltip */
.tree-name-tooltip {
  position: fixed;
  transform: translateY(-100%);
  white-space: nowrap;
  background: #1A1A1A;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 500;
  padding: 0.25rem 0.5rem;
  border-radius: 0.375rem;
  border: 1px solid #2A2A2A;
  box-shadow: 0 4px 12px rgba(0,0,0,0.3);
  pointer-events: none;
  z-index: 9999;
  margin-top: -0.25rem;
}

/* Folder badge in search results */
.chat-folder-badge {
  font-size: var(--fs-small);
  color: #9CA3AF;
  background: #F5F5F5;
  border-radius: var(--radius-full);
  padding: 0.0625rem 0.4rem;
  flex-shrink: 0;
  white-space: nowrap;
  max-width: 5rem;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Chat tree context menu (DocsView style, dark) ───────────────────────── */
.chat-ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}
.chat-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  padding: 4px;
  min-width: 190px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
  animation: chatCtxEnter 0.1s ease-out;
}
@keyframes chatCtxEnter {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.chat-ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #E5E5EA;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.chat-ctx-item:hover { background: #1F1F1F; color: #FFFFFF; }
.chat-ctx-danger { color: #FF453A; }
.chat-ctx-danger:hover { background: rgba(255,69,58,0.15) !important; color: #FF453A !important; }
/* Rename / new dialog */
.chat-ctx-dialog {
  position: fixed;
  z-index: 9999;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  padding: 16px;
  width: 220px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  animation: chatCtxEnter 0.15s ease-out;
}
.chat-ctx-dialog-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
  margin-bottom: 10px;
}
.chat-ctx-dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  outline: none;
}
.chat-ctx-dialog-input:focus { border-color: #4B5563; }
.chat-ctx-dialog-input::placeholder { color: #4B5563; }
.chat-ctx-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.chat-ctx-dialog-cancel {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #2A2A2A;
  background: transparent;
  color: #9CA3AF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  cursor: pointer;
}
.chat-ctx-dialog-cancel:hover { background: #1A1A1A; color: #FFFFFF; }
.chat-ctx-dialog-confirm {
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.chat-ctx-dialog-confirm:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }

/* Active (black bg) item: white action buttons */
.chat-sidebar-item.active .chat-sidebar-action-btn {
  color: rgba(255, 255, 255, 0.5);
}
.chat-sidebar-item.active .chat-sidebar-action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #FFFFFF;
}
.chat-sidebar-item.active .chat-sidebar-action-btn.danger:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #FFFFFF;
}
/* ── Chat window ────────────────────────────────────────────────────────── */
.chat-window {
  background: #FFFFFF;
}

/* ── Chat header ────────────────────────────────────────────────────────── */
/* ── Chat header + config button + tooltip CSS moved to ChatHeader.vue ── */
.chat-header-btn {
  padding: 0.3125rem 0.75rem;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #9CA3AF;
  background: #F5F5F5;
  border: 1px solid #E5E5EA;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.chat-header-btn:hover {
  background: #E5E5EA;
  color: #1A1A1A;
}
.chat-header-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  border-color: #1A1A1A;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

/* ── Context bar ────────────────────────────────────────────────────────── */
.chat-context-bar-wrap {
  position: relative;
  flex-shrink: 0;
  z-index: 10;
}
.chat-context-bar {
  padding: 0.375rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.ctx-header-tab {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translate(-50%, 100%);
  z-index: 21;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 3.5rem;
  height: 1.4rem;
  border: none;
  border-radius: 0 0 0.5rem 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transition: height 0.15s ease, background 0.15s ease;
}
.ctx-header-tab:hover {
  height: 1.875rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

/* ── Messages area ──────────────────────────────────────────────────────── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  scrollbar-width: thin;
  background: #FFFFFF;
}

/* ── Empty state ────────────────────────────────────────────────────────── */
.chat-loading-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 0.875rem;
}
.chat-loading-spinner {
  width: 1.75rem;
  height: 1.75rem;
  border: 3px solid #E5E5EA;
  border-top-color: #1A1A1A;
  border-radius: 50%;
  animation: chat-spin 0.7s linear infinite;
}
@keyframes chat-spin {
  to { transform: rotate(360deg); }
}
.chat-loading-text {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
  font-weight: 500;
  letter-spacing: -0.01em;
}
.chat-empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  gap: 1rem;
  text-align: center;
}
.chat-empty-icon {
  width: 4rem;
  height: 4rem;
  border-radius: 1.125rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.chat-empty-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.chat-empty-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #9CA3AF;
  margin: 0.25rem 0 0;
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
.msg-avatar-col {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
}
.msg-avatar-wrap {
  flex-shrink: 0;
}
.msg-name-chip {
  display: inline-block;
  padding: 0.0625rem 0.5rem;
  border-radius: 9999px;
  background: #1A1A1A;
  color: #fff;
  font-size: 0.62rem;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
  letter-spacing: -0.01em;
  line-height: 1.5;
  white-space: nowrap;
}
.msg-avatar-img {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  object-fit: cover;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.msg-avatar-fallback {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}
.msg-avatar-fallback.system {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.msg-avatar-fallback.user {
  background: #007AFF;
}

/* ── Message action buttons (quote, copy) ──────────────────────────────── */
.msg-action-btn {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  background: #1A1A1A;
  color: #fff;
  border: none;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
  transition: background 0.15s;
}
.msg-action-btn:hover {
  background: #374151;
}
.msg-action-btn-delete:hover {
  background: #DC2626;
}

/* ── Message bubbles ────────────────────────────────────────────────────── */
.msg-timestamp {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
  margin-top: 0.1875rem;
}
.msg-bubble {
  padding: 0.875rem 1.125rem;
  line-height: 1.65;
  border-radius: 1.125rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
}
.msg-bubble :deep(> div:last-child p:last-child),
.msg-bubble :deep(> div:last-child ul:last-child),
.msg-bubble :deep(> div:last-child ol:last-child) {
  margin-bottom: 0;
}
.msg-bubble-user {
  background: linear-gradient(135deg, #4338CA 0%, #6366F1 50%, #818CF8 100%);
  color: #ffffff;
  border-radius: 1.125rem;
  box-shadow: 0 4px 16px rgba(99,102,241,0.25), 0 1px 4px rgba(67,56,202,0.15);
}
.msg-bubble-assistant {
  background: linear-gradient(135deg, #F3F4F6 0%, #E5E7EB 100%);
  border: none;
  color: #1A1A1A;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05), 0 1px 3px rgba(0,0,0,0.03);
  border-radius: 1.125rem;
}

/* ── Input area ─────────────────────────────────────────────────────────── */
.chat-input-area {
  padding: 0.75rem 1.25rem 1rem;
  flex-shrink: 0;
  background: #FFFFFF;
  border-top: 1px solid #E5E5EA;
}
.chat-input-box {
  display: flex;
  gap: 0.5rem;
  align-items: flex-end;
  border-radius: 1rem;
  padding: 0.75rem 1rem;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  transition: border-color 0.2s, box-shadow 0.2s;
}
.chat-input-box.has-quote {
  border-top-left-radius: 0;
  border-top-right-radius: 0;
  border-top: none;
}
.chat-input-box.focused {
  border-color: #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
}

/* ── Header persona CSS moved to ChatHeader.vue ── */
/* Keeping only .chat-header-btn which may be reused */
/* ── Model chip ────────────────────────────────────────────────────────── */
.model-chip {
  padding: 0.25rem 0.625rem 0.25rem 0.25rem;
  gap: 0.375rem;
  height: 2.25rem;
}
.model-chip-icon {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.375rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  color: #fff;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.model-chip-label {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 12px;
  font-weight: 600;
  color: #6B7280;
  max-width: 12.5rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* ── Model popover (wider, with scrollable list) ───────────────────────── */
.model-popover {
  min-width: 23.75rem;
  max-height: 26.25rem;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}
.model-popover-list {
  overflow-y: auto;
  flex: 1;
  padding: 0.125rem 0;
  scrollbar-width: thin;
}
.model-popover-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.5rem 0.625rem;
  border-radius: 0.5rem;
  border: none;
  background: transparent;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  text-align: left;
  transition: background 0.12s;
}
.model-popover-item:hover {
  background: #F5F5F5;
}
.model-popover-item.selected {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.model-item-info {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
}
.model-item-name {
  font-size: 13px;
  font-weight: 500;
  color: #1A1A1A;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-popover-item.selected .model-item-name {
  color: #FFFFFF;
  font-weight: 600;
}
.model-item-id {
  font-family: 'JetBrains Mono', 'SF Mono', monospace;
  font-size: 11px;
  color: #9CA3AF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.model-popover-item.selected .model-item-id {
  color: rgba(255,255,255,0.6);
}
.model-item-check {
  width: 1rem;
  height: 1rem;
  color: #007AFF;
  flex-shrink: 0;
}
.model-popover-status {
  color: #9CA3AF;
  font-size: 12px;
  padding: 0.625rem 0.75rem;
}
.model-popover-status.muted {
  color: #9CA3AF;
}
.model-filter-input {
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: 1px solid #E5E5EA;
  border-radius: 0.5rem;
  font-size: 13px;
  font-family: 'Inter', sans-serif;
  outline: none;
  background: #F5F5F5;
  color: #1A1A1A;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.model-filter-input::placeholder {
  color: #9CA3AF;
}
.model-filter-input:focus {
  border-color: #1A1A1A;
  box-shadow: 0 0 0 2px rgba(0,0,0,0.08);
}

/* ── Animations ─────────────────────────────────────────────────────────── */
@keyframes pulse-green {
  0%, 100% { opacity: 1; box-shadow: 0 0 4px #3fb950; }
  50%       { opacity: 0.5; box-shadow: 0 0 10px #3fb950, 0 0 20px #3fb95055; }
}

/* ── Tools chip (matches persona/model chip style) ─────────────────────── */
.tools-chip {
  padding: 0.25rem 0.625rem 0.25rem 0.25rem;
  gap: 0.375rem;
  height: 2.25rem;
}

/* ── Tools selection modal ─────────────────────────────────────────────── */
.tools-select-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.tools-select-modal {
  width: min(35rem, 95vw); max-height: 80vh;
  background: #0F0F0F; border: 1px solid #2A2A2A;
  border-radius: 1.25rem; box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: tsel-enter 0.2s ease-out;
}
@keyframes tsel-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.tools-select-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem; border-bottom: 1px solid #1F1F1F;
}
.tools-select-header-left { display: flex; align-items: center; gap: 0.625rem; }
.tools-select-header-icon {
  width: 1.875rem; height: 1.875rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.tools-select-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.tools-select-count {
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  color: #9CA3AF; background: #1A1A1A; padding: 0.125rem 0.5rem; border-radius: 0.375rem;
  border: 1px solid #2A2A2A;
}
.tools-select-close {
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280; cursor: pointer; transition: all 0.15s;
}
.tools-select-close:hover { background: #1F1F1F; color: #FFFFFF; }

.tools-select-filters {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.75rem 1.25rem; border-bottom: 1px solid #1F1F1F;
}
.tools-select-search-wrap {
  flex: 1; display: flex; align-items: center; gap: 0.5rem;
  padding: 0.4375rem 0.75rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
}
.tools-select-search-wrap:focus-within { border-color: #4B5563; }
.tools-select-search {
  flex: 1; border: none; outline: none;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FFFFFF; background: transparent;
}
.tools-select-search::placeholder { color: #4B5563; }
.tools-select-actions { display: flex; gap: 0.375rem; }
.tools-select-action-btn {
  padding: 0.3125rem 0.625rem; border-radius: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  border: 1px solid #2A2A2A; background: #1A1A1A; color: #6B7280;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.tools-select-action-btn:hover { background: #222222; color: #FFFFFF; border-color: #374151; }

.tools-select-categories {
  display: flex; gap: 0.375rem; padding: 0.5rem 1.25rem;
  border-bottom: 1px solid #1F1F1F; flex-wrap: wrap;
}
.tools-cat-chip {
  padding: 0.1875rem 0.625rem; border-radius: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  border: 1px solid #2A2A2A; background: #1A1A1A; color: #4B5563;
  cursor: pointer; transition: all 0.15s;
}
.tools-cat-chip.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #fff; border-color: #374151;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.tools-cat-chip:hover:not(.active) { background: #222222; color: #9CA3AF; border-color: #374151; }

.tools-select-list {
  flex: 1; overflow-y: auto; padding: 0.5rem 0.75rem;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.tools-select-empty { padding: 2rem 1.25rem; text-align: center; }
.tools-select-empty p {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: #4B5563; margin: 0;
}
.tools-select-row {
  display: flex; align-items: center; gap: 0.75rem;
  padding: 0.625rem 0.75rem; border-radius: 0.75rem; cursor: pointer;
  transition: all 0.15s;
  border: 1px solid #1F1F1F; background: #1A1A1A; margin-bottom: 0.375rem;
}
.tools-select-row:hover {
  background: #222222; border-color: #2A2A2A;
}
.tools-select-row:hover .tools-select-row-name { color: #FFFFFF; }
.tools-select-row:hover .tools-select-row-desc { color: #9CA3AF; }
.tools-select-row:hover .tools-select-row-cat { background: rgba(255,255,255,0.1); color: #FFFFFF; }
.tools-select-row.enabled {
  background: linear-gradient(135deg, #1A1A1A 0%, #1F2937 100%);
  border-color: #374151;
  box-shadow: 0 1px 6px rgba(0,0,0,0.2);
}
.tools-select-row.enabled .tools-select-row-name { color: #FFFFFF; }
.tools-select-row.enabled .tools-select-row-desc { color: #9CA3AF; }
.tools-select-row.enabled .tools-select-row-cat { background: rgba(255,255,255,0.1); color: #FFFFFF; }
.tools-select-checkbox {
  width: 1rem; height: 1rem; accent-color: #FFFFFF; flex-shrink: 0; cursor: pointer;
}
.tools-select-row:hover .tools-select-checkbox,
.tools-select-row.enabled .tools-select-checkbox { accent-color: #FFFFFF; }
.tools-select-row-info {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.125rem;
}
.tools-select-row-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 600; color: #9CA3AF;
}
.tools-select-row-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.tools-select-row-cat {
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600;
  color: #4B5563; background: #111111; padding: 0.125rem 0.375rem; border-radius: 0.25rem; flex-shrink: 0;
}
.tools-select-type-http { background: rgba(37,99,235,0.15); color: #60A5FA; }
.tools-select-type-code { background: rgba(22,163,74,0.15); color: #4ADE80; }
.tools-select-type-prompt { background: rgba(124,58,237,0.15); color: #A78BFA; }
.tools-select-footer {
  display: flex; justify-content: flex-end; align-items: center; gap: 0.75rem;
  padding: 0.75rem 1.25rem; border-top: 1px solid #1F1F1F; background: #0A0A0A;
}

/* ── Chat Settings Modal (dark theme) ──────────────────────────────────── */
.ccm-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: ccm-fade 0.15s ease-out;
}
@keyframes ccm-fade { from { opacity: 0; } to { opacity: 1; } }
.ccm-dialog {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1.25rem;
  width: 56.25rem;
  max-width: 95vw;
  height: 85vh;
  max-height: 85vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 80px rgba(0,0,0,0.5);
  animation: ccm-enter 0.2s ease-out;
  overflow: hidden;
}
@keyframes ccm-enter {
  from { opacity: 0; transform: scale(0.95) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.ccm-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.125rem 1.5rem; border-bottom: 1px solid #1F1F1F; flex-shrink: 0;
}
.ccm-header-left { display: flex; align-items: center; gap: 0.75rem; }
.ccm-header-icon {
  width: 2.125rem; height: 2.125rem; border-radius: 0.625rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.ccm-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-section);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.ccm-close {
  width: 2.125rem; height: 2.125rem; border-radius: 0.5rem; border: none;
  background: transparent; color: #6B7280; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.ccm-close:hover { background: #1F1F1F; color: #FFFFFF; }

/* Tab bar */
.ccm-tabs {
  display: flex; gap: 0.25rem; padding: 0.5rem 1.5rem;
  border-bottom: 1px solid #1F1F1F; flex-shrink: 0;
}
.ccm-tab {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.5rem 1rem; border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: #6B7280; background: transparent; border: none; cursor: pointer;
  transition: all 0.15s;
}
.ccm-tab:hover { color: #9CA3AF; background: #1A1A1A; }
.ccm-tab.active {
  color: #FFFFFF;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.ccm-tab-badge {
  font-size: 10px; font-weight: 700;
  padding: 0.0625rem 0.375rem; border-radius: 0.25rem;
  background: rgba(255,255,255,0.1); color: inherit;
}
.ccm-tab.active .ccm-tab-badge {
  background: rgba(255,255,255,0.15);
}

/* Body */
.ccm-body {
  flex: 1; overflow: hidden; display: flex; flex-direction: column;
}
.ccm-tab-content {
  flex: 1; display: flex; flex-direction: column; min-height: 0;
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}

/* Dark sections (used in Model & RAG tabs) */
.ccm-dark-section {
  margin-bottom: 1.25rem;
}
.ccm-dark-section-label {
  display: flex; align-items: center; gap: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #9CA3AF; margin-bottom: 0.625rem;
  text-transform: uppercase; letter-spacing: 0.04em;
}
.ccm-dark-badge {
  font-size: 11px; font-weight: 600; text-transform: none; letter-spacing: 0;
  padding: 0.125rem 0.5rem; border-radius: 0.375rem;
  background: #1F1F1F; color: #9CA3AF;
  font-family: 'JetBrains Mono', monospace;
}
.ccm-dark-badge.badge-on { background: #064E3B; color: #6EE7B7; }
.ccm-dark-badge.badge-off { background: #451A1A; color: #FCA5A5; }

/* ── Coding Mode — info chip & tooltips ──────────────────────────────── */
.ccm-coding-info-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem; height: 1.25rem;
  border-radius: 50%;
  background: #1F1F1F;
  border: 1px solid #2A2A2A;
  color: #6B7280;
  cursor: help;
  position: relative;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.ccm-coding-info-chip:hover { background: #2A2A2A; color: #9CA3AF; }

.ccm-coding-tooltip {
  position: absolute;
  bottom: calc(100% + 0.5rem);
  left: 0;
  width: 17.5rem;
  background: #161616;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  padding: 0.75rem 0.875rem;
  box-shadow: 0 12px 32px rgba(0,0,0,0.5);
  z-index: 9999;
  pointer-events: none;
  font-family: 'Inter', sans-serif;
}
.ccm-coding-tooltip-right {
  left: auto;
  right: 0;
}
.ccm-coding-tooltip-title {
  font-size: 12px; font-weight: 700; color: #E5E5EA; margin-bottom: 0.375rem;
}
.ccm-coding-tooltip-body {
  font-size: 11px; font-weight: 400; color: #9CA3AF; line-height: 1.55;
}
.ccm-coding-tooltip-body code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: #67E8F9;
  background: #0C1F26; padding: 0.0625rem 0.3125rem; border-radius: 0.25rem;
}
.ccm-coding-tooltip-hint {
  margin-top: 0.5rem;
  font-size: 11px; font-weight: 500; color: #4B5563;
  border-top: 1px solid #1F1F1F; padding-top: 0.5rem;
}
.ccm-coding-tooltip-files { margin-top: 0.5rem; }
.ccm-coding-tooltip-files-label {
  font-size: 10px; font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.05em; color: #4B5563; margin-bottom: 0.3125rem;
}
.ccm-coding-tooltip-file {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.1875rem 0; color: #6B7280;
}
.ccm-coding-tooltip-file code {
  font-family: 'JetBrains Mono', monospace;
  font-size: 10px; color: #67E8F9;
}

/* ── Coding Mode — toggle row ──────────────────────────────────────────── */
.ccm-coding-toggle-row {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.75rem; padding: 0.625rem 0.875rem;
  background: #1A1A1A; border: 1px solid #222;
  border-radius: 0.625rem;
}
.ccm-coding-toggle-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 500;
  color: #9CA3AF;
}

/* ── Coding Mode — switch (teal accent, not black) ─────────────────────── */
.ccm-coding-switch {
  display: inline-flex; align-items: center; cursor: pointer; flex-shrink: 0;
}
.ccm-coding-switch input { display: none; }
.ccm-coding-switch-track {
  position: relative; width: 2.375rem; height: 1.375rem;
  border-radius: 0.6875rem; background: #2A2A2A;
  border: 1px solid #333;
  transition: background 0.2s, border-color 0.2s;
}
.ccm-coding-switch input:checked + .ccm-coding-switch-track {
  background: #0E7490;
  border-color: #0891B2;
}
.ccm-coding-switch-thumb {
  position: absolute; top: 0.125rem; left: 0.125rem;
  width: 1rem; height: 1rem; border-radius: 50%;
  background: #4B5563;
  box-shadow: 0 1px 3px rgba(0,0,0,0.4);
  transition: transform 0.2s, background 0.2s;
}
.ccm-coding-switch input:checked + .ccm-coding-switch-track .ccm-coding-switch-thumb {
  transform: translateX(1rem); background: #FFFFFF;
}

/* ── Provider info anchor ─────────────────────────────────────────────── */
.ccm-provider-info-anchor {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.375rem; height: 1.375rem;
  border-radius: 50%;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  color: #4B5563; cursor: help;
  position: relative; flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.ccm-provider-info-anchor:hover { background: #2A2A2A; color: #9CA3AF; }

/* Provider buttons (dark) — used in Permissions tab */
.ccm-provider-btns {
  display: flex; gap: 0.5rem;
}
.ccm-provider-btn {
  flex: 1; padding: 0.625rem 0; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  border: 1px solid #2A2A2A; background: #1A1A1A; color: #6B7280;
  cursor: pointer; transition: all 0.15s; text-align: center;
}
.ccm-provider-btn:hover { border-color: #4B5563; color: #9CA3AF; }
.ccm-provider-btn.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563; color: #FFFFFF;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}

/* Step number badge */
.ccm-step-num {
  display: inline-flex; align-items: center; justify-content: center;
  width: 1.125rem; height: 1.125rem; border-radius: 50%;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
  color: #FFFFFF; font-size: 10px; font-weight: 700;
  margin-right: 0.25rem; flex-shrink: 0;
}

/* Provider cards (Model tab — 2-level selection) */
.ccm-provider-cards {
  display: flex; gap: 0.5rem;
}
.ccm-provider-card {
  flex: 1; padding: 0.75rem 0.625rem; border-radius: 0.625rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  cursor: pointer; transition: all 0.15s; text-align: center;
  display: flex; flex-direction: column; gap: 0.1875rem;
}
.ccm-provider-card:hover { border-color: #4B5563; }
.ccm-provider-card.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563;
  box-shadow: 0 2px 12px rgba(0,0,0,0.3);
}
.ccm-provider-card-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: #9CA3AF; transition: color 0.15s;
}
.ccm-provider-card.active .ccm-provider-card-name { color: #FFFFFF; }
.ccm-provider-card-sub {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: #4B5563; transition: color 0.15s;
}
.ccm-provider-card.active .ccm-provider-card-sub { color: rgba(255,255,255,0.5); }
.ccm-provider-card:hover:not(.active) .ccm-provider-card-name { color: #D1D5DB; }

/* Model search (dark) */
.ccm-model-search {
  width: 100%; padding: 0.5rem 0.75rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); outline: none;
  color: #FFFFFF; transition: border-color 0.15s;
}
.ccm-model-search:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75,85,99,0.2); }
.ccm-model-search::placeholder { color: #4B5563; }

/* Model list (dark) */
.ccm-model-list {
  flex: 1; overflow-y: auto;
  border: 1px solid #2A2A2A; border-radius: 0.75rem;
  display: flex; flex-direction: column;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
  background: #1A1A1A;
}
.ccm-model-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; padding: 0.625rem 0.875rem; border: none; background: transparent;
  cursor: pointer; font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  font-weight: 500; color: #9CA3AF; text-align: left;
  transition: all 0.12s; border-bottom: 1px solid #1F1F1F;
}
.ccm-model-item:last-child { border-bottom: none; }
.ccm-model-item:first-child { border-radius: 0.6875rem 0.6875rem 0 0; }
.ccm-model-item:last-child { border-radius: 0 0 0.6875rem 0.6875rem; }
.ccm-model-item:hover { background: #222222; color: #FFFFFF; }
.ccm-model-item.active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
}
.ccm-model-item.active .ccm-model-id { color: rgba(255,255,255,0.4); }
.ccm-model-id {
  font-family: 'JetBrains Mono', monospace; font-size: 10px;
  color: #4B5563; white-space: nowrap; overflow: hidden;
  text-overflow: ellipsis; max-width: 12.5rem;
}
.ccm-model-loading {
  padding: 1rem; text-align: center; font-size: var(--fs-caption); color: #4B5563;
}

/* ── Tools/MCP list toolbar ────────────────────────────────────────────── */
.ccm-list-toolbar {
  display: flex; align-items: center; gap: 0.625rem;
  margin-bottom: 1rem; flex-shrink: 0;
}
.ccm-list-search-wrap {
  flex: 1; display: flex; align-items: center; gap: 0.5rem;
  padding: 0.5rem 0.875rem; border-radius: 0.625rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  transition: border-color 0.15s;
}
.ccm-list-search-wrap:focus-within { border-color: #4B5563; }
.ccm-list-search-wrap:focus-within svg { color: #9CA3AF; }
.ccm-list-search {
  flex: 1; border: none; outline: none;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FFFFFF; background: transparent;
}
.ccm-list-search::placeholder { color: #4B5563; }
.ccm-list-actions {
  display: flex; gap: 0.25rem;
}
.ccm-list-action-btn {
  padding: 0.375rem 0.75rem; border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  border: 1px solid #2A2A2A; background: #1A1A1A; color: #6B7280;
  cursor: pointer; transition: all 0.12s; white-space: nowrap;
}
.ccm-list-action-btn:hover { border-color: #4B5563; color: #FFFFFF; background: #222222; }
.ccm-list-summary {
  font-family: 'JetBrains Mono', monospace; font-size: 11px;
  color: #4B5563; white-space: nowrap; flex-shrink: 0;
}

/* ── Item cards (Tools/MCP) ────────────────────────────────────────────── */
.ccm-item-list {
  flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 0.375rem;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.ccm-item-card {
  display: flex; align-items: center; gap: 0.875rem;
  padding: 0.75rem 1rem; border-radius: 0.75rem;
  border: 1px solid #1F1F1F; background: #1A1A1A;
  cursor: pointer; transition: all 0.15s;
}
.ccm-item-card:hover {
  border-color: #2A2A2A; background: #222222;
}
.ccm-item-card.enabled {
  border-color: #374151;
  background: linear-gradient(135deg, #1A1A1A 0%, #1F2937 100%);
  box-shadow: 0 1px 6px rgba(0,0,0,0.2);
}
.ccm-item-card-info {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.1875rem;
}
.ccm-item-card-top {
  display: flex; align-items: center; gap: 0.5rem;
}
.ccm-item-card-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 600; color: #FFFFFF;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-item-card:not(.enabled) .ccm-item-card-name { color: #9CA3AF; }
.ccm-item-card-type {
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600;
  padding: 0.0625rem 0.375rem; border-radius: 0.25rem; flex-shrink: 0;
}
.ccm-type-http { background: rgba(37,99,235,0.15); color: #60A5FA; }
.ccm-type-code { background: rgba(22,163,74,0.15); color: #4ADE80; }
.ccm-type-prompt { background: rgba(124,58,237,0.15); color: #A78BFA; }

.ccm-item-card-status {
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-family: 'Inter', sans-serif; font-size: 10px; font-weight: 600;
  padding: 0.0625rem 0.375rem; border-radius: 0.25rem; flex-shrink: 0;
}
.ccm-item-card-status.status-running { background: rgba(52,199,89,0.15); color: #4ADE80; }
.ccm-item-card-status.status-stopped { background: rgba(107,114,128,0.15); color: #6B7280; }
.ccm-status-dot {
  width: 0.3125rem; height: 0.3125rem; border-radius: 50%;
}
.status-running .ccm-status-dot { background: #4ADE80; }
.status-stopped .ccm-status-dot { background: #4B5563; }

.ccm-item-card-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563; line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-item-card.enabled .ccm-item-card-desc { color: #6B7280; }

/* Grouped tool list */
.ccm-group-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.625rem 0.25rem 0.25rem;
  border-bottom: 1px solid #1F1F1F;
  margin-bottom: 0.125rem;
}
.ccm-group-header:not(:first-child) { margin-top: 0.75rem; }
.ccm-group-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  font-weight: 700; color: #9CA3AF; text-transform: uppercase; letter-spacing: 0.06em;
}
.ccm-group-count {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563;
}
.ccm-item-row {
  display: flex; align-items: flex-start; gap: 0.625rem;
  padding: 0.5rem 0.5rem; border-radius: 0.5rem;
  cursor: pointer; transition: background 0.12s;
}
.ccm-item-row:hover { background: rgba(255,255,255,0.04); }
.ccm-item-row.enabled { background: rgba(55,65,81,0.2); }
.ccm-item-row.enabled:hover { background: rgba(55,65,81,0.3); }
.ccm-row-checkbox {
  margin-top: 0.1875rem; flex-shrink: 0;
  width: 0.875rem; height: 0.875rem; accent-color: #6B7280; cursor: pointer;
}
.ccm-row-info {
  flex: 1; min-width: 0; display: flex; flex-direction: column; gap: 0.125rem;
}
.ccm-row-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 500; color: #9CA3AF; line-height: 1.3;
}
.ccm-item-row.enabled .ccm-row-name { color: #FFFFFF; font-weight: 600; }
.ccm-row-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  color: #4B5563; line-height: 1.4;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-item-row.enabled .ccm-row-desc { color: #6B7280; }

/* Toggle switch (dark) */
.ccm-toggle {
  display: inline-flex; align-items: center; cursor: pointer; flex-shrink: 0;
}
.ccm-toggle input { display: none; }
.ccm-toggle-track {
  position: relative; width: 2.375rem; height: 1.375rem;
  border-radius: 0.6875rem; background: #2A2A2A;
  transition: background 0.2s;
}
.ccm-toggle input:checked + .ccm-toggle-track {
  background: linear-gradient(135deg, #374151 0%, #4B5563 100%);
}
.ccm-toggle-thumb {
  position: absolute; top: 0.125rem; left: 0.125rem;
  width: 1.125rem; height: 1.125rem; border-radius: 50%;
  background: #6B7280; box-shadow: 0 1px 3px rgba(0,0,0,0.3);
  transition: transform 0.2s, background 0.2s;
}
.ccm-toggle input:checked + .ccm-toggle-track .ccm-toggle-thumb {
  transform: translateX(1rem); background: #FFFFFF;
}

/* List empty */
.ccm-list-empty {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #4B5563; text-align: center; padding: 2.5rem 1.25rem;
}

/* RAG list (dark) */
.ccm-rag-list {
  display: flex; flex-direction: column; gap: 0.375rem;
}
.ccm-rag-item {
  display: flex; align-items: center; justify-content: space-between;
  gap: 0.5rem; padding: 0.625rem 0.875rem; border-radius: 0.625rem;
  background: #1A1A1A; border: 1px solid #1F1F1F;
}
.ccm-rag-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: #FFFFFF;
}
.ccm-rag-meta {
  font-family: 'JetBrains Mono', monospace; font-size: 10px; color: #4B5563;
}

/* Footer (dark) */
.ccm-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.875rem 1.5rem; border-top: 1px solid #1F1F1F;
  background: #0A0A0A; flex-shrink: 0;
}
.ccm-footer-tokens {
  font-family: 'JetBrains Mono', monospace; font-size: 11px; color: #4B5563;
}
.ccm-footer-actions {
  display: flex; gap: 0.5rem; align-items: center;
}
.ccm-cancel-btn {
  padding: 0.5rem 1.25rem; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  background: #1A1A1A; color: #9CA3AF; border: 1px solid #2A2A2A; cursor: pointer;
  transition: all 0.15s;
}
.ccm-cancel-btn:hover {
  background: #2A2A2A; color: #FFFFFF; border-color: #374151;
}
.ccm-save-btn {
  padding: 0.5rem 1.5rem; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; border: 1px solid #374151; cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.ccm-save-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563;
}

/* Working path field */
.ccm-working-path-row {
  display: flex; gap: 0.5rem; align-items: center;
}
.ccm-working-path-input {
  flex: 1; padding: 0.5rem 0.75rem; border-radius: 0.5rem;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  font-family: 'JetBrains Mono', monospace; font-size: 12px;
  color: #FFFFFF; outline: none; transition: border-color 0.15s;
}
.ccm-working-path-input:focus { border-color: #4B5563; }
.ccm-working-path-input::placeholder { color: #4B5563; }
.ccm-working-path-browse {
  display: flex; align-items: center; justify-content: center;
  width: 2.25rem; height: 2.25rem; border-radius: 0.5rem;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  color: #9CA3AF; cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.ccm-working-path-browse:hover {
  background: #2A2A2A; border-color: #374151; color: #FFFFFF;
}
.ccm-working-path-hint {
  font-family: 'Inter', sans-serif; font-size: 11px; color: #4B5563;
  margin-top: 0.25rem; display: block;
}

/* Stepper control — number fields with styled +/- buttons */
.ccm-stepper-row {
  display: flex; align-items: center; gap: 0.25rem;
}
.ccm-stepper-btn {
  display: flex; align-items: center; justify-content: center;
  width: 2rem; height: 2rem; border-radius: 0.5rem; flex-shrink: 0;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  color: #9CA3AF; font-size: 16px; font-family: 'Inter', sans-serif;
  line-height: 1; cursor: pointer; transition: all 0.15s; user-select: none;
}
.ccm-stepper-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
  border-color: #4B5563; color: #FFFFFF;
}
.ccm-stepper-input {
  width: 4rem; padding: 0.375rem 0.5rem; border-radius: 0.5rem; text-align: center;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  font-family: 'JetBrains Mono', monospace; font-size: 13px;
  color: #FFFFFF; outline: none; transition: border-color 0.15s;
  /* hide native spinners */
  -moz-appearance: textfield;
}
.ccm-stepper-input::-webkit-outer-spin-button,
.ccm-stepper-input::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
.ccm-stepper-input:focus { border-color: #4B5563; }
.ccm-stepper-input::placeholder { color: #4B5563; }
.ccm-stepper-input--wide { width: 5.625rem; }
.ccm-stepper-reset {
  padding: 0.3125rem 0.625rem; border-radius: 0.5rem; margin-left: 0.25rem;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  color: #6B7280; font-family: 'Inter', sans-serif; font-size: 11px; font-weight: 600;
  cursor: pointer; transition: all 0.15s; white-space: nowrap;
}
.ccm-stepper-reset:hover {
  background: #2A2A2A; border-color: #374151; color: #9CA3AF;
}

/* ── Permissions tab ──────────────────────────────────────────────────── */
.ccm-perm-mode-hint {
  font-family: 'Inter', sans-serif; font-size: 11px; color: #6B7280;
  margin: 0.25rem 0 0; display: block;
}
.ccm-allow-list {
  display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.5rem;
}
.ccm-allow-entry {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 0.375rem 0.625rem; background: #1A1A1A; border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
}
.ccm-allow-entry-info {
  display: flex; flex-direction: column; gap: 0.125rem; flex: 1; min-width: 0;
}
.ccm-allow-pattern {
  font-family: 'JetBrains Mono', monospace; font-size: 0.72rem;
  color: #60a5fa; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-allow-desc {
  font-size: 0.68rem; color: #6B7280; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ccm-allow-delete {
  display: flex; align-items: center; justify-content: center;
  width: 1.25rem; height: 1.25rem; flex-shrink: 0;
  background: rgba(255,59,48,0.08); border: 1px solid rgba(255,59,48,0.2);
  border-radius: 0.375rem; color: #FF3B30; cursor: pointer; transition: all 0.15s;
}
.ccm-allow-delete:hover { background: rgba(255,59,48,0.18); }
.ccm-allow-add-row {
  display: flex; gap: 0.375rem; align-items: center;
}
.ccm-allow-input {
  flex: 1; min-width: 0; padding: 0.3125rem 0.5625rem; background: #1A1A1A;
  border: 1px solid #2A2A2A; border-radius: 0.5rem; color: #FFFFFF;
  font-family: 'Inter', sans-serif; font-size: 0.75rem; outline: none;
  transition: border-color 0.15s;
}
.ccm-allow-input:focus { border-color: #4B5563; }
.ccm-allow-input::placeholder { color: #4B5563; }
.ccm-allow-add-btn {
  padding: 0.3125rem 0.75rem; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; border-radius: 0.5rem; color: #FFFFFF; font-family: 'Inter', sans-serif;
  font-size: 0.72rem; font-weight: 600; cursor: pointer; transition: all 0.15s; white-space: nowrap;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.ccm-allow-add-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.ccm-allow-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.ccm-allow-entry-readonly { opacity: 0.6; pointer-events: none; }
.ccm-danger-overridden { opacity: 0.4; }
.ccm-danger-overridden .ccm-allow-pattern { text-decoration: line-through; }
.ccm-danger-remove-btn {
  background: rgba(239,68,68,0.08); border-color: rgba(239,68,68,0.2); color: #f87171;
}

/* ── Reduced motion ─────────────────────────────────────────────────────── */
/* ── Rename modal ───────────────────────────────────────────────────────── */
.rename-backdrop {
  position: fixed; inset: 0; z-index: 100;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
}
.rename-modal {
  width: min(26.25rem, 90vw);
  background: #0F0F0F; border: 1px solid #2A2A2A;
  border-radius: 1rem; box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  overflow: hidden;
  animation: rename-enter 0.2s ease-out;
}
@keyframes rename-enter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.rename-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1rem 1.25rem; border-bottom: 1px solid #1F1F1F;
}
.rename-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.rename-close-btn {
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  display: flex; align-items: center; justify-content: center;
  border: none; background: transparent; color: #6B7280;
  cursor: pointer; transition: all 0.15s;
}
.rename-close-btn:hover { background: #1F1F1F; color: #FFFFFF; }
.rename-body { padding: 1rem 1.25rem; }
.rename-input {
  width: 100%; padding: 0.625rem 0.875rem;
  border: 1px solid #2A2A2A; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  color: #FFFFFF; background: #1A1A1A; outline: none;
  resize: none; line-height: 1.5; box-sizing: border-box;
  transition: border-color 0.15s;
}
.rename-input::placeholder { color: #4B5563; }
.rename-input:focus { border-color: #4B5563; }
.rename-actions {
  display: flex; justify-content: flex-end; gap: 0.5rem;
  padding: 0.75rem 1.25rem 1rem;
}

/* ── New chat modal rows ───────────────────────────────────────────────── */
.newchat-name-row-v2 {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.5rem 0.75rem; border-radius: 0.625rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
}
.newchat-name-input {
  flex: 1; min-width: 0; padding: 0.25rem 0.375rem;
  border-radius: 0.375rem; border: none;
  background: transparent;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 500; color: #FFFFFF; outline: none;
}
.newchat-name-input::placeholder { color: #4B5563; font-weight: 400; }

/* ── Folder tree selector ─────────────────────────────────────────────── */
.newchat-folder-tree-wrap {
  display: flex; flex-direction: column; gap: 0.375rem;
}
.newchat-folder-tree-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption);
  font-weight: 600; color: #6B7280;
}
.newchat-folder-tree {
  background: #111111; border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  max-height: 10rem; overflow-y: auto;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
  padding: 0.25rem;
  display: flex; flex-direction: column; gap: 1px;
}

/* ── Persona config button ────────────────────────────────────────────── */
.newchat-persona-cfg-btn {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.5rem;
  border: 1px solid #2A2A2A;
  background: transparent;
  color: #6B7280;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  padding: 0;
}
.newchat-persona-cfg-btn:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: #374151;
  color: #FFFFFF;
}
.newchat-persona-cfg-avatars {
  display: flex;
  align-items: center;
}
.newchat-persona-cfg-avatar-img {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid #1A1A1A;
}
.newchat-persona-cfg-avatar-img + .newchat-persona-cfg-avatar-img,
.newchat-persona-cfg-avatar-img + .newchat-persona-cfg-avatar-fb,
.newchat-persona-cfg-avatar-fb + .newchat-persona-cfg-avatar-img,
.newchat-persona-cfg-avatar-fb + .newchat-persona-cfg-avatar-fb {
  margin-left: -0.375rem;
}
.newchat-persona-cfg-avatar-fb {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  background: #2A2A2A;
  border: 1.5px solid #1A1A1A;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: 'Inter', sans-serif;
  font-size: 8px;
  font-weight: 600;
  color: #9CA3AF;
}
.newchat-persona-cfg-overflow {
  background: #333;
  font-size: 7px;
}

/* ── New Chat Persona Picker Dialog (dark, CCM-style) ────────────────── */
.ncp-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: ccm-fade 0.15s ease-out;
}
.ncp-dialog {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1.25rem;
  width: 30rem;
  max-width: 95vw;
  max-height: 70vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 80px rgba(0,0,0,0.5);
  animation: ccm-enter 0.2s ease-out;
  overflow: hidden;
}

/* Header */
.ncp-header {
  display: flex; align-items: center; justify-content: space-between;
  padding: 1.125rem 1.5rem; border-bottom: 1px solid #1F1F1F; flex-shrink: 0;
}
.ncp-header-left { display: flex; align-items: center; gap: 0.75rem; }
.ncp-header-icon {
  width: 2.125rem; height: 2.125rem; border-radius: 0.625rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.ncp-title {
  font-family: 'Inter', sans-serif; font-size: var(--fs-section);
  font-weight: 700; color: #FFFFFF; margin: 0;
}
.ncp-badge {
  font-size: 11px; font-weight: 600;
  padding: 0.125rem 0.5rem; border-radius: 0.375rem;
  background: #1F1F1F; color: #9CA3AF;
  font-family: 'Inter', sans-serif;
}
.ncp-close {
  width: 2.125rem; height: 2.125rem; border-radius: 0.5rem; border: none;
  background: transparent; color: #6B7280; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.ncp-close:hover { background: #1F1F1F; color: #FFFFFF; }

/* Search */
.ncp-search-bar {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1.5rem; border-bottom: 1px solid #1F1F1F;
  color: #6B7280; flex-shrink: 0;
}
.ncp-search-input {
  flex: 1; border: none; outline: none;
  font-family: 'Inter', sans-serif; font-size: 13px;
  background: transparent; color: #FFFFFF;
}
.ncp-search-input::placeholder { color: #4B5563; }
.ncp-search-clear {
  width: 1.375rem; height: 1.375rem; border-radius: 0.375rem; border: none;
  background: transparent; color: #6B7280; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.12s;
}
.ncp-search-clear:hover { background: #1F1F1F; color: #FFFFFF; }

/* List */
.ncp-list {
  flex: 1; overflow-y: auto; padding: 0.5rem 0.75rem;
  display: flex; flex-direction: column; gap: 0.25rem;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.ncp-item {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.625rem 0.75rem; border-radius: 0.625rem;
  cursor: pointer; transition: all 0.12s;
  border: 1px solid transparent;
}
.ncp-item:hover {
  background: #1A1A1A; border-color: #2A2A2A;
}
.ncp-item.selected {
  background: linear-gradient(135deg, #1A1A1A 0%, #1F2937 100%);
  border-color: #374151;
  box-shadow: 0 1px 6px rgba(0,0,0,0.2);
}
.ncp-item.selected:hover {
  background: linear-gradient(135deg, #1F1F1F 0%, #2D3748 100%);
}

/* Check */
.ncp-check {
  width: 1.125rem; height: 1.125rem; border-radius: 0.3125rem;
  border: 1.5px solid #4B5563; background: transparent;
  display: flex; align-items: center; justify-content: center;
  position: relative; flex-shrink: 0; transition: all 0.12s;
}
.ncp-item.selected .ncp-check {
  background: rgba(255,255,255,0.2); border-color: rgba(255,255,255,0.4);
}
.ncp-check input {
  position: absolute; opacity: 0; width: 100%; height: 100%;
  cursor: pointer; margin: 0;
}
.ncp-check-icon { width: 0.75rem; height: 0.75rem; color: #fff; }

/* Avatar */
.ncp-avatar {
  width: 2.25rem; height: 2.25rem; border-radius: 50%;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: #1F1F1F; flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
}
.ncp-item.selected .ncp-avatar {
  box-shadow: 0 1px 4px rgba(255,255,255,0.1);
}
.ncp-avatar-img { width: 2.25rem; height: 2.25rem; border-radius: 50%; object-fit: cover; }
.ncp-avatar-fallback {
  font-family: 'Inter', sans-serif; font-size: 14px;
  font-weight: 600; color: #6B7280; user-select: none;
}

/* Info */
.ncp-info {
  display: flex; flex-direction: column; gap: 0.0625rem;
  min-width: 0; flex: 1;
}
.ncp-name {
  font-family: 'Inter', sans-serif; font-size: 13px;
  font-weight: 600; color: #E5E5EA;
}
.ncp-item.selected .ncp-name { color: #FFFFFF; }
.ncp-desc {
  font-family: 'Inter', sans-serif; font-size: 11px;
  color: #6B7280; line-height: 1.3;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ncp-item.selected .ncp-desc { color: rgba(255,255,255,0.55); }
.ncp-empty {
  padding: 2rem 0.875rem; text-align: center;
  font-family: 'Inter', sans-serif; font-size: 13px; color: #4B5563;
}

/* Category tree inside ncp dialog */
.ncp-cat-section { display: flex; flex-direction: column; }
.ncp-cat-header {
  display: flex; align-items: center; gap: 0.375rem;
  width: 100%; padding: 0.3125rem 0.25rem;
  background: transparent; border: none; cursor: pointer;
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif;
  color: #6B7280;
  transition: background 0.12s;
}
.ncp-cat-header:hover { background: rgba(255,255,255,0.05); color: #9CA3AF; }
.ncp-cat-chevron {
  flex-shrink: 0; color: #4B5563;
  transition: transform 0.15s;
  transform: rotate(0deg);
}
.ncp-cat-chevron.expanded { transform: rotate(90deg); }
.ncp-cat-emoji { font-size: 0.8125rem; line-height: 1; }
.ncp-cat-name {
  flex: 1; text-align: left;
  font-size: 0.6875rem; font-weight: 700;
  text-transform: uppercase; letter-spacing: 0.05em; color: #6B7280;
}
.ncp-cat-count {
  font-size: 0.625rem; font-weight: 600;
  padding: 0.0625rem 0.3125rem; border-radius: 9999px;
  background: rgba(255,255,255,0.08); color: #6B7280;
}
.ncp-cat-items { display: flex; flex-direction: column; gap: 0.125rem; padding-left: 0.625rem; }

/* Footer */
.ncp-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.875rem 1.5rem; border-top: 1px solid #1F1F1F;
  background: #0A0A0A; flex-shrink: 0;
}
.ncp-footer-hint {
  font-family: 'Inter', sans-serif; font-size: 12px; color: #4B5563;
}
.ncp-done-btn {
  padding: 0.5rem 1.5rem; border-radius: 0.625rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF; border: 1px solid #374151; cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.ncp-done-btn:hover {
  background: linear-gradient(135deg, #2D2D2D 0%, #374151 40%, #6B7280 100%);
  border-color: #4B5563;
}

@media (prefers-reduced-motion: reduce) {
  .chat-sidebar-new-btn,
  .chat-sidebar-item,
  .chat-sidebar-action-btn,
  .persona-chip,
  .persona-popover-item,
  .chat-header-btn,
  .chat-input-box,
  .rename-close-btn {
    transition: none;
  }
  .chat-sidebar-new-btn:hover {
    transform: none;
  }
}

/* ══════════════════════════════════════════════════════════════════════════
   GROUP CHAT — Multi-persona chips, toggle, config popover, @mentions
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Group toggle button ────────────────────────────────────────────────── */
.group-toggle-btn {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.5rem;
  border: 1px solid #E5E5EA;
  background: #F5F5F5;
  color: #9CA3AF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  margin-left: 0.25rem;
}
.group-toggle-btn:hover {
  background: #E5E5EA;
  color: #1A1A1A;
}
.group-toggle-btn.active {
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  color: #fff;
  border-color: #6366F1;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.3);
}

/* ── Group persona chip row ─────────────────────────────────────────────── */
.group-persona-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}
.group-persona-chip {
  display: flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.1875rem 0.5rem 0.1875rem 0.25rem;
  border-radius: 1.25rem;
  background: #F5F5F5;
  border: 1px solid #E5E5EA;
  cursor: pointer;
  transition: all 0.15s;
  font-size: var(--fs-secondary);
  position: relative;
}
.group-persona-chip:hover {
  background: #E5E5EA;
  border-color: #D1D1D6;
}
.group-persona-chip-avatar {
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 50%;
  object-fit: cover;
}
.group-persona-chip-initial {
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
  color: #fff;
  font-size: 0.65rem;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.group-persona-chip-name {
  font-weight: 500;
  color: #1A1A1A;
  max-width: 5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.group-persona-override-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  background: #6366F1;
  flex-shrink: 0;
}
.group-persona-chip-remove {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  color: #9CA3AF;
  border: none;
  cursor: pointer;
  transition: all 0.15s;
  padding: 0;
}
.group-persona-chip-remove:hover {
  background: rgba(255, 59, 48, 0.1);
  color: #FF3B30;
}


/* ── @Mention autocomplete popup ────────────────────────────────────────── */
/* ── @Mention autocomplete popup ────────────────────────────────────────── */
.mention-popup {
  position: absolute;
  bottom: 100%;
  left: 0;
  margin-bottom: 0.375rem;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 0.875rem;
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.16), 0 4px 12px rgba(0,0,0,0.06);
  z-index: 50;
  min-width: 18.75rem;
  max-width: 23.75rem;
  overflow: hidden;
}
.mention-popup-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.875rem 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9CA3AF;
  border-bottom: 1px solid #F0F0F0;
}
.mention-popup-hint {
  font-weight: 500;
  text-transform: none;
  letter-spacing: 0;
  font-size: 10px;
  color: #D1D1D6;
}
.mention-popup-list {
  padding: 0.25rem 0;
  max-height: 20rem;
  overflow-y: auto;
  scrollbar-width: thin;
}
.mention-popup-item {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  width: 100%;
  border: none;
  background: transparent;
  color: #1A1A1A;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s;
  position: relative;
}
.mention-popup-item:hover,
.mention-popup-item.active {
  background: #F7F7F8;
}
.mention-popup-item.active {
  background: #F0F0F2;
}
.mention-popup-item + .mention-popup-item {
  border-top: 1px solid #F5F5F5;
}
.mention-popup-item-all {
  border-top: 1px solid #E5E5EA !important;
}
.mention-popup-avatar {
  flex-shrink: 0;
}
.mention-popup-avatar-img {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  object-fit: cover;
  display: block;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.mention-popup-initial {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-size: 14px;
  font-weight: 700;
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 1px 3px rgba(0,0,0,0.08);
}
.mention-popup-initial-all {
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
}
.mention-popup-body {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  min-width: 0;
  flex: 1;
}
.mention-popup-name-row {
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.mention-popup-name {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: #1A1A1A;
  white-space: nowrap;
}
.mention-popup-meta {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 600;
  color: #fff;
  white-space: nowrap;
  padding: 0.125rem 0.375rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.25rem;
  letter-spacing: 0.01em;
}
.mention-popup-desc {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  font-weight: 500;
  color: #374151;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 1;
  -webkit-box-orient: vertical;
  overflow: hidden;
}
/* ── Sticky target indicator ─────────────────────────────────────────── */
.sticky-target-indicator {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  background: #F3F4F6;
  border: 1px solid #E5E5EA;
  border-radius: 0.375rem;
  padding: 0.0625rem 0.5rem;
  font-family: 'Inter', sans-serif;
}
.sticky-target-label {
  font-size: 11px;
  color: #374151;
  white-space: nowrap;
}
.sticky-target-label strong {
  font-weight: 700;
  color: #1A1A1A;
}
.sticky-target-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: #9CA3AF;
  cursor: pointer;
  padding: 0;
  transition: background 0.12s, color 0.12s;
}
.sticky-target-clear:hover {
  background: #E5E5EA;
  color: #1A1A1A;
}

/* Fixed-position tooltip for @mention descriptions */
.mention-tooltip-fixed {
  position: fixed;
  transform: translateY(-50%);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-family: 'Inter', sans-serif;
  padding: 0.625rem 0.875rem;
  border-radius: 0.625rem;
  width: 17.5rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  z-index: 9999;
  pointer-events: none;
}
.mention-tooltip-fixed::before {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: #0F0F0F;
}
.mention-tooltip-name {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 0.25rem;
}
.mention-tooltip-text {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  white-space: normal;
}
/* Fixed-position tooltip for persona header (teleported to body) */
:global(.persona-header-tooltip-fixed) {
  position: fixed;
  transform: translateX(-50%);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-family: 'Inter', sans-serif;
  padding: 0.625rem 0.875rem;
  border-radius: 0.625rem;
  max-width: 17.5rem;
  width: max-content;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  z-index: 9999;
  pointer-events: none;
}
:global(.persona-header-tooltip-fixed::before) {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: #0F0F0F;
}
:global(.persona-header-tooltip-name) {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
:global(.persona-header-tooltip-text) {
  font-size: 12px;
  font-weight: 400;
  line-height: 1.5;
  white-space: normal;
  word-break: break-word;
}
/* Message avatar tooltip — right side (assistant) */
:global(.msg-avatar-tooltip-fixed.tooltip-right) {
  position: fixed;
  transform: translateY(-50%);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-family: 'Inter', sans-serif;
  padding: 0.5rem 0.75rem;
  border-radius: 0.625rem;
  max-width: 16.25rem;
  width: max-content;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  z-index: 9999;
  pointer-events: none;
}
:global(.msg-avatar-tooltip-fixed.tooltip-right::before) {
  content: '';
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-right-color: #0F0F0F;
}
/* Message avatar tooltip — left side (user) */
:global(.msg-avatar-tooltip-fixed.tooltip-left) {
  position: fixed;
  transform: translate(-100%, -50%);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-family: 'Inter', sans-serif;
  padding: 0.5rem 0.75rem;
  border-radius: 0.625rem;
  max-width: 16.25rem;
  width: max-content;
  box-shadow: 0 8px 24px rgba(0,0,0,0.25);
  z-index: 9999;
  pointer-events: none;
}
:global(.msg-avatar-tooltip-fixed.tooltip-left::before) {
  content: '';
  position: absolute;
  left: 100%;
  top: 50%;
  transform: translateY(-50%);
  border: 6px solid transparent;
  border-left-color: #374151;
}

/* ── RAG chip & popover ────────────────────────────────────────────────── */
.rag-chip {
  padding: 0.25rem 0.625rem 0.25rem 0.25rem;
  gap: 0.375rem;
  height: 2.25rem;
}
.rag-popover {
  position: absolute;
  top: calc(100% + 0.375rem);
  right: 0;
  min-width: 17.5rem;
  max-height: 21.25rem;
  overflow-y: auto;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 0.75rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.08);
  z-index: 50;
  padding: 0.75rem;
  scrollbar-width: thin;
}
.rag-popover-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.625rem;
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 700;
  color: #1A1A1A;
}
.rag-popover-status {
  font-size: 11px;
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
}
.rag-on {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}
.rag-off {
  background: #F3F4F6;
  color: #9CA3AF;
}
.rag-popover-empty {
  font-size: 12px;
  color: #9CA3AF;
  padding: 0.5rem 0;
}
.rag-popover-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.rag-popover-item {
  padding: 0.5rem 0.625rem;
  border-radius: 0.625rem;
  background: #F9FAFB;
  border: 1px solid #F3F4F6;
}
.rag-popover-item-name {
  font-family: 'Inter', sans-serif;
  font-size: 13px;
  font-weight: 600;
  color: #1A1A1A;
}
.rag-popover-item-meta {
  font-family: 'Inter', sans-serif;
  font-size: 11px;
  color: #9CA3AF;
  margin-top: 0.125rem;
}

/* ── Memory Suggestions Banner ──────────────────────────────────────────── */
.memory-banner {
  flex-shrink: 0;
  margin: 0 1.25rem;
  padding: 0.625rem 0.875rem;
  background: var(--bg-card, #FFFFFF);
  border: 1px solid var(--border, #E5E5EA);
  border-radius: var(--radius-md, 12px);
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}
.memory-banner-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 0.5rem;
}
.memory-banner-title {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  color: var(--text-primary, #1A1A1A);
}
.memory-banner-count {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-width: 1.125rem;
  height: 1.125rem;
  padding: 0 0.3125rem;
  border-radius: 0.5625rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-size: 11px;
  font-weight: 600;
}
.memory-banner-actions {
  display: flex;
  gap: 0.375rem;
}
.memory-banner-btn {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem);
  font-weight: 600;
  padding: 0.1875rem 0.625rem;
  border-radius: var(--radius-sm, 8px);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
}
.memory-banner-btn.accept-all {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.memory-banner-btn.accept-all:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.memory-banner-btn.dismiss-all {
  background: #F5F5F5;
  color: var(--text-secondary, #6B7280);
}
.memory-banner-btn.dismiss-all:hover {
  background: #E5E5EA;
  color: var(--text-primary, #1A1A1A);
}
.memory-banner-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.memory-banner-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  border-radius: var(--radius-sm, 8px);
  background: #F9FAFB;
  border: 1px solid #F3F4F6;
}
.memory-banner-item-content {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex: 1;
  min-width: 0;
}
.memory-banner-target {
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  padding: 0.125rem 0.375rem;
  border-radius: 0.25rem;
}
.memory-banner-target.user {
  background: rgba(0, 122, 255, 0.1);
  color: #007AFF;
}
.memory-banner-target.system {
  background: rgba(139, 92, 246, 0.1);
  color: #8B5CF6;
}
.memory-banner-section {
  flex-shrink: 0;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem);
  color: var(--text-muted, #9CA3AF);
  font-weight: 500;
}
.memory-banner-entry {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  color: var(--text-primary, #1A1A1A);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.memory-banner-item-actions {
  display: flex;
  gap: 0.25rem;
  flex-shrink: 0;
}
.memory-item-btn {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 0.375rem;
  border: none;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s ease;
}
.memory-item-btn.accept {
  background: rgba(34, 197, 94, 0.1);
  color: #16A34A;
}
.memory-item-btn.accept:hover {
  background: rgba(34, 197, 94, 0.2);
}
.memory-item-btn.dismiss {
  background: rgba(239, 68, 68, 0.08);
  color: #EF4444;
}
.memory-item-btn.dismiss:hover {
  background: rgba(239, 68, 68, 0.16);
}

/* Memory banner transition */
.memory-banner-enter-active {
  transition: all 0.2s ease-out;
}
.memory-banner-leave-active {
  transition: all 0.15s ease-in;
}
.memory-banner-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.memory-banner-leave-to {
  opacity: 0;
  transform: translateY(8px);
}

/* ── Inspect button cost tooltip ─────────────────────────────────────────── */
/* ── Inline cost chip in context bar ── */
.ict-inline-cost {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  color: #6B7280;
  cursor: default;
  white-space: nowrap;
  padding: 0.125rem 0.25rem;
  border-radius: 0.25rem;
  transition: color 0.12s ease;
}
.ict-inline-cost:hover { color: #374151; }

/* ── Cost breakdown tooltip ── */
.inspect-cost-tooltip {
  position: absolute;
  top: calc(100% + 0.5rem);
  right: 0;
  min-width: 22rem;
  width: max-content;
  max-width: 30rem;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 0.75rem;
  overflow: hidden;
  box-shadow: 0 12px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06);
  z-index: 1000;
  pointer-events: none;
  animation: fadeIn 0.12s ease;
}
/* Header: model name + green total badge */
.ict-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.625rem 0.875rem;
  background: #F9F9F9;
  border-bottom: 1px solid #F0F0F0;
}
.ict-header-left {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  min-width: 0;
  color: #6B7280;
}
.ict-model-name {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  color: #6B7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.ict-total-badge {
  flex-shrink: 0;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  font-weight: 600;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: #F0FDF4;
  color: #15803D;
  white-space: nowrap;
}
/* Section block */
.ict-section {
  padding: 0.5rem 0.875rem;
  border-bottom: 1px solid #F5F5F5;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.ict-section-label {
  font-size: var(--fs-small);
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  margin-bottom: 0.125rem;
}
/* Cost row */
.ict-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1.5rem;
  font-size: var(--fs-small);
  color: #6B7280;
}
.ict-row span:last-child {
  font-family: 'JetBrains Mono', monospace;
  color: #1A1A1A;
  white-space: nowrap;
}
.ict-row-sub {
  margin-top: 0.125rem;
  padding-top: 0.25rem;
  border-top: 1px solid #F0F0F0;
  font-weight: 600;
  color: #374151;
}
.ict-row-sub span:last-child {
  color: #374151;
}
/* Total block */
.ict-total {
  padding: 0.5rem 0.875rem;
  background: #F9F9F9;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
}
.ict-total-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.ict-total-label {
  font-size: var(--fs-small);
  font-weight: 600;
  color: #9CA3AF;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.ict-total-amounts {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-caption);
  flex-wrap: wrap;
}
.ict-amount {
  font-weight: 700;
  color: #15803D;
}
.ict-sep {
  color: #D1D5DB;
  font-size: var(--fs-small);
}
.ict-cur {
  font-size: 0.75em;
  font-weight: 400;
  color: #9CA3AF;
}
.ict-blank {
  font-family: 'JetBrains Mono', monospace;
  color: #D1D5DB;
}
</style>

<style>
/* ── Tree node rules — unscoped because ChatTreeNodeView uses h() render functions ── */
.chat-sidebar-action-btn {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.chat-sidebar-action-btn:hover {
  background: rgba(255, 255, 255, 0.15);
  color: #FFFFFF;
}
.chat-sidebar-action-btn.danger:hover {
  background: rgba(255, 59, 48, 0.25);
  color: #FF6B6B;
}
.chat-sidebar-item-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
  flex-shrink: 0;
}
.chat-sidebar-item:hover .chat-sidebar-item-actions {
  opacity: 1;
  pointer-events: auto;
}
.chat-tree-row {
  position: relative;
}
.chat-tree-row:hover .chat-sidebar-item-actions {
  opacity: 1;
  pointer-events: auto;
}
.chat-tree-folder-actions {
  display: flex;
  align-items: center;
  gap: 0;
  flex-shrink: 0;
  opacity: 0;
  pointer-events: none;
  transition: opacity 0.15s;
}
.chat-tree-row:hover .chat-tree-folder-actions {
  opacity: 1;
  pointer-events: auto;
}
.chat-tree-dragging {
  opacity: 0.4;
}
/* Chips — unscoped so ChatTreeNodeView h() render elements pick them up */
.chat-completed-chip {
  flex-shrink: 0;
  padding: 0.0625rem 0.4375rem;
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  background: #1A1A1A;
  color: #fff;
  letter-spacing: 0.01em;
}
.chat-sidebar-item.active .chat-completed-chip {
  background: rgba(255, 255, 255, 0.2);
}
.chat-approval-chip {
  flex-shrink: 0;
  padding: 0.0625rem 0.4375rem;
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  background: #EF4444;
  color: #fff;
  letter-spacing: 0.01em;
  animation: approval-pulse 1.5s ease-in-out infinite;
}
@keyframes approval-pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.65; }
}
/* Spinner — unscoped so ChatTreeNodeView h() render elements pick it up */
.chat-unread-spinner {
  flex-shrink: 0;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: #1A1A1A;
  border-right-color: rgba(26, 26, 26, 0.4);
  animation: unread-spin 0.7s linear infinite;
}
.chat-unread-spinner--light {
  border-top-color: #fff;
  border-right-color: rgba(255, 255, 255, 0.4);
}
@keyframes unread-spin {
  to { transform: rotate(360deg); }
}


/* ── Folder picker tree items — unscoped: rendered by FolderTreeItem h() ── */
.newchat-ftree-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3rem 0.625rem;
  border-radius: 0.375rem;
  border: none;
  background: transparent;
  width: 100%;
  text-align: left;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.1s, color 0.1s;
  box-sizing: border-box;
}
.newchat-ftree-item:hover {
  background: #1E1E1E;
  color: #FFFFFF;
}
.newchat-ftree-item[data-active] {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}
</style>
