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
              <input v-else v-model="draftName" type="text" class="bv-input" :class="{ error: saveError && !draftName.trim() }" :placeholder="t('agents.agentNamePlaceholder')" spellcheck="false" @input="saveError = ''" />
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
              <textarea v-else v-model="draftDescription" class="bv-textarea" rows="3" :placeholder="t('agents.descriptionPlaceholder')" spellcheck="false"></textarea>
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
                  @click="!readOnly && togglePanel('avatar')" :style="{ cursor: readOnly ? 'default' : 'pointer' }"
                />
                <text v-else x="160" y="93" text-anchor="middle" class="bv-figure-initial">{{ fallbackInitial }}</text>
                <circle cx="160" cy="82" r="58" fill="none" stroke="#3D8BF0" stroke-width="2"
                  class="bv-avatar-hs" :class="{ active: activePanel === 'avatar' }"
                  @click="!readOnly && togglePanel('avatar')" :style="{ cursor: readOnly ? 'default' : 'pointer' }"/>
                <g v-if="!readOnly" class="bv-avatar-edit-hint" @click="togglePanel('avatar')" style="cursor:pointer;">
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
                <g v-if="agentType === 'system'" :key="'voice-hotspot'" class="bv-hotspot" :class="{ active: activePanel === 'voice' }" @click="togglePanel('voice')">
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
            <Transition name="bv-panel" mode="out-in">
              <div v-if="activePanel" :key="activePanel" class="bv-detail-inner">
                <div class="bv-detail-header">
                  <span class="bv-detail-icon">{{ panelIcon(activePanel) }}</span>
                  <span class="bv-detail-title">{{ panelLabel(activePanel) }}</span>
                  <button class="bv-detail-close" @click="activePanel = null">
                    <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>

                <!-- Memory -->
                <div v-if="activePanel === 'memory'" class="bv-detail-body">
                  <div v-if="memoryLoading" class="bv-detail-empty">{{ t('common.loading') }}...</div>
                  <template v-else>
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
                      <div class="bv-ro-value">{{ activeProviderOptions.find(p => p.id === draftProvider)?.label || draftProvider || '—' }}</div>
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
                      <div v-else class="bv-provider-select">
                        <button v-for="p in activeProviderOptions" :key="p.id" class="bv-provider-option" :class="{ active: draftProvider === p.id }" @click="selectProvider(p.id)">{{ p.label }}</button>
                      </div>
                    </div>
                    <!-- Mismatch warning -->
                    <div v-if="providerModelMismatch" class="bv-mismatch-warn">
                      <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                      <span>{{ t('agents.providerModelMismatchDetail', providerModelMismatch) }}</span>
                    </div>
                    <div class="bv-model-section bv-model-section-grow" v-if="draftProvider">
                      <label class="bv-field-label">
                        {{ t('agents.model') }}
                        <span v-if="currentModelLabel && currentModelLabel !== '—'" class="bv-model-badge">{{ currentModelLabel }}</span>
                      </label>
                      <input v-if="draftProviderType !== 'anthropic'" v-model="modelFilter" type="text" :placeholder="t('agents.searchModels')" class="bv-input bv-input-sm" />
                      <div class="bv-model-list">
                        <div v-if="modelsLoading" class="bv-detail-empty">{{ t('common.loading') }}...</div>
                        <button v-for="m in filteredModels" :key="m.id" class="bv-model-item" :class="{ active: draftModelId === m.id }" @click="draftModelId = m.id">
                          <span>{{ m.name || m.label || m.id }}</span>
                          <span v-if="m.id !== (m.name || m.label)" class="bv-model-id">{{ m.id }}</span>
                        </button>
                      </div>
                    </div>
                  </template>
                </div>

                <!-- Tools -->
                <div v-else-if="activePanel === 'tools'" class="bv-detail-body">
                  <!-- Readonly: only selected items -->
                  <template v-if="readOnly">
                    <div v-if="draftRequiredToolIds.length === 0" class="bv-detail-empty">{{ locale.value === 'zh' ? '未分配工具' : 'No tools assigned' }}</div>
                    <div v-else class="bv-ro-item-list">
                      <div v-for="id in draftRequiredToolIds" :key="id" class="bv-ro-item">
                        <span class="bv-ro-item-name">{{ availableTools.find(t => t.id === id)?.name || id }}</span>
                        <span class="bv-ro-item-desc">{{ availableTools.find(t => t.id === id)?.description || '' }}</span>
                      </div>
                    </div>
                  </template>
                  <!-- Editable -->
                  <template v-else>
                    <div v-if="availableTools.length === 0" class="bv-detail-empty">{{ t('agents.noToolsAvailable') }}</div>
                    <template v-else>
                      <div class="bv-cap-toolbar">
                        <button class="bv-cap-toggle-btn" @click="toggleSelectAll('tools')">
                          {{ draftRequiredToolIds.length === availableTools.length ? t('common.deselectAll') : t('common.selectAll') }}
                        </button>
                      </div>
                      <div v-if="draftRequiredToolIds.length > CAP_LIMITS.tools" class="bv-cap-warning">
                        <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {{ locale.value === 'zh' ? `已选 ${draftRequiredToolIds.length} 个工具，超过建议上限 ${CAP_LIMITS.tools}，可能影响准确度并增加 cost` : `${draftRequiredToolIds.length} tools selected — over the recommended limit of ${CAP_LIMITS.tools}. This may reduce accuracy and increase cost.` }}
                      </div>
                      <div class="bv-cap-list">
                        <label v-for="tool in availableTools" :key="tool.id" class="bv-cap-item">
                          <input type="checkbox" :value="tool.id" v-model="draftRequiredToolIds" />
                          <span class="bv-cap-name">{{ tool.name }}</span>
                          <span class="bv-cap-desc">{{ tool.description || tool.category || '' }}</span>
                        </label>
                      </div>
                    </template>
                  </template>
                </div>

                <!-- Skills -->
                <div v-else-if="activePanel === 'skills'" class="bv-detail-body">
                  <template v-if="readOnly">
                    <div v-if="draftRequiredSkillIds.length === 0" class="bv-detail-empty">{{ locale.value === 'zh' ? '未分配技能' : 'No skills assigned' }}</div>
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
                        <button class="bv-cap-toggle-btn" @click="toggleSelectAll('skills')">
                          {{ draftRequiredSkillIds.length === availableSkills.length ? t('common.deselectAll') : t('common.selectAll') }}
                        </button>
                      </div>
                      <div v-if="draftRequiredSkillIds.length > CAP_LIMITS.skills" class="bv-cap-warning">
                        <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {{ locale.value === 'zh' ? `已选 ${draftRequiredSkillIds.length} 个技能，超过建议上限 ${CAP_LIMITS.skills}，可能影响准确度并增加 cost` : `${draftRequiredSkillIds.length} skills selected — over the recommended limit of ${CAP_LIMITS.skills}. This may reduce accuracy and increase cost.` }}
                      </div>
                      <div class="bv-cap-list">
                        <label v-for="skill in availableSkills" :key="skill.id" class="bv-cap-item">
                          <input type="checkbox" :value="skill.id" v-model="draftRequiredSkillIds" />
                          <span class="bv-cap-name">{{ skill.name }}</span>
                          <span class="bv-cap-desc">{{ skill.summary || '' }}</span>
                        </label>
                      </div>
                    </template>
                  </template>
                </div>

                <!-- Knowledge -->
                <div v-else-if="activePanel === 'knowledge'" class="bv-detail-body">
                  <template v-if="readOnly">
                    <div v-if="draftRequiredKnowledgeBaseIds.length === 0" class="bv-detail-empty">{{ locale.value === 'zh' ? '未分配知识库' : 'No knowledge bases assigned' }}</div>
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
                        <button class="bv-cap-toggle-btn" @click="toggleSelectAll('knowledge')">
                          {{ draftRequiredKnowledgeBaseIds.length === availableKnowledgeBases.length ? t('common.deselectAll') : t('common.selectAll') }}
                        </button>
                      </div>
                      <div v-if="draftRequiredKnowledgeBaseIds.length > CAP_LIMITS.knowledge" class="bv-cap-warning">
                        <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {{ locale.value === 'zh' ? `已选 ${draftRequiredKnowledgeBaseIds.length} 个知识库，超过建议上限 ${CAP_LIMITS.knowledge}，可能影响准确度并增加 cost` : `${draftRequiredKnowledgeBaseIds.length} knowledge bases selected — over the recommended limit of ${CAP_LIMITS.knowledge}. This may reduce accuracy and increase cost.` }}
                      </div>
                      <div class="bv-cap-list">
                        <label v-for="kb in availableKnowledgeBases" :key="kb.id" class="bv-cap-item">
                          <input type="checkbox" :value="kb.id" v-model="draftRequiredKnowledgeBaseIds" />
                          <span class="bv-cap-name">{{ kb.name }}</span>
                          <span class="bv-cap-desc">{{ kb.description || '' }}</span>
                        </label>
                      </div>
                    </template>
                  </template>
                </div>

                <!-- MCP -->
                <div v-else-if="activePanel === 'mcp'" class="bv-detail-body">
                  <template v-if="readOnly">
                    <div v-if="draftRequiredMcpServerIds.length === 0" class="bv-detail-empty">{{ locale.value === 'zh' ? '未分配 MCP 服务器' : 'No MCP servers assigned' }}</div>
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
                        <button class="bv-cap-toggle-btn" @click="toggleSelectAll('mcp')">
                          {{ draftRequiredMcpServerIds.length === availableMcpServers.length ? t('common.deselectAll') : t('common.selectAll') }}
                        </button>
                      </div>
                      <div v-if="draftRequiredMcpServerIds.length > CAP_LIMITS.mcp" class="bv-cap-warning">
                        <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                        {{ locale.value === 'zh' ? `已选 ${draftRequiredMcpServerIds.length} 个 MCP 服务器，超过建议上限 ${CAP_LIMITS.mcp}，可能影响准确度并增加 cost` : `${draftRequiredMcpServerIds.length} MCP servers selected — over the recommended limit of ${CAP_LIMITS.mcp}. This may reduce accuracy and increase cost.` }}
                      </div>
                      <div class="bv-cap-list">
                        <label v-for="srv in availableMcpServers" :key="srv.id" class="bv-cap-item">
                          <input type="checkbox" :value="srv.id" v-model="draftRequiredMcpServerIds" />
                          <span class="bv-cap-name">{{ srv.name }}</span>
                          <span class="bv-cap-desc">{{ srv.description || '' }}</span>
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
                      <div class="bv-ro-value">{{ voiceOptions.find(v => v.value === draftVoiceId)?.label || draftVoiceId }}</div>
                      <div class="bv-ro-hint">{{ voiceOptions.find(v => v.value === draftVoiceId)?.desc || '' }}</div>
                    </div>
                  </template>
                  <template v-else>
                    <div class="bv-voice-grid">
                      <button v-for="v in voiceOptions" :key="v.value" class="bv-voice-card" :class="{ active: draftVoiceId === v.value }" @click="draftVoiceId = v.value">
                        <span class="bv-voice-name">{{ v.label }}</span>
                        <span class="bv-voice-desc">{{ v.desc }}</span>
                      </button>
                    </div>
                  </template>
                </div>

                <!-- Avatar picker (inline in right panel) -->
                <div v-else-if="activePanel === 'avatar'" class="bv-detail-body bv-avatar-panel">
                  <!-- Style tabs -->
                  <div class="bv-av-tabs">
                    <button
                      v-for="style in avatarStyles"
                      :key="style.key"
                      class="bv-av-tab"
                      :class="{ active: avatarStyleKey === style.key }"
                      @click="switchAvatarStyle(style.key)"
                    >{{ style.label }}</button>
                  </div>
                  <!-- Upload button -->
                  <label class="bv-av-upload-btn">
                    <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                    {{ locale.value === 'zh' ? '上传图片' : 'Upload Photo' }}
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
                <div class="bv-summary-title">{{ locale.value === 'zh' ? '能力总览' : 'Agent Overview' }}</div>

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
                <div v-if="agentType === 'system'" class="bv-summary-row clickable" @click="togglePanel('voice')">
                  <span class="bv-summary-icon">🎤</span>
                  <div class="bv-summary-content">
                    <span class="bv-summary-label">{{ t('agents.voice') }}</span>
                    <span class="bv-summary-value">{{ voiceOptions.find(v => v.value === draftVoiceId)?.label || draftVoiceId }}</span>
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
                      {{ draftRequiredToolIds.length === 0 ? (locale.value === 'zh' ? '未分配' : 'None') : (locale.value === 'zh' ? draftRequiredToolIds.length + ' 项' : draftRequiredToolIds.length + ' assigned') }}
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
                      {{ draftRequiredSkillIds.length === 0 ? (locale.value === 'zh' ? '未分配' : 'None') : (locale.value === 'zh' ? draftRequiredSkillIds.length + ' 项' : draftRequiredSkillIds.length + ' assigned') }}
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
                      {{ draftRequiredKnowledgeBaseIds.length === 0 ? (locale.value === 'zh' ? '未分配' : 'None') : (locale.value === 'zh' ? draftRequiredKnowledgeBaseIds.length + ' 项' : draftRequiredKnowledgeBaseIds.length + ' assigned') }}
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
                      {{ draftRequiredMcpServerIds.length === 0 ? (locale.value === 'zh' ? '未分配' : 'None') : (locale.value === 'zh' ? draftRequiredMcpServerIds.length + ' 项' : draftRequiredMcpServerIds.length + ' assigned') }}
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
</template>

