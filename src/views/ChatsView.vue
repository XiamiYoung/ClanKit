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
      @open-body-viewer="(id, type, name) => openBodyViewer(id, type, name)"
      @remove-group-agent="(cId, pid) => requestRemoveGroupAgent(cId, pid)"
      @start-call="handleStartCall"
    />

    <!-- ── Chat List Sidebar (single mode) ────────────────────────────────── -->
    <aside v-if="!gridMode" class="chat-sidebar" :style="{ width: chatSidebarCollapsed ? '0' : sidebarWidth + 'px', minWidth: chatSidebarCollapsed ? '0' : undefined, overflow: chatSidebarCollapsed ? 'hidden' : undefined }">
      <!-- Action bar: New Folder, New Chat, Grid Mode -->
      <div class="chat-sidebar-action-bar">
        <!-- New Folder button -->
        <button
          @click="(e) => openCtxDialog('newFolder', '', selectedFolderId ?? chatsStore.activeFolderId ?? null)"
          class="chat-sidebar-action-btn"
          :aria-label="t('chats.newFolder')"
          v-tooltip="t('chats.newFolder')"
        >
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
            <line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>
          </svg>
        </button>
        <!-- New Chat button -->
        <button
          @click="newChat()"
          class="chat-sidebar-action-btn"
          :aria-label="t('chats.newChat')"
          v-tooltip="t('chats.newChat')"
        >
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <!-- Multi-chat grid view button -->
        <button
          @click="enterGridMode()"
          class="chat-sidebar-action-btn"
          :aria-label="t('chats.multiChatGridView')"
          v-tooltip="t('chats.multiChatGridView')"
        >
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>
      </div>

      <!-- Search Filter -->
      <div class="chat-sidebar-filter">
        <svg class="chat-filter-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
          <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
        </svg>
        <input
          v-model="chatFilterQuery"
          type="text"
          :placeholder="t('chats.searchChats')"
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
        <template v-if="!chatsStore.isLoading && chatFilterQuery.trim()">
          <div
            v-for="chat in filteredChats"
            :key="chat.id"
            @click="triggerMemoryExtractionOnSwitch(chatsStore.activeChatId); chatsStore.setActiveChat(chat.id); chatsStore.markAsRead(chat.id)"
            class="chat-sidebar-item group"
            :class="{ active: chat.id === chatsStore.activeChatId }"
          >
            <span v-if="((chat.isRunning && chat.id !== chatsStore.activeChatId) || chatsStore.unreadChatIds.has(chat.id)) && !chatsStore.completedChatIds.has(chat.id) && !chatsStore.pendingPermissionChatIds.has(chat.id)" class="chat-unread-spinner"></span>
            <span v-if="chat.icon" class="chat-sidebar-item-icon">{{ chat.icon }}</span>
            <svg v-else style="width:16px;height:16px;color:#9CA3AF;opacity:0.7;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
            <span class="chat-sidebar-item-title">{{ chat.title }}</span>
            <!-- Folder badge in search mode -->
            <span v-if="chat._folderName" class="chat-folder-badge">{{ chat._folderName }}</span>
            <span v-if="chatsStore.pendingPermissionChatIds.has(chat.id) && chat.id !== chatsStore.activeChatId" class="chat-approval-chip">Approval</span>
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
        <template v-else-if="!chatsStore.isLoading">
          <!-- Root folder row -->
          <div class="chat-root-row">
            <div class="chat-root-row-left" @click="rootExpanded = !rootExpanded">
              <svg class="chat-root-chevron" :style="{ transform: rootExpanded ? 'rotate(90deg)' : 'rotate(0deg)' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <polyline points="9 18 15 12 9 6"/>
              </svg>
              <span class="chat-root-label">{{ t('chats.allChatsRootLabel', { count: chatsStore.chats.length }) }}</span>
            </div>
            <!-- Fold/Unfold all folders button — only visible when folders exist -->
            <button
              v-if="hasFolders"
              class="chat-root-fold-btn"
              v-tooltip="anyFolderExpanded ? t('chats.collapseAllFolders') : t('chats.expandAllFolders')"
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
              v-for="(node, nodeIdx) in chatsStore.chatTree"
              :key="node.id"
              :node="node"
              :index="nodeIdx"
              :depth="1"
              :activeChatId="chatsStore.activeChatId"
              :unreadChatIds="chatsStore.unreadChatIds"
              :completedChatIds="chatsStore.completedChatIds"
              :pendingPermissionChatIds="chatsStore.pendingPermissionChatIds"
              :draggingId="draggingNodeId"
              :selectedFolderId="selectedFolderId"
              :contextMenuNodeId="treeCtxMenu.visible ? treeCtxMenu.node?.id : null"
              :onShowTooltip="(data) => { treeTooltip = { visible: true, ...data } }"
              :onHideTooltip="() => { treeTooltip.visible = false }"
              @select-chat="(id) => { triggerMemoryExtractionOnSwitch(chatsStore.activeChatId); chatsStore.setActiveChat(id); chatsStore.markAsRead(id); selectedFolderId = null; treeLastSelected = { type: 'chat', id } }"
              @toggle-folder="(id) => { chatsStore.toggleFolder(id) }"

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
            {{ t('chats.newFolder') }}
          </button>
          <!-- Folder-specific actions (rename / delete) -->
          <template v-if="treeCtxMenu.node?.type === 'folder'">
            <div style="height:1px; background:#2A2A2A; margin:4px 8px;"></div>
            <button class="chat-ctx-item" @click="openCtxDialog('rename', treeCtxMenu.node.name, treeCtxMenu.node.id, treeCtxMenu.x, treeCtxMenu.y)">
              <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
              {{ t('chats.configureFolder') }}
            </button>
            <button class="chat-ctx-item chat-ctx-danger" @click="closeTreeCtxMenu(); doDeleteFolder(treeCtxMenu.node.id)">
              <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>
              {{ t('chats.deleteFolder') }}
            </button>
          </template>
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

    <!-- Folder create/rename modal -->
    <CategoryModal
      v-if="folderModal.visible"
      :visible="folderModal.visible"
      :mode="folderModal.mode"
      :initial="folderModal.initial"
      :noun="t('chats.folderNoun')"
      :renameTitle="t('chats.configureFolder')"
      :showTypeSelector="false"
      @confirm="onFolderModalConfirm"
      @close="folderModal.visible = false"
    />

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
        v-tooltip="chatSidebarCollapsed ? 'Expand chat list' : 'Collapse chat list'"
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
          <span style="font-size:var(--fs-body); font-weight:600;">{{ t('chats.dropFilesHere') }}</span>
          <span style="font-size:var(--fs-caption); opacity:0.7;">{{ t('chats.pasteFilePaths') }}</span>
        </div>
      </div>

      <template v-if="chatsStore.activeChat">
        <!-- Chat Header (shared component) -->
        <ChatHeader
          ref="chatHeaderRef"
          :chatId="chatsStore.activeChatId"
          @open-chat-settings="showChatConfigModal = true"
          @open-body-viewer="(id, type, name) => openBodyViewer(id, type, name)"
          @remove-group-agent="(cId, pid) => requestRemoveGroupAgent(cId, pid)"
          @start-call="handleStartCall"
          @enter-grid="enterGridMode"
        />

        <!-- ── Context Window Usage Bar (always visible) ────────────────────── -->
        <div class="chat-context-bar-wrap">
        <div class="chat-context-bar">
          <span style="color:#6B7280; font-size:var(--fs-small); white-space:nowrap;">{{ t('chats.context') }}</span>
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
            {{ formatTokenCount(activeCumulativeTokens.input) }} {{ t('chats.tokenIn') }} / {{ formatTokenCount(activeCumulativeTokens.output) }} {{ t('chats.tokenOut') }}
          </span>
          <!-- Inspect button — always clickable -->
          <button
            @click="inspectContext"
            class="flex items-center justify-center rounded-md transition-colors cursor-pointer shrink-0"
            style="width:1.75rem; height:1.75rem; background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color:#FFFFFF; border:1px solid #1A1A1A; box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);"
            v-tooltip="t('chats.inspect')"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
            </svg>
          </button>

          <!-- Compact button -->
          <button
            @click="compactContext"
            :disabled="isCompacting || (!activeRunning && !hasMessages)"
            class="flex items-center justify-center rounded-md transition-colors cursor-pointer shrink-0"
            :style="isCompacting
              ? 'width:1.75rem; height:1.75rem; background:#F5F5F5; color:#6B7280; border:1px solid #E5E5EA;'
              : (activeRunning || hasMessages)
                ? 'width:1.75rem; height:1.75rem; background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color:#FFFFFF; border:1px solid #1A1A1A; box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);'
                : 'width:1.75rem; height:1.75rem; background:#F5F5F5; color:#D1D1D6; border:1px solid #E5E5EA; cursor:not-allowed;'"
            @mouseenter="e => { if (!isCompacting && (activeRunning || hasMessages)) e.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)' }"
            @mouseleave="e => { if (!isCompacting && (activeRunning || hasMessages)) e.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)' }"
            v-tooltip="isCompacting ? t('chats.compacting') : activeRunning ? t('chats.compactOnNext') : t('chats.compactContextWindow')"
          >
            <svg v-if="isCompacting" class="w-3.5 h-3.5 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <path d="M21 12a9 9 0 1 1-6.219-8.56"/>
            </svg>
            <svg v-else class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>
            </svg>
          </button>

          <!-- Unknown-context-window warning button — opens Config → AI Provider -->
          <AppTooltip v-if="activeModelContextUnknown" :text="t('chats.contextUnknownWindow')" placement="top">
            <button
              @click="$router.push('/config?tab=models')"
              class="flex items-center justify-center rounded-md transition-colors cursor-pointer shrink-0"
              style="width:1.75rem; height:1.75rem; background:#FEF2F2; color:#DC2626; border:1px solid #FECACA;"
              @mouseenter="e => { e.currentTarget.style.background='#FEE2E2'; e.currentTarget.style.borderColor='#FCA5A5' }"
              @mouseleave="e => { e.currentTarget.style.background='#FEF2F2'; e.currentTarget.style.borderColor='#FECACA' }"
              :aria-label="t('chats.contextUnknownWindow')"
            >
              <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
                <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
              </svg>
            </button>
          </AppTooltip>
        </div>
        </div>

        <!-- ── Context Inspector Modal ──────────────────────────────────────── -->
        <ContextInspectorModal
          :visible="showContextInspector"
          :chatId="chatsStore.activeChatId"
          :contextMetrics="activeContextMetrics"
          :perAgentContextMetrics="activePerAgentMetrics"
          :debugLogs="debugLog"
          @close="showContextInspector = false"
        />

        <!-- ── History context banner ──────────────────────────────────────── -->
        <div
          v-if="historyContextSources.get(chatsStore.activeChatId)?.length"
          class="shrink-0 flex items-start gap-3 px-4 py-2.5"
          style="background:#FFF9E6; border-bottom:1px solid #F3E1A0;"
        >
          <svg class="shrink-0 mt-0.5" style="width:15px;height:15px;color:#B45309;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
          </svg>
          <div class="flex-1 min-w-0">
            <p style="font-size:var(--fs-small);color:#92400E;font-weight:600;margin:0 0 0.25rem;">
              {{ t('chats.historyContextFound') }}
            </p>
            <div class="flex flex-wrap gap-2">
              <button
                v-for="src in historyContextSources.get(chatsStore.activeChatId)"
                :key="src.chatId"
                @click="chatsStore.setActiveChat(src.chatId)"
                class="flex items-center gap-1.5 px-2.5 py-1 rounded-md cursor-pointer"
                style="background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%);color:#fff;font-size:var(--fs-small);font-weight:600;border:none;box-shadow:0 2px 8px rgba(0,0,0,0.12),0 1px 3px rgba(0,0,0,0.08);"
              >
                <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M5 12h14M12 5l7 7-7 7"/>
                </svg>
                {{ chatsStore.chats.find(c => c.id === src.chatId)?.title || t('chats.jumpToChat') }}
              </button>
            </div>
          </div>
          <div class="shrink-0 flex items-center gap-1.5">
            <span
              v-if="historyContextCountdown > 0"
              style="font-size:var(--fs-small);color:#B45309;font-variant-numeric:tabular-nums;min-width:1.5rem;text-align:right;"
            >{{ historyContextCountdown }}s</span>
            <button
              @click="_clearHistoryCountdown(); historyContextSources.delete(chatsStore.activeChatId)"
              class="cursor-pointer"
              style="color:#B45309;opacity:0.6;"
              @mouseenter="e => e.currentTarget.style.opacity='1'"
              @mouseleave="e => e.currentTarget.style.opacity='0.6'"
              v-tooltip="t('common.close')"
            >
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>

        <!-- ── Messages (shared ChatWindow) + Input ────────────────────────── -->
        <ChatWindow
          ref="chatWindowRef"
          :chatId="chatsStore.activeChatId"
          :showQuote="true"
          :showDelete="true"
          @send="handleChatWindowSend"
          @resend-message="handleResendMessage"
          @retry-waiting-indicator="handleRetryWaitingIndicator"
          @escape-retrieve="interrupt(chatsStore.activeChatId)"
          @quote="quoteMessage"
          @quote-image="handleQuoteImage"
          @delete-message="requestDeleteMessage"
          @speak-message="handleSpeakMessage"
          :speakingMsgId="speakingMsgId"
          :ttsPlayingMsgId="ttsPlayingMsgId"
          :on-approve-plan="approvePlan"
          :on-reject-plan="rejectPlan"
          :on-refine-plan="refinePlan"
        >
          <template #input>
            <!-- Interrupt confirmation bar -->
            <div
              v-if="pendingInterrupt.visible"
              class="chat-interrupt-bar"
            >
              <div class="chat-interrupt-bar-content">
                <svg class="w-4 h-4 shrink-0" style="color:#F59E0B;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                </svg>
                <span class="chat-interrupt-bar-text">
                  {{ t('chats.interruptCountdown', { seconds: pendingInterrupt.countdown }) }}
                </span>
              </div>
              <div class="chat-interrupt-bar-actions">
                <button
                  class="chat-interrupt-btn chat-interrupt-btn--primary"
                  @click="confirmInterrupt"
                >
                  {{ t('chats.interruptAndSend') }} ({{ pendingInterrupt.countdown }})
                </button>
                <button
                  class="chat-interrupt-btn chat-interrupt-btn--ghost"
                  @click="cancelInterrupt"
                >
                  {{ t('common.cancel') }}
                </button>
              </div>
            </div>

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
                  v-tooltip="t('chats.removeQuote', 'Remove quote')"
                >
                  <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>

              <div v-if="isGroupChat || groupActivityState.visible" class="chat-group-status-row chat-group-status-row--input">
                <div
                  v-if="isGroupChat"
                  class="chat-audience-inline"
                  v-tooltip="audienceStatusText"
                >
                  <span class="chat-audience-label">{{ t('chats.sendTo') }}</span>
                  <div class="chat-audience-options">
                    <button
                      class="chat-audience-chip"
                      :class="{ active: groupAudienceMode === 'auto' }"
                      v-tooltip="t('chats.audienceAutoHint')"
                      @click="setAudienceMode('auto')"
                    >
                      {{ t('chats.audienceAuto') }}
                    </button>
                    <button
                      class="chat-audience-chip"
                      :class="{ active: groupAudienceMode === 'all' }"
                      v-tooltip="t('chats.audienceAllHint')"
                      @click="setAudienceMode('all')"
                    >
                      {{ t('chats.audienceAll') }}
                    </button>
                    <button
                      v-for="agentId in activeSystemAgentIds"
                      :key="agentId"
                      class="chat-audience-chip"
                      :class="{ active: isAudienceAgentSelected(agentId) }"
                      v-tooltip="t('chats.audienceManualHint')"
                      @click="toggleAudienceAgent(agentId)"
                    >
                      {{ agentsStore.getAgentById(agentId)?.name || 'Unknown' }}
                    </button>
                  </div>
                </div>
                <div
                  v-if="groupActivityState.visible"
                  class="chat-activity-bar"
                  :class="`chat-activity-bar--${groupActivityState.tone}`"
                >
                  <span class="chat-activity-pulse"></span>
                  <span class="chat-activity-text">{{ groupActivityState.text }}</span>
                </div>
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
                  :aria-label="t('chats.attachFiles')"
                  v-tooltip="t('chats.attachFiles')"
                >
                  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                  </svg>
                </button>
                <ChatMentionInput
                  ref="mentionInputEl"
                  v-model="inputText"
                  v-model:longBlobs="inputLongBlobs"
                  :agentIds="activeSystemAgentIds"
                  :isGroupChat="isGroupChat"
                  :isRunning="activeRunning"
                  @send="sendMessage"
                  @escape="interrupt(chatsStore.activeChatId)"
                  @focus="inputFocused = true"
                  @blur="onInputBlur"
                  @attach="atts => handleAttachResults(atts)"
                  @preview-blob="content => viewingBlobContent = content"
                />
                <!-- Escape retrieve button (visible while running) -->
                <template v-if="activeRunning">
                  <button
                    @click="interrupt(chatsStore.activeChatId)"
                    class="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-all duration-150 cursor-pointer mb-0.5"
                    style="background:rgba(255,59,48,0.08); color:#FF3B30; box-shadow:0 1px 3px rgba(0,0,0,0.04);"
                    @mouseenter="e => e.currentTarget.style.background='rgba(255,59,48,0.12)'"
                    @mouseleave="e => e.currentTarget.style.background='rgba(255,59,48,0.08)'"
                    :aria-label="t('chats.escapeRetrieve')"
                    v-tooltip="t('chats.escapeRetrieve')"
                  >
                    <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <circle cx="12" cy="12" r="10"/><rect x="9" y="9" width="6" height="6" rx="1" fill="currentColor"/>
                    </svg>
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
                  v-tooltip="t('chats.sendMessageBtn')"
                >
                  <svg class="w-5 h-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 19V5"/><path d="m5 12 7-7 7 7"/>
                  </svg>
                </button>
              </div>
              <div class="flex items-center justify-between mt-1.5 px-1">
                <!-- Permission Mode Selector & Status (left) -->
                <div class="flex items-center gap-1.5">
                  <!-- Permission Mode Label & Selector -->
                  <div class="flex items-center gap-1">
                    <label class="text-xs font-medium" style="color:#6B7280; white-space:nowrap;">
                      {{ t('chats.permissionMode') }}:
                    </label>
                    <select
                      :value="chatPermissionMode"
                      @change="(e) => updateChatPermissionMode(e.target.value)"
                      class="permission-mode-select"
                      :class="'pms-' + chatPermissionMode"
                      v-tooltip="permissionModeTitle"
                    >
                      <option value="inherit">{{ t('chats.inherit') }}</option>
                      <option value="chat_only">{{ t('chats.chatOnly') }}</option>
                      <option value="all_permissions">{{ t('chats.allPermissions') }}</option>
                    </select>
                  </div>
                  <!-- Status Info -->
                  <span v-if="!isGroupChat && !gridMode" class="text-xs" style="color:#9CA3AF; white-space:nowrap;">
                    {{ enabledSkills.length }} {{ t('chats.statusSkills') }}{{ enabledToolsCount > 0 ? ', ' + enabledToolsCount + ' ' + t('chats.statusTools') : '' }}{{ enabledMcpCount > 0 ? ', ' + enabledMcpCount + ' MCP' : '' }}{{ enabledKnowledgeCount > 0 ? ', ' + enabledKnowledgeCount + ' RAG' : '' }}
                  </span>
                  <span v-if="attachments.length > 0" style="color:#1A1A1A; font-weight:500; font-size:0.75rem;">
                    {{ attachments.length === 1 ? t('chats.filesAttached', { count: attachments.length }) : t('chats.filesAttachedPlural', { count: attachments.length }) }}
                  </span>
                </div>
                <p class="text-xs" style="color:#9CA3AF;">
                  {{ t('chats.keyboardHintsEnterToSend') }}
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
          <button class="chat-empty-new-btn" @click="newChat()">{{ t('chats.selectOrCreate') }}</button>
        </template>
      </div>
    </div>

    <!-- ── Chat Settings Modal ── -->
    <ChatSettingsModal :visible="showChatConfigModal" :chat-id="chatsStore.activeChatId" @close="showChatConfigModal = false" />

    <!-- ── Rename Chat Modal ─────────────────────────────────────────────── -->
    <div v-if="showRenameModal" class="modal-dialog-backdrop">
      <div class="modal-dialog-container" @keydown.escape="cancelRename">
        <div class="modal-dialog-header">
          <h3 class="modal-dialog-title">{{ t('chats.renameChat') }}</h3>
          <button class="modal-dialog-close-btn" @click="cancelRename" aria-label="Close">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="modal-dialog-body">
          <div class="newchat-name-row-v2">
            <button class="newchat-icon-picker-btn" @click.stop="showRenameIconPicker = true" v-tooltip="t('chats.chatIcon')">
              <span class="newchat-icon-display">{{ editingIcon || '💬' }}</span>
              <svg class="newchat-icon-edit" style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
              </svg>
            </button>
            <textarea
              ref="renameInput"
              v-model="editingTitle"
              @keydown.enter.exact="onRenameKeydown"
              @compositionstart="renameComposing = true"
              @compositionend="renameComposing = false"
              class="modal-dialog-input"
              style="flex:1; min-width:0;"
              placeholder="Enter chat name"
              rows="1"
            ></textarea>
          </div>
        </div>
        <div class="modal-dialog-actions">
          <AppButton variant="secondary" size="modal" @click="cancelRename">{{ t('common.cancel') }}</AppButton>
          <AppButton size="modal" :disabled="!editingTitle.trim()" @click="confirmRename">{{ t('common.save') }}</AppButton>
        </div>
      </div>
    </div>
    <EmojiPicker
      v-if="showRenameIconPicker"
      :current="editingIcon"
      @select="onRenameIconSelect"
      @close="showRenameIconPicker = false"
    />
  </div>

  <!-- New Chat Modal -->
  <NewChatModal
    :visible="showNewChatModal"
    :new-chat-name="newChatName"
    :new-chat-icon="newChatIcon"
    :new-chat-user-agent-id="newChatUserAgentId"
    :new-chat-folder-id="newChatFolderId"
    :new-chat-agent-ids="newChatAgentIds"
    :show-new-chat-icon-picker="showNewChatIconPicker"
    :new-chat-agent-search="newChatAgentSearch"
    :new-chat-agent-category-id="newChatAgentCategoryId"
    :new-chat-user-search="newChatUserSearch"
    :new-chat-user-category-id="newChatUserCategoryId"
    :new-chat-folder-tree-expanded="newChatFolderTreeExpanded"
    :filtered-new-chat-agents="filteredNewChatAgents"
    :filtered-new-chat-users="filteredNewChatUsers"
    :active-new-chat-user-agent="activeNewChatUserAgent"
    :effective-new-chat-user-agent-id="effectiveNewChatUserAgentId"
    :displayed-system-persona-agents="displayedSystemPersonaAgents"
    :sorted-system-agents="sortedSystemAgents"
    :sorted-user-agents="sortedUserAgents"
    @close="cancelNewChat"
    @confirm="confirmNewChat"
    @update:new-chat-name="newChatName = $event"
    @update:new-chat-icon="newChatIcon = $event"
    @update:new-chat-folder-id="newChatFolderId = $event"
    @update:new-chat-agent-search="newChatAgentSearch = $event"
    @update:new-chat-user-search="newChatUserSearch = $event"
    @update:show-new-chat-icon-picker="showNewChatIconPicker = $event"
    @select-new-chat-agent-category="selectNewChatAgentCategory($event)"
    @select-new-chat-user-category="selectNewChatUserCategory($event)"
    @toggle-new-chat-agent="toggleNewChatAgent($event)"
    @toggle-new-chat-folder-expand="toggleNewChatFolderExpand($event)"
    @select-new-chat-user-agent="selectNewChatUserAgent($event)"
    @clear-new-chat-user-selection="clearNewChatUserSelection"
    @remove-new-chat-system-agent="removeNewChatSystemAgent($event)"
    @on-new-chat-icon-select="onNewChatIconSelect($event)"
  />
  <!-- Agent Body Viewer Modal (chat context — model changes go to per-chat override) -->
  <AgentBodyViewer
    v-if="bodyViewerTarget"
    :agent-id="bodyViewerTarget.agentId"
    :agent-type="bodyViewerTarget.agentType"
    :agent-name="bodyViewerTarget.agentName"
    :agent-description="bodyViewerTarget.agentDescription"
    :agent-prompt="bodyViewerTarget.agentPrompt"
    :agent-provider-id="bodyViewerTarget.agentProviderId"
    :agent-model-id="bodyViewerTarget.agentModelId"
    :agent-voice-id="bodyViewerTarget.agentVoiceId"
    :agent-avatar="bodyViewerTarget.agentAvatar"
    :agent-required-tool-ids="bodyViewerTarget.agentRequiredToolIds"
    :agent-required-skill-ids="bodyViewerTarget.agentRequiredSkillIds"
    :agent-required-mcp-server-ids="bodyViewerTarget.agentRequiredMcpServerIds"
    :agent-required-knowledge-base-ids="bodyViewerTarget.agentRequiredKnowledgeBaseIds"
    :from-chat="true"
    :read-only="true"
    @close="closeBodyViewer"
    @update-agent="handleBodyViewerUpdateAgent"
  />

  <!-- Confirm Delete Modal -->
  <ConfirmModal
    v-if="confirmDeleteTarget"
    :visible="true"
    :title="confirmDeleteTarget.type === 'message' ? t('chats.deleteMessage') : confirmDeleteTarget.type === 'chat' ? t('chats.deleteChat') : confirmDeleteTarget.type === 'folder' ? t('chats.deleteFolder') : t('chats.removeAgent')"
    :message="confirmDeleteTarget.type === 'message'
      ? t('chats.deleteMessageConfirm')
      : confirmDeleteTarget.type === 'chat'
        ? t('chats.deleteChatConfirm', { name: confirmDeleteTarget.label })
        : confirmDeleteTarget.type === 'folder'
          ? t('chats.deleteFolderNonEmptyConfirm', { name: confirmDeleteTarget.label })
          : t('chats.removeAgentConfirm', { name: confirmDeleteTarget.label })"
    :confirm-text="t('common.delete')"
    confirm-class="danger"
    @confirm="executeConfirmedDelete"
    @close="confirmDeleteTarget = null"
    :style="{ zIndex: 99999 }"
  />

  <!-- Non-empty folder alert -->
  <ConfirmModal
    v-if="folderNonEmptyAlert"
    :title="t('chats.cannotDeleteFolder')"
    :message="t('chats.folderNonEmptyAlert', { name: folderNonEmptyAlert })"
    :confirm-text="t('common.ok')"
    confirm-class="primary"
    :cancel-text="t('common.close')"
    @confirm="folderNonEmptyAlert = null"
    @close="folderNonEmptyAlert = null"
  />

  <ConfirmModal
    v-if="voiceServerError"
    :visible="true"
    :title="voiceErrorTitle"
    :message="voiceErrorMsg"
    :confirm-text="t('common.goToConfig')"
    confirm-class="primary"
    :cancel-text="t('common.close')"
    @confirm="voiceServerError = ''; $router.push('/config?tab=stt')"
    @close="voiceServerError = ''"
  />

  <!-- Preview limit modal (chat/folder) -->
  <PreviewLimitModal
    :visible="showPreviewLimitModal"
    :message="previewLimitMessage"
    @close="showPreviewLimitModal = false"
  />

  <!-- Preview limit modal (voice call daily limit) -->
  <PreviewLimitModal
    :visible="showVoiceLimitModal"
    :message="voiceLimitMessage"
    @close="showVoiceLimitModal = false"
  />

  <!-- Tree item name tooltip (teleported — escapes sidebar overflow clip) -->
  <Teleport to="body">
    <div
      v-if="treeTooltip.visible"
      class="tree-name-tooltip"
      :style="{
        right: treeTooltip.right + 'px',
        top: (treeTooltip.top - 4) + 'px',
        background: treeTooltip.background || undefined,
        borderColor: treeTooltip.background ? 'transparent' : undefined,
      }"
    >{{ treeTooltip.text }}</div>
  </Teleport>

  <!-- Teleport tooltips to body so they escape all stacking contexts -->
  <Teleport to="body">
    <!-- Header agent tooltip now handled by ChatHeader component -->
    <div
      v-if="mentionTooltip.visible && mentionTooltip.source === 'message'"
      :class="['msg-avatar-tooltip-fixed', mentionTooltip.side === 'left' ? 'tooltip-left' : 'tooltip-right']"
      :style="{ top: mentionTooltip.y + 'px', left: mentionTooltip.x + 'px' }"
    >
      <div class="agent-header-tooltip-name">{{ mentionTooltip.name }}</div>
      <div v-if="mentionTooltip.text" class="agent-header-tooltip-text">{{ mentionTooltip.text }}</div>
    </div>
  </Teleport>

  <!-- Blob view dialog (input-area long-paste chips) -->
  <Teleport to="body">
    <div v-if="viewingBlobContent" class="long-input-overlay">
      <div class="long-input-dialog">
        <div class="long-input-dialog__header">
          <span>{{ t('chats.longInputDialogTitle', { count: viewingBlobContent.length }) }}</span>
          <button class="long-input-dialog__close" @click="viewingBlobContent = null">×</button>
        </div>
        <div class="long-input-dialog__body">
          <pre>{{ viewingBlobContent }}</pre>
        </div>
      </div>
    </div>
  </Teleport>

