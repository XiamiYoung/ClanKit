<template>
  <Teleport to="body" :key="agentId">
    <div class="bv-backdrop">
      <div class="bv-modal">

        <!-- Header -->
        <div class="bv-header">
          <div class="bv-header-left">
            <div class="bv-header-icon">
              <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="5" r="2"/>
                <path d="M12 7v6"/>
                <path d="M9 10l-3 5h12l-3-5"/>
                <path d="M9 22v-5"/><path d="M15 22v-5"/>
              </svg>
            </div>
            <div>
              <h2 class="bv-title">{{ t('agents.bodyView') }} — {{ draftName || agentName }}</h2>
              <span class="bv-meta">{{ agentType === 'system' ? t('agents.systemAgent') : t('agents.userAgent') }}</span>
            </div>
          </div>
          <button class="bv-close-btn" @click="$emit('close')" :aria-label="t('common.close')">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>

        <!-- 3-column body -->
        <div class="bv-body">

          <!-- ── LEFT: Identity + Definition + AI Buttons ── -->
          <div class="bv-left">
            <div class="bv-section-label-row">
              <span class="bv-section-label">{{ t('agents.summary') }}</span>
              <!-- Surprise Me — only on new agent creation (not readonly) -->
              <AppButton v-if="isNew && !readOnly" size="compact" class="bv-ai-micro" :loading="aiWorking && aiWorkingMode === 'surprise'" :disabled="aiWorking" @click="surpriseMe">
                <svg v-if="!(aiWorking && aiWorkingMode === 'surprise')" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/></svg>
                {{ aiWorking && aiWorkingMode === 'surprise' ? t('agents.generating') : t('agents.surpriseMe') }}
              </AppButton>
            </div>

            <!-- Name -->
            <div class="bv-field">
              <label class="bv-field-label">{{ t('agents.name') }}<span v-if="!readOnly" class="bv-required">*</span></label>
              <div v-if="readOnly" class="bv-readonly-text">{{ draftName || '—' }}</div>
              <input v-else v-model="draftName" type="text" class="bv-input" maxlength="50" :class="{ error: saveError && (!draftName.trim() || draftName.trim().length > 50) }" :placeholder="t('agents.agentNamePlaceholder')" spellcheck="false" @input="saveError = ''" @blur="draftName = draftName.trim()" />
            </div>

            <!-- Description -->
            <div class="bv-field">
              <div class="bv-field-label-row">
                <label class="bv-field-label">{{ t('agents.description') }}</label>
                <AppButton v-if="!readOnly" size="compact" class="bv-ai-micro" :loading="aiWorking && aiWorkingMode === 'enhance-desc'" :disabled="aiWorking || !draftDescription.trim()" @click="enhanceDescription">
                  <svg v-if="!(aiWorking && aiWorkingMode === 'enhance-desc')" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                  {{ aiWorking && aiWorkingMode === 'enhance-desc' ? '...' : t('agents.aiEnhance') }}
                </AppButton>
              </div>
              <div v-if="readOnly" class="bv-readonly-text bv-readonly-multiline">{{ draftDescription || '—' }}</div>
              <textarea v-else v-model="draftDescription" class="bv-textarea" rows="3" :placeholder="t('agents.descriptionPlaceholder')" spellcheck="false" @blur="draftDescription = draftDescription.trim()"></textarea>
            </div>

            <span v-if="aiError && !readOnly" class="bv-ai-error">{{ aiError }}</span>

            <!-- Agent Definition -->
            <div class="bv-field bv-field-grow">
              <div class="bv-field-label-row">
                <label class="bv-field-label">
                  {{ t('agents.agentDefinition') }}
                  <span v-if="agentType === 'system' && !readOnly" class="bv-required">*</span>
                </label>
                <AppButton v-if="!readOnly" size="compact" class="bv-ai-micro" :loading="aiWorking && aiWorkingMode === 'generate'" :disabled="aiWorking || !draftDescription.trim()" @click="generateFromDescription">
                  <svg v-if="!(aiWorking && aiWorkingMode === 'generate')" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>
                  {{ aiWorking && aiWorkingMode === 'generate' ? '...' : t('agents.rewriteFromDescription') }}
                </AppButton>
              </div>
              <div v-if="readOnly" class="bv-readonly-text bv-readonly-multiline bv-readonly-grow">{{ draftPrompt || '—' }}</div>
              <textarea
                v-else
                v-model="draftPrompt"
                class="bv-textarea bv-textarea-grow"
                :class="{ error: saveError && agentType === 'system' && !draftPrompt.trim() }"
                :placeholder="agentType === 'system' ? t('agents.systemPromptPlaceholder') : t('agents.userPromptPlaceholder')"
                spellcheck="false"
                @input="saveError = ''"
                @blur="draftPrompt = draftPrompt.trim()"
              ></textarea>
            </div>

            <!-- AI Enhance definition button below definition (not in readonly) -->
            <div v-if="!readOnly" class="bv-ai-btn-row bv-ai-btn-row-end">
              <AppButton size="compact" class="bv-ai-micro" :loading="aiWorking && aiWorkingMode === 'enhance'" :disabled="aiWorking || !draftPrompt.trim()" @click="enhancePrompt">
                <svg v-if="!(aiWorking && aiWorkingMode === 'enhance')" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                {{ aiWorking && aiWorkingMode === 'enhance' ? t('agents.enhancing') : t('agents.aiEnhance') }}
              </AppButton>
            </div>
          </div>

          <!-- ── CENTER: Human figure ── -->
          <div class="bv-center">
            <div class="bv-figure-wrap">
              <svg class="bv-figure" viewBox="0 0 320 440" xmlns="http://www.w3.org/2000/svg">
                <defs>
                  <!-- Avatar clip -->
                  <clipPath id="bv-head-clip">
                    <circle cx="160" cy="82" r="58"/>
                  </clipPath>
                </defs>

                <!-- ─ Ambient glow behind figure ─ -->
                <ellipse cx="160" cy="246" rx="75" ry="120" fill="rgba(30,90,200,0.06)"/>

                <!-- ─ LIMBS (drawn first so torso covers the junction) ─ -->

                <!-- Left arm -->
                <path d="M122 162 Q90 196 74 234 Q67 250 69 266"
                  fill="none" stroke="#3D8BF0" stroke-width="22" stroke-linecap="round"/>
                <path d="M122 162 Q90 196 74 234 Q67 250 69 266"
                  fill="none" stroke="#091D38" stroke-width="16" stroke-linecap="round"/>

                <!-- Right arm -->
                <path d="M198 162 Q230 196 246 234 Q253 250 251 266"
                  fill="none" stroke="#3D8BF0" stroke-width="22" stroke-linecap="round"/>
                <path d="M198 162 Q230 196 246 234 Q253 250 251 266"
                  fill="none" stroke="#091D38" stroke-width="16" stroke-linecap="round"/>

                <!-- Left leg -->
                <path d="M142 244 Q135 300 132 352 Q130 366 132 380"
                  fill="none" stroke="#3D8BF0" stroke-width="22" stroke-linecap="round"/>
                <path d="M142 244 Q135 300 132 352 Q130 366 132 380"
                  fill="none" stroke="#091D38" stroke-width="16" stroke-linecap="round"/>

                <!-- Right leg -->
                <path d="M178 244 Q185 300 188 352 Q190 366 188 380"
                  fill="none" stroke="#3D8BF0" stroke-width="22" stroke-linecap="round"/>
                <path d="M178 244 Q185 300 188 352 Q190 366 188 380"
                  fill="none" stroke="#091D38" stroke-width="16" stroke-linecap="round"/>

                <!-- ─ TORSO ─ -->
                <path d="M122 154 C110 172 108 204 108 244 L212 244 C212 204 210 172 198 154 Z"
                  fill="#0D2040" stroke="#3D8BF0" stroke-width="2" stroke-linejoin="round"/>

                <!-- Hip bridge -->
                <ellipse cx="160" cy="244" rx="56" ry="14"
                  fill="#0D2040" stroke="#3D8BF0" stroke-width="1.5"/>

                <!-- Neck -->
                <rect x="147" y="137" width="26" height="20" rx="5"
                  fill="#0D2040" stroke="#3D8BF0" stroke-width="1.5"/>

                <!-- Chest detail -->
                <line x1="143" y1="182" x2="177" y2="182" stroke="rgba(61,139,240,0.25)" stroke-width="1.5" stroke-linecap="round"/>
                <line x1="140" y1="194" x2="180" y2="194" stroke="rgba(61,139,240,0.18)" stroke-width="1" stroke-linecap="round"/>

                <!-- ─ HEAD ─ -->
                <circle cx="160" cy="82" r="64" fill="none" stroke="rgba(61,139,240,0.18)" stroke-width="5"/>
                <circle cx="160" cy="82" r="58" fill="#0D2040" stroke="#3D8BF0" stroke-width="2"
                  class="bv-avatar-hs" :class="{ active: activePanel === 'avatar' }"
                  @click="!readOnly && togglePanel('avatar')" :style="{ cursor: readOnly ? 'default' : 'pointer' }"/>
                <image
                  v-if="avatarDataUri"
                  :href="avatarDataUri"
                  x="102" y="24"
                  width="116" height="116"
                  clip-path="url(#bv-head-clip)"
                  preserveAspectRatio="xMidYMid slice"
                  class="bv-avatar-hs" :class="{ active: activePanel === 'avatar' }"
                  @click="!readOnly && !isBuiltinSystemAgent && togglePanel('avatar')" :style="{ cursor: readOnly || isBuiltinSystemAgent ? 'default' : 'pointer' }"
                />
                <text v-else x="160" y="93" text-anchor="middle" class="bv-figure-initial">{{ fallbackInitial }}</text>
                <circle cx="160" cy="82" r="58" fill="none" stroke="#3D8BF0" stroke-width="2"
                  class="bv-avatar-hs" :class="{ active: activePanel === 'avatar' }"
                  @click="!readOnly && !isBuiltinSystemAgent && togglePanel('avatar')" :style="{ cursor: readOnly || isBuiltinSystemAgent ? 'default' : 'pointer' }"/>
                <g v-if="!readOnly && !isBuiltinSystemAgent" class="bv-avatar-edit-hint" @click="togglePanel('avatar')" style="cursor:pointer;">
                  <circle cx="196" cy="122" r="12" fill="#0D2040" stroke="#3D8BF0" stroke-width="1.5"/>
                  <path d="M191 124.5l5-5 3 3-5 5-3.5 0.5 0.5-3.5z" fill="none" stroke="#3D8BF0" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
                </g>

                <!-- ─ Hotspots ─ -->

                <!-- MEMORY (left temple) -->
                <g :key="'memory-hotspot'" class="bv-hotspot" :class="{ active: activePanel === 'memory' }" @click="togglePanel('memory')">
                  <line x1="108" y1="70" x2="62" y2="54" class="bv-hs-line"/>
                  <rect x="2" y="40" width="62" height="24" rx="12" class="bv-hs-label-bg"/>
                  <text x="33" y="56" text-anchor="middle" class="bv-hs-label">{{ t('agents.memory') }}</text>
                  <circle cx="108" cy="70" r="15" class="bv-hs-circle"/>
                  <text x="108" y="76" text-anchor="middle" class="bv-hs-icon">🧠</text>
                </g>

                <!-- MODEL (right temple) -->
                <g v-if="agentType === 'system'" :key="'model-hotspot'" class="bv-hotspot" :class="{ active: activePanel === 'model' }" @click="togglePanel('model')">
                  <line x1="212" y1="70" x2="258" y2="54" class="bv-hs-line"/>
                  <rect x="256" y="40" width="62" height="24" rx="12" class="bv-hs-label-bg"/>
                  <text x="287" y="56" text-anchor="middle" class="bv-hs-label">{{ t('agents.aiModel') }}</text>
                  <circle cx="212" cy="70" r="15" class="bv-hs-circle"/>
                  <text x="212" y="76" text-anchor="middle" class="bv-hs-icon">🤖</text>
                </g>

                <!-- VOICE (chin / mouth area) -->
                <g :key="'voice-hotspot'" class="bv-hotspot" :class="{ active: activePanel === 'voice' }" @click="togglePanel('voice')">
                  <line x1="178" y1="125" x2="232" y2="125" class="bv-hs-line"/>
                  <rect x="233" y="113" width="58" height="24" rx="12" class="bv-hs-label-bg"/>
                  <text x="262" y="129" text-anchor="middle" class="bv-hs-label">{{ t('agents.voice') }}</text>
                  <circle cx="163" cy="125" r="15" class="bv-hs-circle"/>
                  <text x="163" y="131" text-anchor="middle" class="bv-hs-icon">🎤</text>
                </g>

                <!-- TOOLS (left hand) -->
                <g v-if="agentType === 'system'" class="bv-hotspot" :class="{ active: activePanel === 'tools' }" @click="togglePanel('tools')">
                  <line x1="56" y1="266" x2="18" y2="266" class="bv-hs-line"/>
                  <rect x="2" y="254" width="54" height="24" rx="12" class="bv-hs-label-bg"/>
                  <text x="29" y="270" text-anchor="middle" class="bv-hs-label">{{ t('agents.tools') }}</text>
                  <circle cx="69" cy="266" r="15" class="bv-hs-circle"/>
                  <text x="69" y="272" text-anchor="middle" class="bv-hs-icon">🔧</text>
                </g>

                <!-- SKILLS (right hand) -->
                <g v-if="agentType === 'system'" class="bv-hotspot" :class="{ active: activePanel === 'skills' }" @click="togglePanel('skills')">
                  <line x1="264" y1="266" x2="302" y2="266" class="bv-hs-line"/>
                  <rect x="264" y="254" width="54" height="24" rx="12" class="bv-hs-label-bg"/>
                  <text x="291" y="270" text-anchor="middle" class="bv-hs-label">{{ t('agents.skills') }}</text>
                  <circle cx="251" cy="266" r="15" class="bv-hs-circle"/>
                  <text x="251" y="272" text-anchor="middle" class="bv-hs-icon">⚡</text>
                </g>

                <!-- KNOWLEDGE (belly center) -->
                <g v-if="agentType === 'system'" class="bv-hotspot" :class="{ active: activePanel === 'knowledge' }" @click="togglePanel('knowledge')">
                  <line x1="145" y1="210" x2="80" y2="210" class="bv-hs-line"/>
                  <rect x="2" y="198" width="78" height="24" rx="12" class="bv-hs-label-bg"/>
                  <text x="41" y="214" text-anchor="middle" class="bv-hs-label">{{ t('agents.knowledge') }}</text>
                  <circle cx="160" cy="210" r="15" class="bv-hs-circle"/>
                  <text x="160" y="216" text-anchor="middle" class="bv-hs-icon">📚</text>
                </g>

                <!-- MCP (right shin) -->
                <g v-if="agentType === 'system'" class="bv-hotspot" :class="{ active: activePanel === 'mcp' }" @click="togglePanel('mcp')">
                  <line x1="202" y1="326" x2="248" y2="340" class="bv-hs-line"/>
                  <rect x="240" y="328" width="76" height="24" rx="12" class="bv-hs-label-bg"/>
                  <text x="278" y="344" text-anchor="middle" class="bv-hs-label">{{ t('agents.mcp') }}</text>
                  <circle cx="188" cy="322" r="15" class="bv-hs-circle"/>
                  <text x="188" y="328" text-anchor="middle" class="bv-hs-icon">🌐</text>
                </g>



                <!-- Agent name below figure -->
                <text x="160" y="408" text-anchor="middle" class="bv-figure-name">{{ draftName || agentName }}</text>
                <text x="160" y="424" text-anchor="middle" class="bv-figure-type">{{ agentType === 'system' ? t('agents.systemAgent') : t('agents.userAgent') }}</text>

              </svg>
            </div>

          </div>

          <!-- ── RIGHT: Detail panel ── -->
          <div class="bv-right">
            <Transition name="bv-panel" mode="out-in" @after-enter="onPanelAfterEnter">
              <div v-if="activePanel" :key="activePanel" class="bv-detail-inner">
                <div class="bv-detail-header">
                  <span class="bv-detail-icon">{{ panelIcon(activePanel) }}</span>
                  <span class="bv-detail-title">{{ panelLabel(activePanel) }}</span>
                  <button class="bv-detail-close" @click="activePanel = null">
                    <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>

                <!-- Memory (structured cards backed by SoulStore) -->
                <div v-if="activePanel === 'memory'" class="bv-detail-body">
                  <div v-if="memoryLoading" class="bv-detail-empty">{{ t('common.loading') }}...</div>
                  <template v-else-if="memoryGroups.length > 0">
                    <div v-for="grp in memoryGroups" :key="grp.title" class="bv-mem-section">
                      <div class="bv-mem-title">{{ grp.title }}</div>
                      <ul class="bv-mem-cards">
                        <li v-for="row in grp.rows" :key="row.id" class="bv-mem-card">
                          <template v-if="!readOnly && editingEntryId === row.id">
                            <textarea v-model="editingEntryDraft" class="bv-mem-card-edit" spellcheck="false" rows="2"></textarea>
                            <div class="bv-mem-card-actions">
                              <button class="bv-mem-card-btn bv-mem-card-btn-primary" @click="saveEditEntry">{{ t('common.save') }}</button>
                              <button class="bv-mem-card-btn" @click="cancelEditEntry">{{ t('common.cancel') }}</button>
                            </div>
                          </template>
                          <template v-else>
                            <div class="bv-mem-card-content">{{ row.content }}</div>
                            <div class="bv-mem-card-meta">
                              <span v-if="row.source && row.source !== 'unknown'" class="bv-mem-chip">{{ row.source }}</span>
                              <span v-if="row.confidence != null" class="bv-mem-chip">conf {{ row.confidence.toFixed(2) }}</span>
                              <span v-if="row.updatedAt" class="bv-mem-meta-date">{{ formatMemoryDate(row.updatedAt) }}</span>
                              <span v-if="!readOnly" class="bv-mem-card-buttons">
                                <button class="bv-mem-card-icon" :title="t('common.edit')" @click="startEditEntry(row)">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                                </button>
                                <button class="bv-mem-card-icon bv-mem-card-icon-danger" :title="t('common.delete')" @click="deleteMemoryEntry(row)">
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:11px;height:11px;"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/></svg>
                                </button>
                              </span>
                            </div>
                          </template>
                        </li>
                      </ul>
                      <div v-if="!readOnly" class="bv-mem-add-row">
                        <input
                          v-model="newEntryDrafts[grp.title]"
                          type="text"
                          class="bv-mem-add-input"
                          :placeholder="t('agents.memoryAddPlaceholder', '') || 'Add an entry...'"
                          @keydown.enter.prevent="addMemoryEntry(grp.title)"
                        />
                        <button class="bv-mem-add-btn" :disabled="!(newEntryDrafts[grp.title] || '').trim()" @click="addMemoryEntry(grp.title)">+</button>
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <!-- Fallback: no structured rows yet — keep the legacy textarea so
                         users can dump raw markdown for brand-new agents. The blob
                         is round-tripped through souls.write into the store on save. -->
                    <div v-if="readOnly" class="bv-readonly-text bv-readonly-multiline bv-readonly-grow">{{ draftMemory || t('agents.noMemory') }}</div>
                    <textarea v-else v-model="draftMemory" class="bv-textarea bv-textarea-grow" :placeholder="t('agents.memoryPlaceholder')" spellcheck="false"></textarea>
                  </template>
                </div>

                <!-- Model -->
                <div v-else-if="activePanel === 'model'" class="bv-detail-body">
                  <!-- Readonly: just show selected -->
                  <template v-if="readOnly">
                    <div class="bv-ro-section">
                      <div class="bv-ro-label">{{ t('agents.provider') }}</div>
                      <div class="bv-ro-value">{{ activeProviderOptions.find(p => p.id === draftProvider)?.name || draftProvider || '—' }}</div>
                    </div>
                    <div class="bv-ro-section">
                      <div class="bv-ro-label">{{ t('agents.model') }}</div>
                      <div class="bv-ro-value">{{ currentModelLabel !== '—' ? currentModelLabel : (locale.value === 'zh' ? '未设置' : 'Not set') }}</div>
                    </div>
                  </template>
                  <!-- Editable -->
                  <template v-else>
                    <div class="bv-model-section">
                      <label class="bv-field-label">{{ t('agents.provider') }}</label>
                      <div v-if="activeProviderOptions.length === 0" class="bv-detail-empty">{{ t('agents.noActiveProviders') }}</div>
                      <ComboBox
                        v-else
                        :modelValue="draftProvider"
                        @update:modelValue="selectProvider($event)"
                        :options="activeProviderOptions"
                        :placeholder="t('agents.selectProvider')"
                      />
                    </div>
                    <div class="bv-model-section bv-model-section-grow" v-if="draftProvider">
                      <label class="bv-field-label">
                        {{ t('agents.model') }}
                        <span v-if="currentModelLabel && currentModelLabel !== '—'" class="bv-model-badge">{{ currentModelLabel }}</span>
                        <span v-if="!draftModelId || ((draftProvider !== agentProviderId || draftModelId !== agentModelId) && !testModelResult?.ok)" class="bv-model-hint">
                          <svg style="width:11px;height:11px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          {{ !draftModelId ? t('agents.selectModelAndTest') : t('agents.testBeforeSave') }}
                        </span>
                      </label>
                      <input v-if="draftProviderType !== 'anthropic'" v-model="modelFilter" type="text" :placeholder="t('agents.searchModels')" class="bv-input bv-input-sm" />
                      <div class="bv-model-list" ref="bvModelListRef">
                        <div v-if="modelsLoading" class="bv-detail-empty">{{ t('common.loading') }}...</div>
                        <button v-for="m in filteredModels" :key="m.id" class="bv-model-item" :class="{ active: draftModelId === m.id, 'bv-model-small-ctx': m.context_length && m.context_length < SMALL_CONTEXT_THRESHOLD }" @click="draftModelId = m.id; saveError = ''; testModelResult = null">
                          <span class="bv-model-item-name">{{ m.name || m.label || m.id }}</span>
                          <span
                            class="bv-model-ctx"
                            :class="m.context_length ? 'has-value' : 'is-missing'"
                            v-tooltip="m.context_length ? (m.contextSource === 'catalog' ? t('config.contextFromCatalog') : t('config.contextFromApi')) : t('config.contextUnknown')"
                          >
                            <template v-if="m.context_length">
                              <span class="bv-model-tag-label">{{ t('config.contextLabel') }}</span>
                              <span class="bv-model-tag-value">{{ formatContextWindow(m.context_length) }}</span>
                            </template>
                            <template v-else>{{ t('config.contextLengthUnavailable') }}</template>
                          </span>
                          <span
                            v-if="m.max_output_tokens"
                            class="bv-model-out has-value"
                            v-tooltip="m.maxOutputSource === 'catalog' ? t('config.maxOutputFromCatalog') : t('config.maxOutputFromApi')"
                          >
                            <span class="bv-model-tag-label">{{ t('config.maxOutputLabel') }}</span>
                            <span class="bv-model-tag-value">{{ formatContextWindow(m.max_output_tokens) }}</span>
                          </span>
                        </button>
                      </div>
                      <!-- Context window warning -->
                      <div v-if="selectedModelContextWindow && selectedModelContextWindow < SMALL_CONTEXT_THRESHOLD" class="bv-ctx-warn">
                        <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        <span>{{ t('agents.smallContextWarning', { size: formatContextWindow(selectedModelContextWindow) }) }}</span>
                      </div>

                      <div class="bv-test-row">
                        <span v-if="testModelResult?.ok" class="bv-test-result" :class="testModelResult.smallCtx ? 'warn' : 'success'">
                          <svg v-if="!testModelResult.smallCtx" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                          <svg v-else style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                          {{ testModelResult.message }}
                        </span>
                        <span v-else-if="testModelResult && !testModelResult.ok" class="bv-test-result error" style="cursor:pointer;" @click="showTestErrorModal = true">
                          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                          {{ t('config.testFailed') }}
                        </span>
                        <button class="bv-test-btn" :disabled="testingModel || !draftModelId" @click="testModelConnection">
                          <svg v-if="!testingModel" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                          <svg v-else style="width:12px;height:12px;" class="bv-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                          {{ testingModel ? t('config.testing') : t('config.test') }}
                        </button>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- Tools -->
                <div v-else-if="activePanel === 'tools'" class="bv-detail-body">
                  <!-- Readonly: only selected items -->
                  <template v-if="readOnly">
                    <div v-if="draftRequiredToolIds.length === 0" class="bv-detail-empty">{{ t('agents.notAssigned') }}</div>
                    <div v-else class="bv-ro-item-list">
                      <div v-for="id in draftRequiredToolIds" :key="id" class="bv-ro-item">
                        <span class="bv-ro-item-name">{{ getToolLocalizedName(id) }}</span>
                        <span class="bv-ro-item-desc">{{ getToolLocalizedDesc(id) }}</span>
                      </div>
                    </div>
                  </template>
                  <!-- Editable -->
                  <template v-else>
                    <div v-if="availableTools.length === 0" class="bv-detail-empty">{{ t('agents.noToolsAvailable') }}</div>
                    <template v-else>
                      <div class="bv-cap-toolbar">
                        <input v-model="capFilter.tools" type="text" :placeholder="t('common.search')" class="bv-input bv-input-sm bv-cap-filter" />
                        <button class="bv-cap-toggle-btn" @click="toggleSelectAll('tools')">
                          {{ draftRequiredToolIds.length === availableTools.length ? t('common.deselectAll') : t('common.selectAll') }}
                        </button>
                      </div>
                      <div v-if="draftRequiredToolIds.length > CAP_LIMITS.tools" class="bv-cap-warning">
                        <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {{ locale.value === 'zh' ? `已选 ${draftRequiredToolIds.length} 个工具，超过建议上限 ${CAP_LIMITS.tools}，可能影响准确度并增加 cost` : `${draftRequiredToolIds.length} tools selected — over the recommended limit of ${CAP_LIMITS.tools}. This may reduce accuracy and increase cost.` }}
                      </div>
                      <div class="bv-cap-list">
                        <label v-for="tool in filteredTools" :key="tool.id" class="bv-cap-item">
                          <input type="checkbox" :value="tool.id" v-model="draftRequiredToolIds" />
                          <div class="bv-cap-text">
                            <span class="bv-cap-name">{{ getToolLocalizedName(tool.id) }}</span>
                            <span v-if="getToolLocalizedDesc(tool.id) || tool.category" class="bv-cap-desc">{{ getToolLocalizedDesc(tool.id) || tool.category }}</span>
                          </div>
                        </label>
                      </div>
                    </template>
                  </template>
                </div>

                <!-- Skills -->
                <div v-else-if="activePanel === 'skills'" class="bv-detail-body">
                  <template v-if="readOnly">
                    <div v-if="draftRequiredSkillIds.length === 0" class="bv-detail-empty">{{ t('agents.notAssigned') }}</div>
                    <div v-else class="bv-ro-item-list">
                      <div v-for="id in draftRequiredSkillIds" :key="id" class="bv-ro-item">
                        <span class="bv-ro-item-name">{{ availableSkills.find(s => s.id === id)?.name || id }}</span>
                        <span class="bv-ro-item-desc">{{ availableSkills.find(s => s.id === id)?.summary || '' }}</span>
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div v-if="availableSkills.length === 0" class="bv-detail-empty">{{ t('agents.noSkillsAvailable') }}</div>
                    <template v-else>
                      <div class="bv-cap-toolbar">
                        <input v-model="capFilter.skills" type="text" :placeholder="t('common.search')" class="bv-input bv-input-sm bv-cap-filter" />
                        <button class="bv-cap-toggle-btn" @click="toggleSelectAll('skills')">
                          {{ draftRequiredSkillIds.length === availableSkills.length ? t('common.deselectAll') : t('common.selectAll') }}
                        </button>
                      </div>
                      <div v-if="draftRequiredSkillIds.length > CAP_LIMITS.skills" class="bv-cap-warning">
                        <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {{ locale.value === 'zh' ? `已选 ${draftRequiredSkillIds.length} 个技能，超过建议上限 ${CAP_LIMITS.skills}，可能影响准确度并增加 cost` : `${draftRequiredSkillIds.length} skills selected — over the recommended limit of ${CAP_LIMITS.skills}. This may reduce accuracy and increase cost.` }}
                      </div>
                      <div class="bv-cap-list">
                        <label v-for="skill in filteredSkills" :key="skill.id" class="bv-cap-item">
                          <input type="checkbox" :value="skill.id" v-model="draftRequiredSkillIds" />
                          <div class="bv-cap-text">
                            <span class="bv-cap-name">{{ skill.name }}</span>
                            <span v-if="skill.summary" class="bv-cap-desc">{{ skill.summary }}</span>
                          </div>
                        </label>
                      </div>
                    </template>
                  </template>
                </div>

                <!-- Knowledge -->
                <div v-else-if="activePanel === 'knowledge'" class="bv-detail-body">
                  <template v-if="readOnly">
                    <div v-if="draftRequiredKnowledgeBaseIds.length === 0" class="bv-detail-empty">{{ t('agents.notAssigned') }}</div>
                    <div v-else class="bv-ro-item-list">
                      <div v-for="id in draftRequiredKnowledgeBaseIds" :key="id" class="bv-ro-item">
                        <span class="bv-ro-item-name">{{ id }}</span>
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div v-if="availableKnowledgeBases.length === 0" class="bv-detail-empty">{{ t('agents.noKnowledgeBases') }}</div>
                    <template v-else>
                      <div class="bv-cap-toolbar">
                        <input v-model="capFilter.knowledge" type="text" :placeholder="t('common.search')" class="bv-input bv-input-sm bv-cap-filter" />
                        <button class="bv-cap-toggle-btn" @click="toggleSelectAll('knowledge')">
                          {{ draftRequiredKnowledgeBaseIds.length === availableKnowledgeBases.length ? t('common.deselectAll') : t('common.selectAll') }}
                        </button>
                      </div>
                      <div v-if="draftRequiredKnowledgeBaseIds.length > CAP_LIMITS.knowledge" class="bv-cap-warning">
                        <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {{ locale.value === 'zh' ? `已选 ${draftRequiredKnowledgeBaseIds.length} 个知识库，超过建议上限 ${CAP_LIMITS.knowledge}，可能影响准确度并增加 cost` : `${draftRequiredKnowledgeBaseIds.length} knowledge bases selected — over the recommended limit of ${CAP_LIMITS.knowledge}. This may reduce accuracy and increase cost.` }}
                      </div>
                      <div v-if="disabledAssignedKnowledge.length > 0" class="bv-cap-disabled-badges">
                        <span v-for="id in disabledAssignedKnowledge" :key="id" class="bv-cap-disabled-badge">
                          <svg style="width:11px;height:11px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                          {{ id }}
                        </span>
                      </div>
                      <div class="bv-cap-list">
                        <label v-for="kb in filteredKnowledge" :key="kb.id" class="bv-cap-item">
                          <input type="checkbox" :value="kb.id" v-model="draftRequiredKnowledgeBaseIds" />
                          <div class="bv-cap-text">
                            <span class="bv-cap-name">{{ kb.name }}</span>
                          </div>
                        </label>
                      </div>
                    </template>
                  </template>
                </div>

                <!-- MCP -->
                <div v-else-if="activePanel === 'mcp'" class="bv-detail-body">
                  <template v-if="readOnly">
                    <div v-if="draftRequiredMcpServerIds.length === 0" class="bv-detail-empty">{{ t('agents.notAssigned') }}</div>
                    <div v-else class="bv-ro-item-list">
                      <div v-for="id in draftRequiredMcpServerIds" :key="id" class="bv-ro-item">
                        <span class="bv-ro-item-name">{{ availableMcpServers.find(s => s.id === id)?.name || id }}</span>
                        <span class="bv-ro-item-desc">{{ availableMcpServers.find(s => s.id === id)?.description || '' }}</span>
                      </div>
                    </div>
                  </template>
                  <template v-else>
                    <div v-if="availableMcpServers.length === 0" class="bv-detail-empty">{{ t('agents.noMcpServers') }}</div>
                    <template v-else>
                      <div class="bv-cap-toolbar">
                        <input v-model="capFilter.mcp" type="text" :placeholder="t('common.search')" class="bv-input bv-input-sm bv-cap-filter" />
                        <button class="bv-cap-toggle-btn" @click="toggleSelectAll('mcp')">
                          {{ draftRequiredMcpServerIds.length === availableMcpServers.length ? t('common.deselectAll') : t('common.selectAll') }}
                        </button>
                      </div>
                      <div v-if="draftRequiredMcpServerIds.length > CAP_LIMITS.mcp" class="bv-cap-warning">
                        <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {{ locale.value === 'zh' ? `已选 ${draftRequiredMcpServerIds.length} 个 MCP 服务器，超过建议上限 ${CAP_LIMITS.mcp}，可能影响准确度并增加 cost` : `${draftRequiredMcpServerIds.length} MCP servers selected — over the recommended limit of ${CAP_LIMITS.mcp}. This may reduce accuracy and increase cost.` }}
                      </div>
                      <div class="bv-cap-list">
                        <label v-for="srv in filteredMcp" :key="srv.id" class="bv-cap-item">
                          <input type="checkbox" :value="srv.id" v-model="draftRequiredMcpServerIds" />
                          <div class="bv-cap-text">
                            <span class="bv-cap-name">{{ srv.name }}</span>
                            <span v-if="srv.description" class="bv-cap-desc">{{ srv.description }}</span>
                          </div>
                        </label>
                      </div>
                    </template>
                  </template>
                </div>

                <!-- Voice -->
                <div v-else-if="activePanel === 'voice'" class="bv-detail-body">
                  <template v-if="readOnly">
                    <div class="bv-ro-section">
                      <div class="bv-ro-label">{{ t('agents.voice') }}</div>
                      <div class="bv-ro-value">{{ currentVoiceLabel }}</div>
                    </div>
                  </template>
                  <template v-else>
                    <!-- No voice mode configured -->
                    <div v-if="!availableVoiceModes.length" style="padding:1rem; color:var(--c-text-muted); text-align:center;">
                      <p>{{ t('agents.voiceNotConfigured') }}</p>
                      <p class="hint" style="margin-top:0.5rem;">{{ t('agents.voiceNotConfiguredHint') }}</p>
                    </div>
                    <template v-else>
                      <!-- Voice mode selector (only show if multiple modes available) -->
                      <div v-if="availableVoiceModes.length > 1" class="bv-field-group">
                        <label class="bv-field-label">{{ t('agents.voiceMode') }}</label>
                        <select v-model="draftVoiceMode" class="bv-field-select">
                          <option v-for="m in availableVoiceModes" :key="m.id" :value="m.id">{{ m.name }}</option>
                        </select>
                      </div>
                      <!-- Voice list -->
                      <div class="bv-field-group">
                        <label class="bv-field-label">{{ t('agents.voiceSelect') }}</label>
                        <div class="bv-voice-grid">
                          <button v-for="v in currentVoiceList" :key="v.id" class="bv-voice-card" :class="{ active: draftVoiceId === v.id }" @click="draftVoiceId = v.id">
                            <span class="bv-voice-name">{{ v.name }}</span>
                            <span class="bv-voice-desc">{{ v.gender === 'Female' ? t('common.female') : v.gender === 'Male' ? t('common.male') : '' }} · {{ v.locale === 'zh-CN' ? t('common.chinese') : v.locale === 'en-US' ? t('common.english') : v.locale || '' }}</span>
                          </button>
                        </div>
                      </div>
                      <!-- Preview -->
                      <div v-if="draftVoiceId" style="margin-top:0.75rem;">
                        <AppButton size="compact" :loading="previewingAgentVoice" :disabled="previewingAgentVoice" @click="previewAgentVoice">
                          {{ previewingAgentVoice ? t('agents.voicePreview') : '▶ ' + t('agents.voicePreview') }}
                        </AppButton>
                      </div>
                    </template>
                  </template>
                </div>

                <!-- Avatar picker (inline in right panel) -->
                <div v-else-if="activePanel === 'avatar' && !isBuiltinSystemAgent" class="bv-detail-body bv-avatar-panel">
                  <!-- Style selector with filter -->
                  <div class="bv-av-style-row">
                    <div class="bv-av-combo" :class="{ open: avatarComboOpen }">
                      <input
                        ref="avatarComboInputRef"
                        type="text"
                        class="bv-av-combo-input"
                        v-model="avatarComboFilter"
                        :placeholder="currentAvatarStyleLabel"
                        @focus="avatarComboOpen = true"
                        @click="avatarComboOpen = true"
                        @input="avatarComboOpen = true"
                        @blur="delayCloseAvatarCombo"
                      />
                      <button class="bv-av-combo-toggle" type="button" @mousedown.prevent="toggleAvatarCombo">
                        <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      <div v-if="avatarComboOpen" class="bv-av-combo-list">
                        <button
                          v-for="style in filteredAvatarStyles"
                          :key="style.key"
                          class="bv-av-combo-option"
                          :class="{ active: avatarStyleKey === style.key }"
                          @mousedown.prevent="switchAvatarStyle(style.key); avatarComboOpen = false; avatarComboFilter = ''"
                        ><img :src="getAvatarDataUri(`${style.key}:preview_sample`)" style="width:1.25rem;height:1.25rem;border-radius:50%;flex-shrink:0;" /> {{ t(style.i18nKey) }}</button>
                        <div v-if="filteredAvatarStyles.length === 0" class="bv-av-combo-empty">No matches</div>
                      </div>
                    </div>
                  </div>
                  <!-- Upload button -->
                  <label class="bv-av-upload-btn">
                    <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {{ t('agents.uploadPhoto') }}
                    <input type="file" accept="image/*" style="display:none;" @change="onAvatarFileUpload" />
                  </label>
                  <!-- Avatar grid -->
                  <div class="bv-av-grid">
                    <button
                      v-for="av in pagedAvatarBatch"
                      :key="av.id"
                      class="bv-av-item"
                      :class="{ selected: draftAvatar === av.id }"
                      @click="draftAvatar = av.id"
                    >
                      <img :src="getAvatarDataUri(av.id)" alt="" style="width:3.5rem;height:3.5rem;border-radius:50%;display:block;" />
                    </button>
                  </div>
                  <!-- Pagination -->
                  <div class="bv-av-pagination">
                    <button class="bv-av-page-btn" :disabled="avatarPage === 0" @click="avatarPage--">
                      <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m15 18-6-6 6-6"/></svg>
                    </button>
                    <span class="bv-av-page-info">{{ avatarPage + 1 }} / {{ avatarTotalPages }}</span>
                    <button class="bv-av-page-btn" :disabled="avatarPage >= avatarTotalPages - 1" @click="avatarPage++">
                      <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                    </button>
                  </div>
                </div>

              </div>

              <!-- Default summary view -->
              <div v-else class="bv-summary-panel">
                <div class="bv-summary-title">{{ t('agents.agentOverview') }}</div>

                <!-- AI Model -->
                <div v-if="agentType === 'system'" class="bv-summary-row clickable" @click="togglePanel('model')">
                  <span class="bv-summary-icon">🤖</span>
                  <div class="bv-summary-content">
                    <span class="bv-summary-label">{{ t('agents.aiModel') }}</span>
                    <span class="bv-summary-value" :class="{ muted: !draftModelId }">
                      {{ draftModelId ? currentModelLabel : (locale.value === 'zh' ? '未设置' : 'Not set') }}
                    </span>
                  </div>
                  <svg class="bv-summary-chevron" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>

                <!-- Voice -->
                <div class="bv-summary-row clickable" @click="togglePanel('voice')">
                  <span class="bv-summary-icon">🎤</span>
                  <div class="bv-summary-content">
                    <span class="bv-summary-label">{{ t('agents.voice') }}</span>
                    <span class="bv-summary-value">{{ currentVoiceLabel }}</span>
                  </div>
                  <svg class="bv-summary-chevron" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>

                <!-- Memory -->
                <div class="bv-summary-row clickable" @click="togglePanel('memory')">
                  <span class="bv-summary-icon">🧠</span>
                  <div class="bv-summary-content">
                    <span class="bv-summary-label">{{ t('agents.memory') }}</span>
                    <span v-if="memoryLoading" class="bv-summary-value muted">{{ t('common.loading') }}...</span>
                    <span v-else class="bv-summary-value" :class="{ muted: memoryLineCount === 0 }">
                      {{ memoryLineCount === 0 ? (locale.value === 'zh' ? '暂无记忆' : 'None') : (locale.value === 'zh' ? memoryLineCount + ' 条' : memoryLineCount + ' entries') }}
                    </span>
                  </div>
                  <svg class="bv-summary-chevron" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>

                <!-- Tools -->
                <div v-if="agentType === 'system'" class="bv-summary-row clickable" @click="togglePanel('tools')">
                  <span class="bv-summary-icon">🔧</span>
                  <div class="bv-summary-content">
                    <span class="bv-summary-label">{{ t('agents.tools') }}</span>
                    <span class="bv-summary-value" :class="{ muted: draftRequiredToolIds.length === 0 }">
                      {{ draftRequiredToolIds.length === 0 ? t('agents.notAssigned') : (locale.value === 'zh' ? draftRequiredToolIds.length + t('agents.assigned') : draftRequiredToolIds.length + ' ' + t('agents.assigned')) }}
                    </span>
                  </div>
                  <svg class="bv-summary-chevron" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>

                <!-- Skills -->
                <div v-if="agentType === 'system'" class="bv-summary-row clickable" @click="togglePanel('skills')">
                  <span class="bv-summary-icon">⚡</span>
                  <div class="bv-summary-content">
                    <span class="bv-summary-label">{{ t('agents.skills') }}</span>
                    <span class="bv-summary-value" :class="{ muted: draftRequiredSkillIds.length === 0 }">
                      {{ draftRequiredSkillIds.length === 0 ? t('agents.notAssigned') : (locale.value === 'zh' ? draftRequiredSkillIds.length + t('agents.assigned') : draftRequiredSkillIds.length + ' ' + t('agents.assigned')) }}
                    </span>
                  </div>
                  <svg class="bv-summary-chevron" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>

                <!-- Knowledge -->
                <div v-if="agentType === 'system'" class="bv-summary-row clickable" @click="togglePanel('knowledge')">
                  <span class="bv-summary-icon">📚</span>
                  <div class="bv-summary-content">
                    <span class="bv-summary-label">{{ t('agents.knowledge') }}</span>
                    <span class="bv-summary-value" :class="{ muted: draftRequiredKnowledgeBaseIds.length === 0 }">
                      {{ draftRequiredKnowledgeBaseIds.length === 0 ? t('agents.notAssigned') : (locale.value === 'zh' ? draftRequiredKnowledgeBaseIds.length + t('agents.assigned') : draftRequiredKnowledgeBaseIds.length + ' ' + t('agents.assigned')) }}{{ disabledAssignedKnowledge.length > 0 ? (locale.value === 'zh' ? `（${disabledAssignedKnowledge.length} ${t('agents.disabled')}）` : ` (${disabledAssignedKnowledge.length} ${t('agents.disabled')})`) : '' }}
                    </span>
                  </div>
                  <svg class="bv-summary-chevron" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>

                <!-- MCP Servers -->
                <div v-if="agentType === 'system'" class="bv-summary-row clickable" @click="togglePanel('mcp')">
                  <span class="bv-summary-icon">🌐</span>
                  <div class="bv-summary-content">
                    <span class="bv-summary-label">{{ t('agents.mcp') }}</span>
                    <span class="bv-summary-value" :class="{ muted: draftRequiredMcpServerIds.length === 0 }">
                      {{ draftRequiredMcpServerIds.length === 0 ? t('agents.notAssigned') : (locale.value === 'zh' ? draftRequiredMcpServerIds.length + t('agents.assigned') : draftRequiredMcpServerIds.length + ' ' + t('agents.assigned')) }}
                    </span>
                  </div>
                  <svg class="bv-summary-chevron" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m9 18 6-6-6-6"/></svg>
                </div>

              </div>
            </Transition>
          </div>

        </div>

        <!-- Footer -->
        <div class="bv-footer">
          <span v-if="saveError" class="bv-save-error">
            <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            {{ saveError }}
          </span>
          <div v-else></div>
          <div class="bv-footer-right">
            <button class="bv-btn secondary" @click="$emit('close')">{{ readOnly ? t('common.close') : t('common.cancel') }}</button>
            <button v-if="!readOnly" class="bv-btn primary" @click="saveAll">{{ t('common.save') }}</button>
          </div>
        </div>

      </div>
    </div>

  </Teleport>

  <!-- Test error modal -->
  <Teleport to="body">
    <div v-if="showTestErrorModal" class="bv-error-backdrop">
      <div class="bv-error-modal">
        <div class="bv-error-modal-header">
          <svg style="width:16px;height:16px;color:#EF4444;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          <span>{{ t('config.testFailed') }}</span>
          <button class="bv-error-modal-close" @click="showTestErrorModal = false">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </button>
        </div>
        <div class="bv-error-modal-body">{{ testModelResult?.message }}</div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, nextTick, onMounted, watch } from 'vue'
