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
      <div class="ch-title-badge" v-if="!isEditing">
        <div class="ch-title-icon">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <span v-if="isRunning" class="ch-title-spinner"></span>
        <span class="chat-header-title">{{ truncatedTitle }}</span>
        <button class="ch-edit-btn" @click.stop="startEdit" title="Rename chat">
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
        <button class="ch-edit-confirm" @click.stop="confirmEdit" title="Save">
          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <polyline points="20 6 9 17 4 12"/>
          </svg>
        </button>
      </div>
      <!-- Extra action buttons slot (grid view inserts maximize + swap here) -->
      <div class="ch-row-top-actions">
        <!-- Voice call button with hover tooltip -->
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
        <!-- Grid view button — only shown in single-chat mode -->
        <button
          v-if="!isGridView"
          class="ch-call-btn"
          title="Multi-chat grid view"
          @click.stop="emit('enter-grid')"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>
          </svg>
        </button>
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

    <!-- Row 2: Personas (right-aligned, left of Chat Settings) + Chat Settings button -->
    <div class="ch-row-bottom" :class="{ 'ch-row-bottom--collapsed': !headerExpanded }">
      <slot name="row-bottom-left" />
      <div class="ch-row-bottom-right">
        <!-- Persona selectors -->
        <div class="persona-section">
          <!-- ── User persona ── -->
          <div class="persona-group">
            <div class="persona-card-wrap" ref="usrChipWrap">
              <div class="persona-card user" @mouseenter="showPersonaTooltip($event, resolvedUserPersonaId)" @mouseleave="hidePersonaTooltip">
                <div class="persona-card-avatar">
                  <img v-if="activeUserAvatarDataUri" :src="activeUserAvatarDataUri" alt="" class="persona-card-avatar-img" />
                  <div v-else class="persona-card-avatar-default user">
                    <svg style="width:14px;height:14px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  </div>
                </div>
                <div v-if="!compactPersonas" class="persona-card-info">
                  <span class="persona-card-name">{{ activeUserPersonaName }}</span>
                </div>
                <button
                  class="persona-card-summary-btn"
                  @click.stop="$emit('open-soul-viewer', activeUserPersona?.id || '__default_user__', 'users', activeUserPersona?.name || 'User')"
                  title="View summary"
                >
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                    <line x1="10" y1="22" x2="14" y2="22"/>
                  </svg>
                </button>
              </div>
              <!-- User persona select button -->
              <button class="sys-add-btn" @click.stop="togglePopover('user')" title="Switch user persona">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="8" r="4"/><path d="M3 21v-2a6 6 0 0 1 9.29-5"/><path d="M19 14v6m-3-3 3 3 3-3"/></svg>
              </button>
              </div>
          </div>

          <!-- ── System personas ── -->
          <div class="persona-group system-group">
            <!-- Overlapping avatar stack -->
            <div class="sys-avatar-stack">
              <div
                v-for="(pid, idx) in visibleSystemPersonaIds"
                :key="pid"
                class="sys-avatar-item"
                :class="{ active: sysPersonaConfigId === pid }"
                :style="{ zIndex: activeSystemPersonaIds.length - idx }"
                @click.stop="onSysAvatarClick(pid)"
                @mouseenter="showPersonaTooltip($event, pid)"
                @mouseleave="hidePersonaTooltip"
              >
                <img v-if="getAvatarDataUriForPersona(personasStore.getPersonaById(pid))" :src="getAvatarDataUriForPersona(personasStore.getPersonaById(pid))" alt="" class="sys-avatar-img" />
                <span v-else class="sys-avatar-fallback">{{ (personasStore.getPersonaById(pid)?.name || '?').charAt(0) }}</span>
                <button
                  v-if="activeSystemPersonaIds.length > 1"
                  class="sys-avatar-remove"
                  @click.stop="$emit('remove-group-persona', resolvedChatId, pid)"
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

            <!-- Active persona name label (no click) -->
            <template v-if="!compactPersonas">
              <div
                v-if="activeSystemPersonaIds.length === 1"
                class="sys-persona-label"
                @mouseenter="showPersonaTooltip($event, activeSystemPersonaIds[0])"
                @mouseleave="hidePersonaTooltip"
              >
                <span class="sys-persona-name">{{ personasStore.getPersonaById(activeSystemPersonaIds[0])?.name || 'Unknown' }}</span>
              </div>
              <div v-else-if="activeSystemPersonaIds.length > 1" class="sys-persona-label">
                <span class="sys-persona-name">{{ activeSystemPersonaIds.length }} personas</span>
              </div>
            </template>

            <!-- Summary button (single persona) — opens SoulViewer -->
            <button
              v-if="activeSystemPersonaIds.length === 1"
              class="persona-card-summary-btn"
              @click.stop="$emit('open-soul-viewer', activeSystemPersonaIds[0], 'system', personasStore.getPersonaById(activeSystemPersonaIds[0])?.name || 'System')"
              title="View summary"
            >
              <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/>
                <line x1="10" y1="22" x2="14" y2="22"/>
              </svg>
            </button>

            <!-- Configure persona button -->
            <div class="persona-chip-wrap" ref="groupAddChipWrap">
              <button class="sys-add-btn" @click.stop="openPersonaCombobox" title="Configure personas">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Chat Settings button -->
        <div ref="configBtnEl" class="chat-config-btn-wrap" @mouseenter="showConfigTooltip" @mouseleave="hideConfigTooltip">
          <button class="chat-config-btn" @click="$emit('open-chat-settings')">
            <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/></svg>
          </button>
        </div>
      </div>
    </div>

  </div>

  <!-- Floating persona tooltip (Teleport to body so it escapes overflow:hidden) -->
  <Teleport to="body">
    <div
      v-if="tooltipState.visible"
      class="ch-persona-tooltip-fixed"
      :style="{ top: tooltipState.y + 'px', left: tooltipState.x + 'px' }"
    >
      <div class="ch-persona-tooltip-name">{{ tooltipState.name }}</div>
      <div class="ch-persona-tooltip-text">{{ tooltipState.text }}</div>
    </div>
  </Teleport>

  <!-- ── User Persona Modal ── -->
  <Teleport to="body">
    <div v-if="showUsrPopover" class="ch-modal-backdrop">
      <div class="ch-modal" role="dialog" aria-modal="true">
        <div class="ch-modal-header">
          <div class="ch-modal-header-icon">
            <svg style="width:15px;height:15px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
          </div>
          <span class="ch-modal-title">User Persona</span>
          <button class="ch-modal-close" @click="showUsrPopover = false">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="ch-modal-body">
          <!-- User categories -->
          <div v-for="cat in personasStore.userCategories" :key="cat.id" class="ch-cat-section">
            <button class="ch-cat-header" @click="toggleUserCat(cat.id)">
              <svg class="ch-cat-chevron" :class="{ expanded: expandedUserCatIds.has(cat.id) }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              <span v-if="cat.emoji" class="ch-cat-emoji">{{ cat.emoji }}</span>
              <span class="ch-cat-name">{{ cat.name }}</span>
              <span class="ch-cat-count">{{ personasStore.personasInCategory(cat.id).length }}</span>
            </button>
            <div v-if="expandedUserCatIds.has(cat.id)" class="ch-cat-items">
              <button
                v-for="p in personasStore.personasInCategory(cat.id)"
                :key="p.id"
                class="ch-modal-item"
                :class="{ selected: resolvedUserPersonaId === p.id }"
                @click="selectPersona('user', p.isDefault ? null : p.id)"
              >
                <div class="ch-modal-item-avatar">
                  <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                  <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                </div>
                <div class="ch-modal-item-text">
                  <span class="ch-modal-item-name">{{ p.name }}</span>
                  <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                </div>
                <svg v-if="resolvedUserPersonaId === p.id" class="ch-modal-check" style="width:16px;height:16px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <div v-if="personasStore.personasInCategory(cat.id).length === 0" class="ch-cat-empty">No personas</div>
            </div>
          </div>
          <!-- All (fallback) section — always last -->
          <div class="ch-cat-section">
            <button class="ch-cat-header" @click="toggleUserCat('__all__')">
              <svg class="ch-cat-chevron" :class="{ expanded: expandedUserCatIds.has('__all__') }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
              <span class="ch-cat-name">All</span>
              <span class="ch-cat-count">{{ sortedUserPersonas.length }}</span>
            </button>
            <div v-if="expandedUserCatIds.has('__all__')" class="ch-cat-items">
              <button
                v-for="p in sortedUserPersonas"
                :key="p.id"
                class="ch-modal-item"
                :class="{ selected: resolvedUserPersonaId === p.id }"
                @click="selectPersona('user', p.isDefault ? null : p.id)"
              >
                <div class="ch-modal-item-avatar">
                  <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                  <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                </div>
                <div class="ch-modal-item-text">
                  <span class="ch-modal-item-name">{{ p.name }}</span>
                  <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                </div>
                <svg v-if="resolvedUserPersonaId === p.id" class="ch-modal-check" style="width:16px;height:16px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- ── System Persona Picker Modal ── -->
  <Teleport to="body">
    <div v-if="showGroupAddPopover" class="ch-modal-backdrop">
      <div class="ch-modal" role="dialog" aria-modal="true">
        <div class="ch-modal-header">
          <div class="ch-modal-header-icon">
            <svg style="width:15px;height:15px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 8V4H8"/><path d="M4 12h16"/><path d="M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1"/><path d="M9 16h0"/><path d="M15 16h0"/></svg>
          </div>
          <span class="ch-modal-title">System Personas</span>
          <button class="ch-modal-close" @click="showGroupAddPopover = false">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="ch-modal-search">
          <svg style="width:14px;height:14px;flex-shrink:0;color:#6B7280;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref="personaSearchEl"
            v-model="personaSearchQuery"
            type="text"
            placeholder="Search personas..."
            class="ch-modal-search-input"
          />
        </div>
        <div class="ch-modal-body">
          <!-- When searching: flat filtered list -->
          <template v-if="personaSearchQuery.trim()">
            <label
              v-for="p in filteredSystemPersonas"
              :key="p.id"
              class="ch-modal-item ch-modal-item-check"
              :class="{ selected: activeSystemPersonaIds.includes(p.id) }"
            >
              <div class="ch-modal-check-box" :class="{ checked: activeSystemPersonaIds.includes(p.id) }">
                <input type="checkbox" :checked="activeSystemPersonaIds.includes(p.id)" @change="toggleSystemPersona(p.id)" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;" />
                <svg v-if="activeSystemPersonaIds.includes(p.id)" style="width:11px;height:11px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="ch-modal-item-avatar">
                <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
              </div>
              <div class="ch-modal-item-text">
                <span class="ch-modal-item-name">{{ p.name }}</span>
                <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
              </div>
            </label>
            <div v-if="filteredSystemPersonas.length === 0" class="ch-modal-empty">No personas match</div>
          </template>
          <!-- No search: category tree -->
          <template v-else>
            <!-- System categories -->
            <div v-for="cat in personasStore.systemCategories" :key="cat.id" class="ch-cat-section">
              <button class="ch-cat-header" @click="toggleSysCat(cat.id)">
                <svg class="ch-cat-chevron" :class="{ expanded: expandedSysCatIds.has(cat.id) }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span v-if="cat.emoji" class="ch-cat-emoji">{{ cat.emoji }}</span>
                <span class="ch-cat-name">{{ cat.name }}</span>
                <span class="ch-cat-count">{{ personasStore.personasInCategory(cat.id).length }}</span>
              </button>
              <div v-if="expandedSysCatIds.has(cat.id)" class="ch-cat-items">
                <label
                  v-for="p in personasStore.personasInCategory(cat.id)"
                  :key="p.id"
                  class="ch-modal-item ch-modal-item-check"
                  :class="{ selected: activeSystemPersonaIds.includes(p.id) }"
                >
                  <div class="ch-modal-check-box" :class="{ checked: activeSystemPersonaIds.includes(p.id) }">
                    <input type="checkbox" :checked="activeSystemPersonaIds.includes(p.id)" @change="toggleSystemPersona(p.id)" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;" />
                    <svg v-if="activeSystemPersonaIds.includes(p.id)" style="width:11px;height:11px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ch-modal-item-avatar">
                    <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                    <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="ch-modal-item-text">
                    <span class="ch-modal-item-name">{{ p.name }}</span>
                    <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                  </div>
                </label>
                <div v-if="personasStore.personasInCategory(cat.id).length === 0" class="ch-cat-empty">No personas</div>
              </div>
            </div>
            <!-- All (fallback) section — always last -->
            <div class="ch-cat-section">
              <button class="ch-cat-header" @click="toggleSysCat('__all__')">
                <svg class="ch-cat-chevron" :class="{ expanded: expandedSysCatIds.has('__all__') }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span class="ch-cat-name">All</span>
                <span class="ch-cat-count">{{ sortedSystemPersonas.length }}</span>
              </button>
              <div v-if="expandedSysCatIds.has('__all__')" class="ch-cat-items">
                <label
                  v-for="p in sortedSystemPersonas"
                  :key="p.id"
                  class="ch-modal-item ch-modal-item-check"
                  :class="{ selected: activeSystemPersonaIds.includes(p.id) }"
                >
                  <div class="ch-modal-check-box" :class="{ checked: activeSystemPersonaIds.includes(p.id) }">
                    <input type="checkbox" :checked="activeSystemPersonaIds.includes(p.id)" @change="toggleSystemPersona(p.id)" style="position:absolute;opacity:0;width:100%;height:100%;cursor:pointer;margin:0;" />
                    <svg v-if="activeSystemPersonaIds.includes(p.id)" style="width:11px;height:11px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ch-modal-item-avatar">
                    <img v-if="getAvatarDataUriForPersona(p)" :src="getAvatarDataUriForPersona(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
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

  <!-- ── System Persona Config Modal ── -->
  <Teleport to="body">
    <div v-if="sysPersonaConfigId" class="ch-modal-backdrop">
      <div class="ch-modal ch-modal-config" role="dialog" aria-modal="true">
        <div class="ch-modal-header">
          <div class="ch-modal-header-icon">
            <svg style="width:15px;height:15px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/></svg>
          </div>
          <div style="display:flex;flex-direction:column;gap:1px;min-width:0;">
            <span class="ch-modal-title">{{ personasStore.getPersonaById(sysPersonaConfigId)?.name || 'Persona' }}</span>
            <span v-if="personasStore.getPersonaById(sysPersonaConfigId)?.description" class="ch-modal-subtitle">{{ personasStore.getPersonaById(sysPersonaConfigId).description }}</span>
          </div>
          <div style="display:flex;align-items:center;gap:6px;margin-left:auto;">
            <button v-if="activeSystemPersonaIds.length > 1" class="ch-modal-soul-btn" @click="$emit('open-soul-viewer', sysPersonaConfigId, 'system', personasStore.getPersonaById(sysPersonaConfigId)?.name || 'System'); sysPersonaConfigId = null" title="View memory">
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a7 7 0 0 1 7 7c0 2.38-1.19 4.47-3 5.74V17a2 2 0 0 1-2 2h-4a2 2 0 0 1-2-2v-2.26C6.19 13.47 5 11.38 5 9a7 7 0 0 1 7-7z"/><line x1="10" y1="22" x2="14" y2="22"/></svg>
            </button>
            <button class="ch-modal-close" @click="sysPersonaConfigId = null">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
        </div>
        <div class="ch-modal-body" style="gap:16px;">
          <!-- Inactive provider warning -->
          <div v-if="isPersonaProviderInactive(sysPersonaConfigId)" class="ch-inactive-warn">
            &#9888; Provider inactive. Go to Configuration to fix.
          </div>
          <!-- Model override (chat-scoped) -->
          <div class="ch-cfg-section">
            <div class="ch-cfg-label">Model</div>
            <div class="ch-override-notice">
              Override for this chat only — won't be saved to the persona.
            </div>
            <ProviderModelPicker
              model-only
              :provider-label="sysConfigProviderLabel"
              :provider="sysConfigProvider"
              :model="chatModelOverride(sysPersonaConfigId)"
              @update:model="val => setChatModelOverride(sysPersonaConfigId, val)"
            />
            <button
              v-if="chatModelOverride(sysPersonaConfigId)"
              class="ch-override-clear"
              @click="setChatModelOverride(sysPersonaConfigId, null)"
            >
              Clear override (use persona default: {{ personaModelLabel(sysPersonaConfigId) }})
            </button>
          </div>
        </div>
        <div class="ch-modal-footer">
          <button class="ch-modal-cancel" @click="sysPersonaConfigId = null">Close</button>
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
      <div class="ch-config-tooltip-row"><span class="cct-key">Provider</span><span class="cct-val">{{ effectiveProviderLabel }}</span></div>
      <div class="ch-config-tooltip-row"><span class="cct-key">Model</span><span class="cct-val">{{ effectiveModelLabel }}</span></div>
      <div class="ch-config-tooltip-row"><span class="cct-key">Tools</span><span class="cct-val">{{ enabledHttpTools.length }}/{{ toolsStore.tools.length }} ({{ formatTokens(toolsTokenEstimate) }})</span></div>
      <div class="ch-config-tooltip-row"><span class="cct-key">MCP</span><span class="cct-val">{{ enabledMcpServers.length }}/{{ mcpStore.servers.length }} ({{ formatTokens(mcpTokenEstimate) }})</span></div>
      <div class="ch-config-tooltip-row"><span class="cct-key">RAG</span><span class="cct-val">{{ ragEnabledCount }} index{{ ragEnabledCount !== 1 ? 'es' : '' }}</span></div>
      <div class="ch-config-tooltip-row"><span class="cct-key">Path</span><span class="cct-val">{{ effectiveWorkingPath }}</span></div>
      <div class="ch-config-tooltip-row"><span class="cct-key">Rounds</span><span class="cct-val">{{ effectivePersonaRounds }}</span></div>
      <div class="ch-config-tooltip-row"><span class="cct-key">Max Tokens</span><span class="cct-val">{{ effectiveMaxOutputTokens.toLocaleString() }}</span></div>
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
          <span class="cct-key">Persona</span>
          <span class="cct-val">{{ personasStore.getPersonaById(activeSystemPersonaIds[0])?.name || '—' }}</span>
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
import { usePersonasStore } from '../../stores/personas'
import { useModelsStore } from '../../stores/models'
import { useToolsStore } from '../../stores/tools'
import { useMcpStore } from '../../stores/mcp'
import { useKnowledgeStore } from '../../stores/knowledge'
import { getAvatarDataUri } from '../personas/personaAvatars'
import ProviderModelPicker from '../common/ProviderModelPicker.vue'
import { estimateToolTokens, estimateMcpTokens, formatTokens } from '../../utils/tokenEstimate'
import { useVoiceStore } from '../../stores/voice'