<script setup>
import { ref, computed, nextTick, onMounted } from 'vue'
import { useAgentsStore } from '../../stores/agents'
import { useModelsStore } from '../../stores/models'
import { useConfigStore } from '../../stores/config'
import { useToolsStore } from '../../stores/tools'
import { useSkillsStore } from '../../stores/skills'
import { useMcpStore } from '../../stores/mcp'
import { useKnowledgeStore } from '../../stores/knowledge'
import { useI18n } from '../../i18n/useI18n'
import { getAvatarDataUri, STYLES, generateRandomBatch } from './agentAvatars'
import AppButton from '../common/AppButton.vue'

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
const draftVoiceId     = ref(props.agentVoiceId || 'alloy')

const draftRequiredToolIds          = ref([...(props.agentRequiredToolIds || [])])
const draftRequiredSkillIds         = ref([...(props.agentRequiredSkillIds || [])])
const draftRequiredMcpServerIds     = ref([...(props.agentRequiredMcpServerIds || [])])
const draftRequiredKnowledgeBaseIds = ref([...(props.agentRequiredKnowledgeBaseIds || [])])


const avatarDataUri   = computed(() => getAvatarDataUri(draftAvatar.value))
const fallbackInitial  = computed(() => (draftName.value || '?').charAt(0).toUpperCase())

