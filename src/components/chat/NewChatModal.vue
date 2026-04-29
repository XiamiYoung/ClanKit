<template>
  <!-- New Chat Modal -->
  <div v-if="visible" class="modal-dialog-backdrop">
    <div
      class="modal-dialog-container newchat-dialog"
      @keydown.escape="emit('close')"
      @keydown.enter.prevent="!$event.target.matches('input, textarea') && emit('confirm')"
    >
      <div class="modal-dialog-header">
        <h3 class="modal-dialog-title">{{ t('chats.newChat') }}</h3>
        <button class="modal-dialog-close-btn" @click="emit('close')" aria-label="Close">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>

      <div class="modal-dialog-body newchat-body">
        <!-- Row 1: Chat icon + name -->
        <div class="newchat-name-row-v2">
          <button class="newchat-icon-picker-btn" @click.stop="emit('update:showNewChatIconPicker', true)" :title="t('chats.chatIcon')">
            <span class="newchat-icon-display">{{ newChatIcon || '💬' }}</span>
            <svg class="newchat-icon-edit" style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round">
              <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
              <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
            </svg>
          </button>
          <input
            ref="newChatNameInputRef"
            :value="newChatName"
            @input="emit('update:newChatName', $event.target.value)"
            type="text"
            :placeholder="t('chats.chatNameOptional')"
            class="newchat-name-input"
          />
        </div>

        <!-- ── User Persona section ──────────────────────────────── -->
        <section class="np-section">
          <header class="np-section-header">
            <div class="np-section-title-row">
              <h4 class="np-section-title">{{ t('chats.userPersona') }}</h4>
              <span class="np-section-hint">{{ activeNewChatUserAgent?.name || t('common.default') }}</span>
            </div>
            <div class="np-search-wrap">
              <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                :value="newChatUserSearch"
                @input="emit('update:newChatUserSearch', $event.target.value)"
                type="text"
                :placeholder="t('chats.searchAgents')"
                class="np-search-input"
                @keydown.stop
              />
              <button v-if="newChatUserSearch" class="np-search-clear" @click="emit('update:newChatUserSearch', '')" :aria-label="t('common.clear')">
                <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </header>

          <!-- Search mode: flat grid -->
          <template v-if="newChatUserSearch.trim()">
            <div class="np-agent-grid np-agent-grid--scroll" v-if="filteredNewChatUsers.length > 0">
              <AgentCardItem
                v-for="p in filteredNewChatUsers"
                :key="p.id"
                :agent="p"
                :selected="isUserSelected(p.id)"
                :show-default="p.id === defaultUserAgentId"
                kind="user"
                @click="emit('select-new-chat-user-agent', p.id)"
              />
            </div>
            <div v-else class="np-empty">{{ t('chats.noAgentsMatch') }}</div>
          </template>

          <!-- Grouped mode: by category -->
          <template v-else>
            <div class="np-grouped-list" v-if="sortedUserAgents.length > 0">
              <div class="np-cat-group np-cat-group--default" v-if="defaultUserAgent">
                <div class="np-cat-group-header">
                  <span class="np-cat-group-emoji">⭐</span>
                  <span class="np-cat-group-name">{{ t('common.default') }}</span>
                </div>
                <div class="np-agent-grid np-agent-grid--in-group">
                  <AgentCardItem
                    :agent="defaultUserAgent"
                    :selected="isUserSelected(defaultUserAgent.id)"
                    :show-default="true"
                    kind="user"
                    @click="emit('select-new-chat-user-agent', defaultUserAgent.id)"
                  />
                </div>
              </div>
              <template v-for="cat in agentsStore.userCategories" :key="cat.id">
                <div class="np-cat-group" v-if="agentsInUserCat(cat.id).length > 0">
                  <div class="np-cat-group-header">
                    <span v-if="cat.emoji" class="np-cat-group-emoji">{{ cat.emoji }}</span>
                    <span class="np-cat-group-name">{{ cat.name }}</span>
                    <span class="np-cat-group-count">{{ agentsInUserCat(cat.id).length }}</span>
                  </div>
                  <div class="np-agent-grid np-agent-grid--in-group">
                    <AgentCardItem
                      v-for="p in agentsInUserCat(cat.id)"
                      :key="p.id"
                      :agent="p"
                      :selected="isUserSelected(p.id)"
                      :show-default="p.id === defaultUserAgentId"
                      kind="user"
                      @click="emit('select-new-chat-user-agent', p.id)"
                    />
                  </div>
                </div>
              </template>
              <div class="np-cat-group" v-if="uncategorizedUserAgents.length > 0">
                <div class="np-cat-group-header">
                  <span class="np-cat-group-name">{{ t('agents.uncategorized') }}</span>
                  <span class="np-cat-group-count">{{ uncategorizedUserAgents.length }}</span>
                </div>
                <div class="np-agent-grid np-agent-grid--in-group">
                  <AgentCardItem
                    v-for="p in uncategorizedUserAgents"
                    :key="p.id"
                    :agent="p"
                    :selected="isUserSelected(p.id)"
                    :show-default="p.id === defaultUserAgentId"
                    kind="user"
                    @click="emit('select-new-chat-user-agent', p.id)"
                  />
                </div>
              </div>
            </div>
            <div v-else class="np-empty">{{ t('agents.noUserAgents', 'No user agents yet') }}</div>
          </template>
        </section>

        <!-- ── System Agents section ────────────────────────────── -->
        <section class="np-section">
          <header class="np-section-header">
            <div class="np-section-title-row">
              <h4 class="np-section-title">{{ t('chats.systemAgents') }}</h4>
              <span class="np-section-hint">
                {{ newChatAgentIds.length === 0
                  ? t('chats.defaultSystemPersona')
                  : t('chats.systemPersonaSelected', undefined, { count: newChatAgentIds.length }) }}
              </span>
            </div>
            <div class="np-search-wrap">
              <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
              <input
                :value="newChatAgentSearch"
                @input="emit('update:newChatAgentSearch', $event.target.value)"
                type="text"
                :placeholder="t('chats.searchAgents')"
                class="np-search-input"
                @keydown.stop
              />
              <button v-if="newChatAgentSearch" class="np-search-clear" @click="emit('update:newChatAgentSearch', '')" :aria-label="t('common.clear')">
                <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </header>

          <!-- Search mode: flat grid -->
          <template v-if="newChatAgentSearch.trim()">
            <div class="np-agent-grid np-agent-grid--scroll" v-if="filteredNewChatAgents.length > 0">
              <AgentCardItem
                v-for="p in filteredNewChatAgents"
                :key="p.id"
                :agent="p"
                :selected="newChatAgentIds.includes(p.id)"
                :show-default="p.id === defaultSystemAgentId"
                kind="system"
                @click="emit('toggle-new-chat-agent', p.id)"
              />
            </div>
            <div v-else class="np-empty">{{ t('chats.noAgentsMatch') }}</div>
          </template>

          <!-- Grouped mode: by category -->
          <template v-else>
            <div class="np-grouped-list" v-if="sortedSystemAgents.length > 0">
              <div class="np-cat-group np-cat-group--default" v-if="defaultSystemAgent">
                <div class="np-cat-group-header">
                  <span class="np-cat-group-emoji">⭐</span>
                  <span class="np-cat-group-name">{{ t('common.default') }}</span>
                </div>
                <div class="np-agent-grid np-agent-grid--in-group">
                  <AgentCardItem
                    :agent="defaultSystemAgent"
                    :selected="newChatAgentIds.includes(defaultSystemAgent.id)"
                    :show-default="true"
                    kind="system"
                    @click="emit('toggle-new-chat-agent', defaultSystemAgent.id)"
                  />
                </div>
              </div>
              <template v-for="cat in agentsStore.systemCategories" :key="cat.id">
                <div class="np-cat-group" v-if="agentsInSystemCat(cat.id).length > 0">
                  <div class="np-cat-group-header">
                    <span v-if="cat.emoji" class="np-cat-group-emoji">{{ cat.emoji }}</span>
                    <span class="np-cat-group-name">{{ cat.name }}</span>
                    <span class="np-cat-group-count">{{ agentsInSystemCat(cat.id).length }}</span>
                  </div>
                  <div class="np-agent-grid np-agent-grid--in-group">
                    <AgentCardItem
                      v-for="p in agentsInSystemCat(cat.id)"
                      :key="p.id"
                      :agent="p"
                      :selected="newChatAgentIds.includes(p.id)"
                      :show-default="p.id === defaultSystemAgentId"
                      kind="system"
                      @click="emit('toggle-new-chat-agent', p.id)"
                    />
                  </div>
                </div>
              </template>
              <div class="np-cat-group" v-if="uncategorizedSystemAgents.length > 0">
                <div class="np-cat-group-header">
                  <span class="np-cat-group-name">{{ t('agents.uncategorized') }}</span>
                  <span class="np-cat-group-count">{{ uncategorizedSystemAgents.length }}</span>
                </div>
                <div class="np-agent-grid np-agent-grid--in-group">
                  <AgentCardItem
                    v-for="p in uncategorizedSystemAgents"
                    :key="p.id"
                    :agent="p"
                    :selected="newChatAgentIds.includes(p.id)"
                    :show-default="p.id === defaultSystemAgentId"
                    kind="system"
                    @click="emit('toggle-new-chat-agent', p.id)"
                  />
                </div>
              </div>
            </div>
            <div v-else class="np-empty">{{ t('agents.noSystemAgents', 'No system agents yet') }}</div>
          </template>
        </section>

        <!-- ── Folder tree selector ─────────────────────────────── -->
        <div v-if="chatsStore.chatTree.some(n => n.type === 'folder')" class="newchat-folder-tree-wrap">
          <div class="newchat-folder-tree-label">{{ t('chats.saveToFolder') }}</div>
          <div class="newchat-folder-tree">
            <button
              class="newchat-ftree-item"
              v-bind="newChatFolderId === null ? { 'data-active': '' } : {}"
              @click="emit('update:newChatFolderId', null)"
            >
              <svg style="width:14px;height:14px;flex-shrink:0;opacity:0.75;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span>{{ t('chats.rootNoFolder') }}</span>
            </button>
            <template v-for="node in chatsStore.chatTree" :key="node.id">
              <FolderTreeItem
                v-if="node.type === 'folder'"
                :node="node"
                :depth="0"
                :selected-id="newChatFolderId"
                :expanded-ids="newChatFolderTreeExpanded"
                @select="emit('update:newChatFolderId', $event)"
                @toggle="emit('toggle-new-chat-folder-expand', $event)"
              />
            </template>
          </div>
        </div>
      </div>

      <div class="modal-dialog-actions">
        <AppButton variant="secondary" size="modal" @click="emit('close')">{{ t('common.cancel') }}</AppButton>
        <AppButton size="modal" @click="emit('confirm')">{{ t('common.create') }}</AppButton>
      </div>
    </div>
  </div>

  <EmojiPicker
    v-if="showNewChatIconPicker"
    :current="newChatIcon"
    @select="emit('on-new-chat-icon-select', $event)"
    @close="emit('update:showNewChatIconPicker', false)"
  />