import { useAgentsStore, BUILTIN_SYSTEM_AGENT_ID } from '../../stores/agents'
import { useModelsStore } from '../../stores/models'
import { useConfigStore } from '../../stores/config'
import { useToolsStore } from '../../stores/tools'
import { useSkillsStore } from '../../stores/skills'
import { useMcpStore } from '../../stores/mcp'
import { useKnowledgeStore } from '../../stores/knowledge'
import { useI18n } from '../../i18n/useI18n'
import { getAvatarDataUri, STYLES, generateRandomBatch } from './agentAvatars'
import { buildAgentEnhancementPrompt, buildAgentGenerationPrompt, detectAgentLanguage, extractJsonPayload } from '../../utils/agentDefinitionPrompts'
import AppButton from '../common/AppButton.vue'
import ComboBox from '../common/ComboBox.vue'

const props = defineProps({
  agentId:          { type: String, required: true },
  agentType:        { type: String, required: true },
  agentName:        { type: String, default: 'Agent' },
  agentDescription: { type: String, default: '' },
  agentPrompt:      { type: String, default: '' },
  agentProviderId:  { type: String, default: null },
  agentModelId:     { type: String, default: null },
  agentVoiceId:     { type: String, default: null },
  agentAvatar:      { type: String, default: null },
  agentRequiredToolIds:          { type: Array, default: () => [] },
  agentRequiredSkillIds:         { type: Array, default: () => [] },
  agentRequiredMcpServerIds:     { type: Array, default: () => [] },
  agentRequiredKnowledgeBaseIds: { type: Array, default: () => [] },
  readOnly:     { type: Boolean, default: false },
  isNew:        { type: Boolean, default: false },
  fromChat:     { type: Boolean, default: false },
})