// ── Inline avatar picker state ──────────────────────────────────────────────
const avatarStyles     = STYLES
const avatarBatchCache = new Map()
const avatarStyleKey   = ref('avataaars')
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

// ── Memory ─────────────────────────────────────────────────────────────────
const draftMemory   = ref('')
const memoryLoading = ref(!props.isNew)
const memoryLoaded  = ref(false)
const memoryLineCount = computed(() => draftMemory.value.split('\n').filter(l => l.trim()).length)

async function loadMemory() {
  if (memoryLoaded.value || props.isNew) return
  memoryLoading.value = true
  try {
    const data = await window.electronAPI.souls.read(props.agentId, props.agentType)
    draftMemory.value = data || ''
    memoryLoaded.value = true
  } catch (err) {
    console.error('[Memory] souls.read error', err)
  }
  memoryLoading.value = false
}

// Pre-load memory on mount so summary row shows correct count immediately.
onMounted(() => {
  if (!props.isNew) loadMemory()
})

// ── Voice options ──────────────────────────────────────────────────────────
const voiceOptions = [
  { value: 'alloy',   label: 'Alloy',   desc: 'Neutral, balanced' },
  { value: 'echo',    label: 'Echo',     desc: 'Warm, rounded' },
  { value: 'fable',   label: 'Fable',    desc: 'Expressive, British' },
  { value: 'onyx',    label: 'Onyx',     desc: 'Deep, authoritative' },
  { value: 'nova',    label: 'Nova',     desc: 'Friendly, upbeat' },
  { value: 'shimmer', label: 'Shimmer',  desc: 'Clear, gentle' },
]

