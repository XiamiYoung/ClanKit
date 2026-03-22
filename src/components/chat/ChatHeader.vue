<template>
  <div class="chat-header">
    <!-- Row 1: Centered title badge + slot for extra actions -->
    <div class="ch-row-top">
      <!-- Running / approval indicator (left-aligned) -->
      <div class="ch-row-top-status">
        <span v-if="chatsStore.pendingPermissionChatIds.has(resolvedChatId)" class="ch-status-badge ch-status-badge--approval">
          <svg style="width:10px;height:10px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
          </svg>
          Approval
        </span>
        <span v-else-if="isRunning" class="ch-status-badge ch-status-badge--running">
          <span class="ch-status-dot"></span>
          Running
        </span>
      </div>
      <!-- Centered chat title badge -->
      <div
        class="ch-title-badge"
        v-if="!isEditing"
        ref="titleBadgeEl"
        @mouseenter="showPathTooltip"
        @mouseleave="hidePathTooltip"
      >
        <div class="ch-title-icon">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <span v-if="isRunning" class="ch-title-spinner"></span>
        <span class="chat-header-title">{{ truncatedTitle }}</span>
        <button class="ch-edit-btn" @click.stop="startEdit" :title="t('chats.renameChat')">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
          </svg>
        </button>
      </div>
      <!-- Inline edit mode -->
      <div class="ch-title-edit" v-else>
        <div class="ch-title-icon">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <input
          ref="editInputEl"
          v-model="editTitle"
          class="ch-title-input"
          maxlength="60"
          @keydown.enter="confirmEdit"
          @keydown.escape="cancelEdit"
          @blur="confirmEdit"
        />
        <button class="ch-edit-confirm" @click.stop="confirmEdit" :title="t('common.save')">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>
      <!-- Right side: call + settings (single view) or grid action buttons -->
      <div class="ch-row-top-actions">
        <template v-if="!isGridView">
          <!-- Voice call button -->
          <div
            ref="callBtnEl"
            class="ch-call-btn-wrap"
            @mouseenter="showCallTooltip"
            @mouseleave="hideCallTooltip"
          >
            <button
              class="ch-call-btn"
              :disabled="!canStartCall"
              @click.stop="startCall"
            >
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z"/>
              </svg>
            </button>
          </div>
          <!-- Chat Settings button -->
          <div ref="configBtnEl" class="chat-config-btn-wrap" @mouseenter="showConfigTooltip" @mouseleave="hideConfigTooltip">
            <button class="chat-config-btn" @click="$emit('open-chat-settings')">
              <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
          </div>
        </template>
        <slot name="actions" />
      </div>
    </div>

    <!-- Hamburger tab hanging below the header -->
    <button
      class="ch-header-tab"
      :title="headerExpanded ? 'Collapse header' : 'Expand header'"
      @click.stop="headerExpanded = !headerExpanded"
    >
      <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
        <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
      </svg>
    </button>

    <!-- Row 2: Agents (right-aligned, left of Chat Settings) + Chat Settings button -->
    <div class="ch-row-bottom" :class="{ 'ch-row-bottom--collapsed': !headerExpanded }">
      <slot name="row-bottom-left" />
      <div class="ch-row-bottom-right">
        <!-- Agent selectors -->
        <div class="agent-section">
          <!-- ── User agent ── -->
          <div class="agent-group">
            <div class="agent-card-wrap" ref="usrChipWrap">
              <div class="agent-card user" @mouseenter="showAgentTooltip($event, resolvedUserAgentId)" @mouseleave="hideAgentTooltip">
                <div class="agent-card-avatar">
                  <img
                    v-if="activeUserAvatarDataUri"
                    :src="activeUserAvatarDataUri"
                    alt=""
                    class="agent-card-avatar-img"
                    @click.stop="$emit('open-soul-viewer', activeUserAgent?.id || '__default_user__', 'users', activeUserAgent?.name || 'User')"
                    title="View summary"
                  />
                  <div
                    v-else
                    class="agent-card-avatar-default user"
                    @click.stop="$emit('open-soul-viewer', activeUserAgent?.id || '__default_user__', 'users', activeUserAgent?.name || 'User')"
                    title="View summary"
                  >
                    <svg style="width:14px;height:14px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                </div>
              </div>
              <!-- User agent select button -->
              <button class="sys-add-btn" @click.stop="togglePopover('user')" :title="t('chats.switchUserAgent', 'Switch user agent')">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 9.29-5"/><path d="M19 14v6m-3-3 3 3 3-3"/></svg>
              </button>
              </div>
          </div>

          <!-- ── System agents ── -->
          <div class="agent-group system-group">
            <!-- Overlapping avatar stack -->
            <div class="sys-avatar-stack">
              <div
                v-for="(pid, idx) in visibleSystemAgentIds"
                :key="pid"
                class="sys-avatar-item"
                :style="{ zIndex: activeSystemAgentIds.length - idx }"
                @click.stop="onSysAvatarClick(pid)"
                @mouseenter="showAgentTooltip($event, pid)"
                @mouseleave="hideAgentTooltip"
              >
                <img v-if="systemAgentAvatarMap[pid]" :src="systemAgentAvatarMap[pid]" alt="" class="sys-avatar-img" />
                <span v-else class="sys-avatar-fallback">{{ (agentsStore.getAgentById(pid)?.name || '?').charAt(0) }}</span>
                <button
                  v-if="activeSystemAgentIds.length > 1"
                  class="sys-avatar-remove"
                  @click.stop="$emit('remove-group-agent', resolvedChatId, pid)"
                >
                  <svg style="width:8px;height:8px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <!-- Overflow count -->
              <div
                v-if="overflowSystemCount > 0"
                class="sys-avatar-item sys-avatar-overflow"
                :style="{ zIndex: 0 }"
                @click.stop="showGroupAddPopover = !showGroupAddPopover"
              >
                <span class="sys-avatar-fallback">+{{ overflowSystemCount }}</span>
              </div>
            </div>

            <!-- Configure agent button -->
            <div class="agent-chip-wrap" ref="groupAddChipWrap">
              <button class="sys-add-btn" @click.stop="openAgentCombobox" :title="t('chats.configureAgents', 'Configure agents')">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
            </div>
          </div>
        </div>

      </div>
    </div>

  </div>

  <!-- Folder path tooltip -->
  <Teleport to="body">
    <div
      v-if="pathTooltip.visible"
      class="ch-path-tooltip"
      :style="{ top: pathTooltip.y + 'px', left: pathTooltip.x + 'px' }"
    >{{ pathTooltip.text }}</div>
  </Teleport>

  <!-- Floating agent tooltip (Teleport to body so it escapes overflow:hidden) -->
  <Teleport to="body">
    <div
      v-if="tooltipState.visible"
      class="ch-agent-tooltip-fixed"
      :style="{ top: tooltipState.y + 'px', left: tooltipState.x + 'px' }"
    >
      <div class="ch-agent-tooltip-name">{{ tooltipState.name }}</div>
      <div class="ch-agent-tooltip-text">{{ tooltipState.text }}</div>
    </div>
  </Teleport>

  <!-- ── User Agent Modal ── -->
  <Teleport to="body">
    <div v-if="showUsrPopover" class="ch-modal-backdrop">
      <div class="ch-modal" role="dialog" aria-modal="true">
        <div class="ch-modal-header">
          <div class="ch-modal-header-icon">
            <svg style="width:15px;height:15px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <span class="ch-modal-title">{{ t('chats.userAgent') }}</span>
          <button class="ch-modal-close" @click="showUsrPopover = false">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="ch-modal-body">
          <!-- User categories -->
          <div v-for="cat in agentsStore.userCategories" :key="cat.id" class="ch-cat-section">
            <button class="ch-cat-header" @click="toggleUserCat(cat.id)">
              <svg class="ch-cat-chevron" :class="{ expanded: expandedUserCatIds.has(cat.id) }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              <span v-if="cat.emoji" class="ch-cat-emoji">{{ cat.emoji }}</span>
              <span class="ch-cat-name">{{ cat.name }}</span>
              <span class="ch-cat-count">{{ agentsStore.agentsInCategory(cat.id).length }}</span>
            </button>
            <div v-if="expandedUserCatIds.has(cat.id)" class="ch-cat-items">
              <button
                v-for="p in agentsStore.agentsInCategory(cat.id)"
                :key="p.id"
                class="ch-modal-item"
                :class="{ selected: resolvedUserAgentId === p.id }"
                @click="selectAgent('user', p.id)"
              >
                <div class="ch-modal-item-avatar">
                  <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                  <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                </div>
                <div class="ch-modal-item-text">
                  <span class="ch-modal-item-name">{{ p.name }}</span>
                  <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                </div>
                <svg v-if="resolvedUserAgentId === p.id" class="ch-modal-check" style="width:16px;height:16px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <div v-if="agentsStore.agentsInCategory(cat.id).length === 0" class="ch-cat-empty">No agents</div>
            </div>
          </div>
          <!-- All (fallback) section — always last -->
          <div class="ch-cat-section">
            <button class="ch-cat-header" @click="toggleUserCat('__all__')">
              <svg class="ch-cat-chevron" :class="{ expanded: expandedUserCatIds.has('__all__') }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              <span class="ch-cat-name">All</span>
              <span class="ch-cat-count">{{ sortedUserAgents.length }}</span>
            </button>
            <div v-if="expandedUserCatIds.has('__all__')" class="ch-cat-items">
              <button
                v-for="p in sortedUserAgents"
                :key="p.id"
                class="ch-modal-item"
                :class="{ selected: resolvedUserAgentId === p.id }"
                @click="selectAgent('user', p.id)"
              >
                <div class="ch-modal-item-avatar">
                  <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                  <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                </div>
                <div class="ch-modal-item-text">
                  <span class="ch-modal-item-name">{{ p.name }}</span>
                  <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                </div>
                <svg v-if="resolvedUserAgentId === p.id" class="ch-modal-check" style="width:16px;height:16px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── System Agent Picker Modal ── -->
  <Teleport to="body">
    <div v-if="showGroupAddPopover" class="ch-modal-backdrop">
      <div class="ch-modal" role="dialog" aria-modal="true">
        <div class="ch-modal-header">
          <div class="ch-modal-header-icon">
            <svg style="width:15px;height:15px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><path d="M4 12h16"/><path d="M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1"/><path d="M9 16h0"/><path d="M15 16h0"/></svg>
          </div>
          <span class="ch-modal-title">{{ t('chats.systemAgents') }}</span>
          <button class="ch-modal-close" @click="showGroupAddPopover = false">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="ch-modal-search">
          <svg style="width:14px;height:14px;flex-shrink:0;color:#6B7280;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref="agentSearchEl"
            v-model="agentSearchQuery"
            type="text"
            :placeholder="t('chats.searchAgents')"
            class="ch-modal-search-input"
          />
        </div>
        <div class="ch-modal-body">
          <!-- When searching: flat filtered list -->
          <template v-if="agentSearchQuery.trim()">
            <label
              v-for="p in filteredSystemAgents"
              :key="p.id"
              class="ch-modal-item ch-modal-item-check"
              :class="{ selected: activeSystemAgentIds.includes(p.id) }"
            >
              <div class="ch-modal-check-box" :class="{ checked: activeSystemAgentIds.includes(p.id) }">
                <input type="checkbox" :checked="activeSystemAgentIds.includes(p.id)" @change="toggleSystemAgent(p.id)" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;" />
                <svg v-if="activeSystemAgentIds.includes(p.id)" style="width:11px;height:11px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="ch-modal-item-avatar">
                <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
              </div>
              <div class="ch-modal-item-text">
                <span class="ch-modal-item-name">{{ p.name }}</span>
                <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
              </div>
            </label>
            <div v-if="filteredSystemAgents.length === 0" class="ch-modal-empty">{{ t('chats.noAgentsMatch') }}</div>
          </template>
          <!-- No search: category tree -->
          <template v-else>
            <!-- System categories -->
            <div v-for="cat in agentsStore.systemCategories" :key="cat.id" class="ch-cat-section">
              <button class="ch-cat-header" @click="toggleSysCat(cat.id)">
                <svg class="ch-cat-chevron" :class="{ expanded: expandedSysCatIds.has(cat.id) }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span v-if="cat.emoji" class="ch-cat-emoji">{{ cat.emoji }}</span>
                <span class="ch-cat-name">{{ cat.name }}</span>
                <span class="ch-cat-count">{{ agentsStore.agentsInCategory(cat.id).length }}</span>
              </button>
              <div v-if="expandedSysCatIds.has(cat.id)" class="ch-cat-items">
                <label
                  v-for="p in agentsStore.agentsInCategory(cat.id)"
                  :key="p.id"
                  class="ch-modal-item ch-modal-item-check"
                  :class="{ selected: activeSystemAgentIds.includes(p.id) }"
                >
                  <div class="ch-modal-check-box" :class="{ checked: activeSystemAgentIds.includes(p.id) }">
                    <input type="checkbox" :checked="activeSystemAgentIds.includes(p.id)" @change="toggleSystemAgent(p.id)" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;" />
                    <svg v-if="activeSystemAgentIds.includes(p.id)" style="width:11px;height:11px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ch-modal-item-avatar">
                    <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                    <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="ch-modal-item-text">
                    <span class="ch-modal-item-name">{{ p.name }}</span>
                    <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                  </div>
                </label>
                <div v-if="agentsStore.agentsInCategory(cat.id).length === 0" class="ch-cat-empty">No agents</div>
              </div>
            </div>
            <!-- All (fallback) section — always last -->
            <div class="ch-cat-section">
              <button class="ch-cat-header" @click="toggleSysCat('__all__')">
                <svg class="ch-cat-chevron" :class="{ expanded: expandedSysCatIds.has('__all__') }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span class="ch-cat-name">All</span>
                <span class="ch-cat-count">{{ sortedSystemAgents.length }}</span>
              </button>
              <div v-if="expandedSysCatIds.has('__all__')" class="ch-cat-items">
                <label
                  v-for="p in sortedSystemAgents"
                  :key="p.id"
                  class="ch-modal-item ch-modal-item-check"
                  :class="{ selected: activeSystemAgentIds.includes(p.id) }"
                >
                  <div class="ch-modal-check-box" :class="{ checked: activeSystemAgentIds.includes(p.id) }">
                    <input type="checkbox" :checked="activeSystemAgentIds.includes(p.id)" @change="toggleSystemAgent(p.id)" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;" />
                    <svg v-if="activeSystemAgentIds.includes(p.id)" style="width:11px;height:11px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ch-modal-item-avatar">
                    <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                    <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="ch-modal-item-text">
                    <span class="ch-modal-item-name">{{ p.name }}</span>
                    <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                  </div>
                </label>
              </div>
            </div>
          </template>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Floating chat settings tooltip (Teleport to body to escape stacking contexts) -->
  <Teleport to="body">
    <div
      v-if="configTooltipVisible"
      class="ch-config-tooltip-fixed"
      :style="{ top: configTooltipY + 'px', right: configTooltipRight + 'px' }"
    >
      <div class="ch-config-tooltip-row"><span class="cct-key">{{ t('chats.chatSettingsPath') }}</span><span class="cct-val">{{ effectiveWorkingPath }}</span></div>
      <div class="ch-config-tooltip-row"><span class="cct-key">{{ t('chats.chatSettingsAgentRounds') }}</span><span class="cct-val">{{ effectiveAgentRounds }}</span></div>
      <div class="ch-config-tooltip-row"><span class="cct-key">{{ t('chats.chatSettingsMaxTokens') }}</span><span class="cct-val">{{ effectiveMaxOutputTokens.toLocaleString() }}</span></div>
    </div>
  </Teleport>

  <!-- Floating call button tooltip (Teleport to body to escape stacking contexts) -->
  <Teleport to="body">
    <div
      v-if="callTooltipVisible"
      class="ch-call-tooltip-fixed"
      :style="{ top: callTooltipY + 'px', right: callTooltipRight + 'px' }"
    >
      <template v-if="canStartCall">
        <div class="ch-call-tooltip-row">
          <span class="cct-key">Agent</span>
          <span class="cct-val">{{ agentsStore.getAgentById(activeSystemAgentIds[0])?.name || '—' }}</span>
        </div>
        <div class="ch-call-tooltip-row">
          <span class="cct-key">STT</span>
          <span class="cct-val">Whisper</span>
        </div>
        <div class="ch-call-tooltip-row">
          <span class="cct-key">TTS</span>
          <span class="cct-val">{{ callTtsModeLabel }}</span>
        </div>
      </template>
      <template v-else>
        <div class="ch-call-tooltip-reason">{{ callButtonTooltip }}</div>
      </template>
    </div>
  </Teleport>