</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted, onActivated, onDeactivated, onErrorCaptured, watch, toRaw, provide } from 'vue'
defineOptions({ name: 'ChatsView', inheritAttrs: false })
import { useRoute, useRouter } from 'vue-router'
import { useChatsStore } from '../stores/chats'
import { useSkillsStore } from '../stores/skills'
import { useConfigStore } from '../stores/config'
import { useAgentsStore } from '../stores/agents'
import { useMcpStore } from '../stores/mcp'
import { useToolsStore } from '../stores/tools'
import { useModelsStore } from '../stores/models'
import { useKnowledgeStore } from '../stores/knowledge'
import { useVoiceStore } from '../stores/voice'
import { useFocusModeStore } from '../stores/focusMode'
import { useObsidianStore } from '../stores/obsidian'
import { useI18n } from '../i18n/useI18n'
import { getAvatarDataUri } from '../components/agents/agentAvatars'
import AgentBodyViewer from '../components/agents/AgentBodyViewer.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import PreviewLimitModal from '../components/common/PreviewLimitModal.vue'
import MessageRenderer from '../components/chat/MessageRenderer.vue'
import ChatWindow from '../components/chat/ChatWindow.vue'
import ChatHeader from '../components/chat/ChatHeader.vue'
import ChatMentionInput from '../components/chat/ChatMentionInput.vue'
import { parseMentions } from '../utils/mentions'
import { v4 as uuidv4 } from 'uuid'
import AppButton from '../components/common/AppButton.vue'
import AppTooltip from '../components/common/AppTooltip.vue'
import ChatGridLayout from '../components/chat/ChatGridLayout.vue'
import CategoryModal from '../components/agents/CategoryModal.vue'
import EmojiPicker from '../components/agents/EmojiPicker.vue'
import ChatSettingsModal from '../components/chat/ChatSettingsModal.vue'
import NewChatModal from '../components/chat/NewChatModal.vue'
import ContextInspectorModal from '../components/chat/ContextInspectorModal.vue'
import { useVoiceRecording } from '../composables/useVoiceRecording'
import { useChatTree } from '../composables/useChatTree'
import { useMessageOps } from '../composables/useMessageOps'
import { useChunkHandler } from '../composables/useChunkHandler'
import { useAgentCollaboration } from '../composables/useAgentCollaboration'
import { useSendMessage } from '../composables/useSendMessage'
import { useGridMode } from '../composables/useGridMode'
import { useAttachments } from '../composables/useAttachments'
import { useAvatarTooltip } from '../composables/useAvatarTooltip'

