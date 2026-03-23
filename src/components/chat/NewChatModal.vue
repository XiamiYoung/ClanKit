<template>
  <!-- New Chat Modal -->
  <div v-if="visible" class="rename-backdrop">
    <div class="rename-modal" style="width:min(460px, 90vw);" @keydown.escape="emit('close')" @keydown.enter.prevent="emit('confirm')">
      <div class="rename-header">
        <h3 class="rename-title">{{ t('chats.newChat') }}</h3>
        <button class="rename-close-btn" @click="emit('close')" aria-label="Close">
          <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
        </button>
      </div>
      <div style="padding:1rem 1.25rem 1.25rem; display:flex; flex-direction:column; gap:0.875rem;">
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

        <div class="newchat-field-stack">
          <div class="newchat-folder-tree-label">{{ t('chats.userPersona') }}</div>
          <button class="newchat-agent-row-btn" @click.stop="emit('update:showNewChatUserPopover', true)" :title="t('chats.userPersona')">
            <div class="newchat-agent-cfg-avatars" v-if="activeNewChatUserAgent">
              <img v-if="getAvatarDataUriForAgent(activeNewChatUserAgent)" :src="getAvatarDataUriForAgent(activeNewChatUserAgent)" alt="" class="newchat-agent-cfg-avatar-img" />
              <span v-else class="newchat-agent-cfg-avatar-fb">{{ (activeNewChatUserAgent.name || '?').charAt(0) }}</span>
            </div>
            <svg v-else style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
            </svg>
            <span class="newchat-agent-row-label">{{ activeNewChatUserAgent?.name || t('common.default') }}</span>
          </button>
          <div v-if="activeNewChatUserAgent" class="newchat-selected-preview">
            <div class="newchat-selected-agent-chip">
              <img v-if="getAvatarDataUriForAgent(activeNewChatUserAgent)" :src="getAvatarDataUriForAgent(activeNewChatUserAgent)" alt="" class="newchat-selected-agent-avatar" />
              <span v-else class="newchat-selected-agent-fallback">{{ (activeNewChatUserAgent.name || '?').charAt(0) }}</span>
              <span class="newchat-selected-agent-name">{{ activeNewChatUserAgent.name }}</span>
              <button
                v-if="newChatUserAgentId"
                class="newchat-selected-agent-remove"
                @click.stop="emit('clear-new-chat-user-selection')"
                :aria-label="t('common.remove')"
                :title="t('common.remove')"
              >
                <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </div>
        </div>

        <div class="newchat-field-stack">
          <div class="newchat-folder-tree-label">{{ t('chats.systemAgents') }}</div>
          <button class="newchat-agent-row-btn" @click.stop="emit('update:showNewChatAgentPopover', true)" :title="t('chats.configureAgents')">
            <div class="newchat-agent-cfg-avatars" v-if="newChatAgentIds.length > 0">
              <template v-for="(pid, i) in newChatAgentIds.slice(0, 3)" :key="pid">
                <img v-if="getAvatarDataUriForAgent(agentsStore.getAgentById(pid))" :src="getAvatarDataUriForAgent(agentsStore.getAgentById(pid))" alt="" class="newchat-agent-cfg-avatar-img" :style="{ zIndex: 10 - i }" />
                <span v-else class="newchat-agent-cfg-avatar-fb" :style="{ zIndex: 10 - i }">{{ (agentsStore.getAgentById(pid)?.name || '?').charAt(0) }}</span>
              </template>
              <span v-if="newChatAgentIds.length > 3" class="newchat-agent-cfg-avatar-fb newchat-agent-cfg-overflow" :style="{ zIndex: 5 }">+{{ newChatAgentIds.length - 3 }}</span>
            </div>
            <svg v-else style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
            </svg>
            <span class="newchat-agent-row-label">{{ displayedSystemPersonaAgents.length > 0 ? t('common.selected') + ': ' + displayedSystemPersonaAgents.length : t('common.default') }}</span>
          </button>
          <div v-if="displayedSystemPersonaAgents.length > 0" class="newchat-selected-preview">
            <div v-for="p in displayedSystemPersonaAgents" :key="p.id" class="newchat-selected-agent-chip">
              <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" class="newchat-selected-agent-avatar" />
              <span v-else class="newchat-selected-agent-fallback">{{ (p.name || '?').charAt(0) }}</span>
              <span class="newchat-selected-agent-name">{{ p.name }}</span>
              <button
                v-if="newChatAgentIds.includes(p.id)"
                class="newchat-selected-agent-remove"
                @click.stop="emit('remove-new-chat-system-agent', p.id)"
                :aria-label="t('common.remove')"
                :title="t('common.remove')"
              >
                <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </button>
            </div>
          </div>
        </div>

        <!-- Row 2: Folder tree selector -->
        <div v-if="chatsStore.chatTree.some(n => n.type === 'folder')" class="newchat-folder-tree-wrap">
          <div class="newchat-folder-tree-label">{{ t('chats.saveToFolder') }}</div>
          <div class="newchat-folder-tree">
            <!-- Root option -->
            <button
              class="newchat-ftree-item"
              v-bind="newChatFolderId === null ? { 'data-active': '' } : {}"
              @click="emit('update:newChatFolderId', null)"
            >
              <svg style="width:14px;height:14px;flex-shrink:0;opacity:0.75;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
              <span>{{ t('chats.rootNoFolder') }}</span>
            </button>
            <!-- Recursive folder tree -->
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
      <div class="rename-actions">
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

  <!-- New Chat Agent Picker Dialog (dark, CCM-style) -->
  <Teleport to="body">
    <div v-if="showNewChatAgentPopover" class="ncp-backdrop">
      <div class="ncp-dialog">
        <!-- Header -->
        <div class="ncp-header">
          <div class="ncp-header-left">
            <div class="ncp-header-icon">
              <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h2 class="ncp-title">{{ t('chats.systemAgents') }}</h2>
            <span class="ncp-badge">{{ newChatAgentIds.length }} {{ t('common.selected') }}</span>
          </div>
          <button class="ncp-close" @click="emit('update:showNewChatAgentPopover', false)">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- Search -->
        <div class="ncp-search-bar">
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref="newChatAgentSearchEl"
            :value="newChatAgentSearch"
            @input="emit('update:newChatAgentSearch', $event.target.value)"
            type="text"
            :placeholder="t('chats.searchAgents')"
            class="ncp-search-input"
            @keydown.stop
          />
          <button v-if="newChatAgentSearch" class="ncp-search-clear" @click="emit('update:newChatAgentSearch', '')">
            <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- Agent list -->
        <div class="ncp-list">
          <!-- When searching: flat filtered list -->
          <template v-if="newChatAgentSearch.trim()">
            <label
              v-for="p in filteredNewChatAgents"
              :key="p.id"
              class="ncp-item"
              :class="{ selected: newChatAgentIds.includes(p.id) }"
            >
              <div class="ncp-check">
                <input type="checkbox" :checked="newChatAgentIds.includes(p.id)" @change="emit('toggle-new-chat-agent', p.id)" />
                <svg v-if="newChatAgentIds.includes(p.id)" class="ncp-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="ncp-avatar">
                <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" class="ncp-avatar-img" />
                <span v-else class="ncp-avatar-fallback">{{ p.name.charAt(0) }}</span>
              </div>
              <div class="ncp-info">
                <span class="ncp-name">{{ p.name }}</span>
                <span v-if="p.description" class="ncp-desc">{{ p.description }}</span>
              </div>
            </label>
            <div v-if="filteredNewChatAgents.length === 0" class="ncp-empty">{{ t('chats.noAgentsMatch') }}</div>
          </template>
          <!-- No search: category tree -->
          <template v-else>
            <!-- System categories -->
            <div v-for="cat in agentsStore.systemCategories" :key="cat.id" class="ncp-cat-section">
              <button class="ncp-cat-header" @click="emit('toggle-ncp-cat', cat.id)">
                <svg class="ncp-cat-chevron" :class="{ expanded: ncpExpandedCatIds.has(cat.id) }" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span v-if="cat.emoji" class="ncp-cat-emoji">{{ cat.emoji }}</span>
                <span class="ncp-cat-name">{{ cat.name }}</span>
                <span class="ncp-cat-count">{{ agentsStore.agentsInCategory(cat.id).length }}</span>
              </button>
              <div v-if="ncpExpandedCatIds.has(cat.id)" class="ncp-cat-items">
                <label
                  v-for="p in agentsStore.agentsInCategory(cat.id)"
                  :key="p.id"
                  class="ncp-item"
                  :class="{ selected: newChatAgentIds.includes(p.id) }"
                >
                  <div class="ncp-check">
                    <input type="checkbox" :checked="newChatAgentIds.includes(p.id)" @change="emit('toggle-new-chat-agent', p.id)" />
                    <svg v-if="newChatAgentIds.includes(p.id)" class="ncp-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ncp-avatar">
                    <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" class="ncp-avatar-img" />
                    <span v-else class="ncp-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="ncp-info">
                    <span class="ncp-name">{{ p.name }}</span>
                    <span v-if="p.description" class="ncp-desc">{{ p.description }}</span>
                  </div>
                </label>
                <div v-if="agentsStore.agentsInCategory(cat.id).length === 0" class="ncp-empty" style="padding: 0.375rem 0.5rem; font-size: 0.75rem; font-style: italic;">No agents</div>
              </div>
            </div>
            <!-- All (fallback) section — always last -->
            <div class="ncp-cat-section">
              <button class="ncp-cat-header" @click="emit('toggle-ncp-cat', '__all__')">
                <svg class="ncp-cat-chevron" :class="{ expanded: ncpExpandedCatIds.has('__all__') }" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span class="ncp-cat-name">{{ t('common.all') }}</span>
                <span class="ncp-cat-count">{{ sortedSystemAgents.length }}</span>
              </button>
              <div v-if="ncpExpandedCatIds.has('__all__')" class="ncp-cat-items">
                <label
                  v-for="p in sortedSystemAgents"
                  :key="p.id"
                  class="ncp-item"
                  :class="{ selected: newChatAgentIds.includes(p.id) }"
                >
                  <div class="ncp-check">
                    <input type="checkbox" :checked="newChatAgentIds.includes(p.id)" @change="emit('toggle-new-chat-agent', p.id)" />
                    <svg v-if="newChatAgentIds.includes(p.id)" class="ncp-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ncp-avatar">
                    <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" class="ncp-avatar-img" />
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
          <span class="ncp-footer-hint">{{ newChatAgentIds.length === 0 ? t('chats.defaultSystemPersona') : t('chats.systemPersonaSelected', undefined, { count: newChatAgentIds.length }) }}</span>
          <button class="ncp-done-btn" @click="emit('update:showNewChatAgentPopover', false)">{{ t('common.done') }}</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- New Chat User Persona Picker Dialog (single-select) -->
  <Teleport to="body">
    <div v-if="showNewChatUserPopover" class="ncp-backdrop">
      <div class="ncp-dialog">
        <div class="ncp-header">
          <div class="ncp-header-left">
            <div class="ncp-header-icon">
              <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>
              </svg>
            </div>
            <h2 class="ncp-title">{{ t('chats.userPersona') }}</h2>
          </div>
          <button class="ncp-close" @click="emit('update:showNewChatUserPopover', false)">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div class="ncp-search-bar">
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input
            ref="newChatUserSearchEl"
            :value="newChatUserSearch"
            @input="emit('update:newChatUserSearch', $event.target.value)"
            type="text"
            :placeholder="t('chats.searchAgents')"
            class="ncp-search-input"
            @keydown.stop
          />
          <button v-if="newChatUserSearch" class="ncp-search-clear" @click="emit('update:newChatUserSearch', '')">
            <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <div class="ncp-list">
          <template v-if="newChatUserSearch.trim()">
            <label
              v-for="p in filteredNewChatUsers"
              :key="p.id"
              class="ncp-item"
              :class="{ selected: isUserSelected(p.id) }"
            >
              <div class="ncp-check">
                <input type="radio" name="newchat-user-persona" :checked="isUserSelected(p.id)" @change="emit('select-new-chat-user-agent', p.id)" />
                <svg v-if="isUserSelected(p.id)" class="ncp-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
              </div>
              <div class="ncp-avatar">
                <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" class="ncp-avatar-img" />
                <span v-else class="ncp-avatar-fallback">{{ p.name.charAt(0) }}</span>
              </div>
              <div class="ncp-info">
                <span class="ncp-name">{{ p.name }}</span>
                <span v-if="p.description" class="ncp-desc">{{ p.description }}</span>
              </div>
            </label>
            <div v-if="filteredNewChatUsers.length === 0" class="ncp-empty">{{ t('chats.noAgentsMatch') }}</div>
          </template>

          <template v-else>
            <div v-for="cat in agentsStore.userCategories" :key="cat.id" class="ncp-cat-section">
              <button class="ncp-cat-header" @click="emit('toggle-nup-cat', cat.id)">
                <svg class="ncp-cat-chevron" :class="{ expanded: nupExpandedCatIds.has(cat.id) }" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span v-if="cat.emoji" class="ncp-cat-emoji">{{ cat.emoji }}</span>
                <span class="ncp-cat-name">{{ cat.name }}</span>
                <span class="ncp-cat-count">{{ agentsStore.agentsInCategory(cat.id).length }}</span>
              </button>
              <div v-if="nupExpandedCatIds.has(cat.id)" class="ncp-cat-items">
                <label
                  v-for="p in agentsStore.agentsInCategory(cat.id)"
                  :key="p.id"
                  class="ncp-item"
                  :class="{ selected: isUserSelected(p.id) }"
                >
                  <div class="ncp-check">
                    <input type="radio" name="newchat-user-persona" :checked="isUserSelected(p.id)" @change="emit('select-new-chat-user-agent', p.id)" />
                    <svg v-if="isUserSelected(p.id)" class="ncp-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ncp-avatar">
                    <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" class="ncp-avatar-img" />
                    <span v-else class="ncp-avatar-fallback">{{ p.name.charAt(0) }}</span>
                  </div>
                  <div class="ncp-info">
                    <span class="ncp-name">{{ p.name }}</span>
                    <span v-if="p.description" class="ncp-desc">{{ p.description }}</span>
                  </div>
                </label>
              </div>
            </div>

            <div class="ncp-cat-section">
              <button class="ncp-cat-header" @click="emit('toggle-nup-cat', '__all__')">
                <svg class="ncp-cat-chevron" :class="{ expanded: nupExpandedCatIds.has('__all__') }" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                <span class="ncp-cat-name">{{ t('common.all') }}</span>
                <span class="ncp-cat-count">{{ sortedUserAgents.length }}</span>
              </button>
              <div v-if="nupExpandedCatIds.has('__all__')" class="ncp-cat-items">
                <label
                  v-for="p in sortedUserAgents"
                  :key="p.id"
                  class="ncp-item"
                  :class="{ selected: isUserSelected(p.id) }"
                >
                  <div class="ncp-check">
                    <input type="radio" name="newchat-user-persona" :checked="isUserSelected(p.id)" @change="emit('select-new-chat-user-agent', p.id)" />
                    <svg v-if="isUserSelected(p.id)" class="ncp-check-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><polyline points="20 6 9 17 4 12"/></svg>
                  </div>
                  <div class="ncp-avatar">
                    <img v-if="getAvatarDataUriForAgent(p)" :src="getAvatarDataUriForAgent(p)" alt="" class="ncp-avatar-img" />
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

        <div class="ncp-footer">
          <span class="ncp-footer-hint">{{ activeNewChatUserAgent?.name || t('common.default') }}</span>
          <button class="ncp-done-btn" @click="emit('update:showNewChatUserPopover', false)">{{ t('common.done') }}</button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { defineComponent, ref, h } from 'vue'