const emit = defineEmits(['close', 'update-agent'])

const isBuiltinSystemAgent = computed(() => props.agentId === BUILTIN_SYSTEM_AGENT_ID)

const agentsStore = useAgentsStore()
const modelsStore = useModelsStore()
const configStore = useConfigStore()
const toolsStore  = useToolsStore()
const skillsStore = useSkillsStore()
const mcpStore    = useMcpStore()
const knowledgeStore = useKnowledgeStore()
const { t, locale } = useI18n()

// ── Active panel ───────────────────────────────────────────────────────────
const activePanel = ref(null)

function togglePanel(panel) {
  activePanel.value = activePanel.value === panel ? null : panel
  if (panel === 'memory' && activePanel.value === 'memory') loadMemory()
}

// Fired by the panel Transition once the enter animation completes — at this
// point the model list DOM is mounted and laid out, so scrolling the active
// model into view is reliable.
function onPanelAfterEnter() {
  if (activePanel.value === 'model') scrollActiveModelIntoView()
}

function panelLabel(panel) {
  const map = {
    avatar:    t('agents.changeAvatar'),
    memory:    t('agents.memory'),
    model:     t('agents.aiModel'),
    tools:     t('agents.tools'),
    skills:    t('agents.skills'),
    knowledge: t('agents.knowledge'),
    mcp:       t('agents.mcp'),
    voice:     t('agents.voice'),
  }
  return map[panel] || panel
}