import ChatTreeNodeView from '../components/chat/ChatTreeNodeView.js'

const chatsStore = useChatsStore()
const skillsStore = useSkillsStore()
const configStore = useConfigStore()
const agentsStore = useAgentsStore()
const mcpStore = useMcpStore()
const toolsStore = useToolsStore()
const modelsStore = useModelsStore()
const knowledgeStore = useKnowledgeStore()
const voiceStore = useVoiceStore()
const focusModeStore = useFocusModeStore()
const { t } = useI18n()
const route = useRoute()
const router = useRouter()


const enabledSkillObjects = computed(() => {
  const agent = currentSingleAgent.value
  if (!agent) return skillsStore.allSkillObjects
  const required = agent.requiredSkillIds
  if (!required || required.length === 0) return []
  return skillsStore.allSkillObjects.filter(s => required.includes(s.id))
})

const inputText = ref('')
const inputLongBlobs = ref({}) // id → long-paste content; populated by ChatMentionInput chips
const viewingBlobContent = ref(null)

// ── Voice recording composable ──
// inputText moved here; sendMessage is a function declaration (hoisted).
const {
  handleStartCall,
  voiceServerError,
  setupVoiceListeners,
  cleanupVoiceListeners,
  addVoiceMessageToChat,
  speakText,
  stopSpeaking,
  cancelCurrentSpeech,
  handleVoiceTask,
  startMicCapture,
  stopMicCapture,
  showVoiceLimitModal,
  voiceLimitMessage,
} = useVoiceRecording({ inputText, sendMessage: (...args) => sendMessage(...args) })