import AppButton from '../common/AppButton.vue'
import EmojiPicker from '../agents/EmojiPicker.vue'
import { useI18n } from '../../i18n/useI18n'
import { useChatsStore } from '../../stores/chats'
import { useAgentsStore } from '../../stores/agents'
import { getAvatarDataUri } from '../agents/agentAvatars'

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
  showNewChatAgentPopover: Boolean,
  newChatAgentSearch: { type: String, default: '' },
  showNewChatUserPopover: Boolean,
  newChatUserSearch: { type: String, default: '' },
  newChatFolderTreeExpanded: { type: Object, default: () => new Set() },
  ncpExpandedCatIds: { type: Object, default: () => new Set() },
  nupExpandedCatIds: { type: Object, default: () => new Set() },
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
  'update:showNewChatAgentPopover',
  'update:showNewChatUserPopover',
  'toggle-ncp-cat',
  'toggle-nup-cat',
  'toggle-new-chat-agent',
  'toggle-new-chat-folder-expand',
  'select-new-chat-user-agent',
  'clear-new-chat-user-selection',
  'remove-new-chat-system-agent',
  'on-new-chat-icon-select',
])

// Template refs (internal to this component)
const newChatNameInputRef = ref(null)
const newChatAgentSearchEl = ref(null)
const newChatUserSearchEl = ref(null)