// ── Provider / model ───────────────────────────────────────────────────────
const activeProviderOptions = computed(() => {
  const labels = { anthropic: 'Anthropic', openrouter: 'OpenRouter', openai: 'OpenAI', deepseek: 'DeepSeek' }
  return configStore.activeProviders.map(id => {
    const provider = configStore.config.providers.find(p => p.id === id)
    return { id, label: labels[provider?.type] || provider?.name || id }
  })
})

const initProvider  = props.agentProviderId || (configStore.activeProviders[0] || 'anthropic')
const draftProvider = ref(initProvider)
const draftModelId  = ref(props.agentModelId || null)
const modelFilter   = ref('')

const draftProviderType = computed(() => {
  const provider = configStore.config.providers.find(p => p.id === draftProvider.value)
  return provider?.type || 'anthropic'
})

function _detectModelProviderType(modelId) {
  if (!modelId) return null
  const m = modelId.toLowerCase()
  if (m.includes('deepseek')) return 'deepseek'
  if (m.includes('claude') || m.startsWith('anthropic/')) return 'anthropic'
  if (m.includes('gemini') || m.startsWith('google/')) return 'google'
  if (m.startsWith('gpt') || m.startsWith('o1') || m.startsWith('o3') || m.startsWith('o4') || m.startsWith('openai/')) return 'openai'
  return null
}

const providerModelMismatch = computed(() => {
  if (!draftModelId.value || draftProviderType.value === 'openrouter') return null
  const detectedType = _detectModelProviderType(draftModelId.value)
  if (!detectedType || detectedType === draftProviderType.value) return null
  const LABELS = { anthropic: 'Anthropic', openai: 'OpenAI', deepseek: 'DeepSeek', openrouter: 'OpenRouter', google: 'Google' }
  return { model: draftModelId.value, detected: LABELS[detectedType] || detectedType, provider: LABELS[draftProviderType.value] || draftProviderType.value }
})

const modelsLoading = computed(() => {
  const pt = draftProviderType.value
  return (pt === 'openrouter' && modelsStore.openrouterLoading) ||
         (pt === 'openai'     && modelsStore.openaiLoading) ||
         (pt === 'deepseek'   && modelsStore.deepseekLoading)
})

function selectProvider(prov) {
  draftProvider.value = prov
  draftModelId.value  = null
  modelFilter.value   = ''
  const provider = configStore.config.providers.find(p => p.id === prov)
  const pt = provider?.type || 'anthropic'
  if (pt === 'openrouter' && !modelsStore.openrouterCached) modelsStore.fetchOpenRouterModels()
  if (pt === 'openai'     && !modelsStore.openaiCached)     modelsStore.fetchOpenAIModels()
  if (pt === 'deepseek'   && !modelsStore.deepseekCached)   modelsStore.fetchDeepSeekModels()
}