function panelIcon(panel) {
  const map = { avatar: '🖼️', memory: '🧠', model: '🤖', tools: '🔧', skills: '⚡', knowledge: '📚', mcp: '🌐', voice: '🎤' }
  return map[panel] || '•'
}

// ── Draft state ────────────────────────────────────────────────────────────
const draftName        = ref(props.agentName || '')
const draftDescription = ref(props.agentDescription || '')
const draftPrompt      = ref(props.agentPrompt || '')
const draftAvatar      = ref(props.agentAvatar || null)
const draftVoiceId     = ref(props.agentVoiceId || getDefaultVoiceForLocale(configStore.config.language))

// Soul + Speech DNA produced by surpriseMe / generateFromDescription. Held in
// memory until the user clicks save, then flushed to disk by the parent
// component via writeNuwaSections / writeSpeechDna IPC calls. Cleared after a
// successful save so editing an existing agent doesn't keep re-writing.
const draftSoul   = ref(null)
const draftSpeech = ref(null)

// Pre-fill prompt template for new user agents
if (props.isNew && props.agentType !== 'system' && !draftPrompt.value) {
  draftPrompt.value = t('agents.userPromptTemplate')
}

// Expose draft field state for onboarding tracking
defineExpose({
  draftName,
  draftDescription,
  draftPrompt,
  draftAvatar,
})

const draftRequiredToolIds          = ref([...(props.agentRequiredToolIds || [])])
const draftRequiredSkillIds         = ref([...(props.agentRequiredSkillIds || [])])
const draftRequiredMcpServerIds     = ref([...(props.agentRequiredMcpServerIds || [])])
const draftRequiredKnowledgeBaseIds = ref([...(props.agentRequiredKnowledgeBaseIds || [])])

const capFilter = ref({ tools: '', skills: '', knowledge: '', mcp: '' })
const filteredTools = computed(() => {
  const q = capFilter.value.tools.toLowerCase()
  return q ? availableTools.value.filter(t => (t.name || '').toLowerCase().includes(q) || (t.description || '').toLowerCase().includes(q) || t.id.toLowerCase().includes(q)) : availableTools.value
})
const filteredSkills = computed(() => {
  const q = capFilter.value.skills.toLowerCase()
  return q ? availableSkills.value.filter(s => (s.name || '').toLowerCase().includes(q) || (s.summary || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) : availableSkills.value
})
const filteredKnowledge = computed(() => {
  const q = capFilter.value.knowledge.toLowerCase()
  return q ? availableKnowledgeBases.value.filter(k => (k.name || '').toLowerCase().includes(q) || (k.description || '').toLowerCase().includes(q) || k.id.toLowerCase().includes(q)) : availableKnowledgeBases.value
})
const filteredMcp = computed(() => {
  const q = capFilter.value.mcp.toLowerCase()
  return q ? availableMcpServers.value.filter(s => (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q) || s.id.toLowerCase().includes(q)) : availableMcpServers.value
})


const avatarDataUri   = computed(() => getAvatarDataUri(draftAvatar.value))
const fallbackInitial  = computed(() => (draftName.value || '?').charAt(0).toUpperCase())

// ── Inline avatar picker state ──────────────────────────────────────────────
const avatarStyles     = STYLES
const avatarComboOpen  = ref(false)
const avatarComboFilter = ref('')
const currentAvatarStyleLabel = computed(() => {
  const s = STYLES.find(s => s.key === avatarStyleKey.value)
  return s ? t(s.i18nKey) : t(STYLES[0].i18nKey)
})
const avatarComboInputRef = ref(null)
function delayCloseAvatarCombo() { setTimeout(() => { avatarComboOpen.value = false }, 150) }
function toggleAvatarCombo() {
  avatarComboOpen.value = !avatarComboOpen.value
  if (avatarComboOpen.value) nextTick(() => avatarComboInputRef.value?.focus())
}

const filteredAvatarStyles = computed(() => {
  const q = avatarComboFilter.value.toLowerCase()
  if (!q) return STYLES
  return STYLES.filter(s => t(s.i18nKey).toLowerCase().includes(q) || s.key.toLowerCase().includes(q))
})
const avatarBatchCache = new Map()
const avatarStyleKey   = ref(STYLES[0].key)
const avatarPage       = ref(0)
const AVATAR_PAGE_SIZE = 24

function getAvatarBatch(styleKey) {
  if (!avatarBatchCache.has(styleKey)) {
    avatarBatchCache.set(styleKey, generateRandomBatch(120, styleKey))
  }
  return avatarBatchCache.get(styleKey)
}
getAvatarBatch(avatarStyleKey.value)

const currentAvatarBatch = computed(() => getAvatarBatch(avatarStyleKey.value))

const avatarTotalPages = computed(() =>
  Math.ceil(currentAvatarBatch.value.length / AVATAR_PAGE_SIZE)
)

const pagedAvatarBatch = computed(() => {
  const start = avatarPage.value * AVATAR_PAGE_SIZE
  return currentAvatarBatch.value.slice(start, start + AVATAR_PAGE_SIZE)
})

function switchAvatarStyle(styleKey) {
  avatarStyleKey.value = styleKey
  avatarPage.value = 0
  getAvatarBatch(styleKey)
}

function onAvatarFileUpload(event) {
  const file = event.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = (e) => { draftAvatar.value = e.target.result }
  reader.readAsDataURL(file)
}

// ── Memory (structured rows from SoulStore) ────────────────────────────────
// Replaces the legacy "load full markdown blob into a textarea" pattern. The
// SQLite-backed SoulStore now exposes per-entry CRUD via `memories:*` IPC,
// so each memory has a stable id, section, source, confidence and timestamps —
// editable as discrete cards instead of a free-form text field.
//
// `draftMemory` (the markdown string) is retained as a fallback view: when
// the agent has no structured rows yet (e.g. brand-new agent) we still let
// users dump raw markdown in. On save, that blob is round-tripped through
// `souls.write` which lands in the store via the markdown adapter.
const memoryRows    = ref([])             // [{ id, section, content, source, confidence, createdAt, updatedAt }]
const draftMemory   = ref('')             // fallback markdown view
const memoryLoading = ref(!props.isNew)
const memoryLoaded  = ref(false)

// New entry composer state — keyed per-section so multiple sections can have
// open composers simultaneously. `null` means no draft for that section.
const newEntryDrafts = reactive({})       // { [sectionName]: string }
const editingEntryId = ref(null)
const editingEntryDraft = ref('')

// Canonical section ordering — mirrors electron/memory/soulMarkdown.js.
const MEMORY_SECTION_ORDER = [
  'Identity',
  'Mental Models', 'Decision Heuristics', 'Values & Anti-Patterns',
  'Relational Genealogy', 'Honest Boundaries', 'Core Tensions', 'Relationship Timeline',
  'Preferences', 'Communication', 'Technical', 'Projects', 'Personal', 'Interaction Notes',
  'Memory Updates Log',
]
const SECTION_RANK = new Map(MEMORY_SECTION_ORDER.map((s, i) => [s, i]))

const memoryEntryCount = computed(() => memoryRows.value.length)

// Group rows by section for card rendering. Sections appear in canonical order;
// unknown sections sort alphabetically after.
const memoryGroups = computed(() => {
  const bySection = new Map()
  for (const r of memoryRows.value) {
    if (!bySection.has(r.section)) bySection.set(r.section, [])
    bySection.get(r.section).push(r)
  }
  const groups = [...bySection.entries()].map(([title, rows]) => ({
    title,
    rows: [...rows].sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)),
  }))
  groups.sort((a, b) => {
    const ra = SECTION_RANK.has(a.title) ? SECTION_RANK.get(a.title) : 1000
    const rb = SECTION_RANK.has(b.title) ? SECTION_RANK.get(b.title) : 1000
    if (ra !== rb) return ra - rb
    return a.title.localeCompare(b.title)
  })
  return groups
})

async function loadMemory() {
  if (memoryLoaded.value || props.isNew) return
  memoryLoading.value = true
  try {
    if (window.electronAPI?.memories?.list) {
      const result = await window.electronAPI.memories.list(props.agentId, props.agentType)
      memoryRows.value = (result?.rows) || []
    }
    // Always also pull the markdown view for the fallback editor when there
    // are zero rows (brand-new agent case).
    const md = await window.electronAPI.souls.read(props.agentId, props.agentType)
    draftMemory.value = md || ''
    memoryLoaded.value = true
  } catch (err) {
    console.error('[Memory] load failed', err)
  }
  memoryLoading.value = false
}

async function refreshMemory() {
  try {
    if (window.electronAPI?.memories?.list) {
      const result = await window.electronAPI.memories.list(props.agentId, props.agentType)
      memoryRows.value = (result?.rows) || []
    }
  } catch (err) {
    console.error('[Memory] refresh failed', err)
  }
}