const speakingMsgId = ref('')
const ttsPlayingMsgId = ref('')
let _speakAudioEl = null

// ── Chunked TTS pipeline state ──
let _ttsSessionId = null
let _ttsSessionDir = null
let _ttsChunks = new Map()   // index → filePath
let _ttsTotal = 0
let _ttsPlayingIdx = -1
let _ttsChunkHandler = null  // raw IPC handler ref returned by onTtsChunkReady

// Stop playback when the user switches to a different chat
watch(() => chatsStore.activeChatId, () => { stopSpeakMessage() })

function resolveSpeakAgentId(msg) {
  if (msg?.agentId && agentsStore.getAgentById(msg.agentId)) return msg.agentId
  const chat = chatsStore.chats.find(c => c.id === chatsStore.activeChatId)
  if (chat?.groupAgentIds?.length) return chat.groupAgentIds[0]
  return chat?.systemAgentId || agentsStore.defaultSystemAgent?.id || null
}

function _playChunkAudio(audioUrl) {
  _speakAudioEl = new Audio(audioUrl)
  const speakerId = voiceStore.selectedSpeakerId
  if (speakerId && typeof _speakAudioEl.setSinkId === 'function') {
    _speakAudioEl.setSinkId(speakerId).catch(() => {})
  }
  _speakAudioEl.onended = () => _ttsPlayNext()
  _speakAudioEl.onerror = () => _ttsPlayNext()
  ttsPlayingMsgId.value = speakingMsgId.value
  _speakAudioEl.play().catch(() => _ttsPlayNext())
}

function _fileToVaultUrl(filePath) {
  // Convert OS path to vault-asset:// URL (handles Windows backslashes)
  const normalized = filePath.replace(/\\/g, '/')
  return `vault-asset://${normalized.startsWith('/') ? '' : '/'}${normalized}`
}

function _ttsPlayNext() {
  // Clean up previous audio element
  if (_speakAudioEl) { _speakAudioEl.pause(); _speakAudioEl = null }

  const nextIdx = _ttsPlayingIdx + 1
  if (nextIdx >= _ttsTotal) {
    // All chunks played — cleanup
    _ttsFinish()
    return
  }
  const filePath = _ttsChunks.get(nextIdx)
  if (filePath) {
    _ttsPlayingIdx = nextIdx
    _playChunkAudio(_fileToVaultUrl(filePath))
  }
  // else: chunk not ready yet — _ttsOnChunk will call _ttsPlayNext when it arrives
}

function _ttsOnChunk(data) {
  if (data.sessionId !== _ttsSessionId) return
  _ttsChunks.set(data.index, data.filePath)
  if (data.total && !_ttsTotal) _ttsTotal = data.total

  // Start playback when first 2 chunks are ready (or only 1 chunk total)
  if (_ttsPlayingIdx === -1) {
    const ready = _ttsChunks.has(0) && (_ttsTotal <= 1 || _ttsChunks.has(1))
    if (ready) {
      _ttsPlayingIdx = 0
      _playChunkAudio(_fileToVaultUrl(_ttsChunks.get(0)))
    }
    return
  }
  // If we're waiting for the next chunk and it just arrived, play it
  const waitingFor = _ttsPlayingIdx + 1
  if (data.index === waitingFor && !_speakAudioEl) {
    _ttsPlayingIdx = waitingFor
    _playChunkAudio(_fileToVaultUrl(data.filePath))
  }
}

function _ttsFinish() {
  const dir = _ttsSessionDir
  _ttsCleanupState()
  speakingMsgId.value = ''
  ttsPlayingMsgId.value = ''
  if (dir) window.electronAPI?.voice?.edgeTtsCleanup?.({ sessionDir: dir })
}

function _ttsCleanupState() {
  if (_ttsChunkHandler) {
    window.electronAPI?.voice?.offTtsChunkReady?.(_ttsChunkHandler)
    _ttsChunkHandler = null
  }
  _ttsChunks = new Map()
  _ttsTotal = 0
  _ttsPlayingIdx = -1
  _ttsSessionId = null
  _ttsSessionDir = null
}