</template>

<script setup>
import { defineComponent, ref, computed, h } from 'vue'
import AppButton from '../common/AppButton.vue'
import EmojiPicker from '../agents/EmojiPicker.vue'
import { useI18n } from '../../i18n/useI18n'
import { useChatsStore } from '../../stores/chats'
import { useAgentsStore } from '../../stores/agents'
import { getAvatarDataUri } from '../agents/agentAvatars'
import AgentCardItem from './AgentCardItem.js'

const { t } = useI18n()
const chatsStore = useChatsStore()
const agentsStore = useAgentsStore()

const props = defineProps({
  visible: Boolean,
  newChatName: { type: String, default: '' },
  newChatIcon: { type: String, default: '' },
  newChatUserAgentId: { type: String, default: null },
  newChatFolderId: { type: String, default: null },
  newChatAgentIds: { type: Array, default: () => [] },
  showNewChatIconPicker: Boolean,
  newChatAgentSearch: { type: String, default: '' },
  newChatAgentCategoryId: { type: String, default: '__all__' },
  newChatUserSearch: { type: String, default: '' },
  newChatUserCategoryId: { type: String, default: '__all__' },
  newChatFolderTreeExpanded: { type: Object, default: () => new Set() },
  filteredNewChatAgents: { type: Array, default: () => [] },
  filteredNewChatUsers: { type: Array, default: () => [] },
  activeNewChatUserAgent: { type: Object, default: null },
  effectiveNewChatUserAgentId: { type: String, default: null },
  displayedSystemPersonaAgents: { type: Array, default: () => [] },
  sortedSystemAgents: { type: Array, default: () => [] },
  sortedUserAgents: { type: Array, default: () => [] },
})