async function addMemoryEntry(section) {
  const text = (newEntryDrafts[section] || '').trim()
  if (!text) return
  try {
    const r = await window.electronAPI.memories.add({
      agentId: props.agentId,
      agentType: props.agentType,
      section,
      content: text,
      source: 'user',
    })
    if (r?.success) {
      newEntryDrafts[section] = ''
      await refreshMemory()
    }
  } catch (err) {
    console.error('[Memory] add failed', err)
  }
}

function startEditEntry(row) {
  editingEntryId.value = row.id
  editingEntryDraft.value = row.content
}
function cancelEditEntry() {
  editingEntryId.value = null
  editingEntryDraft.value = ''
}
async function saveEditEntry() {
  const id = editingEntryId.value
  const content = editingEntryDraft.value.trim()
  if (!id || !content) return cancelEditEntry()
  try {
    const r = await window.electronAPI.memories.update({ id, content })
    if (r?.success) await refreshMemory()
  } catch (err) {
    console.error('[Memory] update failed', err)
  }
  cancelEditEntry()
}
async function deleteMemoryEntry(row) {
  if (!row?.id) return
  try {
    const r = await window.electronAPI.memories.delete(row.id)
    if (r?.success) await refreshMemory()
  } catch (err) {
    console.error('[Memory] delete failed', err)
  }
}

function formatMemoryDate(ms) {
  if (!ms) return ''
  try {
    const d = new Date(ms)
    if (isNaN(d.getTime())) return ''
    return d.toISOString().slice(0, 10)
  } catch { return '' }
}

// Backwards-compat: the summary row still needs a count.
const memoryLineCount = memoryEntryCount

// Pre-load memory on mount so summary row shows correct count immediately.
onMounted(() => {
  if (!props.isNew) loadMemory()
})

// ── Voice options ──────────────────────────────────────────────────────────
import { EDGE_VOICES, OPENAI_VOICES, getDefaultVoiceForLocale } from '../../utils/edgeVoices'

const draftVoiceMode = ref('') // 'local' or 'openai'
const previewingAgentVoice = ref(false)

const availableVoiceModes = computed(() => {
  const vc = configStore.config.voiceCall || {}
  const modes = []
  // Edge-TTS is always available (no config required)
  modes.push({ id: 'local', name: 'Edge-TTS' })
  if (vc.whisperApiKey && vc.ttsMode && vc.ttsMode !== 'browser') {
    modes.push({ id: 'openai', name: 'OpenAI TTS' })
  }
  if (!draftVoiceMode.value) draftVoiceMode.value = modes[0].id
  return modes
})

const currentVoiceList = computed(() => {
  if (draftVoiceMode.value === 'openai') return OPENAI_VOICES
  return EDGE_VOICES
})

const currentVoiceLabel = computed(() => {
  const all = [...EDGE_VOICES, ...OPENAI_VOICES]
  const found = all.find(v => v.id === draftVoiceId.value)
  return found ? found.name : draftVoiceId.value || '–'
})

async function previewAgentVoice() {
  if (!draftVoiceId.value || previewingAgentVoice.value) return
  previewingAgentVoice.value = true
  try {
    if (draftVoiceMode.value === 'local' && window.electronAPI?.voice?.edgePreview) {
      const result = await window.electronAPI.voice.edgePreview({ voice: draftVoiceId.value })
      if (result?.success && result.audio) {
        const audio = new Audio(`data:audio/mpeg;base64,${result.audio}`)
        await audio.play()
      }
    } else if (draftVoiceMode.value === 'openai' && window.electronAPI?.voice?.tts) {
      const vc = configStore.config.voiceCall || {}
      const result = await window.electronAPI.voice.tts({
        text: 'Hello, this is a voice preview.',
        apiKey: vc.whisperApiKey,
        baseURL: vc.whisperBaseURL || 'https://api.openai.com',
        model: 'tts-1',
        voice: draftVoiceId.value,
      })
      if (result?.success && result.audio) {
        const audio = new Audio(`data:audio/${result.format || 'mp3'};base64,${result.audio}`)
        await audio.play()
      }
    }
  } catch {}
  previewingAgentVoice.value = false
}

// ── Provider / model ───────────────────────────────────────────────────────
const activeProviderOptions = computed(() => {
  return configStore.activeProviders.map(id => {
    const provider = configStore.config.providers.find(p => p.id === id)
    return { id, name: configStore.getProviderDisplayName(provider) || id }
  })
})

const initProvider  = props.agentProviderId || configStore.activeProviders[0] || ''
const draftProvider = ref(initProvider)
const draftModelId  = ref(props.agentModelId || null)
const modelFilter   = ref('')

function resolveProvider(value) {
  return configStore.config.providers.find(p => p.id === value || p.type === value) || null
}

const resolvedDraftProvider = computed(() => resolveProvider(draftProvider.value))

const hasValidSelectedProvider = computed(() => {
  const provider = resolvedDraftProvider.value
  if (!provider?.id) return false
  return activeProviderOptions.value.some(option => option.id === provider.id)
})

const draftProviderType = computed(() => {
  const provider = resolvedDraftProvider.value
  return provider?.type || draftProvider.value || ''
})

// Use provider instance ID for cache lookup, fall back to type
const draftProviderKey = computed(() => {
  const provider = resolvedDraftProvider.value
  return provider?.id || draftProviderType.value
})

const availableProviderModels = computed(() => modelsStore.getModelsForProvider(draftProviderKey.value))

const hasValidSelectedModel = computed(() => {
  if (!draftModelId.value) return false
  return availableProviderModels.value.some(model => model.id === draftModelId.value)
})

const modelsLoading = computed(() => modelsStore.isLoading(draftProviderKey.value))

function selectProvider(prov) {
  saveError.value = ''
  draftProvider.value = prov
  draftModelId.value  = null
  modelFilter.value   = ''
  testModelResult.value = null
}

// ── Model test ──
const testingModel = ref(false)
const testModelResult = ref(null)
const showTestErrorModal = ref(false)

async function testModelConnection() {
  const provider = resolvedDraftProvider.value
  if (!provider || !draftModelId.value || testingModel.value) return
  testingModel.value = true
  testModelResult.value = null
  try {
    const res = await window.electronAPI.testProvider({
      provider: provider.type,
      apiKey: provider.apiKey,
      baseURL: provider.baseURL,
      utilityModel: draftModelId.value,
    })
    if (res.success) {
      const ctx = selectedModelContextWindow.value
      const ctxWarn = ctx && ctx < SMALL_CONTEXT_THRESHOLD
        ? ` — ${t('agents.smallContextBrief', { size: formatContextWindow(ctx) })}`
        : ''
      testModelResult.value = { ok: true, message: `${res.ms}ms${ctxWarn}`, smallCtx: !!ctxWarn }
    } else {
      testModelResult.value = { ok: false, message: res.error }
    }
  } catch (err) {
    testModelResult.value = { ok: false, message: err.message || 'Test failed' }
  if (testModelResult.value && !testModelResult.value.ok) {
    showTestErrorModal.value = true
  }
  } finally {
    testingModel.value = false
  }
}

const filteredModels = computed(() => {
  const q = modelFilter.value.trim().toLowerCase()
  const models = availableProviderModels.value
  if (!q) return models
  return models.filter(m => (m.name || m.label || '').toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
})

// ── Scroll active model into view ─────────────────────────────────────────
const bvModelListRef = ref(null)

function scrollActiveModelIntoView() {
  const tryScroll = () => {
    const container = bvModelListRef.value
    if (!container) return false
    const active = container.querySelector('.bv-model-item.active')
    if (!active) return false
    const cRect = container.getBoundingClientRect()
    const aRect = active.getBoundingClientRect()
    const activeTopInScroll = aRect.top - cRect.top + container.scrollTop
    const target = activeTopInScroll - (container.clientHeight - active.offsetHeight) / 2
    const max = container.scrollHeight - container.clientHeight
    container.scrollTop = Math.max(0, Math.min(max, target))
    return true
  }
  if (tryScroll()) return
  requestAnimationFrame(() => {
    if (tryScroll()) return
    requestAnimationFrame(() => { tryScroll() })
  })
}

// Re-scroll when the model panel opens, the filter changes the rendered rows,
// the provider's model list finishes loading, or the selection moves.
watch(
  [() => activePanel.value, filteredModels, modelFilter, draftModelId],
  ([panel]) => {
    if (panel !== 'model') return
    nextTick(() => scrollActiveModelIntoView())
  }
)

// Format context window / token counts with K / M units.
function formatContextWindow(n) {
  if (!n || n <= 0) return ''
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return (m >= 10 ? Math.round(m) : Number(m.toFixed(2))) + 'M'
  }
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return String(n)
}

const currentModelLabel = computed(() => {
  if (!draftModelId.value) return '—'
  const models = availableProviderModels.value
  const m = models.find(x => x.id === draftModelId.value)
  return m?.name || m?.label || draftModelId.value
})

const selectedModelContextWindow = computed(() => {
  if (!draftModelId.value) return null
  const m = availableProviderModels.value.find(x => x.id === draftModelId.value)
  return m?.context_length || null
})

const SMALL_CONTEXT_THRESHOLD = 20000

// ── Capabilities data ──────────────────────────────────────────────────────
const CAP_LIMITS = { tools: 20, skills: 50, mcp: 5, knowledge: 3 }

const availableTools = computed(() => toolsStore.tools || [])
const availableSkills = computed(() => skillsStore.skills || [])
const availableMcpServers = computed(() => mcpStore.servers || [])
const availableKnowledgeBases = computed(() => {
  return (knowledgeStore.knowledgeBases || [])
    .filter(kb => {
      const cfg = (knowledgeStore.kbConfigs || {})[kb.id]
      return cfg?.enabled !== false
    })
    .map(kb => ({ id: kb.id, name: kb.name, description: kb.description }))
})

// Helper: Get localized name for tool (use i18n if available, fallback to name)
function getToolLocalizedName(toolId) {
  const tool = availableTools.value.find(t => t.id === toolId)
  if (!tool) return toolId
  if (tool.i18nKey) {
    try {
      return t(tool.i18nKey + '.name')
    } catch {}
  }
  return tool.name
}

// Helper: Get localized description for tool
function getToolLocalizedDesc(toolId) {
  const tool = availableTools.value.find(t => t.id === toolId)
  if (!tool) return ''
  if (tool.i18nKey) {
    try {
      return t(tool.i18nKey + '.description')
    } catch {}
  }
  return tool.description || ''
}

// Assigned KBs that are currently disabled — shown as read-only badges
const disabledAssignedKnowledge = computed(() => {
  const configs = knowledgeStore.kbConfigs || {}
  return (draftRequiredKnowledgeBaseIds.value || []).filter(id => {
    const cfg = configs[id]
    return cfg && cfg.enabled === false
  })
})

function toggleSelectAll(panel) {
  const map = {
    tools:     { draft: draftRequiredToolIds,          items: availableTools },
    skills:    { draft: draftRequiredSkillIds,         items: availableSkills },
    knowledge: { draft: draftRequiredKnowledgeBaseIds, items: availableKnowledgeBases },
    mcp:       { draft: draftRequiredMcpServerIds,     items: availableMcpServers },
  }
  const { draft, items } = map[panel]
  const allIds = items.value.map(i => i.id)
  draft.value = draft.value.length === allIds.length ? [] : allIds
}

// ── AI generation helpers ──────────────────────────────────────────────────
const aiWorking     = ref(false)
const aiWorkingMode = ref('')
const aiError       = ref('')

function detectLanguage() {
  return detectAgentLanguage(draftDescription.value, draftPrompt.value, configStore.config?.language || 'en')
}

const _avatarStyleKeys = STYLES.map(s => s.key)
const _validVoiceIds = EDGE_VOICES.map(v => v.id)

function _avatarVoiceInstruction() {
  const voiceList = EDGE_VOICES.map(v => `${v.id} (${v.name}, ${v.gender}, ${v.locale})`).join('; ')
  return `\n\nAlso:\n1. Choose an avatar style. RULE: if the persona is a HUMAN, you MUST use "agents" (realistic digital persona portraits). Only use other styles for non-human personas: "bottts" for robots/AI, "funEmoji" for playful characters, "pixelArt" for retro/gaming, "bigEars"/"bigSmile" for cute cartoon animals, "shapes"/"rings" for abstract entities. Add an "avatarStyle" field.\n2. Choose the best voice from: [${voiceList}]. Add a "voiceId" field.`
}

function _applyAiAvatarVoice(data) {
  // Avatar: only set if user hasn't manually picked one
  if (!draftAvatar.value) {
    const aiStyle = data?.avatarStyle && _avatarStyleKeys.includes(data.avatarStyle) ? data.avatarStyle : STYLES[0].key
    const seed = draftName.value?.trim() || `${Date.now()}`
    draftAvatar.value = `${aiStyle}:${seed}`
  }
  // Voice: only set if still on default
  const defaultVoice = getDefaultVoiceForLocale(configStore.config?.language || 'en')
  if (data?.voiceId && _validVoiceIds.includes(data.voiceId) && draftVoiceId.value === defaultVoice) {
    draftVoiceId.value = data.voiceId
  }
}

async function surpriseMe() {
  if (aiWorking.value) return
  aiWorking.value = true
  aiWorkingMode.value = 'surprise'
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const lang = detectLanguage()
    let prompt = buildAgentGenerationPrompt({ agentType: props.agentType === 'system' ? 'system' : 'user', lang })
    prompt += _avatarVoiceInstruction()
    const res = await window.electronAPI.enhancePrompt({ prompt, config })
    if (res.success && res.text) {
      const data = robustParseAgentJSON(res.text)
      if (!data) { aiWorking.value = false; return }
      if (data.name) draftName.value = data.name
      if (data.description) draftDescription.value = String(data.description)
      if (data.prompt)      draftPrompt.value = typeof data.prompt === 'string' ? data.prompt : JSON.stringify(data.prompt, null, 2)
      // Capture the Nuwa-style soul + speech blocks if the AI returned them.
      // Held in draft state until user clicks save; parent then writes to disk.
      if (data.soul && typeof data.soul === 'object') draftSoul.value = data.soul
      if (data.speech && typeof data.speech === 'object') draftSpeech.value = data.speech
      _applyAiAvatarVoice(data)
    } else {
      aiError.value = res.error || 'Generation failed. Check utility model config.'
    }
  } catch (err) {
    aiError.value = err.message || 'Generation failed.'
  }
  aiWorking.value = false
  aiWorkingMode.value = ''
}