</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, onUnmounted } from 'vue'
import { useChatsStore } from '../../stores/chats'
import { useConfigStore } from '../../stores/config'
import { useAgentsStore } from '../../stores/agents'
import { useModelsStore } from '../../stores/models'
import { useToolsStore } from '../../stores/tools'
import { useMcpStore } from '../../stores/mcp'
import { useKnowledgeStore } from '../../stores/knowledge'
import { getAvatarDataUri } from '../agents/agentAvatars'
import { estimateToolTokens, estimateMcpTokens, formatTokens } from '../../utils/tokenEstimate'
import { useVoiceStore } from '../../stores/voice'
import { useI18n } from '../../i18n/useI18n'

const { t } = useI18n()

const props = defineProps({
  chatId: { type: String, required: true },
  isGridView: { type: Boolean, default: false },
  compactAgents: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-chat-settings',
  'open-soul-viewer',
  'remove-group-agent',
  'start-call',
  'enter-grid',
])

// Collapse state — starts collapsed in grid, expanded in single view
const headerExpanded = ref(!props.isGridView)
defineExpose({ headerExpanded })

const chatsStore = useChatsStore()
const configStore = useConfigStore()
const agentsStore = useAgentsStore()
const voiceStore = useVoiceStore()

// ── Voice call ──
const callBtnEl = ref(null)
const callTooltipVisible = ref(false)
const callTooltipY = ref(0)
const callTooltipRight = ref(0)