const emit = defineEmits([
  'close',
  'confirm',
  'update:newChatName',
  'update:newChatIcon',
  'update:newChatFolderId',
  'update:newChatAgentSearch',
  'update:newChatUserSearch',
  'update:showNewChatIconPicker',
  'select-new-chat-agent-category',
  'select-new-chat-user-category',
  'toggle-new-chat-agent',
  'toggle-new-chat-folder-expand',
  'select-new-chat-user-agent',
  'clear-new-chat-user-selection',
  'remove-new-chat-system-agent',
  'on-new-chat-icon-select',
])

const newChatNameInputRef = ref(null)
defineExpose({ newChatNameInputRef })

function isUserSelected(agentId) {
  return props.effectiveNewChatUserAgentId === agentId
}

const defaultSystemAgentId = computed(() => agentsStore.defaultSystemAgent?.id || null)
const defaultUserAgentId = computed(() => agentsStore.defaultUserAgent?.id || null)

// ── Grouping helpers — operate on the already-sorted/typed arrays from props ──
// The default agent renders in a dedicated top group (see template); exclude
// it from category and uncategorized groups so it doesn't appear twice.
function agentsInUserCat(catId) {
  return props.sortedUserAgents.filter(a =>
    a.id !== defaultUserAgentId.value &&
    Array.isArray(a.categoryIds) && a.categoryIds.includes(catId)
  )
}
function agentsInSystemCat(catId) {
  return props.sortedSystemAgents.filter(a =>
    a.id !== defaultSystemAgentId.value &&
    Array.isArray(a.categoryIds) && a.categoryIds.includes(catId)
  )
}
const uncategorizedUserAgents = computed(() =>
  props.sortedUserAgents.filter(a =>
    a.id !== defaultUserAgentId.value &&
    (!Array.isArray(a.categoryIds) || a.categoryIds.length === 0)
  )
)
const uncategorizedSystemAgents = computed(() =>
  props.sortedSystemAgents.filter(a =>
    a.id !== defaultSystemAgentId.value &&
    (!Array.isArray(a.categoryIds) || a.categoryIds.length === 0)
  )
)
const defaultUserAgent = computed(() =>
  props.sortedUserAgents.find(a => a.id === defaultUserAgentId.value) || null
)
const defaultSystemAgent = computed(() =>
  props.sortedSystemAgents.find(a => a.id === defaultSystemAgentId.value) || null
)