const props = defineProps({
  chatId: { type: String, required: true },
  isGridView: { type: Boolean, default: false },
  compactPersonas: { type: Boolean, default: false },
})

const emit = defineEmits([
  'open-chat-settings',
  'open-soul-viewer',
  'remove-group-persona',
  'start-call',
  'enter-grid',
])

// Collapse state — starts collapsed in grid, expanded in single view
const headerExpanded = ref(!props.isGridView)
defineExpose({ headerExpanded })

const chatsStore = useChatsStore()
const configStore = useConfigStore()
const personasStore = usePersonasStore()
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
  if (sysPersonaConfigId.value) { sysPersonaConfigId.value = null; return }
  if (showGroupAddPopover.value) { showGroupAddPopover.value = false; return }
  if (showUsrPopover.value) { showUsrPopover.value = false; return }
}
onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

const isGroupChat = computed(() => chat.value?.isGroupChat ?? false)
const canStartCall = computed(() => {
  if (voiceStore.isCallActive) return false
  if (activeSystemPersonaIds.value.length !== 1) return false
  if (!configStore.config.voiceCall?.whisperApiKey) return false
  return true
})
const callButtonTooltip = computed(() => {
  if (voiceStore.isCallActive) return 'Call already in progress'
  const count = activeSystemPersonaIds.value.length
  if (count === 0) return 'Select a persona to start a call'
  if (count > 1) return 'Voice call requires exactly one persona'
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

// ── User persona popover ──
const showUsrPopover = ref(false)
const usrChipWrap = ref(null)
const expandedUserCatIds = ref(new Set())

// ── Group add popover ──
const showGroupAddPopover = ref(false)
const groupAddChipWrap = ref(null)
const personaSearchEl = ref(null)
const personaSearchQuery = ref('')
const expandedSysCatIds = ref(new Set())

// ── System persona config popover ──
const sysPersonaConfigId = ref(null)

// ── Own tooltip state (not shared with parent) ──
const tooltipState = reactive({ visible: false, name: '', text: '', x: 0, y: 0 })

// ── Persona computed ──
function getAvatarDataUriForPersona(persona) {
  if (!persona?.avatar) return null
  return getAvatarDataUri(persona.avatar)
}

const activeUserPersona = computed(() => {
  const id = chat.value?.userPersonaId
  return id ? personasStore.getPersonaById(id) : personasStore.defaultUserPersona
})
const activeUserAvatarDataUri = computed(() => getAvatarDataUriForPersona(activeUserPersona.value))
const activeUserPersonaName = computed(() => activeUserPersona.value?.name || 'Default')

const resolvedUserPersonaId = computed(() => {
  const id = chat.value?.userPersonaId
  return id || personasStore.defaultUserPersona?.id || null
})

const sortedUserPersonas = computed(() =>
  [...personasStore.userPersonas].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)

const sortedSystemPersonas = computed(() =>
  [...personasStore.systemPersonas].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)

const activeSystemPersonaIds = computed(() => {
  const c = chat.value
  if (!c) return []
  if (c.groupPersonaIds?.length > 0) return [...c.groupPersonaIds]
  const id = c.systemPersonaId || personasStore.defaultSystemPersona?.id
  return id ? [id] : []
})

const MAX_VISIBLE_AVATARS = 4
const visibleSystemPersonaIds = computed(() => activeSystemPersonaIds.value.slice(0, MAX_VISIBLE_AVATARS))
const overflowSystemCount = computed(() => Math.max(0, activeSystemPersonaIds.value.length - MAX_VISIBLE_AVATARS))

const filteredSystemPersonas = computed(() => {
  const q = personaSearchQuery.value.toLowerCase().trim()
  const list = sortedSystemPersonas.value
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

function selectPersona(type, id) {
  if (props.chatId) chatsStore.setChatPersona(props.chatId, type, id)
  showUsrPopover.value = false
}

function openPersonaCombobox() {
  showGroupAddPopover.value = !showGroupAddPopover.value
  if (showGroupAddPopover.value) {
    personaSearchQuery.value = ''
    expandedSysCatIds.value = new Set()
    nextTick(() => personaSearchEl.value?.focus())
  }
}

function toggleSystemPersona(personaId) {
  const chatId = props.chatId
  if (!chatId) return
  const c = chat.value
  const currentIds = activeSystemPersonaIds.value

  if (currentIds.includes(personaId)) {
    if (currentIds.length <= 1) return
    chatsStore.removeGroupPersona(chatId, personaId)
  } else {
    if (!c.isGroupChat) {
      chatsStore.toggleGroupMode(chatId, true)
    }
    chatsStore.addGroupPersona(chatId, personaId)
  }
}

// ── System avatar click: grid/group → soul viewer; normal → nothing ──
function onSysAvatarClick(pid) {
  if (props.compactPersonas || activeSystemPersonaIds.value.length > 1) {
    // Grid view or group chat: icon click opens soul viewer
    emit('open-soul-viewer', pid, 'system', personasStore.getPersonaById(pid)?.name || 'System')
  }
  // Normal single-persona view: no action on avatar click (use View Summary btn instead)
}

// ── System persona config popover ──
function openSysPersonaConfig(pid) {
  if (sysPersonaConfigId.value === pid) {
    sysPersonaConfigId.value = null
  } else {
    sysPersonaConfigId.value = pid
  }
}

// ── Chat-scope model override (does NOT touch persona) ──
function chatModelOverride(personaId) {
  return chat.value?.personaModelOverrides?.[personaId] || null
}

function setChatModelOverride(personaId, modelId) {
  if (!props.chatId) return
  chatsStore.setChatPersonaModelOverride(props.chatId, personaId, modelId)
}

function personaModelLabel(personaId) {
  return personasStore.getPersonaById(personaId)?.modelId || '(provider default)'
}

function isPersonaProviderInactive(personaId) {
  const p = personasStore.getPersonaById(personaId)
  if (!p?.providerId) return false
  return !configStore.config[p.providerId]?.isActive
}

const sysConfigProvider = computed(() => {
  if (!sysPersonaConfigId.value) return 'anthropic'
  const p = personasStore.getPersonaById(sysPersonaConfigId.value)
  return p?.providerId || 'anthropic'
})

const sysConfigProviderLabel = computed(() => {
  if (!sysPersonaConfigId.value) return ''
  const p = personasStore.getPersonaById(sysPersonaConfigId.value)
  const labels = { anthropic: 'Anthropic', openrouter: 'OpenRouter', openai: 'OpenAI', deepseek: 'DeepSeek' }
  return labels[p?.providerId] || p?.providerId || ''
})

// ── Persona tooltip (header-only) ──
function showPersonaTooltip(event, pid) {
  const persona = personasStore.getPersonaById(pid)
  if (!persona?.description) { tooltipState.visible = false; return }
  const rect = event.currentTarget.getBoundingClientRect()
  tooltipState.name = persona.name
  tooltipState.text = persona.description
  const tooltipWidth = 280
  let left = rect.left + rect.width / 2
  left = Math.max(tooltipWidth / 2 + 8, Math.min(left, window.innerWidth - tooltipWidth / 2 - 8))
  tooltipState.x = left
  tooltipState.y = rect.bottom + 10
  tooltipState.visible = true
}

function hidePersonaTooltip() {
  tooltipState.visible = false
}

// ── Chat Settings tooltip data ──
const effectiveProviderLabel = computed(() => {
  const c = chat.value
  if (!c) return '—'
  const personaId = activeSystemPersonaIds.value[0]
  if (!personaId) return '—'
  const persona = personasStore.getPersonaById(personaId)
  const labels = { anthropic: 'Anthropic', openrouter: 'OpenRouter', openai: 'OpenAI', deepseek: 'DeepSeek' }
  return labels[persona?.providerId] || '—'
})

const effectiveModelLabel = computed(() => {
  const c = chat.value
  if (!c) return '—'
  const personaId = activeSystemPersonaIds.value[0]
  if (!personaId) return '—'
  const override = c.personaModelOverrides?.[personaId]
  if (override) return `${override} (override)`
  return personasStore.getPersonaById(personaId)?.modelId || '—'
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
  return chat.value?.workingPath || configStore.config.artyfactPath || '~/.sparkai/artyfact'
})

const effectivePersonaRounds = computed(() => {
  return chat.value?.maxPersonaRounds ?? 10
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
  background: #F5F5F5;
  border: 1px solid #E5E5EA;
  transition: all 0.15s;
}
.ch-title-badge:hover {
  background: #EFEFEF;
  border-color: #D1D1D6;
}
.ch-title-icon {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
/* ── Running spinner (before title) ── */
.ch-title-spinner {
  flex-shrink: 0;
  width: 0.75rem;
  height: 0.75rem;
  border-radius: 50%;
  border: 2px solid transparent;
  border-top-color: #1A1A1A;
  border-right-color: rgba(26, 26, 26, 0.4);
  animation: ch-title-spin 0.7s linear infinite;
}
@keyframes ch-title-spin {
  to { transform: rotate(360deg); }
}

.chat-header-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  color: #1A1A1A;
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
  color: #9CA3AF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.ch-edit-btn:hover {
  background: #E5E5EA;
  color: #1A1A1A;
}

/* ── Inline edit mode (centered) ── */
.ch-title-edit {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.25rem 0.375rem 0.25rem 0.625rem;
  border-radius: 9999px;
  background: #FFFFFF;
  border: 1.5px solid #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0,0,0,0.06);
}
.ch-title-input {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  color: #1A1A1A;
  border: none;
  outline: none;
  background: transparent;
  width: 11.25rem;
  letter-spacing: -0.01em;
}
.ch-title-input::placeholder { color: #D1D1D6; }
.ch-edit-confirm {
  width: 1.5rem;
  height: 1.5rem;
  border-radius: 50%;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.ch-edit-confirm:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
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

/* ── Actions (right-aligned over the centered content) ── */
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
/* ── Row 2: Personas + Chat Settings ── */
.ch-row-bottom {
  display: flex;
  align-items: center;
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
  margin-left: auto;
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
  width: 2.25rem;
  height: 2.25rem;
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
/* ── Persona section layout ── */
.persona-section {
  display: flex;
  align-items: center;
  gap: 0.625rem;
}
.persona-group {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  position: relative;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  padding: 0.25rem 0.5rem;
  border-radius: 0.625rem;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

/* ── User persona card ── */
.persona-card-wrap {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.375rem;
}
.persona-card {
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
.persona-card-avatar {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  flex-shrink: 0;
}
.persona-card-avatar-img {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  object-fit: cover;
}
.persona-card-avatar-default {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
}
.persona-card-avatar-default.user {
  background: rgba(255,255,255,0.15);
}
.persona-card-info {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  min-width: 0;
}
.persona-card-name {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  flex-shrink: 0;
}
.persona-card-desc {
  font-size: 0.625rem;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 5rem;
}
.persona-card-summary-btn {
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 50%;
  border: none;
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.7);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
  flex-shrink: 0;
}
.persona-card-summary-btn:hover {
  background: rgba(255,255,255,0.25);
  color: #FFFFFF;
  transform: scale(1.1);
}

/* ── System personas: Teams-style avatar stack ── */
.sys-avatar-stack {
  display: flex;
  align-items: center;
}
.sys-avatar-item {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 50%;
  border: 2px solid rgba(255,255,255,0.2);
  margin-left: -0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  position: relative;
  transition: transform 0.15s, box-shadow 0.15s;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
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
  z-index: 10;
}
.sys-avatar-item:hover .sys-avatar-remove {
  opacity: 1;
}

/* System persona name label */
.sys-persona-label {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  margin-left: 0.25rem;
  flex-shrink: 0;
}
.sys-persona-name {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  flex-shrink: 0;
}
.sys-persona-desc {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 500;
  color: rgba(255,255,255,0.6);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  max-width: 6.25rem;
}

/* Add persona button */
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

/* ── Persona chip wrap ── */
.persona-chip-wrap {
  position: relative;
}
</style>

<!-- Global styles for teleported modals + tooltips (unscoped) -->
<style>
/* ── Persona modals (teleported) ── */
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
.ch-modal-config {
  width: min(22.5rem, 90vw);
  max-height: 70vh;
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
.ch-modal-soul-btn {
  width: 1.625rem; height: 1.625rem; border-radius: 0.4375rem;
  border: 1px solid #2A2A2A; background: #1A1A1A; color: #9CA3AF;
  display: flex; align-items: center; justify-content: center;
  cursor: pointer; transition: all 0.15s; flex-shrink: 0;
}
.ch-modal-soul-btn:hover { background: #2A2A2A; color: #FFFFFF; }
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

/* Category tree inside persona modals */
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
/* Config modal specific */
.ch-cfg-section { flex-shrink: 0; }
.ch-cfg-label {
  font-family: 'Inter', sans-serif; font-size: 0.625rem;
  font-weight: 700; text-transform: uppercase;
  letter-spacing: 0.06em; color: #4B5563; margin-bottom: 0.5rem;
}
.ch-override-notice {
  font-size: var(--fs-caption, 0.8125rem);
  margin-bottom: 0.5rem;
  padding: 0.375rem 0.625rem;
  background: rgba(251,191,36,0.08);
  border: 1px solid rgba(251,191,36,0.2);
  border-radius: var(--radius-sm, 8px);
  color: #D97706;
}
.ch-override-clear {
  margin-top: 0.5rem;
  font-size: var(--fs-caption, 0.8125rem);
  color: #9CA3AF;
  background: none;
  border: none;
  cursor: pointer;
  text-decoration: underline;
  padding: 0;
}
.ch-override-clear:hover { color: #FFFFFF; }
.ch-inactive-warn {
  font-size: var(--fs-caption, 0.8125rem);
  color: #EF4444;
  font-weight: 600;
  padding: 0.5rem 0.75rem;
  background: rgba(239,68,68,0.08);
  border-radius: var(--radius-sm, 8px);
  margin-bottom: 0.5rem;
}
.ch-modal-footer {
  padding: 0.625rem 1rem; border-top: 1px solid #1F1F1F;
  background: #0A0A0A; display: flex; justify-content: flex-end;
  flex-shrink: 0;
}
.ch-modal-cancel {
  padding: 0.4375rem 1rem; border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: 0.8125rem; font-weight: 600;
  border: 1px solid #2A2A2A; background: #1A1A1A; color: #9CA3AF; cursor: pointer; transition: all 0.15s;
}
.ch-modal-cancel:hover { background: #222; color: #FFFFFF; border-color: #374151; }

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

.ch-persona-tooltip-fixed {
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
.ch-persona-tooltip-name {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 700;
  color: #F5F5F5;
  margin-bottom: 0.25rem;
}
.ch-persona-tooltip-text {
  font-family: 'Inter', sans-serif;
  font-size: 0.75rem;
  font-weight: 400;
  color: #D1D1D6;
  line-height: 1.5;
}
</style>