async function handleSpeakMessage(msg) {
  if (!msg?.content) return

  if (speakingMsgId.value === msg.id) { stopSpeakMessage(); return }
  stopSpeakMessage()

  let text = ''
  if (msg.segments) {
    text = msg.segments.filter(s => s.type === 'text').map(s => s.content || '').join('\n\n')
  } else if (typeof msg.content === 'string') {
    text = msg.content
  }
  // Clean markdown but preserve paragraph breaks for chunking
  text = text.replace(/```[\s\S]*?```/g, '').replace(/[#*`_~\[\]()>|]/g, '').trim()
  if (!text) return

  speakingMsgId.value = msg.id
  try {
    const agentId = resolveSpeakAgentId(msg)
    const agent = agentId ? agentsStore.getAgentById(agentId) : null
    const voice = agent?.voiceId
    if (!voice) { stopSpeakMessage(); return }

    const sessionId = crypto.randomUUID()
    _ttsSessionId = sessionId

    // Register chunk listener before invoking (events may arrive during await)
    _ttsChunkHandler = window.electronAPI.voice.onTtsChunkReady(_ttsOnChunk)

    const result = await window.electronAPI.voice.edgeTtsChunked({ text, voice, sessionId })
    if (speakingMsgId.value !== msg.id) { stopSpeakMessage(); return }

    if (!result?.success) { stopSpeakMessage(); return }

    if (result.mode === 'single') {
      // Short text — play directly
      _ttsCleanupState()
      _speakAudioEl = new Audio(`data:audio/${result.format || 'mp3'};base64,${result.audio}`)
      const speakerId = voiceStore.selectedSpeakerId
      if (speakerId && typeof _speakAudioEl.setSinkId === 'function') {
        _speakAudioEl.setSinkId(speakerId).catch(() => {})
      }
      _speakAudioEl.onended = () => stopSpeakMessage()
      _speakAudioEl.onerror = () => stopSpeakMessage()
      ttsPlayingMsgId.value = speakingMsgId.value
      await _speakAudioEl.play()
    } else {
      // Chunked — pipeline playback is driven by _ttsOnChunk events
      _ttsTotal = result.totalChunks
      _ttsSessionDir = result.sessionDir
    }
  } catch {
    stopSpeakMessage()
  }
}

function stopSpeakMessage() {
  const sid = _ttsSessionId
  const dir = _ttsSessionDir
  if (_speakAudioEl) { _speakAudioEl.pause(); _speakAudioEl = null }
  _ttsCleanupState()
  speakingMsgId.value = ''
  ttsPlayingMsgId.value = ''
  // Cancel remaining synthesis and cleanup temp files
  if (sid) window.electronAPI?.voice?.edgeTtsCancel?.({ sessionId: sid })
  if (dir) window.electronAPI?.voice?.edgeTtsCleanup?.({ sessionDir: dir })
}


// Wizard first chat: highlight AI Docs nav when agent stops running
watch(() => {
  const wid = chatsStore.wizardFirstChatId
  if (!wid) return null
  const chat = chatsStore.chats.find(c => c.id === wid)
  return chat?.isRunning ?? null
}, (isRunning, wasRunning) => {
  if (wasRunning === true && isRunning === false) {
    const wizardChatId = chatsStore.wizardFirstChatId
    if (!wizardChatId) return
    chatsStore.wizardFirstChatId = null
    setTimeout(() => {
      const obsStore = useObsidianStore()
      obsStore.highlightNav = true
      obsStore.loadTree()
    }, 1000)
  }
})

const voiceErrorTitle = computed(() => {
  const code = voiceServerError.value
  if (code === 'VOICE_DISABLED') return t('voice.voiceDisabledTitle')
  if (code === 'WHISPER_NOT_CONFIGURED') return t('voice.whisperNotConfiguredTitle')
  return t('voice.serverNotRunningTitle')
})
const voiceErrorMsg = computed(() => {
  const code = voiceServerError.value
  if (code === 'VOICE_DISABLED') return t('voice.voiceDisabledMsg')
  if (code === 'WHISPER_NOT_CONFIGURED') return t('voice.whisperNotConfiguredMsg')
  return t('voice.serverNotRunningMsg')
})


// ── Memory saved notification ──────────────────────────────────────────────

/**
 * Fire-and-forget memory extraction for a chat we are navigating away from.
 * Bypasses the N=10 threshold so any un-extracted messages are processed.
 */
function triggerMemoryExtractionOnSwitch(leavingChatId) {
  if (!leavingChatId || !window.electronAPI?.memory?.extractOnChatSwitch) return
  const chat = chatsStore.chats.find(c => c.id === leavingChatId)
  if (!chat?.messages?.length) return
  const cfg = configStore.config
  if (!cfg.utilityModel?.provider || !cfg.utilityModel?.model) return

  const sysId = chat.systemAgentId || agentsStore.defaultSystemAgent?.id
  const usrId = chat.userAgentId || agentsStore.defaultUserAgent?.id
  const participants = chat.groupAgentIds?.length > 0
    ? chat.groupAgentIds.map(pid => {
        const p = agentsStore.getAgentById(pid)
        return p ? { id: p.id, name: p.name, type: 'system' } : null
      }).filter(Boolean)
    : (sysId ? [{ id: sysId, name: agentsStore.getAgentById(sysId)?.name || 'Assistant', type: 'system' }] : null)

  const agentPrompts = {
    systemAgentId: sysId || '__default_system__',
    userAgentId: usrId || agentsStore.defaultUserAgent?.id || '__default_user__',
  }

  try {
    window.electronAPI.memory.extractOnChatSwitch({
      chatId: leavingChatId,
      messages: JSON.parse(JSON.stringify(toRaw(chat.messages))),
      config: JSON.parse(JSON.stringify(toRaw(cfg))),
      participants,
      agentPrompts,
    }).catch(() => {})
  } catch {
    // Non-fatal — messages may contain non-serializable attachments
  }
}

// Watch for "Send to Chat" from DocsView AI Edit bar
watch(() => focusModeStore.pendingChatMessage, (msg) => {
  if (msg) {
    inputText.value = msg
    focusModeStore.pendingChatMessage = ''
  }
})

// Watch for input prefill from empty-state guides (useChatToCreate composable)
watch(() => chatsStore.pendingInputPrefill, async (pending) => {
  if (!pending) return
  const { text, chatId } = pending
  chatsStore.pendingInputPrefill = null
  if (chatId) {
    await chatsStore.setActiveChat(chatId)
    await nextTick()
  }
  inputText.value = text
})

const mentionInputEl = ref(null) // ChatMentionInput component instance
const mentionInputRef = mentionInputEl

// ── Attachments / Drag-and-Drop ──
const {
  attachments, isDragOver,
  onDragEnter, onDragOver, onDragLeave, onDrop,
  pickFiles, removeAttachment, handleAttachResults,
} = useAttachments({ inputText, mentionInputRef, dbg })

// ── Chat tree composable (drag-drop, sidebar, rename, filter, context menu, new chat, delete) ──
const {
  sortedSystemAgents, sortedUserAgents,
  draggingNodeId, treeDropTarget, rootDragOver,
  onTreeDrop, onRootDragOver, onRootDragLeave, onRootDrop,
  sidebarWidth, chatHeaderRef, chatSidebarCollapsed,
  treeLastSelected, selectedFolderId, rootExpanded, isResizing,
  anyFolderExpanded, hasFolders, startResize,
  renameInput, showRenameModal, editingChatId, editingTitle, editingIcon, showRenameIconPicker, renameComposing,
  startRename, confirmRename, cancelRename, onRenameKeydown, onRenameIconSelect,
  chatFilterQuery, chatSearchCache, filteredChats, ensureChatSearchable,
  treeCtxMenu, treeCtxDialog, folderModal, ctxDialogInputRef, treeTooltip,
  openTreeContextMenu, closeTreeCtxMenu, openCtxDialog,
  cancelCtxDialog, commitCtxDialog, onFolderModalConfirm,
  ctxNewChat, ctxNewFolder, ctxRenameFolder, ctxDeleteFolder,
  doDeleteFolder, folderNonEmptyAlert,
  showNewChatModal, newChatName, newChatIcon, newChatUserAgentId,
  showNewChatIconPicker, newChatFolderId, newChatNameInputRef,
  newChatAgentIds, newChatAgentSearch, newChatAgentCategoryId,
  newChatUserSearch, newChatUserCategoryId,
  newChatFolderTreeExpanded,
  filteredNewChatAgents, filteredNewChatUsers,
  activeNewChatUserAgent, effectiveNewChatUserAgentId, displayedSystemPersonaAgents,
  onNewChatIconSelect, selectNewChatUserAgent, isNewChatUserSelected,
  clearNewChatUserSelection, removeNewChatSystemAgent, toggleNewChatAgent,
  selectNewChatAgentCategory, selectNewChatUserCategory, toggleNewChatFolderExpand,
  newChat, confirmNewChat, cancelNewChat,
  confirmDeleteTarget, requestDeleteChat, requestRemoveGroupAgent, executeConfirmedDelete,
  showPreviewLimitModal, previewLimitMessage,
} = useChatTree({ mentionInputRef })

const messagesEl = ref(null)
const chatWindowRef = ref(null)
const inputFocused = ref(false)
const perChatActivityLines = reactive(new Map())
const copiedId = ref(null)
const quotedMessage = ref(null)  // { role, content } of the message being quoted
const userScrolled = ref(false)  // true when user manually scrolled up during streaming
let programmaticScrollCount = 0   // counter to ignore scroll events triggered by scrollToBottom
const visibleLimit = ref(25)     // show last N messages (~1000 lines); user can load more
// Per-chat transient state (not persisted)
const perChatDebugLogs = reactive(new Map())    // chatId → [{time, msg, level}]
const debugLog = computed(() => perChatDebugLogs.get(chatsStore.activeChatId) ?? [])

function dbg(msg, level = 'info', chatId = null) {
  const cid = chatId || chatsStore.activeChatId
  if (!cid) return
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  if (!perChatDebugLogs.has(cid)) perChatDebugLogs.set(cid, [])
  perChatDebugLogs.get(cid).push({ time, msg, level })
}
const showContextInspector  = ref(false)

const {
  copyMessage,
  requestDeleteMessage,
  quoteMessage,
  handleQuoteImage,
  getQuotedSenderName,
  clearQuote,
  formatTime,
  formatTokenCount,
  handleChatWindowSend,
  handleRetryWaitingIndicator,
  handleResendMessage,
} = useMessageOps({
  copiedId,
  quotedMessage,
  attachments,
  inputText,
  mentionInputRef,
  confirmDeleteTarget,
  sendMessage: (...args) => sendMessage(...args),
  setPendingLongBlobs: (blobs) => setPendingLongBlobs?.(blobs),
})

// Wrapper so useChunkHandler can call _fireGroupAgentsDirect before it's bound
// (useAgentCollaboration is initialized after useChunkHandler)
let _fireGroupAgentsDirectRef = null
function _fireGroupAgentsDirectWrapper(...args) {
  return _fireGroupAgentsDirectRef?.(...args)
}

// Explicit group audience selection.
// Stored on the chat so the audience mode survives reloads and chat switches.
const stickyTarget = computed({
  get() {
    return chatsStore.activeChat?.groupAudienceAgentIds ?? []
  },
  set(val) {
    const chat = chatsStore.activeChat
    if (chat) chat.groupAudienceAgentIds = Array.isArray(val) ? val : []
  }
})

const groupAudienceMode = computed({
  get() {
    return chatsStore.activeChat?.groupAudienceMode || 'auto'
  },
  set(val) {
    const chat = chatsStore.activeChat
    if (chat) chat.groupAudienceMode = val || 'auto'
  }
})

// stopStreamingTimer wrapper — actual impl wired after useSendMessage call
let _stopStreamingTimerImpl = () => {}

const {
  perChatStreamingMsgId,
  perChatStreamingSegments,
  historyContextSources,
  historyContextCountdown,
  _startHistoryCountdown,
  _clearHistoryCountdown,
  streamingSeconds,
  collaborationCancelled,
  runningAgentKeys,
  isInCollaborationLoop,
  lastTextSeg,
  lastToolSeg,
  flushSegments,
  waitForAgentEnd,
  handleChunk,
} = useChunkHandler({
  scrollToBottom,
  dbg,
  _fireGroupAgentsDirect: _fireGroupAgentsDirectWrapper,
  stickyTarget,
  stopStreamingTimer: () => _stopStreamingTimerImpl(),
})

const {
  applyProviderCredsToConfig,
  _fireGroupAgentsDirect,
} = useAgentCollaboration({
  enabledSkillObjects,
  scrollToBottom,
  dbg,
  collaborationCancelled,
  runningAgentKeys,
  isInCollaborationLoop,
  waitForAgentEnd,
})

// Now bind the wrapper to the actual implementation
_fireGroupAgentsDirectRef = _fireGroupAgentsDirect

// Provide shared interrupt refs to grid panels (each panel calls useInterrupt with these +
// its own local inputText/attachments/mentionInputRef).
provide('interruptShared', {
  collaborationCancelled,
  isInCollaborationLoop,
  runningAgentKeys,
})

// Per-chat state — reads from the active chat object in the store (must be before useSendMessage)
const activeRunning = computed(() => chatsStore.activeChat?.isRunning ?? false)
const activeContextMetrics = computed(() => chatsStore.activeChat?.contextMetrics ?? { inputTokens: 0, outputTokens: 0, totalTokens: 0, maxTokens: 0, percentage: 0, compactionCount: 0 })
const activePerAgentMetrics = computed(() => chatsStore.activeChat?.perAgentContextMetrics ?? {})
const hasContextData = computed(() => activeContextMetrics.value.inputTokens > 0)
const hasMessages = computed(() => (chatsStore.activeChat?.messages?.length ?? 0) > 0)
// Cumulative token totals across the whole chat (sum of per-message tokenUsage).
// The header display uses these so users see chat-wide consumption instead of
// just the latest request's usage, which matches what Inspector already shows.
const activeCumulativeTokens = computed(() => {
  const messages = chatsStore.activeChat?.messages || []
  let input = 0, output = 0
  for (const msg of messages) {
    if (msg.tokenUsage) {
      input  += msg.tokenUsage.input  || 0
      output += msg.tokenUsage.output || 0
    }
  }
  return { input, output }
})
// True when the active chat's primary model has no known context window.
// Shows a red "!" next to the compact button so users know automatic
// protection (threshold-based compaction) is not available until they
// configure the window in Config → Provider → Model Settings.
const activeModelContextUnknown = computed(() => {
  const chat = chatsStore.activeChat
  if (!chat) return false
  const agentId = chat.groupAgentIds?.[0] || chat.systemAgentId || agentsStore.defaultSystemAgent?.id
  const modelId = agentsStore.getAgentById(agentId)?.modelId
  if (!modelId) return false
  return modelsStore.getContextSource(modelId) === null
})
const activeSystemAgentIds = computed(() => {
  const chat = chatsStore.activeChat
  if (!chat) return []
  if (chat.groupAgentIds?.length > 0) return [...chat.groupAgentIds]
  const id = chat.systemAgentId || agentsStore.defaultSystemAgent?.id
  return id ? [id] : []
})

// ── Send message orchestration ──
const {
  sendMessage, interrupt, approvePlan, rejectPlan, refinePlan, compactContext,
  pendingInterrupt, confirmInterrupt, cancelInterrupt,
  _saveDraftForChat, _restoreDraftForChat,
  _codingModeContext, isCompacting,
  startStreamingTimer, stopStreamingTimer,
  setPendingLongBlobs,
} = useSendMessage({
  inputText, inputLongBlobs, attachments, quotedMessage, mentionInputRef, userScrolled,
  scrollToBottom, dbg, getQuotedSenderName,
  perChatStreamingMsgId, perChatStreamingSegments,
  collaborationCancelled, isInCollaborationLoop, runningAgentKeys,
  streamingSeconds, historyContextSources, _clearHistoryCountdown,
  applyProviderCredsToConfig, _fireGroupAgentsDirect,
  activeRunning, activeSystemAgentIds, enabledSkillObjects, stickyTarget,
  programmaticScroll: {
    increment: () => { programmaticScrollCount++ },
    decrement: () => { programmaticScrollCount = Math.max(0, programmaticScrollCount - 1) },
  },
})
// Wire the stopStreamingTimer wrapper now that useSendMessage has provided it
_stopStreamingTimerImpl = stopStreamingTimer

// Group chat popover state moved to ChatHeader
const showGroupAgentConfigId = ref(null)

// ── Avatar tooltips — declared after activeSystemAgentIds / activeUserAgent below ──

// Get assistant display name for a message
function getMsgAssistantName(msg) {
  const pid = msg.agentId || activeSystemAgentIds.value[0]
  const agent = pid ? agentsStore.getAgentById(pid) : null
  return agent?.name || msg.agentName || 'Assistant'
}

const isGroupChat = computed(() => chatsStore.activeChat?.isGroupChat ?? false)

function setAudienceMode(mode) {
  groupAudienceMode.value = mode
  if (mode !== 'manual') stickyTarget.value = []
}

function toggleAudienceAgent(agentId) {
  const selected = new Set(stickyTarget.value || [])
  if (selected.has(agentId)) selected.delete(agentId)
  else selected.add(agentId)
  stickyTarget.value = [...selected]
  groupAudienceMode.value = selected.size > 0 ? 'manual' : 'auto'
}

function isAudienceAgentSelected(agentId) {
  return groupAudienceMode.value === 'manual' && stickyTarget.value.includes(agentId)
}

const stickyTargetLabel = computed(() => {
  if (!stickyTarget.value || stickyTarget.value.length === 0) return null
  return stickyTarget.value
    .map(id => agentsStore.getAgentById(id)?.name || 'Unknown')
    .join(', ')
})

const audienceStatusText = computed(() => {
  if (!isGroupChat.value) return ''
  if (groupAudienceMode.value === 'all') return t('chats.audienceAllStatus')
  if (groupAudienceMode.value === 'manual' && stickyTargetLabel.value) {
    return t('chats.audienceManualStatus', { names: stickyTargetLabel.value })
  }
  return t('chats.audienceAutoStatus')
})

const groupActivityState = computed(() => {
  const chat = chatsStore.activeChat
  if (!chat?.isGroupChat) return { visible: false, tone: 'idle', text: '' }

  const liveMessages = (chat.messages || []).filter(msg => msg.streaming && msg.agentId)
  const liveNames = [...new Set(liveMessages.map(msg => getMsgAssistantName(msg)).filter(Boolean))]

  if (liveNames.length > 1) {
    return {
      visible: true,
      tone: 'live',
      text: t('chats.activityMultipleResponding', { count: liveNames.length }),
    }
  }

  if (liveNames.length === 1) {
    const [name] = liveNames
    if (chat.isCallingTool && chat.currentToolCall) {
      return {
        visible: true,
        tone: 'tool',
        text: t('chats.activityUsingTool', { names: name, tool: chat.currentToolCall }),
      }
    }
    const hasText = liveMessages.some(msg => {
      if (msg.content) return true
      return (msg.segments || []).some(seg => seg.type === 'text' && seg.content)
    })
    return {
      visible: true,
      tone: hasText ? 'live' : 'thinking',
      text: t(hasText ? 'chats.activityResponding' : 'chats.activityThinking', { names: name }),
    }
  }

  if (chat.isRunning) {
    return {
      visible: true,
      tone: 'routing',
      text: t('chats.activityChoosing'),
    }
  }

  return { visible: false, tone: 'idle', text: '' }
})


const showChatConfigModal = ref(false)
// ── Grid mode ──
const {
  gridMode, gridCount, gridChatIds, gridToastMsg,
  enterGridMode, exitGridMode, gridMaximizeChat,
  gridNewChat, gridSelectChat, gridSwapChat, gridOpenChatSettings,
} = useGridMode({ showChatConfigModal, triggerMemoryExtractionOnSwitch })

// Catch rendering errors from child components (e.g. MessageRenderer) to prevent silent breakage
onErrorCaptured((err, instance, info) => {
  console.error('[ChatsView] Render error caught:', err, '\nComponent:', instance?.$options?.name || instance, '\nInfo:', info)
  dbg(`RENDER ERROR: ${err.message} (${info})`, 'error')
  return false // don't propagate — keep the parent alive
})

// ── Current single-agent (null for group chat) ──
const currentSingleAgent = computed(() => {
  const chat = chatsStore.activeChat
  if (!chat || chat.groupAgentIds?.length > 0) return null
  const id = chat.systemAgentId || agentsStore.defaultSystemAgent?.id
  return id ? agentsStore.getAgentById(id) : null
})

const enabledSkills = computed(() => {
  const agent = currentSingleAgent.value
  if (!agent) return skillsStore.skills.map(s => s.id)
  const required = agent.requiredSkillIds
  if (!required || required.length === 0) return []
  return required
})

const enabledToolsCount = computed(() => {
  const agent = currentSingleAgent.value
  if (!agent) return toolsStore.tools.length
  const required = agent.requiredToolIds
  return (required && required.length > 0) ? required.length : 0
})

const enabledMcpCount = computed(() => {
  const agent = currentSingleAgent.value
  if (!agent) return mcpStore.servers.length
  const required = agent.requiredMcpServerIds
  return (required && required.length > 0) ? required.length : 0
})

const enabledKnowledgeCount = computed(() => {
  const agent = currentSingleAgent.value
  if (!agent) return Object.values(knowledgeStore.kbConfigs).filter(c => c.enabled !== false).length
  const required = agent.requiredKnowledgeBaseIds
  if (!required?.length) return 0
  return required.filter(id => knowledgeStore.kbConfigs[id]?.enabled !== false).length
})

// ── Permission mode for quick selector in status bar ──
const chatPermissionMode = computed({
  get: () => chatsStore.activeChat?.permissionMode || 'inherit'
})

const permissionModeTitle = computed(() => {
  const mode = chatPermissionMode.value
  if (mode === 'inherit') return t('chats.permissionModeInherit')
  if (mode === 'chat_only') return t('chats.permissionModeChatOnly')
  return t('chats.permissionModeAllPermissions')
})

function updateChatPermissionMode(newMode) {
  const chatId = chatsStore.activeChatId
  if (!chatId || !newMode) return
  chatsStore.setChatSettings(chatId, {
    permissionMode: newMode
  })
  // If the agent is currently running, push the new permission mode immediately
  const runningChat = chatsStore.chats.find(c => c.id === chatId && c.isRunning)
  if (runningChat && window.electronAPI?.updatePermissionMode) {
    window.electronAPI.updatePermissionMode(chatId, {
      chatMode: newMode,
      chatAllowList: JSON.parse(JSON.stringify(chatsStore.activeChat?.chatAllowList || []))
    })
  }
}

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

// ── Body Viewer modal state ──────────────────────────────────────────────
const bodyViewerTarget = ref(null) // { agentId, agentType, agentName, agentDescription, agentPrompt, agentProviderId, agentModelId, agentVoiceId, agentAvatar }

function openBodyViewer(agentId, agentType, agentName) {
  const agent = agentsStore.getAgentById(agentId)
  bodyViewerTarget.value = {
    agentId,
    agentType,
    agentRequiredToolIds: agent?.requiredToolIds ?? [],
    agentRequiredSkillIds: agent?.requiredSkillIds ?? [],
    agentRequiredMcpServerIds: agent?.requiredMcpServerIds ?? [],
    agentRequiredKnowledgeBaseIds: agent?.requiredKnowledgeBaseIds ?? [],
    agentName: agent?.name || agentName || 'Agent',
    agentDescription: agent?.description || '',
    agentPrompt: agent?.prompt || '',
    agentProviderId: agent?.providerId || null,
    agentModelId: agent?.modelId || null,
    agentVoiceId: agent?.voiceId || null,
    agentAvatar: agent?.avatar || null,
  }
}

function closeBodyViewer() {
  bodyViewerTarget.value = null
}


async function handleBodyViewerUpdateAgent(updates) {
  if (!bodyViewerTarget.value) return
  const pid = bodyViewerTarget.value.agentId
  const agent = agentsStore.getAgentById(pid)
  if (!agent) return

  // ── All fields → global agent (providerId/modelId changes are ignored in chat context) ──
  const globalUpdates = { ...updates }
  delete globalUpdates.providerId
  delete globalUpdates.modelId
  if (Object.keys(globalUpdates).length > 0) {
    const updated = { ...agent, ...globalUpdates }
    await agentsStore.saveAgent(updated)
    if (!bodyViewerTarget.value) return
    bodyViewerTarget.value.agentPrompt = updated.prompt ?? bodyViewerTarget.value.agentPrompt
    bodyViewerTarget.value.agentDescription = updated.description ?? bodyViewerTarget.value.agentDescription
    if (globalUpdates.voiceId !== undefined) bodyViewerTarget.value.agentVoiceId = updated.voiceId ?? null
  }
}

// System agent config popover state moved to ChatHeader

// ── Agent chip popovers (moved to ChatHeader) ──

function getAvatarDataUriForAgent(agent) {
  if (!agent?.avatar) return null
  return getAvatarDataUri(agent.avatar)
}

const activeSystemAgent = computed(() => {
  const id = chatsStore.activeChat?.systemAgentId
  return id ? agentsStore.getAgentById(id) : agentsStore.defaultSystemAgent
})
const activeUserAgent = computed(() => {
  const id = chatsStore.activeChat?.userAgentId
  return id ? agentsStore.getAgentById(id) : agentsStore.defaultUserAgent
})
// Header-only display computed removed (moved to ChatHeader):
// activeSystemAvatarDataUri, activeUserAvatarDataUri, activeSystemAgentName, activeUserAgentName
// resolvedSystemAgentId, resolvedUserAgentId, sortedSystemAgents, sortedUserAgents

// MAX_VISIBLE_AVATARS, visibleSystemAgentIds, overflowSystemCount moved to ChatHeader

// toggleSystemAgent moved to ChatHeader

// ── Avatar tooltips ──
const { mentionTooltip, showMsgAvatarTooltip, hideMsgAvatarTooltip, showUserAvatarTooltip } = useAvatarTooltip({
  activeSystemAgentIds,
  activeUserAgent,
  getAgentById: (id) => agentsStore.getAgentById(id),
})

// getAgentProviderLabel kept — also used in mention popup
// Shows per-chat override when active, otherwise falls back to agent global settings.
function resolveProviderName(providerId) {
  if (!providerId) return 'anthropic'
  const providers = configStore.config?.providers || []
  const found = providers.find(p => p.id === providerId)
  if (found) return found.alias || found.name || found.type || providerId
  return providerId
}

function getAgentProviderLabel(agentId) {
  const agent = agentsStore.getAgentById(agentId)
  if (!agent) return 'Default'
  const rawProvider = agent.providerId || 'anthropic'
  const providerName = resolveProviderName(rawProvider)
  const model = agent.modelId || ''
  if (model) {
    const short = model.split('/').pop().split(':')[0]
    return `${providerName} · ${short}`
  }
  return providerName
}
// ── RAG chip popover ──────────────────────────────────────────────────────
const showRagPopover = ref(false)
const ragChipWrap = ref(null)

const ragEnabledCount = computed(() => {
  const configs = knowledgeStore.kbConfigs
  return Object.values(configs).filter(c => c.enabled !== false).length
})

// Close popovers on outside click (agent header popovers now handled by ChatHeader)
function handlePopoverOutsideClick(e) {
  if (ragChipWrap.value && !ragChipWrap.value.contains(e.target)) showRagPopover.value = false
  if (showGroupAgentConfigId.value) {
    const configPopover = document.querySelector('.group-agent-config-popover')
    if (configPopover && !configPopover.contains(e.target)) showGroupAgentConfigId.value = null
  }
}



// ── Group Chat Functions ──────────────────────────────────────────────────────
function toggleGroupMode() {
  const chatId = chatsStore.activeChatId
  if (!chatId) return
  chatsStore.toggleGroupMode(chatId, !isGroupChat.value)
}

function toggleGroupAgent(agentId) {
  const chatId = chatsStore.activeChatId
  if (!chatId) return
  const ids = chatsStore.activeChat?.groupAgentIds || []
  if (ids.includes(agentId)) {
    requestRemoveGroupAgent(chatId, agentId)
  } else {
    chatsStore.addGroupAgent(chatId, agentId)
  }
}

function openGroupAgentConfig(agentId) {
  showGroupAgentConfigId.value = showGroupAgentConfigId.value === agentId ? null : agentId
}

function getGroupAgentOverride(agentId, field) {
  const overrides = chatsStore.activeChat?.groupAgentOverrides?.[agentId]
  if (!overrides) {
    // Fall back to agent defaults
    const agent = agentsStore.getAgentById(agentId)
    return agent?.[field] || ''
  }
  return overrides[field] || ''
}

function setGroupAgentOverrideField(agentId, field, value) {
  const chatId = chatsStore.activeChatId
  if (!chatId) return
  const existing = chatsStore.activeChat?.groupAgentOverrides?.[agentId] || {}
  chatsStore.setGroupAgentOverride(chatId, agentId, { ...existing, [field]: value })
}

function onInputBlur() {
  inputFocused.value = false
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


function inspectContext() {
  showContextInspector.value = true
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(() => chatsStore.activeChatId, (newId, oldId) => {
  // Save input draft for the chat we're leaving, restore for the one we're entering
  _saveDraftForChat(oldId)
  _restoreDraftForChat(newId)

  userScrolled.value = false
  visibleLimit.value = 25
  showContextInspector.value = false
  quotedMessage.value = null
  // Group audience state is backed by the active chat — switching chats automatically restores its selection

  nextTick(() => {
    mentionInputRef.value?.focus()
  })
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
  if (e.key === 'Escape') {
    // Don't gate on activeRunning — isRunning may be cleared by agent_end before
    // the user's ESC reaches us. interrupt() checks whether there's a
    // streaming/waiting msg to interrupt.
    e.preventDefault()
    interrupt(chatsStore.activeChatId)
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
      handleAttachResults(results)
    }
  } catch (err) {
    dbg(`Intercepted drop error: ${err.message}`, 'error')
  }
}

// --- Coding Mode: CLAUDE.md file watcher lifecycle ----------------------------
// Mirrors Claude Code: watches the full CLAUDE.md hierarchy for the active chat.
// When a file changes, main pushes claude:context-updated -> we store merged
// context in _codingModeContext so it is used on the NEXT send automatically.
// _codingModeContext ref comes from useSendMessage composable
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
  rootExpanded.value = true
  chatsStore.revealActiveChat()
  if (voiceStore.isCallActive && voiceStore.isPip) voiceStore.setPip(false)
})

// KeepAlive lifecycle: fires when user navigates away — keep mic/TTS running, just show PiP
onDeactivated(() => {
  if (voiceStore.isCallActive) voiceStore.setPip(true)
})

onMounted(async () => {
  // On first mount, also restore PiP (onActivated fires after onMounted on first render)
  // — nothing extra needed here; onActivated handles it.

  agentsStore.loadAgents()
  await knowledgeStore.loadConfig()
  toolsStore.loadTools()
  scrollToBottom()
  nextTick(() => mentionInputRef.value?.focus())
  document.addEventListener('click', handlePopoverOutsideClick)

  // Register UI chunk callback with the store (store owns the persistent IPC listener)
  chatsStore.setUiChunkCallback((cId, chunk) => {
    handleChunk(cId, chunk)
  })

  // Reconnect to any agent loops that survived a page refresh or minibar transition.
  // setUiChunkCallback is registered BEFORE this await so chunks arriving
  // during ensureMessages calls go through handleChunk (the full UI path).
  const reconnected = await chatsStore.reconnectRunningAgents()
  for (const { chatId, entries } of reconnected) {
    const chat = chatsStore.chats.find(c => c.id === chatId)
    if (!chat?.messages) continue
    for (const entry of entries) {
      const routeKey = entry.isGroup ? `${chatId}:${entry.agentId}` : chatId
      if (perChatStreamingMsgId.has(routeKey)) continue  // already registered

      // Reuse an existing streaming message if one was created by _applyChunk
      // while ChatsView was unmounted (e.g. during minibar mode). Without this,
      // each minibar round-trip creates a duplicate empty bubble with a wavebar.
      const existingMsg = [...chat.messages].reverse().find(m =>
        m.role === 'assistant' && m.streaming &&
        (entry.isGroup ? m.agentId === entry.agentId : !m.isWaitingIndicator)
      )
      if (existingMsg) {
        perChatStreamingMsgId.set(routeKey, existingMsg.id)
        perChatStreamingSegments.set(routeKey, existingMsg.segments || [])
      } else {
        const msgId = uuidv4()
        perChatStreamingMsgId.set(routeKey, msgId)
        perChatStreamingSegments.set(routeKey, [])
        chat.messages.push({
          id: msgId,
          role: 'assistant',
          content: '',
          streaming: true,
          streamingStartedAt: Date.now(),
          agentId: entry.isGroup ? entry.agentId : undefined,
          agentName: entry.isGroup ? entry.agentName : undefined,
          segments: [],
        })
      }
    }
    scrollToBottom(false, chatId)
  }

  // Mark current chat as read on mount
  if (chatsStore.activeChatId) chatsStore.markAsRead(chatsStore.activeChatId)

  // Reload chat list when IM bridge creates a new chat
  if (window.electronAPI?.im?.onChatsUpdated) {
    window.electronAPI.im.onChatsUpdated(async () => {
      await chatsStore.loadChats()
    })
  }
  // Reload messages for a specific chat when IM bridge appends to it
  if (window.electronAPI?.im?.onChatUpdated) {
    window.electronAPI.im.onChatUpdated(async ({ chatId }) => {
      const chat = chatsStore.chats.find(c => c.id === chatId)
      if (!chat) {
        await chatsStore.loadChats()
        return
      }
      // Reload full chat from disk to pick up metadata changes (agent, group settings)
      // as well as new messages
      const full = await window.electronAPI.getChat(chatId)
      if (full) {
        chat.systemAgentId    = full.systemAgentId ?? chat.systemAgentId
        chat.isGroupChat        = full.isGroupChat ?? chat.isGroupChat
        chat.groupAgentIds    = full.groupAgentIds ?? chat.groupAgentIds
        chat.groupAgentOverrides = full.groupAgentOverrides ?? chat.groupAgentOverrides
      }
      // Force-reload messages from disk
      chat.messages = null
      await chatsStore.ensureMessages(chatId)
    })
  }

  // IM bridge: streaming agent response into chat window
  if (window.electronAPI?.im?.onAgentStreamStart) {
    window.electronAPI.im.onAgentStreamStart(({ chatId, message }) => {
      const chat = chatsStore.chats.find(c => c.id === chatId)
      if (!chat?.messages) return
      if (!chat.messages.find(m => m.id === message.id)) {
        chat.messages.push(message)
      }
    })
  }
  if (window.electronAPI?.im?.onAgentChunk) {
    window.electronAPI.im.onAgentChunk(({ chatId, messageId, chunk }) => {
      if (chunk.type !== 'text') return
      const chat = chatsStore.chats.find(c => c.id === chatId)
      if (!chat?.messages) return
      const msg = chat.messages.find(m => m.id === messageId)
      if (!msg) return
      msg.content = (msg.content || '') + (chunk.text || '')
      if (msg.segments?.[0]) msg.segments[0].content = msg.content
      else msg.segments = [{ type: 'text', content: msg.content }]
    })
  }
  if (window.electronAPI?.im?.onAgentStreamEnd) {
    window.electronAPI.im.onAgentStreamEnd(({ chatId, messageId, removed, error }) => {
      const chat = chatsStore.chats.find(c => c.id === chatId)
      if (!chat?.messages) return
      const idx = chat.messages.findIndex(m => m.id === messageId)
      if (idx === -1) return
      // `removed:true` means message-router deleted the placeholder on disk
      // (no content produced / consumed pendingStop / cancelled). The renderer
      // must splice too, otherwise an empty assistant bubble persists in
      // memory until reload — that's the "ghost empty bubble" symptom.
      if (removed) {
        chat.messages.splice(idx, 1)
        return
      }
      const m = chat.messages[idx]
      m.streaming = false
      // Carry the structured-error fields so ChatWindow.vue's error indicator
      // bar + auth-error hint render the same red card as the chat-window send
      // path. Without this, the IM bridge bubble would just look empty/blank
      // when the agent failed.
      if (error) {
        m.errorDetail = error.detail
        m.errorCode = error.code
        if (error.isError) m.isError = true
      }
    })
  }
  // Iron-law three-piece (#B): map IM bridge run lifecycle to chat.isRunning,
  // so the interrupt button and status badges in the chat window light up
  // exactly like for chat-window sends.
  if (window.electronAPI?.im?.onRunStarted) {
    window.electronAPI.im.onRunStarted(({ chatId }) => {
      const chat = chatsStore.chats.find(c => c.id === chatId)
      if (chat) chat.isRunning = true
    })
  }
  if (window.electronAPI?.im?.onRunEnded) {
    window.electronAPI.im.onRunEnded(({ chatId }) => {
      const chat = chatsStore.chats.find(c => c.id === chatId)
      if (chat) {
        chat.isRunning = false
        chat.isThinking = false
        chat.isCallingTool = false
      }
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

// Stop speech recognition and TTS when call ends (from any source)
watch(() => voiceStore.isCallActive, (active) => {
  if (!active) {
    stopMicCapture()
    stopSpeaking()
    cleanupVoiceListeners()
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
  cleanupVoiceListeners()

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

  // Trigger memory extraction for the active chat on window close
  if (chatsStore.activeChatId) {
    triggerMemoryExtractionOnSwitch(chatsStore.activeChatId)
  }

})

defineExpose({ chatSidebarCollapsed, chatHeaderRef })
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
  min-width: 10rem;
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
/* ── Action bar below header ── */
.chat-sidebar-action-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
}

.chat-sidebar-action-btn {
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
  flex-shrink: 0;
}

.chat-sidebar-action-btn:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  transform: translateY(-1px);
  box-shadow: 0 4px 12px rgba(0,0,0,0.16), 0 2px 4px rgba(0,0,0,0.1);
}

.chat-sidebar-action-btn:active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  transform: translateY(0);
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
  padding: 0.3125rem 0.5rem 0.3125rem 0;
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
  gap: 0.125rem;
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
  background: transparent;
  color: rgba(26,26,26,0.4);
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.15s, color 0.15s;
}
.chat-root-fold-btn:hover {
  background: rgba(26,26,26,0.08);
  color: #1A1A1A;
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
  border-color: #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
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
  color: #1A1A1A;
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
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #ffffff;
}
.chat-sidebar-item:hover .chat-sidebar-item-title {
  color: #ffffff;
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
  flex-shrink: 0;
}
.chat-context-bar {
  padding: 0.375rem 1rem;
  display: flex;
  align-items: center;
  gap: 0.75rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}

/* ── Messages area ──────────────────────────────────────────────────────── */
.chat-messages {
  flex: 1;
  overflow-y: auto;
  overflow-x: hidden;
  padding: 1.25rem 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  
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
.chat-empty-new-btn {
  margin-top: 0.75rem;
  padding: 0.5rem 1.25rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: 1px solid #374151;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: #D1D5DB;
  cursor: pointer;
  transition: border-color 0.15s, color 0.15s;
}
.chat-empty-new-btn:hover {
  border-color: #6B7280;
  color: #fff;
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

/* ── Interrupt bar ──────────────────────────────────────────────────────── */
.chat-interrupt-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.5rem 1.25rem;
  background: #FFFBEB;
  border-top: 1px solid #FDE68A;
  flex-shrink: 0;
  animation: interrupt-slide-in 0.15s ease-out;
}
@keyframes interrupt-slide-in {
  from { opacity: 0; transform: translateY(4px); }
  to { opacity: 1; transform: translateY(0); }
}
.chat-interrupt-bar-content {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.chat-interrupt-bar-text {
  font-size: var(--fs-small, 0.8125rem);
  font-weight: 500;
  color: #92400E;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.chat-interrupt-bar-actions {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}
.chat-interrupt-btn {
  padding: 0.25rem 0.75rem;
  border-radius: 0.5rem;
  font-size: var(--fs-small, 0.8125rem);
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: background 0.15s, opacity 0.15s;
  white-space: nowrap;
}
.chat-interrupt-btn--primary {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.chat-interrupt-btn--primary:hover {
  opacity: 0.9;
}
.chat-interrupt-btn--ghost {
  background: transparent;
  color: #6B7280;
  border: 1px solid #D1D5DB;
}
.chat-interrupt-btn--ghost:hover {
  background: #F3F4F6;
  color: #374151;
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


/* ── Reduced motion ─────────────────────────────────────────────────────── */
.chat-sidebar-item-icon {
  width: 1rem;
  height: 1rem;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  line-height: 1;
  font-size: 0.875rem;
  flex-shrink: 0;
}

@media (prefers-reduced-motion: reduce) {
  .chat-sidebar-new-btn,
  .chat-sidebar-item,
  .chat-sidebar-action-btn,
  .agent-chip,
  .agent-popover-item,
  .chat-header-btn,
  .chat-input-box,
  .modal-dialog-close-btn {
    transition: none;
  }
  .chat-sidebar-new-btn:hover {
    transform: none;
  }
}

.chat-group-status-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
  margin-top: 0.55rem;
  padding: 0 0.125rem;
  flex-wrap: wrap;
}

.chat-group-status-row--input {
  margin: 0 0 0.55rem;
  padding: 0.375rem 0.75rem;
  border-radius: 0.75rem;
  background: #F0F4FF;
}

.chat-audience-inline {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  min-width: 0;
  flex: 1;
}

.chat-audience-label {
  font-size: 0.7rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #6B7280;
}

.chat-audience-options {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-wrap: wrap;
}

.chat-audience-chip {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  min-height: 1.75rem;
  padding: 0.25rem 0.7rem;
  border-radius: 9999px;
  border: 1px solid #E5E5EA;
  background: #FFFFFF;
  color: #4B5563;
  font-size: 0.75rem;
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}

.chat-audience-chip:hover {
  border-color: #D1D5DB;
  color: #1A1A1A;
  background: #F9FAFB;
}

.chat-audience-chip.active {
  border-color: transparent;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

.chat-activity-bar {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  min-height: 2.25rem;
  padding: 0.625rem 0.85rem;
  border-radius: 0.875rem;
  border: 1px solid transparent;
  box-shadow: 0 2px 8px rgba(0,0,0,0.05);
  margin-left: auto;
}

.chat-activity-bar--routing {
  background: #FFFFFF;
  border-color: #E5E5EA;
  color: #1A1A1A;
  box-shadow: 0 1px 3px rgba(0,0,0,0.04);
}

.chat-activity-bar--thinking {
  background: rgba(245, 158, 11, 0.1);
  border-color: rgba(245, 158, 11, 0.16);
  color: #B45309;
}

.chat-activity-bar--live {
  background: rgba(16, 185, 129, 0.1);
  border-color: rgba(16, 185, 129, 0.16);
  color: #047857;
}

.chat-activity-bar--tool {
  background: rgba(124, 58, 237, 0.1);
  border-color: rgba(124, 58, 237, 0.16);
  color: #6D28D9;
}

.chat-activity-pulse {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 9999px;
  background: currentColor;
  box-shadow: 0 0 0 0 currentColor;
  animation: chatActivityPulse 1.2s ease-out infinite;
}

.chat-activity-text {
  font-size: 0.8rem;
  font-weight: 600;
  white-space: nowrap;
}

@keyframes chatActivityPulse {
  0% { box-shadow: 0 0 0 0 rgba(0,0,0,0.18); }
  70% { box-shadow: 0 0 0 0.55rem rgba(0,0,0,0); }
  100% { box-shadow: 0 0 0 0 rgba(0,0,0,0); }
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
/* Fixed-position tooltip for agent header (teleported to body) */
:global(.agent-header-tooltip-fixed) {
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
:global(.agent-header-tooltip-fixed::before) {
  content: '';
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  border: 6px solid transparent;
  border-bottom-color: #0F0F0F;
}
:global(.agent-header-tooltip-name) {
  font-size: 12px;
  font-weight: 700;
  margin-bottom: 0.25rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
:global(.agent-header-tooltip-text) {
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
  z-index: 10;
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
  z-index: 20;
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

@keyframes shake-horizontal {
  0%, 100% { transform: translateX(0); }
  10%, 30%, 50%, 70%, 90% { transform: translateX(-2px); }
  20%, 40%, 60%, 80% { transform: translateX(2px); }
}

.chat-completed-emoji {
  display: inline-block;
  margin-right: 0.375rem;
  animation: shake-horizontal 4s ease-in-out infinite;
  will-change: transform;
  flex-shrink: 0;
}

/* ── Permission mode selector in status bar ─── */
.permission-mode-select {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  padding: 0.3rem 0.5rem 0.3rem 0.375rem;
  min-height: 1.375rem;
  border-radius: 0.375rem;
  border: 1px solid transparent;
  background-color: #FFFFFF;
  color: #1A1A1A;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease;
  outline: none;
  appearance: none;
  background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8'%3E%3Cpath fill='%231A1A1A' d='M1 1l5 5 5-5'/%3E%3C/svg%3E");
  background-repeat: no-repeat;
  background-position: right 0.375rem center;
  padding-right: 1.5rem;
  min-width: fit-content;
  vertical-align: middle;
}

.permission-mode-select.pms-inherit {
  color: #92400E; background-color: #FEF3C7;
}
.permission-mode-select.pms-chat_only {
  color: #047857; background-color: #ECFDF5;
}
.permission-mode-select.pms-all_permissions {
  color: #B91C1C; background-color: #FEF2F2;
}
.permission-mode-select:hover {
  opacity: 0.85;
}

.permission-mode-select:focus {
  outline: none;
}

.permission-mode-select option {
  background-color: #FFFFFF;
  color: #1A1A1A;
  padding: 0.375rem 0.5rem;
  font-weight: normal;
}

/* ── Blob view dialog (matches the user-message bubble gradient) ── */
.long-input-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.55);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
}
.long-input-dialog {
  background: #0F0F0F;
  color: #FFF8F0;
  border-radius: 1.125rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.28), 0 2px 6px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.08);
  width: min(90vw, 700px);
  max-height: 80vh;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.long-input-dialog__header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 1rem;
  border-bottom: 1px solid rgba(255,248,240,0.15);
  font-weight: 600;
  font-size: 0.9rem;
  color: #FFF8F0;
  flex-shrink: 0;
}
.long-input-dialog__close {
  background: none;
  border: none;
  font-size: 1.25rem;
  line-height: 1;
  cursor: pointer;
  color: rgba(255,248,240,0.7);
  padding: 0 0.25rem;
}
.long-input-dialog__close:hover { color: #FFF8F0; }
.long-input-dialog__body {
  overflow: auto;
  padding: 1rem;
  flex: 1;
}
.long-input-dialog__body pre {
  margin: 0;
  white-space: pre-wrap;
  word-break: break-word;
  font-family: 'Inter', monospace;
  font-size: 0.85rem;
  color: #FFF8F0;
  line-height: 1.6;
}
</style>