const filteredModels = computed(() => {
  const q = modelFilter.value.trim().toLowerCase()
  const models = modelsStore.getModelsForProvider(draftProviderType.value)
  if (!q) return models
  return models.filter(m => (m.name || m.label || '').toLowerCase().includes(q) || m.id.toLowerCase().includes(q))
})

const currentModelLabel = computed(() => {
  if (!draftModelId.value) return '—'
  const models = modelsStore.getModelsForProvider(draftProviderType.value)
  const m = models.find(x => x.id === draftModelId.value)
  return m?.name || m?.label || draftModelId.value
})

// ── Capabilities data ──────────────────────────────────────────────────────
const CAP_LIMITS = { tools: 20, skills: 50, mcp: 5, knowledge: 3 }

const availableTools = computed(() => toolsStore.tools || [])
const availableSkills = computed(() => skillsStore.skills || [])
const availableMcpServers = computed(() => mcpStore.servers || [])
const availableKnowledgeBases = computed(() => {
  const configs = knowledgeStore.indexConfigs || {}
  return Object.entries(configs).map(([name, cfg]) => ({
    id: name, name, description: cfg.enabled ? 'Enabled' : 'Disabled',
  }))
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
  const text = (draftDescription.value || '') + ' ' + (draftPrompt.value || '')
  if (/[\u4e00-\u9fff]/.test(text)) return 'Chinese'
  if (/[\u3040-\u309f\u30a0-\u30ff]/.test(text)) return 'Japanese'
  if (/[\uac00-\ud7af]/.test(text)) return 'Korean'
  const appLang = configStore.config?.language || 'en'
  if (appLang.startsWith('zh')) return 'Chinese'
  return null
}

function getCharacterPromptSections(lang) {
  if (lang === 'Chinese') {
    return `### 身份定位
以”你是 [姓名/称谓] — [一句话核心特征]”开头，说明这个角色最本质的一点

### 核心限制
写一条这个角色绝对无法违反的行为规则——这是让角色有辨识度的灵魂
要求：必须是可观察的行为（不是内心感受），必须是无条件的（不能出现”通常”、”倾向于”等词）
参考格式（不要照抄，根据角色写专属的）：
“你只能用[具体方式]表达，绝无例外，哪怕对方要求你[极端情况]”
“你绝不会[具体行为]，每一次[相关动作]都必须包含[必要元素]”
“无论发生什么，你都必须[具体行为]，哪怕[极端情况]也不例外”

### 说话方式
根据这个角色的表达媒介，定义可直接操作的语言机制——不是性格描述，是执行规则

如果角色用文字说话：
- **必用句式**：2-3个每次都会出现的固定开场词或口头禅（用引号写出原话）
- **情绪编码对照表**：用什么符号/重复/停顿/大小写表达不同情绪，写成查表格式
- **禁用内容**：至少2条这个角色绝对不会说的具体话或词

如果角色用非文字媒介（emoji / 肢体动作 / 特殊符号等）：
- **表达系统**：定义这套媒介的映射规则，写成对照表（媒介单元 → 含义）
- **组合规则**：说明如何组合来表达复杂意思或情绪变化
- **禁用内容**：明确这个角色绝对不会用的表达方式

### 触发规则
写6条覆盖完全不同场景的 IF→THEN 规则
每条写”策略描述”而不是固定台词——描述这个角色会采取什么行动/态度，不要写死具体句子：
当被夸奖时 →
当被反驳或挑战时 →
当对方向自己求助时 →
当话题冷场或对方沉默时 →
当对方想结束对话时 →
当触碰到角色的敏感点时 →

### 示例对话
3组对话，每组展示不同的触发场景，每组至少2个来回
示例必须体现上面定义的口头禅、情绪编码和触发规则，让读者一眼就能感受到这个角色的独特质感

### 铁律
一句话锁死这个角色最不可妥协的特征：
格式：”永远[做什么]。哪怕[极端情况]，也绝不例外。”`
  }
  return `### Core Identity
Start with “You are [Name/Title] — [one defining trait]” — the single most essential thing about this character

### The Core Constraint
Write ONE absolute behavioral rule this character can NEVER violate — this is what makes them recognizable
Requirements: must be an OBSERVABLE BEHAVIOR (not an internal feeling); must be UNCONDITIONAL (no “tends to”, “usually”, “often”)
Reference formats (don't copy — write one that's specific to this character):
“You can ONLY [specific method of expression]. No exceptions, not even if [extreme situation]”
“You NEVER [specific behavior] — every [related action] must contain [required element]”
“No matter what, you always [specific behavior]. Even if [extreme situation], no exceptions”

### How You Speak
Don't describe personality — define executable language mechanics:

**Signature phrases**: 2-3 fixed openers or catchphrases this character uses in EVERY conversation (write them in quotes)
**Emotion encoding**: A reference table showing how this character uses punctuation/repetition/pauses/capitalization to encode different emotions
e.g. “.” = calm statement / “!” = excited / “...” = trailing off or loaded silence
**Forbidden content**: At least 2 specific things this character would NEVER say or words they would never use

### Trigger Rules
Write 6 IF→THEN rules — each must cover a completely different scenario
Each rule describes a STRATEGY or APPROACH, not a fixed line — describe what the character does/how they react, not a scripted sentence:
When complimented →
When contradicted or challenged →
When someone asks for help →
When the conversation goes silent or someone stops responding →
When someone tries to end the conversation →
When a sensitive topic is hit →

### Example Exchanges
3 exchanges, each showing a DIFFERENT trigger scenario, at least 2 turns each
Examples must actively demonstrate the signature phrases, emotion encoding, and trigger rules — let the reader feel this character's distinct voice immediately

### The One Rule
One final sentence locking in this character's most non-negotiable trait:
Format: “Always [do what]. Even if [extreme situation], no exceptions.”`
}

function getProfessionalPromptSections(lang) {
  if (lang === 'Chinese') {
    return `### 核心定位
以”你是 [名字]，[一句话定位]”开头，清晰说明这个Agent的专业身份和服务范围

### 专业能力
列出具体技能、工具、技术栈和细分领域（使用具体名称，不用泛称）；说明各项能力的深度和侧重点

### 工作规则
针对这个Agent实际会遇到的具体场景，写3-5条 IF→THEN 行为规则
格式：”当[这个Agent真实会遇到的场景]时，[具体做什么]——不允许[错误替代做法]”
规则必须专属于这个Agent的工作领域，不能写成通用套话

### 输出格式
定义这个Agent最常见输出类型的具体结构模板
根据这个Agent的实际工作产出写，不要写通用格式

### 边界约束
明确列出：不做什么 / 什么时候拒绝 / 什么时候必须追问才能继续
必须是这个Agent领域专属的限制，不是”遵循高标准”这种废话`
  }
  return `### Core Role
Start with “You are [Name], [one-line positioning]” — clearly state this agent's professional identity and scope

### Expertise & Tools
List specific skills, tools, tech stack, and sub-disciplines by name (no vague terms); describe the depth and focus of each area

### Working Rules
3-5 IF→THEN behavioral rules specific to THIS agent's actual work scenarios
Format: “When [a real scenario this agent faces], [do what] — never [wrong alternative]”
Rules must be domain-specific — no generic filler like “always include an actionable step”

### Output Format
Define the exact structural template for this agent's most common deliverable(s)
Write based on what this agent actually produces — not a generic format

### Hard Constraints
Explicit list of: what you won't do / when you refuse / what must be clarified before you proceed
Must be domain-specific to this agent — not generic quality platitudes`
}


function extractJSON(text) {
  const match = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (match) return match[1].trim()
  const start = text.indexOf('{')
  const end   = text.lastIndexOf('}')
  if (start >= 0 && end > start) return text.slice(start, end + 1)
  return text.trim()
}

async function surpriseMe() {
  if (aiWorking.value) return
  aiWorking.value = true
  aiWorkingMode.value = 'surprise'
  aiError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const lang = detectLanguage()
    const langInstruction = lang ? `IMPORTANT: Generate ALL fields entirely in ${lang}.\n\n` : ''
    const charSections = getCharacterPromptSections(lang)
    const profSections = getProfessionalPromptSections(lang)
    const nameRequirement = lang === 'Chinese'
      ? 'Name must be a realistic Chinese personal name (e.g., 李晓霖). Do NOT use titles or roles like "星空编织者".'
      : 'Name must be a realistic personal name (e.g., Alex Chen). Do NOT use titles or roles like "Starlight Weaver".'

    const res = await window.electronAPI.enhancePrompt({
      prompt: `${langInstruction}Generate a completely random, creative, and surprising agent — they could be anyone or anything: a quirky character, a niche professional, a fictional archetype, a roleplay persona. Be imaginative and unexpected.\n\nGenerate a realistic personal name.\n${nameRequirement}\n\nFirst, decide the agent type:\n- TYPE A (Professional/Functional): skills, tools, expertise-focused\n- TYPE B (Character/Persona): personality, relationship, behavior-focused\n\n## If TYPE A — use this structure:\n${profSections}\n\n## If TYPE B — use this structure:\n${charSections}\n\n## Output Format (CRITICAL - return ONLY valid JSON)\n{\n  "name": "realistic personal name",\n  "description": "keyword-style summary, max 100 characters, no prose",\n  "prompt": "### Section\\ncontent\\n\\n### Section\\ncontent..."\n}\n\nReturn ONLY valid JSON, no additional text.`,
      config,
    })
    if (res.success && res.text) {
      let data
      try { data = JSON.parse(extractJSON(res.text)) } catch {
        aiError.value = 'AI returned invalid JSON. Try again.'
        aiWorking.value = false
        return
      }
      // Surprise Me always randomizes the name
      if (data.name) {
        draftName.value = data.name
      }
      if (data.description) draftDescription.value = String(data.description)
      if (data.prompt)      draftPrompt.value = typeof data.prompt === 'string' ? data.prompt : JSON.stringify(data.prompt, null, 2)
      if (!draftAvatar.value) draftAvatar.value = `a${Math.floor(Math.random() * 36) + 1}`
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
    const descLine = desc
      ? `The user wants an agent described as: "${desc}"\n\n`
      : 'Generate a completely random, creative, and surprising agent. Be imaginative.\n\n'
    const lang = detectLanguage()
    const langInstruction = lang ? `IMPORTANT: Write ALL output entirely in ${lang}.\n\n` : ''
    const charSections = getCharacterPromptSections(lang)
    const profSections = getProfessionalPromptSections(lang)
    const existingName = draftName.value?.trim()
    const nameRequirement = existingName
      ? ''
      : (lang === 'Chinese'
        ? 'Name must be a realistic Chinese personal name (e.g., 李晓霖). Do NOT use titles or roles like "星空编织者".'
        : 'Name must be a realistic personal name (e.g., Alex Chen). Do NOT use titles or roles like "Starlight Weaver".')

    const nameInstruction = existingName
      ? `The agent's name is "${existingName}". Use this exact name in the "name" JSON field AND as the identity name throughout the "prompt" field (e.g., the prompt must start with "You are ${existingName} — ..."). Do NOT generate a different name.`
      : 'Generate a realistic personal name.'

    const res = await window.electronAPI.enhancePrompt({
      prompt: `${langInstruction}${descLine}First, determine the agent type from the description:\n- TYPE A (Professional/Functional): the description focuses on skills, tools, expertise, domain knowledge — e.g. "2D美工", "code reviewer", "data analyst"\n- TYPE B (Character/Persona): the description focuses on a person's personality, role, relationship — e.g. "grumpy doctor", "supportive friend", "fictional wizard"\n\nThen generate a detailed definition using the matching section structure below. Expand VERTICALLY — go deeper into what is described, not sideways into unrelated areas.\n\n${nameInstruction}\n${nameRequirement}\n\n## If TYPE A — use this structure:\n${profSections}\n\n## If TYPE B — use this structure:\n${charSections}\n\n## Output Format (CRITICAL)\n- Return ONLY valid JSON, no markdown fences, no extra text\n- The "prompt" field MUST be a single plain string with markdown section headers inside — NOT a nested object\n{\n  "name": "realistic personal name",\n  "description": "keyword-style summary, max 100 characters, no prose sentences",\n  "prompt": "### Section\\ncontent\\n\\n### Section\\ncontent..."\n}`,
      config,
    })
    if (res.success && res.text) {
      let data
      try { data = JSON.parse(extractJSON(res.text)) } catch {
        aiError.value = 'AI returned invalid JSON. Try again.'
        aiWorking.value = false
        return
      }
      // Preserve existing name if user provided it
      if (!draftName.value?.trim() && data.name) {
        draftName.value = data.name
      }
      if (data.description) draftDescription.value = String(data.description)
      if (data.prompt)      draftPrompt.value = typeof data.prompt === 'string' ? data.prompt : JSON.stringify(data.prompt, null, 2)
      if (!draftAvatar.value) draftAvatar.value = `a${Math.floor(Math.random() * 36) + 1}`
    } else {
      aiError.value = res.error || 'Generation failed. Check utility model config.'
    }
  } catch (err) {
    aiError.value = err.message || 'Generation failed.'
  }
  aiWorking.value = false
  aiWorkingMode.value = ''
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
    const res = await window.electronAPI.enhancePrompt({
      prompt: `${langInstruction}Enrich this agent description with implied specifics. Rules:\n- Maximum 100 characters total\n- Infer and ADD the concrete details that naturally belong to this domain but weren't spelled out — specific tools by name, sub-disciplines, platforms, techniques, workflows\n- Keep the same direction; do NOT introduce unrelated fields\n- Replace vague phrases ("各种工具", "大量经验") with the actual specifics they imply\n- Format: short factual phrases separated by commas — NOT prose sentences\n- Return ONLY the enriched description, nothing else\n\nExample: "精通2D美工，有游戏Art经验" → "2D角色/场景设计，游戏原画，PS/SAI/SP，手游美术规范"\n\nOriginal:\n${draftDescription.value}`,
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
    const langInstruction = `IMPORTANT: Write ALL output entirely in ${lang}.\n\n`
    const charSections = getCharacterPromptSections(lang === 'English' ? null : lang)
    const profSections = getProfessionalPromptSections(lang === 'English' ? null : lang)
    const anchorDesc = draftDescription.value.trim()
    const anchorNote = anchorDesc
      ? `The agent's core description is: "${anchorDesc}". The enhanced definition MUST stay anchored to this — deepen it vertically, do NOT drift into unrelated directions.\n\n`
      : ''
    const enhancementPrompt = `${langInstruction}${anchorNote}Enhance this agent definition. First determine the type from the existing content:\n- TYPE A (Professional/Functional): focuses on skills, tools, expertise → use Professional sections\n- TYPE B (Character/Persona): focuses on personality, relationship, roleplay → use Character sections\n\nRules:\n- Expand VERTICALLY — go deeper into what is already there, more specific and actionable\n- Keep the same section structure; enrich each section's content\n- Do NOT add sections from the wrong type (e.g. do NOT add 心理动机 to a professional agent)\n- Return ONLY the enhanced definition text, nothing else\n\n## Professional sections (TYPE A):\n${profSections}\n\n## Character sections (TYPE B):\n${charSections}\n\nOriginal Definition:\n${draftPrompt.value}`

    const res = await window.electronAPI.enhancePrompt({
      prompt: enhancementPrompt,
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
  if (!draftName.value.trim()) {
    saveError.value = locale.value === 'zh' ? '名称不能为空' : 'Name is required'
    return
  }
  if (props.agentType === 'system' && !draftPrompt.value.trim()) {
    saveError.value = locale.value === 'zh' ? '系统提示词不能为空' : 'Definition (system prompt) is required'
    return
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
    saveError.value = locale.value === 'zh'
      ? `已存在名为"${duplicate.name}"的 Agent`
      : `An agent named "${duplicate.name}" already exists.`
    return
  }
  emit('update-agent', {
    name:        draftName.value,
    avatar:      draftAvatar.value,
    description: draftDescription.value,
    prompt:      draftPrompt.value,
    providerId:  draftProvider.value,
    modelId:     draftModelId.value || null,
    voiceId:     draftVoiceId.value,
    requiredToolIds:          draftRequiredToolIds.value || [],
    requiredSkillIds:         draftRequiredSkillIds.value || [],
    requiredMcpServerIds:     draftRequiredMcpServerIds.value || [],
    requiredKnowledgeBaseIds: draftRequiredKnowledgeBaseIds.value || [],
  })
  if (memoryLoaded.value) {
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
  flex: 1; overflow-y: auto;
  border: 1px solid #2A2A2A; border-radius: 0.5rem; min-height: 5rem;
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
.bv-cap-list { display: flex; flex-direction: column; gap: 0.1875rem; }

.bv-cap-item {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 0.375rem 0.5rem; border-radius: 0.375rem;
  cursor: pointer; transition: background 0.12s;
}
.bv-cap-item:hover { background: #1A1A1A; }

.bv-cap-item input[type="checkbox"] {
  width: 0.875rem; height: 0.875rem; flex-shrink: 0;
  cursor: pointer; accent-color: #007AFF;
}

.bv-cap-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; color: #FFFFFF;
}

.bv-cap-desc {
  font-size: var(--fs-caption); color: #6B7280; margin-left: auto;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 7rem;
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

.bv-av-tabs {
  display: flex; flex-wrap: wrap; gap: 0.25rem;
  max-height: 5rem; overflow-y: auto; flex-shrink: 0;
}
.bv-av-tab {
  padding: 0.2rem 0.625rem; border-radius: 9999px;
  border: 1px solid #2A2A2A; background: #1A1A1A;
  color: #6B7280; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small); font-weight: 600;
  cursor: pointer; white-space: nowrap; transition: all 0.12s;
}
.bv-av-tab:hover:not(.active) { background: #222; color: #D1D5DB; border-color: #374151; }
.bv-av-tab.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; border-color: #4B5563;
}

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
.bv-mismatch-warn {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 0.5rem 0.625rem;
  border-radius: var(--radius-sm);
  background: rgba(245, 158, 11, 0.08);
  border: 1px solid rgba(245, 158, 11, 0.25);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #92400E;
  font-weight: 500;
  line-height: 1.4;
  margin-top: 0.5rem;
}

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
.bv-av-tabs::-webkit-scrollbar,
.bv-model-list::-webkit-scrollbar { width: 4px; }
.bv-left::-webkit-scrollbar-track,
.bv-detail-body::-webkit-scrollbar-track,
.bv-av-grid::-webkit-scrollbar-track,
.bv-av-tabs::-webkit-scrollbar-track,
.bv-model-list::-webkit-scrollbar-track { background: transparent; }
.bv-left::-webkit-scrollbar-thumb,
.bv-detail-body::-webkit-scrollbar-thumb,
.bv-av-grid::-webkit-scrollbar-thumb,
.bv-av-tabs::-webkit-scrollbar-thumb,
.bv-model-list::-webkit-scrollbar-thumb { background: #2A2A2A; border-radius: 9999px; }
</style>