async function generateFromDescription() {
  if (aiWorking.value) return
  aiWorking.value = true
  aiWorkingMode.value = 'generate'
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const desc = draftDescription.value.trim()
    const lang = detectLanguage()
    const existingName = draftName.value?.trim()

    let prompt = buildAgentGenerationPrompt({
      agentType: props.agentType === 'system' ? 'system' : 'user',
      description: desc,
      lang,
      existingName,
    })
    prompt += _avatarVoiceInstruction()
    const res = await window.electronAPI.enhancePrompt({ prompt, config })
    if (res.success && res.text) {
      const data = robustParseAgentJSON(res.text)
      if (!data) { aiWorking.value = false; return }
      if (!draftName.value?.trim() && data.name) {
        draftName.value = data.name
      }
      if (data.description) draftDescription.value = String(data.description)
      if (data.prompt)      draftPrompt.value = typeof data.prompt === 'string' ? data.prompt : JSON.stringify(data.prompt, null, 2)
      if (data.soul && typeof data.soul === 'object') draftSoul.value = data.soul
      if (data.speech && typeof data.speech === 'object') draftSpeech.value = data.speech
      _applyAiAvatarVoice(data)
    } else {
      aiError.value = res.error || 'Generation failed. Check utility model config.'
    }
  } catch (err) {
    aiError.value = err.message || 'Generation failed.'
  }
  aiWorking.value = false
  aiWorkingMode.value = ''
}

/**
 * Escape literal newlines/tabs inside JSON string values.
 * Walks the text char-by-char, toggling an "inside string" flag and
 * replacing bare \n / \r / \t with their JSON escape sequences.
 * Handles backslash-escape sequences correctly (skips the next char).
 */
function repairJsonStrings(text) {
  let result = ''
  let inString = false
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (inString) {
      if (ch === '\\') {
        // Pass escape sequence through unchanged
        result += ch + (text[i + 1] || '')
        i++
      } else if (ch === '"') {
        inString = false
        result += ch
      } else if (ch === '\n') {
        result += '\\n'
      } else if (ch === '\r') {
        result += '\\r'
      } else if (ch === '\t') {
        result += '\\t'
      } else {
        result += ch
      }
    } else {
      if (ch === '"') inString = true
      result += ch
    }
  }
  return result
}

/**
 * Robust JSON parser for AI-generated agent definitions.
 * Handles markdown fences, smart quotes, trailing commas, and
 * broken "prompt" fields with unescaped newlines/quotes.
 */
function robustParseAgentJSON(rawText) {
  let extracted = extractJsonPayload(rawText)

  // Build candidate variants: original, repaired, smart-quote-normalized, trailing-comma-stripped
  const normalize = s => s
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/,\s*([}\]])/g, '$1')

  const candidates = [
    extracted,
    repairJsonStrings(extracted),
    normalize(extracted),
    repairJsonStrings(normalize(extracted)),
  ]

  for (const candidate of candidates) {
    try { return JSON.parse(candidate) } catch {}
  }

  // Last resort: extract fields individually with regex
  try {
    const nameMatch = extracted.match(/"name"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
    const descMatch = extracted.match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/s)
    // prompt field often contains unescaped newlines — grab everything up to last closing brace
    const promptMatch = extracted.match(/"prompt"\s*:\s*"([\s\S]*?)"\s*[,}]/s)
      || extracted.match(/"prompt"\s*:\s*"([\s\S]*)"\s*\}?\s*$/s)
    if (nameMatch || descMatch || promptMatch) {
      return {
        name: nameMatch ? nameMatch[1] : '',
        description: descMatch ? descMatch[1] : '',
        prompt: promptMatch ? promptMatch[1].replace(/\\n/g, '\n').replace(/\\"/g, '"') : '',
      }
    }
  } catch {}

  aiError.value = 'AI returned invalid JSON. Try again.'
  return null
}

async function enhanceDescription() {
  if (aiWorking.value || !draftDescription.value.trim()) return
  aiWorking.value = true
  aiWorkingMode.value = 'enhance-desc'
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const lang = detectLanguage()
    const langInstruction = lang ? `IMPORTANT: Write ALL output entirely in ${lang}.\n\n` : ''
    const isUserPersona = props.agentType !== 'system'
    const prompt = isUserPersona
      ? `${langInstruction}Enrich this user persona description with implied specifics. Rules:\n- Maximum 100 characters total\n- Infer and ADD the concrete identity, background tension, temperament, or life context naturally implied by the description\n- Keep the same direction; do NOT introduce unrelated themes\n- Format: short factual phrases separated by commas — NOT prose sentences\n- Do NOT mention system agents, prompts, tools, workflows, or future development\n- Return ONLY the enriched description, nothing else\n\nExample: "穷学生，进京赶考，名门之后" → "家道中落，寒门求生，名门余脉，自尊强，命运翻身"\n\nOriginal:\n${draftDescription.value}`
      : `${langInstruction}Enrich this agent description with implied specifics. Rules:\n- Maximum 100 characters total\n- Infer and ADD the concrete details that naturally belong to this domain but weren't spelled out — specific tools by name, sub-disciplines, platforms, techniques, workflows\n- Keep the same direction; do NOT introduce unrelated fields\n- Replace vague phrases ("各种工具", "大量经验") with the actual specifics they imply\n- Format: short factual phrases separated by commas — NOT prose sentences\n- Return ONLY the enriched description, nothing else\n\nExample: "精通2D美工，有游戏Art经验" → "2D角色/场景设计，游戏原画，PS/SAI/SP，手游美术规范"\n\nOriginal:\n${draftDescription.value}`
    const res = await window.electronAPI.enhancePrompt({
      prompt,
      config,
    })
    if (res.success && res.text) {
      draftDescription.value = res.text.trim().replace(/\.+$/, '')
    } else {
      aiError.value = res.error || 'Enhancement failed.'
    }
  } catch (err) {
    aiError.value = err.message || 'Enhancement failed.'
  }
  aiWorking.value = false
  aiWorkingMode.value = ''
}

async function enhancePrompt() {
  if (aiWorking.value || !draftPrompt.value.trim()) return
  aiWorking.value = true
  aiWorkingMode.value = 'enhance'
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const lang = detectLanguage() || 'English'
    const res = await window.electronAPI.enhancePrompt({
      prompt: buildAgentEnhancementPrompt({
        agentType: props.agentType === 'system' ? 'system' : 'user',
        lang,
        description: draftDescription.value.trim(),
        prompt: draftPrompt.value,
      }),
      config,
    })
    if (res.success && res.text) {
      draftPrompt.value = res.text.trim()
    } else {
      aiError.value = res.error || 'Enhancement failed.'
    }
  } catch (err) {
    aiError.value = err.message || 'Enhancement failed.'
  }
  aiWorking.value = false
  aiWorkingMode.value = ''
}

// ── Save ───────────────────────────────────────────────────────────────────
const saveError = ref('')

function saveAll() {
  saveError.value = ''
  draftName.value = draftName.value.trim()
  draftDescription.value = draftDescription.value.trim()
  draftPrompt.value = draftPrompt.value.trim()
  if (!draftName.value) {
    saveError.value = t('agents.nameRequired')
    return
  }
  if (draftName.value.length > 50) {
    saveError.value = t('agents.nameTooLong')
    return
  }
  if (!draftPrompt.value) {
    saveError.value = t('agents.promptRequired')
    return
  }
  if (!draftDescription.value) {
    saveError.value = t('agents.descriptionRequired', 'Description is required')
    return
  }
  if (!draftAvatar.value) {
    activePanel.value = 'avatar'
    saveError.value = t('agents.avatarRequired', 'Please select an avatar')
    return
  }
  if (props.agentType === 'system') {
    if (!draftProvider.value) {
      activePanel.value = 'model'
      saveError.value = t('agents.providerRequired')
      return
    }
    if (!hasValidSelectedProvider.value) {
      activePanel.value = 'model'
      saveError.value = t('agents.invalidProviderSelection')
      return
    }
    if (!draftModelId.value) {
      activePanel.value = 'model'
      saveError.value = t('agents.modelRequired')
      return
    }
    if (!hasValidSelectedModel.value) {
      activePanel.value = 'model'
      saveError.value = t('agents.invalidModelSelection')
      return
    }
    const modelChanged = draftProvider.value !== props.agentProviderId || draftModelId.value !== props.agentModelId
    if (modelChanged && !testModelResult.value?.ok) {
      activePanel.value = 'model'
      saveError.value = t('agents.testModelBeforeSave')
      return
    }
  }
  // Duplicate name check — same type, exclude self
  // agentType prop is 'system' | 'users'; store uses 'system' | 'user'
  const agentStoreType = props.agentType === 'system' ? 'system' : 'user'
  const trimmedName = draftName.value.trim().toLowerCase()
  const duplicate = agentsStore.agents.find(a =>
    a.type === agentStoreType &&
    a.name?.trim().toLowerCase() === trimmedName &&
    a.id !== props.agentId
  )
  if (duplicate) {
    saveError.value = t('agents.duplicateName', { name: duplicate.name })
    return
  }
  if (!draftVoiceId.value) {
    activePanel.value = 'voice'
    saveError.value = t('agents.voiceRequired')
    return
  }
  const isSystemAgent = props.agentType === 'system'
  // Snapshot + clear soul/speech so a subsequent save (after edits) doesn't
  // re-write the same Nuwa assets. The parent uses these to populate the
  // soul.md and speech.json files via writeNuwaSections / writeSpeechDna IPC.
  const _soulOnce   = draftSoul.value
  const _speechOnce = draftSpeech.value
  draftSoul.value   = null
  draftSpeech.value = null
  emit('update-agent', {
    name:        draftName.value,
    avatar:      draftAvatar.value,
    description: draftDescription.value,
    prompt:      draftPrompt.value,
    providerId:  isSystemAgent ? draftProvider.value : null,
    modelId:     isSystemAgent ? (draftModelId.value || null) : null,
    voiceId:     draftVoiceId.value,
    requiredToolIds:          draftRequiredToolIds.value || [],
    requiredSkillIds:         draftRequiredSkillIds.value || [],
    requiredMcpServerIds:     draftRequiredMcpServerIds.value || [],
    requiredKnowledgeBaseIds: draftRequiredKnowledgeBaseIds.value || [],
    // Non-persistent fields — parent handler reads these and writes to disk
    // via the chat-import IPC, then drops them before saveAgent.
    _soulSeed:   _soulOnce,
    _speechSeed: _speechOnce,
  })
  // Memory persistence: structured rows are saved live via memories:add/update/
  // delete as the user edits cards, so nothing to flush there. Only the legacy
  // textarea fallback (shown when the agent has zero rows) needs an explicit
  // souls.write — that blob gets diffed into rows on the main side.
  if (memoryLoaded.value && memoryRows.value.length === 0 && (draftMemory.value || '').trim()) {
    window.electronAPI.souls.write(props.agentId, props.agentType, draftMemory.value)
      .catch(err => console.error('Memory save failed:', err))
  }
  emit('close')
}
</script>

<style scoped>
/* ── Backdrop & modal ─────────────────────────────────────────────────────── */
.bv-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(6px);
  z-index: 200;
  display: flex;
  align-items: center;
  justify-content: center;
}

.bv-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  box-shadow: 0 25px 60px rgba(0, 0, 0, 0.55);
  display: flex;
  flex-direction: column;
  width: 85vw;
  height: 90vh;
  overflow: hidden;
  animation: bvEnter 0.2s ease-out;
}

@keyframes bvEnter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.bv-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.875rem 1.25rem;
  border-bottom: 1px solid #1E1E1E;
  flex-shrink: 0;
}

.bv-header-left { display: flex; align-items: center; gap: 0.75rem; }

.bv-header-icon {
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex; align-items: center; justify-content: center; flex-shrink: 0;
}

.bv-title { font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle); font-weight: 700; color: #FFFFFF; margin: 0; }
.bv-meta  { font-size: var(--fs-caption); color: #6B7280; }

.bv-close-btn {
  width: 2rem; height: 2rem; border-radius: 0.5rem;
  background: transparent; border: none; color: #6B7280; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.bv-close-btn:hover { background: #1A1A1A; color: #FFFFFF; }

/* ── 3-column body ───────────────────────────────────────────────────────── */
.bv-body {
  display: grid;
  grid-template-columns: 28% 1fr 30%;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── LEFT column ─────────────────────────────────────────────────────────── */
.bv-left {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  padding: 1rem 1rem;
  border-right: 1px solid #1E1E1E;
  overflow-y: auto;
}

.bv-section-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
  flex-shrink: 0;
}

.bv-section-label {
  font-size: var(--fs-caption);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #4B5563;
}

/* SVG avatar hotspot hover */
.bv-avatar-hs { transition: opacity 0.15s; }
.bv-avatar-hs:hover, .bv-avatar-hs.active { opacity: 0.85; }
.bv-avatar-edit-hint { opacity: 0; transition: opacity 0.15s; }
.bv-figure:hover .bv-avatar-edit-hint { opacity: 1; }

/* Fields */
.bv-field { display: flex; flex-direction: column; gap: 0.3125rem; }
.bv-field-grow { flex: 1; min-height: 0; }

.bv-field-label-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.25rem;
}

.bv-field-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption); font-weight: 600; color: #6B7280;
  display: flex; align-items: center; gap: 0.375rem;
}