// ── FolderTreeItem — recursive folder picker for new chat modal ──
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
        node.children?.some(c => c.type === 'folder')
          ? h('svg', {
              style: { width: '12px', height: '12px', flexShrink: 0, opacity: 0.6, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' },
              viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5',
              onClick: (e) => { e.stopPropagation(); emit('toggle', node.id) },
            }, [h('polyline', { points: '9 18 15 12 9 6' })])
          : h('span', { style: 'width:12px;display:inline-block;flex-shrink:0;' }),
        h('span', { style: { fontSize: '13px', lineHeight: '1', flexShrink: 0, userSelect: 'none' } }, node.emoji || '\u{1F4C1}'),
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
</script>

<style>
/* ── Modal sizing override (wider than the default modal-dialog-container) ──
   Compound selector to outrank the global `.modal-dialog-container` width rule
   in style.css (both single-class otherwise → loading order would decide). */
.modal-dialog-container.newchat-dialog {
  width: min(64rem, 96vw);
  max-height: 90vh;
  display: flex;
  flex-direction: column;
}
.modal-dialog-container.newchat-dialog .newchat-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 1rem;
}

/* ── Chat name row ──────────────────────────────────────────────────────── */
.newchat-name-row-v2 {
  display: flex;
  align-items: stretch;
  gap: 0.625rem;
}
.newchat-name-input {
  flex: 1;
  min-width: 0;
  height: 2.75rem;
  padding: 0 0.75rem;
  border-radius: 0.625rem;
  border: 1px solid #2A2A2A;
  background: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  font-weight: 500;
  color: #FFFFFF;
  outline: none;
  box-sizing: border-box;
}
.newchat-name-input::placeholder { color: #4B5563; font-weight: 400; }
.newchat-name-input:focus { border-color: #4B5563; }

.newchat-icon-picker-btn {
  position: relative;
  width: 3.5rem;
  height: 2.75rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  background: #1A1A1A;
  cursor: pointer;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  transition: border-color 0.15s, background 0.15s;
  flex-shrink: 0;
}
.newchat-icon-picker-btn:hover {
  border-color: #4B5563;
  background: #202020;
}
.newchat-icon-display { font-size: 1.25rem; line-height: 1; }
.newchat-icon-edit {
  position: absolute;
  right: 0.25rem;
  bottom: 0.25rem;
  color: #9CA3AF;
}

/* ── Section (User Persona / System Agents) ─────────────────────────── */
.np-section {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  background: #0B0B0B;
  border: 1px solid #1F1F1F;
  border-radius: 0.75rem;
  padding: 0.75rem;
}
.np-section-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-wrap: wrap;
}
.np-section-title-row {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  flex: 1;
  min-width: 0;
}
.np-section-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #E5E5EA;
  margin: 0;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.np-section-hint {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #6B7280;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  min-width: 0;
}

.np-search-wrap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  padding: 0.3125rem 0.5rem;
  width: 14rem;
  flex-shrink: 0;
  color: #6B7280;
  transition: border-color 0.12s;
}
.np-search-wrap:focus-within { border-color: #4B5563; }
.np-search-input {
  flex: 1;
  min-width: 0;
  border: none;
  outline: none;
  background: transparent;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
}
.np-search-input::placeholder { color: #4B5563; }
.np-search-clear {
  width: 1rem; height: 1rem;
  border: none; background: transparent;
  border-radius: 0.25rem;
  color: #6B7280;
  cursor: pointer;
  display: flex; align-items: center; justify-content: center;
}
.np-search-clear:hover { background: #2A2A2A; color: #FFFFFF; }

/* ── Grouped list (no-search mode) — bounded scroll container ───────── */
.np-grouped-list {
  max-height: 22rem;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 0.125rem;
}
.np-cat-group {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.np-cat-group-header {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  padding: 0.125rem 0.25rem;
  font-family: 'Inter', sans-serif;
}
.np-cat-group-emoji { font-size: 0.875rem; line-height: 1; }
.np-cat-group-name {
  font-size: 0.6875rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: #9CA3AF;
}
.np-cat-group-count {
  font-size: 0.625rem;
  font-weight: 600;
  background: rgba(255,255,255,0.08);
  color: #6B7280;
  padding: 0.0625rem 0.4375rem;
  border-radius: 9999px;
}

/* Agent grid — used both for search-mode (scrollable) and grouped-mode (in-group, container scrolls) */
.np-agent-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(15rem, 1fr));
  gap: 0.4375rem;
  padding: 0.125rem;
}
.np-agent-grid--scroll {
  max-height: 22rem;
  overflow-y: auto;
}
.np-agent-grid--in-group {
  max-height: none;
  overflow: visible;
  padding: 0;
}

.np-agent-card {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  background: #131313;
  border: 1px solid #232323;
  border-radius: 0.625rem;
  cursor: pointer;
  text-align: left;
  transition: all 0.12s;
  color: inherit;
  font: inherit;
  min-width: 0;
}
.np-agent-card:hover {
  background: #1A1A1A;
  border-color: #374151;
}
.np-agent-card.selected {
  background: linear-gradient(135deg, #161E2E 0%, #1F2937 100%);
  border-color: #4B5563;
  box-shadow: 0 1px 6px rgba(0,0,0,0.25);
}

.np-agent-avatar {
  width: 2rem;
  height: 2rem;
  border-radius: 50%;
  flex-shrink: 0;
  overflow: hidden;
  background: #1F1F1F;
  display: flex; align-items: center; justify-content: center;
}
.np-agent-avatar img { width: 100%; height: 100%; object-fit: cover; }
.np-agent-avatar-fb {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #9CA3AF;
}

.np-agent-meta {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.0625rem;
}
.np-agent-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  color: #E5E5EA;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.np-agent-card.selected .np-agent-name { color: #FFFFFF; }
.np-agent-desc {
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  color: #6B7280;
  line-height: 1.3;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.np-agent-card.selected .np-agent-desc { color: rgba(255,255,255,0.55); }

.np-agent-badge {
  position: absolute;
  top: 0.25rem;
  right: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.5625rem;
  font-weight: 600;
  letter-spacing: 0.03em;
  text-transform: uppercase;
  color: #9CA3AF;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.08);
  padding: 0.0625rem 0.3125rem;
  border-radius: 0.25rem;
}

.np-agent-check,
.np-agent-radio {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 0.3125rem;
  border: 1.5px solid #4B5563;
  background: transparent;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: #FFFFFF;
}
.np-agent-radio { border-radius: 50%; }
.np-agent-check--selected,
.np-agent-radio--selected {
  background: rgba(255,255,255,0.18);
  border-color: rgba(255,255,255,0.45);
}

.np-empty {
  padding: 1.25rem 0.875rem;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #4B5563;
  background: #131313;
  border: 1px dashed #232323;
  border-radius: 0.5rem;
}

/* ── Folder tree selector (unchanged) ──────────────────────────────── */
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
  padding: 0.25rem;
  display: flex; flex-direction: column; gap: 1px;
}
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