function showCallTooltip() {
  if (!callBtnEl.value) return
  const rect = callBtnEl.value.getBoundingClientRect()
  callTooltipY.value = rect.bottom + 8
  callTooltipRight.value = window.innerWidth - rect.right
  callTooltipVisible.value = true
}

function hideCallTooltip() {
  callTooltipVisible.value = false
}

const configBtnEl = ref(null)
const configTooltipVisible = ref(false)
const configTooltipY = ref(0)
const configTooltipRight = ref(0)

function showConfigTooltip() {
  if (!configBtnEl.value) return
  const rect = configBtnEl.value.getBoundingClientRect()
  configTooltipY.value = rect.bottom + 8
  configTooltipRight.value = window.innerWidth - rect.right
  configTooltipVisible.value = true
}

function hideConfigTooltip() {
  configTooltipVisible.value = false
}

// Close any open modal on Escape
function onKeyDown(e) {
  if (e.key !== 'Escape') return
  if (showGroupAddPopover.value) { showGroupAddPopover.value = false; return }
  if (showUsrPopover.value) { showUsrPopover.value = false; return }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

const isGroupChat = computed(() => chat.value?.isGroupChat ?? false)
const canStartCall = computed(() => {
  if (voiceStore.isCallActive) return false
  if (activeSystemAgentIds.value.length !== 1) return false
  if (!configStore.config.voiceCall?.whisperApiKey) return false
  return true
})
const callButtonTooltip = computed(() => {
  if (voiceStore.isCallActive) return 'Call already in progress'
  const count = activeSystemAgentIds.value.length
  if (count === 0) return 'Select an agent to start a call'
  if (count > 1) return 'Voice call requires exactly one agent'
  if (!configStore.config.voiceCall?.whisperApiKey) return 'Whisper API key not configured — go to Configuration → Voice Call'
  return 'Start voice call'
})
const callTtsModeLabel = computed(() => {
  const mode = configStore.config.voiceCall?.ttsMode || 'browser'
  if (mode === 'openai-hd') return 'OpenAI TTS HD'
  if (mode === 'openai') return 'OpenAI TTS'
  return 'Browser (free)'
})

function startCall() {
  if (!canStartCall.value) return
  emit('start-call', props.chatId)
}
const modelsStore = useModelsStore()
const toolsStore = useToolsStore()
const mcpStore = useMcpStore()
const knowledgeStore = useKnowledgeStore()

// ── Computed chat reference ──
const chat = computed(() => chatsStore.chats.find(c => c.id === props.chatId) || null)
const resolvedChatId = computed(() => props.chatId)
const chatFolderPath = computed(() => props.chatId ? chatsStore.getChatFolderPath(props.chatId) : '')

// ── Folder path tooltip ──
const titleBadgeEl = ref(null)
const pathTooltip = ref({ visible: false, x: 0, y: 0, text: '' })
function showPathTooltip() {
  if (!titleBadgeEl.value || !chat.value) return
  const rect = titleBadgeEl.value.getBoundingClientRect()
  const folderPart = chatFolderPath.value
  const text = `Path: ${folderPart ? `${folderPart}/${chat.value.title}` : chat.value.title}`
  pathTooltip.value = { visible: true, x: rect.left + rect.width / 2, y: rect.bottom + 6, text }
}
function hidePathTooltip() {
  pathTooltip.value.visible = false
}

// ── Running state ──
const isRunning = computed(() => chat.value?.isRunning ?? false)

// ── Truncated title ──
const titleMaxLen = computed(() => props.isGridView ? 20 : 100)
const truncatedTitle = computed(() => {
  const title = chat.value?.title || 'Chat'
  const max = titleMaxLen.value
  return title.length > max ? title.slice(0, max) + '…' : title
})

// ── Inline title editing ──
const isEditing = ref(false)
const editTitle = ref('')
const editInputEl = ref(null)

function startEdit() {
  editTitle.value = chat.value?.title || ''
  isEditing.value = true
  nextTick(() => editInputEl.value?.focus())
}

async function confirmEdit() {
  if (!isEditing.value) return
  const newTitle = editTitle.value.trim()
  if (newTitle && newTitle !== chat.value?.title) {
    await chatsStore.renameChat(props.chatId, newTitle)
  }
  isEditing.value = false
}

function cancelEdit() {
  isEditing.value = false
}

// ── User agent popover ──
const showUsrPopover = ref(false)
const usrChipWrap = ref(null)
const expandedUserCatIds = ref(new Set())

// ── Group add popover ──
const showGroupAddPopover = ref(false)
const groupAddChipWrap = ref(null)
const agentSearchEl = ref(null)
const agentSearchQuery = ref('')
const expandedSysCatIds = ref(new Set())

// ── Own tooltip state (not shared with parent) ──
const tooltipState = reactive({ visible: false, name: '', text: '', x: 0, y: 0 })

// ── Agent computed ──
function getAvatarDataUriForAgent(agent) {
  if (!agent?.avatar) return null
  return getAvatarDataUri(agent.avatar)
}

const activeUserAgent = computed(() => {
  const id = chat.value?.userAgentId
  return id ? agentsStore.getAgentById(id) : agentsStore.defaultUserAgent
})
const activeUserAvatarDataUri = computed(() => getAvatarDataUriForAgent(activeUserAgent.value))
const activeUserAgentName = computed(() => activeUserAgent.value?.name || 'Default')

const resolvedUserAgentId = computed(() => {
  const id = chat.value?.userAgentId
  return id || agentsStore.defaultUserAgent?.id || null
})

const sortedUserAgents = computed(() =>
  [...agentsStore.userAgents].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)

const sortedSystemAgents = computed(() =>
  [...agentsStore.systemAgents].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)

const activeSystemAgentIds = computed(() => {
  const c = chat.value
  if (!c) return []
  if (c.groupAgentIds?.length > 0) return [...c.groupAgentIds]
  const id = c.systemAgentId || agentsStore.defaultSystemAgent?.id
  return id ? [id] : []
})

const MAX_VISIBLE_AVATARS = 4
const visibleSystemAgentIds = computed(() => activeSystemAgentIds.value.slice(0, MAX_VISIBLE_AVATARS))
const overflowSystemCount = computed(() => Math.max(0, activeSystemAgentIds.value.length - MAX_VISIBLE_AVATARS))

// Pre-compute avatar URIs as a computed so Vue's dep-tracker reliably re-evaluates
// when the active chat changes (avoiding stale avatar after chat switch).
const systemAgentAvatarMap = computed(() => {
  const map = {}
  for (const pid of activeSystemAgentIds.value) {
    const agent = agentsStore.getAgentById(pid)
    map[pid] = agent?.avatar ? getAvatarDataUri(agent.avatar) : null
  }
  return map
})

const filteredSystemAgents = computed(() => {
  const q = agentSearchQuery.value.toLowerCase().trim()
  const list = sortedSystemAgents.value
  if (!q) return list
  return list.filter(p =>
    p.name.toLowerCase().includes(q) ||
    (p.description && p.description.toLowerCase().includes(q))
  )
})

// ── Category tree toggle helpers ──
function toggleUserCat(id) {
  const s = new Set(expandedUserCatIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedUserCatIds.value = s
}
function toggleSysCat(id) {
  const s = new Set(expandedSysCatIds.value)
  s.has(id) ? s.delete(id) : s.add(id)
  expandedSysCatIds.value = s
}

// ── Popover functions ──
function togglePopover(type) {
  if (type === 'user') {
    expandedUserCatIds.value = new Set()
    showUsrPopover.value = !showUsrPopover.value
  }
}

function selectAgent(type, id) {
  if (props.chatId) chatsStore.setChatAgent(props.chatId, type, id)
  showUsrPopover.value = false
}

function openAgentCombobox() {
  showGroupAddPopover.value = !showGroupAddPopover.value
  if (showGroupAddPopover.value) {
    agentSearchQuery.value = ''
    expandedSysCatIds.value = new Set()
    nextTick(() => agentSearchEl.value?.focus())
  }
}

function toggleSystemAgent(agentId) {
  const chatId = props.chatId
  if (!chatId) return
  const c = chat.value
  const currentIds = activeSystemAgentIds.value

  if (currentIds.includes(agentId)) {
    if (currentIds.length <= 1) return
    chatsStore.removeGroupAgent(chatId, agentId)
  } else {
    if (!c.isGroupChat) {
      chatsStore.toggleGroupMode(chatId, true)
    }
    chatsStore.addGroupAgent(chatId, agentId)
  }
}

// ── System avatar click: grid/group → soul viewer; normal → nothing ──
function onSysAvatarClick(pid) {
  emit('open-soul-viewer', pid, 'system', agentsStore.getAgentById(pid)?.name || 'System')
}

// ── Agent tooltip (header-only) ──
function showAgentTooltip(event, pid) {
  const agent = agentsStore.getAgentById(pid)
  if (!agent?.description) { tooltipState.visible = false; return }
  const rect = event.currentTarget.getBoundingClientRect()
  tooltipState.name = agent.name
  tooltipState.text = agent.description
  const tooltipWidth = 280
  let left = rect.left + rect.width / 2
  left = Math.max(tooltipWidth / 2 + 8, Math.min(left, window.innerWidth - tooltipWidth / 2 - 8))
  tooltipState.x = left
  tooltipState.y = rect.bottom + 10
  tooltipState.visible = true
}

function hideAgentTooltip() {
  tooltipState.visible = false
}

// ── Chat Settings tooltip data ──
const effectiveProviderLabel = computed(() => {
  const c = chat.value
  if (!c) return '—'
  const agentId = activeSystemAgentIds.value[0]
  if (!agentId) return '—'
  const agent = agentsStore.getAgentById(agentId)
  if (!agent?.providerId) return '—'
  const providers = configStore.config?.providers || []
  const found = providers.find(p => p.id === agent.providerId || p.type === agent.providerId)
  return found?.name || found?.type || agent.providerId
})

const effectiveModelLabel = computed(() => {
  const agentId = activeSystemAgentIds.value[0]
  if (!agentId) return '—'
  return agentsStore.getAgentById(agentId)?.modelId || '—'
})

// Chat-level tool/MCP/RAG counts for the tooltip
const chatEnabledToolIds = computed(() => chat.value?.enabledToolIds ? new Set(chat.value.enabledToolIds) : new Set(toolsStore.tools.map(t => t.id)))
const enabledHttpTools = computed(() => toolsStore.tools.filter(t => chatEnabledToolIds.value.has(t.id)))
const toolsTokenEstimate = computed(() => enabledHttpTools.value.reduce((sum, t) => sum + estimateToolTokens(t), 0))

const chatEnabledMcpIds = computed(() => chat.value?.enabledMcpIds ? new Set(chat.value.enabledMcpIds) : new Set(mcpStore.servers.map(s => s.id)))
const enabledMcpServers = computed(() => mcpStore.servers.filter(s => chatEnabledMcpIds.value.has(s.id)))
const mcpTokenEstimate = computed(() =>
  enabledMcpServers.value.reduce((sum, s) => {
    const status = mcpStore.runningStatus[s.id]
    const toolCount = status?.toolCount ?? 10
    return sum + estimateMcpTokens(s, toolCount)
  }, 0)
)

const ragEnabledCount = computed(() => {
  const configs = knowledgeStore.indexConfigs
  return Object.values(configs).filter(c => c.enabled).length
})

const effectiveWorkingPath = computed(() => {
  return chat.value?.workingPath || configStore.config.artifactPath || `${configStore.config.dataPath}/artifact`
})

const effectiveAgentRounds = computed(() => {
  return chat.value?.maxAgentRounds ?? 10
})

const effectiveMaxOutputTokens = computed(() => {
  return chat.value?.maxOutputTokens ?? configStore.config.maxOutputTokens ?? 32768
})

</script>

<style scoped>
.chat-header {
  display: flex;
  flex-direction: column;
  flex-shrink: 0;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  position: relative;
  z-index: 20;
}
.ch-header-tab {
  position: absolute;
  bottom: 0;
  left: 50%;
  transform: translate(-50%, 100%);
  z-index: 21;
  width: 3.5rem;
  height: 1.4rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: 0 0 0.5rem 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
  transition: height 0.15s ease, background 0.15s ease;
}
.ch-header-tab:hover {
  height: 1.875rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

/* ── Row 1: Title row ── */
.ch-row-top {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.5rem 1rem 0.25rem;
  position: relative;
  min-height: 2.25rem;
}

/* ── Title badge (centered) ── */
.ch-title-badge {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.375rem 0.25rem 0.625rem;
  border-radius: 9999px;
  background: #FFFFFF;
  border: 1px solid var(--border, #E5E5EA);
  box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
  transition: none;
}
.ch-title-badge:hover {
  background: var(--bg-hover, #F5F5F5);
  box-shadow: 0 2px 8px rgba(0,0,0,0.08);
}
.ch-title-icon {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-main, #F2F2F7);
  color: var(--text-secondary, #6B7280);
  flex-shrink: 0;
}
/* ── Running spinner (before title) ── */
.ch-title-spinner {
  flex-shrink: 0;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: var(--text-primary, #1A1A1A);
  border-right-color: rgba(26,26,26,0.3);
  animation: ch-title-spin 0.7s linear infinite;
}
@keyframes ch-title-spin {
  to { transform: rotate(360deg); }
}

.chat-header-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  color: var(--text-primary, #1A1A1A);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  margin: 0;
  max-width: 12.5rem;
  letter-spacing: -0.01em;
}
.ch-edit-btn {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: none;
  background: transparent;
  color: var(--text-muted, #9CA3AF);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: none;
  flex-shrink: 0;
}
.ch-edit-btn:hover {
  background: var(--bg-main, #F2F2F7);
  color: var(--text-primary, #1A1A1A);
}

/* ── Inline edit mode (centered) ── */
.ch-title-edit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.375rem 0.25rem 0.625rem;
  border-radius: 9999px;
  background: #FFFFFF;
  border: 1.5px solid var(--text-primary, #1A1A1A);
  box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
}
.ch-title-input {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  color: var(--text-primary, #1A1A1A);
  border: none;
  outline: none;
  background: transparent;
  width: 11.25rem;
  letter-spacing: -0.01em;
}
.ch-title-input::placeholder { color: var(--text-muted, #9CA3AF); }
.ch-edit-confirm {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: none;
  background: var(--bg-main, #F2F2F7);
  color: var(--text-primary, #1A1A1A);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.ch-edit-confirm:hover {
  background: var(--border, #E5E5EA);
}

/* ── Status indicator (left-aligned, title row) ── */
.ch-row-top-status {
  position: absolute;
  left: 1rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
}
.ch-status-badge {
  display: flex; align-items: center; gap: 0.3125rem;
  padding: 0.1875rem 0.625rem 0.1875rem 0.5rem;
  border-radius: var(--radius-full, 9999px);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small, 0.75rem);
  font-weight: 600;
  white-space: nowrap;
}
.ch-status-badge--approval {
  background: #EF4444;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(239,68,68,0.25);
  animation: chApprovalPulse 1.5s ease-in-out infinite;
}
@keyframes chApprovalPulse { 0%,100%{ opacity:1; } 50%{ opacity:0.65; } }
.ch-status-badge--running {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  animation: chRunningPulse 1.2s ease-in-out infinite;
}
.ch-status-dot {
  width: 0.375rem; height: 0.375rem; border-radius: 50%;
  background: #FFFFFF;
  animation: chRunningPulse 1.2s ease-in-out infinite;
}
@keyframes chRunningPulse { 0%,100%{ opacity:1; } 50%{ opacity:0.4; } }

/* ── Actions (right-aligned, title row) ── */
.ch-row-top-actions {
  position: absolute;
  right: 1rem;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}

/* ── Call button ── */
.ch-call-btn-wrap {
  position: relative;
  flex-shrink: 0;
}
.ch-call-btn {
  display: flex; align-items: center; justify-content: center;
  width: 1.875rem; height: 1.875rem; border: none; border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; cursor: pointer; transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.ch-call-btn:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
.ch-call-btn:disabled {
  background: #E5E5EA;
  color: #9CA3AF;
  box-shadow: none;
  cursor: not-allowed;
  opacity: 0.6;
}
/* ── Row 2: Agents + Chat Settings ── */
.ch-row-bottom {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.25rem 1rem 0.5rem;
  overflow: hidden;
  max-height: 4rem;
  opacity: 1;
  transition: max-height 0.25s ease, opacity 0.2s ease, padding 0.25s ease;
}
.ch-row-bottom--collapsed {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  pointer-events: none;
}
.ch-row-bottom-right {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}

/* ── Chat config button ── */
.chat-config-btn-wrap {
  position: relative;
  flex-shrink: 0;
}
.chat-config-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.875rem;
  height: 1.875rem;
  padding: 0;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  cursor: pointer;
  transition: background 0.15s, box-shadow 0.15s;
  font-family: 'Inter', sans-serif;
  flex-shrink: 0;
}
.chat-config-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
/* ── Agent section layout ── */
.agent-section {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.agent-group {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  position: relative;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  padding: 0.125rem 0.5rem;
  border-radius: 0.625rem;
  box-shadow: 0 2px 8px rgba(75, 85, 99, 0.35), 0 1px 3px rgba(75, 85, 99, 0.2);
}

/* ── User agent card ── */
.agent-card-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.agent-card {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0;
  border-radius: 0;
  border: none;
  background: transparent;
  transition: none;
  font-family: 'Inter', sans-serif;
  position: relative;
}
.agent-card-avatar {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.agent-card-avatar-img {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  object-fit: cover;
  cursor: pointer;
}
.agent-card-avatar-default {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.agent-card-avatar-default.user {
  background: rgba(255,255,255,0.15);
  cursor: pointer;
}
.agent-card-info {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  min-width: 0;
}
.agent-card-name {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  flex-shrink: 0;
}
.agent-card-desc {
  font-size: 0.625rem;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 5rem;
}

/* ── System agents: Teams-style avatar stack ── */
.sys-avatar-stack {
  display: flex;
  align-items: center;
}
.sys-avatar-item {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  border: none;
  margin-left: -0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: transform 0.15s, box-shadow 0.15s;
  background: transparent;
  overflow: visible;
  flex-shrink: 0;
}
.sys-avatar-stack > .sys-avatar-item:first-child {
  margin-left: 0;
}
.sys-avatar-item:hover {
  transform: scale(1.12);
  box-shadow: 0 2px 8px rgba(0,0,0,0.15);
  z-index: 20 !important;
}
.sys-avatar-item.active {
  box-shadow: 0 0 0 2px #1A1A1A;
  z-index: 20 !important;
}
.sys-avatar-img {
  width: 100%;
  height: 100%;
  border-radius: 50%;
  object-fit: cover;
}
.sys-avatar-fallback {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 700;
  color: #fff;
  user-select: none;
}
.sys-avatar-overflow {
  background: #6B7280;
  cursor: pointer;
}
.sys-avatar-remove {
  position: absolute;
  top: -0.1875rem;
  right: -0.1875rem;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 50%;
  background: #EF4444;
  color: #fff;
  border: 1.5px solid rgba(255,255,255,0.3);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  opacity: 0;
  transition: opacity 0.15s;
  z-index: 100;
}
.sys-avatar-item:hover .sys-avatar-remove {
  opacity: 1;
}


/* Add agent button */
.sys-add-btn {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 50%;
  border: 1.5px dashed rgba(255,255,255,0.3);
  background: transparent;
  color: rgba(255,255,255,0.5);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.sys-add-btn:hover {
  border-color: rgba(255,255,255,0.6);
  color: #FFFFFF;
  background: rgba(255,255,255,0.1);
}

/* ── Agent chip wrap ── */
.agent-chip-wrap {
  position: relative;
}
</style>

<!-- Global styles for teleported modals + tooltips (unscoped) -->
<style>
/* ── Folder path tooltip ── */
.ch-path-tooltip {
  position: fixed;
  z-index: 9999;
  transform: translateX(-50%);
  padding: 0.375rem 0.75rem;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption, 0.8125rem);
  font-weight: 500;
  white-space: nowrap;
  pointer-events: none;
  box-shadow: 0 4px 12px rgba(0,0,0,0.2), 0 1px 3px rgba(0,0,0,0.12);
}

/* ── Agent modals (teleported) ── */
.ch-modal-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.55);
  backdrop-filter: blur(6px); -webkit-backdrop-filter: blur(6px);
  display: flex; align-items: center; justify-content: center;
  animation: ch-backdrop-in 0.15s ease-out;
}
@keyframes ch-backdrop-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
.ch-modal {
  width: min(36rem, 90vw);
  max-height: 80vh;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  display: flex; flex-direction: column; overflow: hidden;
  animation: ch-modal-in 0.18s ease-out;
}
@keyframes ch-modal-in {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to { opacity: 1; transform: scale(1) translateY(0); }
}
.ch-modal-header {
  display: flex; align-items: center; gap: 0.625rem;
  padding: 0.875rem 1rem 0.75rem;
  border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
}
.ch-modal-header-icon {
  width: 1.75rem; height: 1.75rem; border-radius: 0.5rem; flex-shrink: 0;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  display: flex; align-items: center; justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.ch-modal-title {
  font-family: 'Inter', sans-serif; font-size: 0.9375rem;
  font-weight: 700; color: #FFFFFF;
}
.ch-modal-subtitle {
  font-family: 'Inter', sans-serif; font-size: 0.75rem;
  font-weight: 400; color: #6B7280;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.ch-modal-close {
  margin-left: auto; width: 1.75rem; height: 1.75rem; border-radius: 0.4375rem;
  border: none; background: transparent; color: #6B7280;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.ch-modal-close:hover { background: #1F1F1F; color: #FFFFFF; }
.ch-modal-search {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid #1A1A1A;
  flex-shrink: 0;
}
.ch-modal-search-input {
  flex: 1; border: none; outline: none;
  background: transparent;
  font-family: 'Inter', sans-serif; font-size: 0.875rem;
  color: #FFFFFF;
}
.ch-modal-search-input::placeholder { color: #4B5563; }
.ch-modal-body {
  flex: 1; overflow-y: auto;
  padding: 0.5rem;
  display: flex; flex-direction: column; gap: 0.1875rem;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.ch-modal-item {
  display: flex; align-items: center; gap: 0.75rem;
  width: 100%; padding: 0.625rem 0.75rem;
  border-radius: 0.625rem; border: 1px solid transparent;
  background: transparent; cursor: pointer;
  font-family: 'Inter', sans-serif;
  transition: all 0.12s; text-align: left;
}
.ch-modal-item:hover {
  background: #1A1A1A; border-color: #2A2A2A;
}
.ch-modal-item.selected {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #374151 100%);
  border-color: #374151;
}
.ch-modal-item-check { align-items: flex-start; }
.ch-modal-check-box {
  width: 1.125rem; height: 1.125rem; border-radius: 0.3125rem; flex-shrink: 0;
  border: 1.5px solid #374151;
  display: flex; align-items: center; justify-content: center;
  position: relative; transition: all 0.12s; margin-top: 0.125rem;
}
.ch-modal-check-box.checked {
  background: linear-gradient(135deg, #374151 0%, #4B5563 100%);
  border-color: #4B5563;
}
.ch-modal-item-avatar {
  width: 2.5rem; height: 2.5rem; border-radius: 50%; flex-shrink: 0;
  overflow: hidden; display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1A1A1A 0%, #374151 100%);
}
.ch-modal-avatar-fallback {
  font-family: 'Inter', sans-serif; font-size: 0.9375rem;
  font-weight: 700; color: #fff; user-select: none;
}
.ch-modal-item-text {
  display: flex; flex-direction: column; gap: 0.1875rem;
  min-width: 0; flex: 1;
}
.ch-modal-item-name {
  font-family: 'Inter', sans-serif; font-size: 0.875rem;
  font-weight: 600; color: #E5E5EA;
}
.ch-modal-item.selected .ch-modal-item-name { color: #FFFFFF; }
.ch-modal-item-desc {
  font-family: 'Inter', sans-serif; font-size: 0.75rem;
  font-weight: 400; color: #6B7280; line-height: 1.4;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical;
  overflow: hidden;
}
.ch-modal-item.selected .ch-modal-item-desc { color: rgba(255,255,255,0.5); }
.ch-modal-check { color: rgba(255,255,255,0.7); }
.ch-modal-empty {
  padding: 1.25rem; text-align: center;
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; color: #4B5563;
}

/* Category tree inside agent modals */
.ch-cat-section { display: flex; flex-direction: column; }
.ch-cat-header {
  display: flex; align-items: center; gap: 0.375rem;
  width: 100%; padding: 0.3125rem 0.5rem;
  background: transparent; border: none; cursor: pointer;
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif;
  color: #6B7280;
  transition: background 0.12s;
}
.ch-cat-header:hover { background: rgba(255,255,255,0.05); color: #9CA3AF; }
.ch-cat-chevron {
  flex-shrink: 0; color: #4B5563;
  transition: transform 0.15s;
  transform: rotate(0deg);
}
.ch-cat-chevron.expanded { transform: rotate(90deg); }
.ch-cat-emoji { font-size: 0.8125rem; line-height: 1; }
.ch-cat-name {
  flex: 1; text-align: left;
  font-size: 0.75rem; font-weight: 600;
  text-transform: uppercase; letter-spacing: 0.05em;
}
.ch-cat-count {
  font-size: 0.6875rem; font-weight: 600;
  padding: 0.0625rem 0.3125rem; border-radius: 9999px;
  background: rgba(255,255,255,0.08); color: #6B7280;
}
.ch-cat-items { display: flex; flex-direction: column; gap: 0.125rem; padding-left: 0.75rem; }
.ch-cat-empty {
  padding: 0.375rem 0.5rem;
  font-family: 'Inter', sans-serif; font-size: 0.75rem; color: #4B5563;
  font-style: italic;
}
.ch-call-tooltip-fixed {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  background: #1A1A1A;
  border-radius: 0.625rem;
  padding: 0.625rem 0.875rem;
  min-width: 12.5rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
}
.ch-config-tooltip-fixed {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  background: #1A1A1A;
  border-radius: 0.625rem;
  padding: 0.625rem 0.875rem;
  min-width: 13.75rem;
  box-shadow: 0 8px 24px rgba(0,0,0,0.18);
}
.ch-config-tooltip-fixed .ch-config-tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.125rem 0;
}
.ch-config-tooltip-fixed .cct-key {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
}
.ch-config-tooltip-fixed .cct-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #FFFFFF;
  text-align: right;
  word-break: break-all;
}
.ch-call-tooltip-fixed .ch-call-tooltip-row {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  gap: 0.75rem;
  padding: 0.125rem 0;
}
.ch-call-tooltip-fixed .ch-call-tooltip-reason {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255,255,255,0.75);
  line-height: 1.5;
}
.ch-call-tooltip-fixed .cct-key {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  white-space: nowrap;
}
.ch-call-tooltip-fixed .cct-val {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  text-align: right;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 10rem;
}

.ch-agent-tooltip-fixed {
  position: fixed;
  z-index: 9999;
  pointer-events: none;
  transform: translateX(-50%);
  min-width: 12.5rem;
  max-width: 18.75rem;
  padding: 0.625rem 0.875rem;
  background: rgba(0, 0, 0, 0.92);
  border-radius: 0.625rem;
  box-shadow: 0 4px 12px rgba(0,0,0,0.12);
}
.ch-agent-tooltip-name {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  color: #F5F5F5;
  margin-bottom: 0.25rem;
}
.ch-agent-tooltip-text {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 400;
  color: #D1D1D6;
  line-height: 1.5;
}
</style>