.bv-required { color: #EF4444; font-weight: 700; }

/* ── Shared amber AI micro-button (ai-doc-toggle-btn.active style) ── */
:deep(.bv-ai-micro) {
  padding: 0.1875rem 0.5rem !important;
  font-size: 0.6875rem !important;
  border-radius: 0.375rem !important;
  gap: 0.25rem !important;
  background: linear-gradient(135deg, #92400E 0%, #B45309 40%, #D97706 100%) !important;
  color: #FFFFFF !important;
  border: none !important;
  box-shadow: 0 2px 8px rgba(180,83,9,0.35), 0 1px 3px rgba(180,83,9,0.2) !important;
}
:deep(.bv-ai-micro):hover:not(:disabled) {
  background: linear-gradient(135deg, #78350F 0%, #92400E 40%, #B45309 100%) !important;
  box-shadow: 0 2px 10px rgba(180,83,9,0.45) !important;
}
:deep(.bv-ai-micro):disabled {
  opacity: 0.4 !important;
  box-shadow: none !important;
}

.bv-input {
  background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 0.5rem;
  color: #FFFFFF; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  padding: 0.4375rem 0.625rem; outline: none; width: 100%; box-sizing: border-box;
  transition: border-color 0.15s;
}
.bv-input:focus { border-color: #4B5563; }
.bv-input-sm { font-size: var(--fs-caption); padding: 0.3125rem 0.5rem; }

.bv-textarea {
  background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 0.5rem;
  color: #FFFFFF; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  padding: 0.4375rem 0.625rem; outline: none; resize: vertical;
  width: 100%; box-sizing: border-box; line-height: 1.55;
  transition: border-color 0.15s;
}
.bv-textarea:focus { border-color: #4B5563; }
.bv-textarea-grow { flex: 1; resize: none; min-height: 8rem; overflow-y: auto; }

/* ── Memory sections ── */
.bv-mem-section {
  display: flex; flex-direction: column; gap: 0.25rem;
  flex-shrink: 0;
}
.bv-mem-title {
  font-size: 0.75rem; font-weight: 600; color: #9CA3AF;
  padding: 0.125rem 0; border-bottom: 1px solid #2A2A2A;
  text-transform: uppercase; letter-spacing: 0.03em;
}
.bv-mem-textarea {
  resize: vertical; min-height: 1.75rem;
  background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 0.375rem;
  color: #FFFFFF; font-family: 'Inter', sans-serif; font-size: 0.75rem;
  padding: 0.375rem 0.5rem; outline: none; line-height: 1.5;
  overflow-y: auto; width: 100%; box-sizing: border-box;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
  field-sizing: content;
}
.bv-mem-textarea:focus { border-color: #4B5563; }
.bv-mem-textarea::-webkit-scrollbar { width: 4px; }
.bv-mem-textarea::-webkit-scrollbar-track { background: transparent; }
.bv-mem-textarea::-webkit-scrollbar-thumb { background: #333; border-radius: 9999px; }
.bv-mem-content-ro {
  min-height: 1.75rem; overflow-y: auto;
  font-size: 0.75rem; color: #D1D5DB; line-height: 1.5;
  padding: 0.375rem 0.5rem; white-space: pre-wrap;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.bv-mem-content-ro::-webkit-scrollbar { width: 4px; }
.bv-mem-content-ro::-webkit-scrollbar-track { background: transparent; }
.bv-mem-content-ro::-webkit-scrollbar-thumb { background: #333; border-radius: 9999px; }

/* ── Memory: structured cards (Path B — backed by SoulStore) ── */
.bv-mem-cards {
  list-style: none; padding: 0; margin: 0;
  display: flex; flex-direction: column; gap: 0.25rem;
}
.bv-mem-card {
  background: #1A1A1A; border: 1px solid #2A2A2A; border-radius: 0.375rem;
  padding: 0.4375rem 0.5625rem; display: flex; flex-direction: column; gap: 0.25rem;
}
.bv-mem-card:hover { border-color: #3A3A3A; }
.bv-mem-card-content {
  font-size: 0.75rem; color: #D1D5DB; line-height: 1.5;
  white-space: pre-wrap; word-break: break-word;
}
.bv-mem-card-meta {
  display: flex; align-items: center; gap: 0.4rem; flex-wrap: wrap;
  font-size: 0.625rem; color: #6B7280;
}
.bv-mem-chip {
  background: #232323; color: #9CA3AF;
  padding: 0.0625rem 0.4375rem; border-radius: 999px;
  font-size: 0.625rem; font-weight: 500;
}
.bv-mem-meta-date {
  font-family: 'JetBrains Mono', monospace; font-size: 0.625rem; color: #6B7280;
}
.bv-mem-card-buttons {
  margin-left: auto; display: inline-flex; gap: 0.25rem;
}
.bv-mem-card-icon {
  background: transparent; border: 1px solid transparent;
  color: #9CA3AF; cursor: pointer;
  width: 1.375rem; height: 1.375rem; padding: 0;
  display: inline-flex; align-items: center; justify-content: center;
  border-radius: 0.25rem;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.bv-mem-card-icon:hover { background: #232323; color: #FFFFFF; border-color: #2A2A2A; }
.bv-mem-card-icon-danger:hover { color: #FCA5A5; }
.bv-mem-card-edit {
  resize: vertical; min-height: 1.75rem;
  background: #0F0F0F; border: 1px solid #4B5563; border-radius: 0.25rem;
  color: #FFFFFF; font-family: 'Inter', sans-serif; font-size: 0.75rem;
  padding: 0.375rem 0.5rem; outline: none; line-height: 1.5;
  width: 100%; box-sizing: border-box;
}
.bv-mem-card-actions {
  display: flex; gap: 0.375rem; justify-content: flex-end;
}
.bv-mem-card-btn {
  background: transparent; border: 1px solid #2A2A2A; color: #9CA3AF;
  padding: 0.1875rem 0.625rem; border-radius: 0.25rem; cursor: pointer;
  font-size: 0.6875rem; font-weight: 500;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.bv-mem-card-btn:hover { background: #232323; color: #FFFFFF; }
.bv-mem-card-btn-primary {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; border-color: #4B5563;
}
.bv-mem-card-btn-primary:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

/* New-entry composer row */
.bv-mem-add-row {
  display: flex; gap: 0.25rem; margin-top: 0.0625rem;
}
.bv-mem-add-input {
  flex: 1; background: #1A1A1A; border: 1px solid #2A2A2A;
  border-radius: 0.375rem; color: #FFFFFF;
  font-family: 'Inter', sans-serif; font-size: 0.75rem;
  padding: 0.3125rem 0.5rem; outline: none;
}
.bv-mem-add-input:focus { border-color: #4B5563; }
.bv-mem-add-btn {
  width: 1.875rem; flex-shrink: 0;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  border-radius: 0.375rem; color: #9CA3AF;
  font-size: 0.875rem; line-height: 1; cursor: pointer;
  transition: background 0.12s, color 0.12s, border-color 0.12s;
}
.bv-mem-add-btn:hover:not(:disabled) {
  background: #232323; color: #FFFFFF; border-color: #3A3A3A;
}
.bv-mem-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }

/* AI buttons */
.bv-ai-btn-row {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.bv-ai-btn-row-end {
  justify-content: flex-end;
}

.bv-ai-error {
  font-size: var(--fs-caption);
  color: #EF4444;
  line-height: 1.4;
}

/* ── CENTER column ───────────────────────────────────────────────────────── */
.bv-center {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  justify-content: flex-start;
  padding: 0;
  border-right: 1px solid #1E1E1E;
  overflow: hidden;
  position: relative;
  background: radial-gradient(ellipse at 50% 40%, rgba(20,50,100,0.18) 0%, transparent 70%);
}

.bv-figure-wrap {
  display: flex;
  align-items: stretch;
  justify-content: center;
  flex: 1;
  width: 100%;
  min-height: 0;
  overflow: hidden;
}

.bv-figure {
  display: block;
  width: 90%;
  height: 90%;
  max-width: none;
  max-height: none;
  margin: auto;
  overflow: visible;
}

/* SVG text elements */
.bv-figure-initial {
  font-family: 'Inter', sans-serif;
  font-size: 32px;
  font-weight: 700;
  fill: #7CB9FF;
  text-shadow: 0 0 12px rgba(100,160,255,0.5);
}

.bv-figure-name {
  font-family: 'Inter', sans-serif;
  font-size: 14px;
  font-weight: 700;
  fill: #C8D8F0;
}

.bv-figure-type {
  font-family: 'Inter', sans-serif;
  font-size: 10px;
  font-weight: 500;
  fill: #4A6080;
}

/* Hotspots */
.bv-hotspot { cursor: pointer; }

.bv-hotspot .bv-hs-circle {
  fill: #0D1929;
  stroke: #3A7BD5;
  stroke-width: 2;
  transition: fill 0.15s, stroke 0.15s;
}
.bv-hotspot:hover .bv-hs-circle {
  fill: rgba(30, 90, 200, 0.25);
  stroke: #5A9BFF;
}
.bv-hotspot.active .bv-hs-circle {
  fill: rgba(0, 122, 255, 0.30);
  stroke: #60AEFF;
}

.bv-hotspot .bv-hs-icon { font-size: 12px; user-select: none; }

.bv-hotspot .bv-hs-line {
  stroke: #1E3A5F;
  stroke-width: 1.5;
  stroke-dasharray: 4 3;
}
.bv-hotspot:hover .bv-hs-line { stroke: #3A6EA8; }
.bv-hotspot.active .bv-hs-line { stroke: #3A7BD5; stroke-dasharray: none; }

.bv-hotspot .bv-hs-label-bg {
  fill: #0A1525;
  stroke: #1E3A5F;
  stroke-width: 1.5;
  transition: fill 0.15s, stroke 0.15s;
}
.bv-hotspot:hover .bv-hs-label-bg { fill: #0F1E35; stroke: #2D5A8C; }
.bv-hotspot.active .bv-hs-label-bg { fill: rgba(0, 80, 180, 0.2); stroke: #3A7BD5; }

.bv-hotspot .bv-hs-label {
  font-family: 'Inter', sans-serif;
  font-size: 9.5px; font-weight: 700;
  fill: #4A6A9A; user-select: none;
  transition: fill 0.15s;
}
.bv-hotspot:hover .bv-hs-label { fill: #7AAADD; }
.bv-hotspot.active .bv-hs-label { fill: #7CB9FF; }

.bv-figure-hint {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: var(--fs-caption);
  color: #4B5563;
  padding-top: 0.25rem;
}

/* ── RIGHT column ────────────────────────────────────────────────────────── */
.bv-right {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.bv-detail-inner {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.bv-panel-enter-active,
.bv-panel-leave-active {
  transition: opacity 0.15s ease, transform 0.15s ease;
}
.bv-panel-enter-from,
.bv-panel-leave-to {
  opacity: 0;
  transform: translateX(6px);
}

.bv-detail-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.875rem 1rem 0.75rem;
  border-bottom: 1px solid #1E1E1E;
  flex-shrink: 0;
}

.bv-detail-icon { font-size: 1rem; }

.bv-detail-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #FFFFFF;
  flex: 1;
}

.bv-detail-close {
  width: 1.5rem; height: 1.5rem; border-radius: 0.375rem;
  background: transparent; border: none; color: #6B7280; cursor: pointer;
  display: flex; align-items: center; justify-content: center;
  transition: background 0.15s, color 0.15s;
}
.bv-detail-close:hover { background: #1A1A1A; color: #FFFFFF; }

.bv-detail-body {
  flex: 1; overflow-y: auto;
  padding: 0.875rem 1rem;
  display: flex; flex-direction: column; gap: 0.625rem;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.bv-detail-empty { font-size: var(--fs-secondary); color: #6B7280; padding: 0.25rem 0; }

/* Model panel */
.bv-model-section { display: flex; flex-direction: column; gap: 0.5rem; }
.bv-model-section-grow { flex: 1; min-height: 0; }

.bv-model-badge {
  font-size: var(--fs-small); font-weight: 600;
  font-family: 'JetBrains Mono', monospace;
  color: #60A5FA; background: rgba(0, 122, 255, 0.1);
  padding: 0.0625rem 0.3125rem; border-radius: 0.25rem;
}

.bv-provider-select { display: flex; flex-wrap: wrap; gap: 0.375rem; }

.bv-provider-option {
  padding: 0.25rem 0.75rem; border-radius: 9999px;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  color: #9CA3AF; font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption); font-weight: 600; cursor: pointer; transition: all 0.15s;
}
.bv-provider-option:hover { border-color: #4B5563; color: #FFFFFF; }
.bv-provider-option.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: #4B5563; color: #FFFFFF;
}

.bv-model-list {
  overflow-y: auto;
  border: 1px solid #2A2A2A; border-radius: 0.5rem;
  flex: 1; min-height: 0;
}

.bv-model-item {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  width: 100%; padding: 0.375rem 0.625rem;
  background: transparent; border: none; border-bottom: 1px solid #1E1E1E;
  color: #9CA3AF; font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption); cursor: pointer; text-align: left;
  transition: background 0.12s, color 0.12s;
}
.bv-model-item:last-child { border-bottom: none; }
.bv-model-item:hover { background: #1A1A1A; color: #FFFFFF; }
.bv-model-item.active { background: rgba(0, 122, 255, 0.1); color: #60A5FA; }

.bv-model-id {
  font-family: 'JetBrains Mono', monospace; font-size: 0.5625rem;
  color: #4B5563; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
  max-width: 7rem; flex-shrink: 0;
}
.bv-model-ctx,
.bv-model-out {
  font-family: 'Inter', sans-serif; font-size: 0.5625rem;
  padding: 0 0.375rem; border-radius: 0.25rem; flex-shrink: 0;
  letter-spacing: 0.02em; white-space: nowrap;
  display: inline-flex; align-items: center; gap: 0.25rem;
}
.bv-model-tag-label { opacity: 0.85; }
.bv-model-tag-value { font-family: 'JetBrains Mono', monospace; font-weight: 600; }
/* Green when value exists, amber when missing — same semantics as the config page */
.bv-model-ctx.has-value,
.bv-model-out.has-value {
  color: #34D399; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35);
}
.bv-model-ctx.is-missing {
  color: #F59E0B; background: rgba(245,158,11,0.1); border: 1px dashed rgba(245,158,11,0.4);
  font-style: italic;
}
/* Small-context override keeps amber-warn look when < 20k */
.bv-model-small-ctx .bv-model-ctx.has-value {
  color: #D97706; background: rgba(245,158,11,0.15); border-color: rgba(245,158,11,0.4);
}
.bv-model-item-name {
  flex: 1 1 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Capabilities */
.bv-cap-toolbar {
  display: flex; gap: 0.375rem; margin-bottom: 0.375rem;
}
.bv-cap-toggle-btn {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption); font-weight: 600;
  padding: 0.1875rem 0.625rem; border-radius: 0.375rem;
  background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.7);
  border: 1px solid rgba(255,255,255,0.12); cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.bv-cap-toggle-btn:hover {
  background: rgba(255,255,255,0.14); color: #FFFFFF;
}
.bv-cap-warning {
  display: flex; align-items: flex-start; gap: 0.375rem;
  padding: 0.4375rem 0.625rem; margin-bottom: 0.375rem;
  border-radius: 0.375rem;
  background: rgba(245, 158, 11, 0.12);
  border: 1px solid rgba(245, 158, 11, 0.3);
  color: #FCD34D;
  font-size: var(--fs-caption); line-height: 1.4;
}
.bv-cap-list {
  display: flex; flex-direction: column; gap: 0.1875rem;
  flex: 1; min-height: 0; overflow-y: auto;
  border: 1px solid #2A2A2A; border-radius: 0.5rem;
  margin-bottom: 0.5rem;
  scrollbar-width: thin; scrollbar-color: #333 transparent;
}
.bv-cap-list::-webkit-scrollbar { width: 4px; }
.bv-cap-list::-webkit-scrollbar-track { background: transparent; }
.bv-cap-list::-webkit-scrollbar-thumb { background: #333; border-radius: 9999px; }
.bv-cap-filter { flex: 1; min-width: 0; }

.bv-cap-item {
  display: flex; align-items: flex-start; gap: 0.5rem;
  padding: 0.375rem 0.5rem; border-radius: 0.375rem;
  cursor: pointer; transition: background 0.12s;
  border-bottom: 1px solid #1E1E1E;
}
.bv-cap-item:last-child { border-bottom: none; }
.bv-cap-item:hover { background: #1A1A1A; }

.bv-cap-item input[type="checkbox"] {
  width: 0.875rem; height: 0.875rem; flex-shrink: 0;
  cursor: pointer; accent-color: #4B5563;
  margin-top: 0.125rem;
}

.bv-cap-text { display: flex; flex-direction: column; gap: 0.125rem; min-width: 0; flex: 1; }

.bv-cap-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; color: #FFFFFF;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}

.bv-cap-desc {
  font-size: 0.6875rem; color: #6B7280; line-height: 1.3;
  display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden;
}
.bv-cap-disabled-badges {
  display: flex; flex-wrap: wrap; gap: 0.25rem; margin-bottom: 0.375rem;
}
.bv-cap-disabled-badge {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.125rem 0.5rem; border-radius: 9999px;
  background: rgba(107,114,128,0.1); border: 1px solid rgba(107,114,128,0.2);
  color: #6B7280; font-size: 0.6875rem;
  cursor: default; user-select: none;
}


/* Summary row — clickable cursor only when interactive */
.bv-summary-row { cursor: default; }
.bv-summary-row.clickable { cursor: pointer; }

/* Readonly text display */
.bv-readonly-text {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #D1D5DB;
  line-height: 1.55;
  padding: 0.3125rem 0;
}
.bv-readonly-multiline {
  white-space: pre-wrap;
  word-break: break-word;
  overflow-y: auto;
  max-height: 8rem;
}
.bv-readonly-grow {
  flex: 1;
  max-height: none;
  overflow-y: auto;
  min-height: 4rem;
}

/* Readonly detail sections (model / voice) */
.bv-ro-section { display: flex; flex-direction: column; gap: 0.25rem; margin-bottom: 0.75rem; }
.bv-ro-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.04em;
}
.bv-ro-value {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 600;
  color: #FFFFFF;
}
.bv-ro-hint {
  font-size: var(--fs-caption);
  color: #6B7280;
}

/* Readonly item lists (tools / skills / mcp / knowledge) */
.bv-ro-item-list { display: flex; flex-direction: column; gap: 0.375rem; }
.bv-ro-item {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0.5rem 0.625rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
}
.bv-ro-item-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
}
.bv-ro-item-desc {
  font-size: var(--fs-caption);
  color: #6B7280;
}


/* Voice */
.bv-voice-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 0.5rem; }

.bv-voice-card {
  display: flex; flex-direction: column; align-items: center; gap: 0.1875rem;
  padding: 0.625rem 0.5rem; background: #1A1A1A; border: 1px solid #2A2A2A;
  border-radius: 0.5rem; cursor: pointer; transition: all 0.15s;
}
.bv-voice-card:hover { border-color: #4B5563; }
.bv-voice-card.active { background: rgba(0, 122, 255, 0.1); border-color: #007AFF; }

.bv-voice-name { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 700; color: #FFFFFF; }
.bv-voice-desc { font-size: var(--fs-small); color: #6B7280; text-align: center; }

/* ── Footer ──────────────────────────────────────────────────────────────── */
.bv-footer {
  display: flex; align-items: center; justify-content: space-between;
  padding: 0.75rem 1.25rem; border-top: 1px solid #1E1E1E;
  background: #0A0A0A; flex-shrink: 0;
}

.bv-footer-right { display: flex; align-items: center; gap: 0.625rem; }

.bv-btn {
  padding: 0.4375rem 1.25rem; border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; cursor: pointer; border: none; transition: all 0.15s;
}

.bv-btn.secondary {
  background: #1A1A1A; color: #9CA3AF; border: 1px solid #2A2A2A;
}
.bv-btn.secondary:hover { background: #2A2A2A; color: #FFFFFF; }

.bv-btn.primary {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.bv-btn.primary:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

/* ── Summary panel (default right state) ────────────────────────────────── */
.bv-summary-panel {
  min-height: 0;
  flex: 1;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  padding: 0.875rem 0;
}

.bv-summary-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #4B5563;
  padding: 0 1rem 0.625rem;
  flex-shrink: 0;
}

.bv-summary-row {
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  padding: 0.625rem 1rem;
  border-bottom: 1px solid #141414;
  transition: background 0.12s;
  min-height: 2.75rem;
}
.bv-summary-row:last-child { border-bottom: none; }
.bv-summary-row.clickable:hover { background: #141414; }
.bv-summary-row.clickable:hover .bv-summary-chevron { color: #6B7280; }

.bv-summary-icon {
  font-size: 1rem;
  flex-shrink: 0;
  margin-top: 0.05rem;
  line-height: 1;
}

.bv-summary-content {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  min-width: 0;
}

.bv-summary-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #9CA3AF;
  line-height: 1;
}

.bv-summary-value {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #E5E7EB;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.bv-summary-value.muted { color: #4B5563; font-style: italic; }

.bv-summary-chips {
  display: flex;
  flex-wrap: wrap;
  gap: 0.25rem;
}

.bv-summary-chip {
  display: inline-block;
  padding: 0.125rem 0.5rem;
  border-radius: 9999px;
  background: #1A2A3A;
  border: 1px solid #2A3A4A;
  color: #7CB9FF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  white-space: nowrap;
}

.bv-summary-chevron {
  flex-shrink: 0;
  color: #2A2A2A;
  margin-top: 0.125rem;
  transition: color 0.12s;
}

.bv-summary-panel::-webkit-scrollbar { width: 4px; }
.bv-summary-panel::-webkit-scrollbar-track { background: transparent; }
.bv-summary-panel::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 9999px; }

/* ── Inline Avatar Picker Panel ──────────────────────────────────────────── */
.bv-avatar-panel { gap: 0.625rem; }

.bv-av-style-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-shrink: 0;
}
.bv-av-combo {
  position: relative;
  flex: 1;
}
.bv-av-combo-input {
  width: 100%;
  padding: 0.375rem 2rem 0.375rem 0.625rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  outline: none;
  transition: border-color 0.15s;
}
.bv-av-combo-input::placeholder { color: #FFFFFF; }
.bv-av-combo-input:focus { border-color: #4B5563; }
.bv-av-combo-input:focus::placeholder { color: #6B7280; }
.bv-av-combo-toggle {
  position: absolute;
  right: 0;
  top: 0;
  bottom: 0;
  width: 2rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: #6B7280;
  cursor: pointer;
  border-radius: 0 0.5rem 0.5rem 0;
  transition: color 0.15s;
}
.bv-av-combo-toggle:hover { color: #FFFFFF; }
.bv-av-combo-toggle svg { transition: transform 0.15s; }
.bv-av-combo.open .bv-av-combo-toggle svg { transform: rotate(180deg); }
.bv-av-combo-list {
  position: absolute;
  top: 100%;
  left: 0;
  right: 0;
  margin-top: 2px;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.5rem;
  max-height: 12rem;
  overflow-y: auto;
  z-index: 10;
  box-shadow: 0 8px 24px rgba(0, 0, 0, 0.4);
}
.bv-av-combo-option {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.375rem 0.625rem;
  background: transparent;
  border: none;
  color: #D1D5DB;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  text-align: left;
  cursor: pointer;
  transition: background 0.12s;
}
.bv-av-combo-option:hover { background: #222; color: #FFFFFF; }
.bv-av-combo-option.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; font-weight: 600;
}
.bv-av-combo-empty {
  padding: 0.5rem 0.625rem;
  color: #6B7280;
  font-size: var(--fs-caption);
  text-align: center;
}
.bv-av-combo-list::-webkit-scrollbar { width: 4px; }
.bv-av-combo-list::-webkit-scrollbar-track { background: transparent; }
.bv-av-combo-list::-webkit-scrollbar-thumb { background: #333; border-radius: 9999px; }

.bv-av-upload-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.3rem 0.75rem; border-radius: 0.5rem;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  color: #9CA3AF; font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption); font-weight: 600;
  cursor: pointer; flex-shrink: 0; transition: all 0.12s; width: fit-content;
}
.bv-av-upload-btn:hover { background: #222; color: #FFFFFF; border-color: #374151; }

.bv-av-grid {
  display: grid; grid-template-columns: repeat(4, 1fr); gap: 0.375rem;
  overflow-y: auto; flex: 1;
}
.bv-av-item {
  display: flex; align-items: center; justify-content: center;
  padding: 0.3rem; border-radius: 0.75rem; border: 2px solid transparent;
  background: transparent; cursor: pointer;
  transition: border-color 0.12s, background 0.12s;
}
.bv-av-item:hover { background: rgba(75,85,99,0.15); border-color: rgba(75,85,99,0.4); }
.bv-av-item.selected { border-color: #3D8BF0; background: rgba(61,139,240,0.1); }

/* ── Avatar pagination ───────────────────────────────────────────────────── */
.bv-av-pagination {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  flex-shrink: 0;
  padding-top: 0.125rem;
}

.bv-av-page-btn {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border-radius: 0.375rem;
  border: 1px solid #2A2A2A;
  background: #1A1A1A;
  color: #9CA3AF;
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;
}
.bv-av-page-btn:hover:not(:disabled) { background: #2A2A2A; color: #FFFFFF; border-color: #4B5563; }
.bv-av-page-btn:disabled { opacity: 0.35; cursor: not-allowed; }

.bv-av-page-info {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #6B7280;
  min-width: 2.5rem;
  text-align: center;
}

/* ── Save error ──────────────────────────────────────────────────────────── */
.bv-save-error {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #EF4444;
  font-weight: 500;
}

/* ── Provider/model mismatch warning ─────────────────────────────────────── */
/* ── Required field highlight ────────────────────────────────────────────── */
.bv-input.error,
.bv-textarea.error {
  border-color: #EF4444 !important;
  box-shadow: 0 0 0 2px rgba(239,68,68,0.15);
}

/* ── Scrollbars ──────────────────────────────────────────────────────────── */
.bv-left::-webkit-scrollbar,
.bv-detail-body::-webkit-scrollbar,
.bv-av-grid::-webkit-scrollbar,
.bv-model-list::-webkit-scrollbar { width: 4px; }
.bv-left::-webkit-scrollbar-track,
.bv-detail-body::-webkit-scrollbar-track,
.bv-av-grid::-webkit-scrollbar-track,
.bv-model-list::-webkit-scrollbar-track { background: transparent; }
.bv-left::-webkit-scrollbar-thumb,
.bv-detail-body::-webkit-scrollbar-thumb,
.bv-av-grid::-webkit-scrollbar-thumb,
.bv-model-list::-webkit-scrollbar-thumb { background: #333; border-radius: 9999px; }

.bv-ctx-warn {
  display: flex; align-items: flex-start; gap: 0.5rem;
  margin-top: 0.5rem; padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm, 8px);
  background: rgba(245, 158, 11, 0.1); border: 1px solid rgba(245, 158, 11, 0.3);
  color: #D97706; font-size: var(--fs-caption); font-family: 'Inter', sans-serif; line-height: 1.4;
}
.bv-test-row { display: flex; align-items: center; justify-content: flex-end; gap: 0.5rem; margin-top: 0.5rem; }
.bv-test-btn {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.25rem 0.5rem; border: none; border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; font-size: 0.6875rem; font-weight: 500; cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 1px 3px rgba(0,0,0,0.12);
}
.bv-test-btn:hover:not(:disabled) { box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
.bv-test-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.bv-test-result {
  display: inline-flex; align-items: center; gap: 0.25rem; font-size: 0.6875rem;
  max-width: 14rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; cursor: default;
}
.bv-test-result.success { color: #22C55E; }
.bv-test-result.warn { color: #D97706; }
.bv-test-result.error { color: #EF4444; }
.bv-model-hint {
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-size: 0.6875rem; font-weight: 400; color: #F59E0B; margin-left: 0.25rem;
}
@keyframes bv-spin { to { transform: rotate(360deg); } }
.bv-spin { animation: bv-spin 1s linear infinite; }

.bv-error-backdrop {
  position: fixed; inset: 0; z-index: 9999;
  background: rgba(0,0,0,0.5); backdrop-filter: blur(2px);
  display: flex; align-items: center; justify-content: center;
}
.bv-error-modal {
  background: #111; border: 1px solid #2A2A2A; border-radius: 0.75rem;
  width: 28rem; max-width: 90vw; max-height: 60vh; display: flex; flex-direction: column;
  box-shadow: 0 20px 60px rgba(0,0,0,0.4);
}
.bv-error-modal-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.75rem 1rem; border-bottom: 1px solid #2A2A2A;
  font-size: 0.8125rem; font-weight: 600; color: #EF4444;
}
.bv-error-modal-close {
  margin-left: auto; background: none; border: none; color: #6B7280; cursor: pointer;
  padding: 0.25rem; border-radius: 0.25rem; display: flex;
}
.bv-error-modal-close:hover { color: #FFFFFF; background: #1A1A1A; }
.bv-error-modal-body {
  padding: 1rem; font-size: 0.75rem; color: #D1D5DB;
  font-family: 'JetBrains Mono', monospace; line-height: 1.5;
  overflow-y: auto; white-space: pre-wrap; word-break: break-all;
}
</style>