// Expose refs so parent can access them if needed
defineExpose({
  newChatNameInputRef,
  newChatAgentSearchEl,
  newChatUserSearchEl,
})

function getAvatarDataUriForAgent(agent) {
  if (!agent?.avatar) return null
  return getAvatarDataUri(agent.avatar)
}

function isUserSelected(agentId) {
  return props.effectiveNewChatUserAgentId === agentId
}

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
        // Chevron — only if has sub-folders
        node.children?.some(c => c.type === 'folder')
          ? h('svg', {
              style: { width: '12px', height: '12px', flexShrink: 0, opacity: 0.6, transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' },
              viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2.5',
              onClick: (e) => { e.stopPropagation(); emit('toggle', node.id) },
            }, [h('polyline', { points: '9 18 15 12 9 6' })])
          : h('span', { style: 'width:12px;display:inline-block;flex-shrink:0;' }),
        // Folder emoji
        h('span', { style: { fontSize: '13px', lineHeight: '1', flexShrink: 0, userSelect: 'none' } }, node.emoji || '\u{1F4C1}'),
        // Name
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
/* ── New chat modal rows ───────────────────────────────────────────────── */
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

.newchat-icon-display {
  font-size: 1.25rem;
  line-height: 1;
}

.newchat-icon-edit {
  position: absolute;
  right: 0.25rem;
  bottom: 0.25rem;
  color: #9CA3AF;
}

.newchat-field-stack {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}

.newchat-select {
  width: 100%;
  padding: 0.5rem 0.625rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  background: #1A1A1A;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  outline: none;
}
.newchat-select:focus { border-color: #4B5563; }

.newchat-agent-row-btn {
  width: 100%;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  background: #1A1A1A;
  color: #6B7280;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  justify-content: flex-start;
  padding: 0.4375rem 0.625rem;
  cursor: pointer;
  transition: all 0.15s;
}
.newchat-agent-row-btn:hover {
  border-color: #374151;
  color: #FFFFFF;
}

.newchat-agent-row-label {
  font-size: var(--fs-caption);
  font-family: 'Inter', sans-serif;
  color: inherit;
}

.newchat-selected-preview {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}

.newchat-selected-agent-chip {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.875rem 0.25rem 0.4375rem;
  border-radius: 9999px;
  border: 1px solid #2A2A2A;
  background: #111111;
}

.newchat-selected-agent-avatar,
.newchat-selected-agent-fallback {
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  flex-shrink: 0;
}

.newchat-selected-agent-avatar {
  object-fit: cover;
}

.newchat-selected-agent-fallback {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: #2A2A2A;
  color: #9CA3AF;
  font-size: 0.5625rem;
  font-weight: 600;
}

.newchat-selected-agent-name {
  color: #D1D5DB;
  font-size: var(--fs-small);
  line-height: 1;
  max-width: 8rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.newchat-selected-agent-remove {
  position: absolute;
  top: -0.25rem;
  right: -0.25rem;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  border: 1px solid #374151;
  background: #1A1A1A;
  color: #9CA3AF;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.15s;
}

.newchat-selected-agent-remove:hover {
  background: rgba(255,59,48,0.15);
  border-color: rgba(255,59,48,0.45);
  color: #FF6B6B;
}

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

/* ── Agent config button ────────────────────────────────────────────── */
.newchat-agent-cfg-btn {
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
.newchat-agent-cfg-btn:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: #374151;
  color: #FFFFFF;
}
.newchat-agent-cfg-avatars {
  display: flex;
  align-items: center;
}
.newchat-agent-cfg-avatar-img {
  width: 1.125rem;
  height: 1.125rem;
  border-radius: 50%;
  object-fit: cover;
  border: 1.5px solid #1A1A1A;
}
.newchat-agent-cfg-avatar-img + .newchat-agent-cfg-avatar-img,
.newchat-agent-cfg-avatar-img + .newchat-agent-cfg-avatar-fb,
.newchat-agent-cfg-avatar-fb + .newchat-agent-cfg-avatar-img,
.newchat-agent-cfg-avatar-fb + .newchat-agent-cfg-avatar-fb {
  margin-left: -0.375rem;
}
.newchat-agent-cfg-avatar-fb {
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
.newchat-agent-cfg-overflow {
  background: #333;
  font-size: 7px;
}

/* ── New Chat Agent Picker Dialog (dark, CCM-style) ────────────────── */
.ncp-backdrop {
  position: fixed; inset: 0; z-index: 200;
  background: rgba(0,0,0,0.6); backdrop-filter: blur(8px);
  display: flex; align-items: center; justify-content: center;
  animation: ncm-fade 0.15s ease-out;
}
@keyframes ncm-fade { from { opacity: 0; } to { opacity: 1; } }
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
  animation: ncm-enter 0.2s ease-out;
  overflow: hidden;
}
@keyframes ncm-enter {
  from { opacity: 0; transform: scale(0.95) translateY(12px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
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
