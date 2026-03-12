<template>
  <Teleport to="body">
    <div v-if="visible" class="pe-backdrop">
      <div class="pe-modal">

        <!-- Header -->
        <div class="pe-header">
          <div class="pe-header-left">
            <div class="pe-header-icon">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
            </div>
            <span class="pe-header-title">{{ isNew ? 'New Plan' : 'Edit Plan' }}</span>
          </div>
          <div class="pe-header-center">
            <button v-if="!isNew" class="pe-history-btn" @click="showHistory = true">
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
              Execution History
            </button>
          </div>
          <button class="pe-close-btn" @click="cancel">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Two-column layout: form | workflow canvas -->
        <div class="pe-columns" :style="{ '--split-pct': splitPct + '%' }">

          <!-- LEFT: form -->
          <div class="pe-body">

            <!-- Icon + Name row -->
            <div class="pe-field">
              <label class="pe-label">Plan name <span class="pe-required">*</span></label>
              <div class="pe-name-row">
                <button class="pe-icon-btn" @click="showIconPicker = true" title="Choose icon">{{ draft.icon || '📋' }}</button>
                <input v-model="draft.name" class="pe-input" placeholder="e.g. Daily Market Pipeline" maxlength="80" />
                <EmojiPicker v-if="showIconPicker" :current="draft.icon" @select="e => { draft.icon = e; showIconPicker = false }" @close="showIconPicker = false" />
              </div>
            </div>

            <!-- Description -->
            <div class="pe-field">
              <label class="pe-label">Description</label>
              <input v-model="draft.description" class="pe-input" placeholder="What does this plan accomplish?" maxlength="200" />
            </div>

            <!-- Steps -->
            <div class="pe-section">
              <div class="pe-section-header">
                <div class="pe-section-icon">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <span class="pe-section-title">Steps</span>
                <span class="pe-section-hint">Steps can run in parallel — set dependencies to sequence them</span>
              </div>

              <div v-if="draft.steps.length === 0" class="pe-no-steps">
                No steps yet — add one below.
              </div>

              <div class="pe-steps-list">
                <div v-for="(step, stepIdx) in draft.steps" :key="step.id" class="pe-step-card">

                  <!-- Step header -->
                  <div class="pe-step-head">
                    <div class="pe-step-num">{{ stepIdx + 1 }}</div>
                    <span class="pe-step-task-label">
                      {{ taskName(step.taskId) || 'Select a task →' }}
                    </span>
                    <div class="pe-step-actions">
                      <button class="pe-step-btn" @click="moveStep(stepIdx, -1)" :disabled="stepIdx === 0" title="Move up">
                        <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="18 15 12 9 6 15"/></svg>
                      </button>
                      <button class="pe-step-btn" @click="moveStep(stepIdx, 1)" :disabled="stepIdx === draft.steps.length - 1" title="Move down">
                        <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                      </button>
                      <button class="pe-step-btn pe-step-remove" @click="removeStep(stepIdx)" title="Remove step">
                        <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  </div>

                  <!-- Task picker -->
                  <div class="pe-step-field">
                    <label class="pe-step-label">Task</label>
                    <select v-model="step.taskId" class="pe-select" @change="onTaskChange(step)">
                      <option value="">— select task —</option>
                      <option v-for="t in tasks" :key="t.id" :value="t.id">{{ t.icon }} {{ t.name }}</option>
                    </select>
                  </div>

                  <!-- Agents -->
                  <template v-if="step.taskId">
                    <div class="pe-step-field">
                      <label class="pe-step-label">Agent(s) <span class="pe-required">*</span></label>
                      <div class="pe-agent-chips">
                        <div v-for="pid in step.defaultAgentIds" :key="pid" class="pe-agent-chip">
                          {{ agentName(pid) }}
                          <button class="pe-chip-remove" @click="removeDefaultAgent(step, pid)">
                            <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                          </button>
                        </div>
                        <select class="pe-select pe-select-add-agent" @change="addDefaultAgent(step, $event)">
                          <option value="">+ Add agent</option>
                          <option v-for="p in availableAgentsForStep(step)" :key="p.id" :value="p.id">{{ p.name }}</option>
                        </select>
                      </div>
                    </div>
                  </template>

                  <!-- Prompt override (optional) -->
                  <div v-if="step.taskId" class="pe-step-field">
                    <label class="pe-step-label">Prompt override <span class="pe-step-label-hint">(leave blank to use task prompt)</span></label>
                    <textarea v-model="step.promptOverride" class="pe-textarea" rows="2" placeholder="Override the task prompt for this step only…"></textarea>
                    <!-- Output token pills for dependencies -->
                    <div v-if="(step.dependsOn || []).length > 0" class="pe-output-tokens">
                      <span class="pe-output-tokens-label">Insert output token:</span>
                      <code
                        v-for="depId in step.dependsOn"
                        :key="depId"
                        class="pe-output-token"
                        :title="`Insert output of step: ${stepLabel(depId)}`"
                        @click="insertOutputToken(step, depId)"
                      >&#123;&#123;output:{{ stepLabel(depId) }}}}</code>
                    </div>
                  </div>

                  <!-- Run order / dependencies (collapsible) -->
                  <div v-if="stepIdx > 0" class="pe-dep-section">
                    <button class="pe-dep-toggle" @click="toggleDep(step.id)" type="button">
                      <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="11" x2="5" y2="16"/><line x1="12" y1="11" x2="19" y2="16"/></svg>
                      Run order
                      <span v-if="(step.dependsOn || []).length > 0" class="pe-dep-count">
                        {{ step.dependsOn.length }} dep{{ step.dependsOn.length !== 1 ? 's' : '' }}
                      </span>
                      <svg class="pe-dep-chevron" :class="depOpen[step.id] && 'pe-dep-chevron--open'" style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="6 9 12 15 18 9"/></svg>
                    </button>

                    <div v-if="depOpen[step.id]" class="pe-dep-body">
                      <div class="pe-dep-hint">By default steps without dependencies run in parallel. Select steps this step must wait for.</div>
                      <div class="pe-dep-chips">
                        <button
                          v-for="prev in draft.steps.slice(0, stepIdx)"
                          :key="prev.id"
                          type="button"
                          :class="['pe-dep-chip', (step.dependsOn || []).includes(prev.id) && 'pe-dep-chip--active']"
                          @click="toggleDepStep(step, prev.id)"
                        >
                          <span class="pe-dep-chip-num">{{ draft.steps.indexOf(prev) + 1 }}</span>
                          {{ taskName(prev.taskId) || '(no task)' }}
                          <svg v-if="(step.dependsOn || []).includes(prev.id)" style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        </button>
                      </div>

                      <div v-if="(step.dependsOn || []).length > 0" class="pe-dep-cond-row">
                        <label class="pe-dep-cond-label">Run condition</label>
                        <div class="pe-dep-cond-btns">
                          <button
                            v-for="c in RUN_CONDITIONS"
                            :key="c.id"
                            type="button"
                            :class="['pe-dep-cond-btn', (step.runCondition || 'always') === c.id && 'pe-dep-cond-btn--active', `pe-dep-cond-btn--${c.id}`]"
                            @click="step.runCondition = c.id"
                          >
                            <span class="pe-dep-cond-dot" :class="`pe-dep-cond-dot--${c.id}`"></span>
                            {{ c.label }}
                          </button>
                        </div>
                        <div class="pe-dep-cond-desc">{{ conditionDesc(step) }}</div>
                      </div>
                    </div>
                  </div>

                </div>
              </div>

              <button class="pe-add-step-btn" @click="addStep">
                <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                Add Step
              </button>
            </div>

            <!-- Schedule -->
            <div class="pe-section">
              <div class="pe-section-header">
                <div class="pe-section-icon">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                </div>
                <span class="pe-section-title">Schedule</span>
                <div v-if="draft.schedule.type !== 'manual'" class="pe-sched-toggle-row" @click.stop>
                  <button
                    type="button"
                    :class="['pe-toggle-switch', draft.schedule.enabled && 'pe-toggle-switch--on']"
                    @click="draft.schedule.enabled = !draft.schedule.enabled"
                    :title="draft.schedule.enabled ? 'Schedule enabled — click to disable' : 'Schedule disabled — click to enable'"
                  >
                    <span class="pe-toggle-knob"></span>
                  </button>
                  <span class="pe-toggle-label">{{ draft.schedule.enabled ? 'Enabled' : 'Disabled' }}</span>
                </div>
              </div>

              <div class="pe-schedule-types">
                <button
                  v-for="type in ['manual', 'once', 'cron']"
                  :key="type"
                  :class="['pe-sched-type-btn', draft.schedule.type === type && 'pe-sched-type-btn--active']"
                  @click="draft.schedule.type = type"
                >{{ schedTypeLabel(type) }}</button>
              </div>

              <div v-if="draft.schedule.type === 'once'" class="pe-field">
                <label class="pe-label">Run at</label>
                <div class="pe-datetime-row">
                  <button class="pe-pick-btn" @click="$refs.dtInput.showPicker ? $refs.dtInput.showPicker() : $refs.dtInput.click()" type="button" title="Pick date &amp; time">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    Pick
                  </button>
                  <input ref="dtInput" v-model="draft.schedule.runAt" type="datetime-local" class="pe-dt-input" />
                </div>
              </div>

              <template v-if="draft.schedule.type === 'cron'">
                <div class="pe-cron-presets">
                  <button
                    v-for="preset in CRON_PRESETS"
                    :key="preset.label"
                    :class="['pe-preset-btn', draft.schedule.cron === preset.cron && 'pe-preset-btn--active']"
                    @click="draft.schedule.cron = preset.cron"
                  >{{ preset.label }}</button>
                </div>
                <div class="pe-field">
                  <div class="pe-cron-field-header">
                    <label class="pe-label">Cron expression</label>
                    <button type="button" class="pe-cron-gen-btn" @click="showCronGen = !showCronGen">
                      <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      Generate from description
                    </button>
                  </div>
                  <input v-model="draft.schedule.cron" class="pe-input pe-mono" placeholder="0 18 * * 1-5" />
                  <!-- Natural language generator panel -->
                  <div v-if="showCronGen" class="pe-cron-gen-panel">
                    <div class="pe-cron-gen-hint">Describe your schedule in plain English:</div>
                    <div class="pe-cron-gen-row">
                      <input v-model="cronGenInput" class="pe-input" placeholder='e.g. "every weekday at 9am"' @keydown.enter="generateCronFromNL" />
                      <button type="button" class="pe-cron-gen-submit" @click="generateCronFromNL" :disabled="cronGenLoading">
                        <svg v-if="cronGenLoading" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="pe-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                        <span v-else>→</span>
                      </button>
                    </div>
                    <div v-if="cronGenError" class="pe-cron-gen-error">
                      <svg style="width:11px;height:11px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                      {{ cronGenError }}
                    </div>
                  </div>
                  <!-- AI description -->
                  <div v-if="cronAiDescLoading" class="pe-cron-desc pe-cron-desc--loading">
                    <svg style="width:11px;height:11px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" class="pe-spin"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    Explaining…
                  </div>
                  <div v-else-if="cronAiDescError" class="pe-cron-desc pe-cron-desc--error">
                    <svg style="width:11px;height:11px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
                    {{ cronAiDescError }}
                  </div>
                  <div v-else-if="cronAiDesc" class="pe-cron-desc">
                    <svg style="width:11px;height:11px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                    {{ cronAiDesc }}
                  </div>
                  <!-- Next 7 occurrences -->
                  <div v-if="cronNextOccurrences(draft.schedule.cron).length" class="pe-cron-next">
                    <div class="pe-cron-next-label">Next 7 occurrences</div>
                    <div class="pe-cron-next-list">
                      <span v-for="(ts, i) in cronNextOccurrences(draft.schedule.cron)" :key="i" class="pe-cron-next-chip">{{ ts }}</span>
                    </div>
                  </div>
                </div>
                <div class="pe-field">
                  <label class="pe-label">Timezone</label>
                  <input v-model="draft.schedule.timezone" class="pe-input" placeholder="UTC" />
                </div>
              </template>

              <div v-if="draft.schedule.type !== 'manual'" class="pe-sched-enable-hint">
                <span class="pe-pass-hint">{{ draft.schedule.enabled ? 'This plan will run automatically on schedule.' : 'Schedule disabled — won\'t run automatically.' }}</span>
              </div>
            </div>

            <!-- Permissions -->
            <div class="pe-section">
              <div class="pe-section-header">
                <div class="pe-section-icon">
                  <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                </div>
                <span class="pe-section-title">Permissions</span>
              </div>

              <div class="pe-perm-btns">
                <button
                  v-for="m in PERMISSION_MODES"
                  :key="m.id"
                  type="button"
                  :class="['pe-perm-btn', draft.permissionMode === m.id && 'pe-perm-btn--active']"
                  @click="draft.permissionMode = m.id"
                >{{ m.label }}</button>
              </div>
              <p class="pe-perm-hint">
                <template v-if="draft.permissionMode === 'inherit'">Uses the global mode from Config → Security.</template>
                <template v-else-if="draft.permissionMode === 'chat_only'">Agent asks permission before running shell commands or writing files.</template>
                <template v-else>Agent can run any tool freely. Danger blocks still apply.</template>
              </p>

              <!-- Allow list (shown for inherit + chat_only) -->
              <template v-if="draft.permissionMode !== 'all_permissions'">
                <div class="pe-perm-allow-label">
                  Allow List
                  <span class="pe-perm-badge">{{ draft.allowList.length }}</span>
                </div>
                <div class="pe-perm-allow-list">
                  <div v-if="draft.allowList.length === 0" class="pe-perm-empty">No entries — all shell/file ops require approval.</div>
                  <div v-for="(entry, i) in draft.allowList" :key="entry.id" class="pe-perm-entry">
                    <span class="pe-perm-pattern">{{ entry.pattern }}</span>
                    <span v-if="entry.description" class="pe-perm-desc">{{ entry.description }}</span>
                    <button class="pe-perm-remove" @click="removeAllowEntry(i)" title="Remove">
                      <svg style="width:9px;height:9px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                  </div>
                  <div class="pe-perm-add-row">
                    <input v-model="newAllowPattern" class="pe-perm-input" placeholder="glob pattern, e.g. node *" @keydown.enter="addAllowEntry" />
                    <input v-model="newAllowDesc" class="pe-perm-input pe-perm-input--desc" placeholder="description (optional)" @keydown.enter="addAllowEntry" />
                    <button class="pe-perm-add-btn" @click="addAllowEntry" :disabled="!newAllowPattern.trim()">Add</button>
                  </div>
                </div>
              </template>
            </div>

          </div>

          <!-- DRAG DIVIDER -->
          <div class="pe-divider" @mousedown="onDividerMousedown">
            <div class="pe-divider-handle"></div>
          </div>

          <!-- RIGHT: workflow canvas -->
          <div class="pe-canvas">
            <div class="pe-canvas-label">
              <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="11" x2="5" y2="16"/><line x1="12" y1="11" x2="19" y2="16"/></svg>
              Workflow Preview
            </div>

            <!-- Horizontal flow scroll -->
            <div class="pe-flow-scroll">
              <div v-if="draft.steps.length === 0" class="pe-flow-empty">
                <svg style="width:28px;height:28px;opacity:0.2;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="5" r="3"/><line x1="12" y1="8" x2="12" y2="11"/><circle cx="5" cy="19" r="3"/><circle cx="19" cy="19" r="3"/><line x1="12" y1="11" x2="5" y2="16"/><line x1="12" y1="11" x2="19" y2="16"/></svg>
                <span>Add steps to see the workflow</span>
              </div>

              <div v-else class="pe-flow">

                <!-- START terminus -->
                <div class="pf-terminus">
                  <div class="pf-terminus-dot"></div>
                  <span>START</span>
                </div>

                <template v-for="(wave, wi) in flowWaves" :key="wi">
                  <!-- Horizontal connector -->
                  <div class="pf-hconn">
                    <div class="pf-hconn-line"></div>
                    <svg class="pf-hconn-arrow" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 1 5 5 9 1"/></svg>
                  </div>

                  <!-- Wave column -->
                  <div class="pf-wave-col">
                    <div v-if="wave.length > 1" class="pf-wave-tag">
                      <span class="pf-wave-parallel">parallel ×{{ wave.length }}</span>
                    </div>

                    <div
                      v-for="node in wave"
                      :key="node.stepId"
                      :class="['pf-step-block', node.condClass]"
                    >
                      <!-- Step pill -->
                      <div class="pf-step-pill">
                        <span class="pf-step-num">{{ node.stepIndex + 1 }}</span>
                        <span class="pf-step-task">{{ node.taskIcon }} {{ node.taskName }}</span>
                        <span v-if="node.conditionBadge" :class="['pf-cond-badge', `pf-cond-badge--${node.runCondition}`]">
                          <span class="pf-cond-dot" :class="`pf-cond-dot--${node.runCondition}`"></span>
                          {{ node.conditionBadge }}
                        </span>
                      </div>

                      <!-- Depends-on line -->
                      <div v-if="node.dependsOnLabels.length > 0" class="pf-depends-on">
                        after: {{ node.dependsOnLabels.join(', ') }}
                      </div>

                      <!-- Agents -->
                      <div class="pf-agents-line">
                        <span class="pf-agents-label">Agent:</span>
                        <span class="pf-agents-names">{{ node.agents.length ? node.agents.map(p => p.name).join(', ') : '—' }}</span>
                      </div>
                    </div>
                  </div>
                </template>

                <!-- Final connector + END -->
                <div class="pf-hconn">
                  <div class="pf-hconn-line"></div>
                  <svg class="pf-hconn-arrow" viewBox="0 0 10 6" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="1 1 5 5 9 1"/></svg>
                </div>
                <div class="pf-terminus">
                  <div class="pf-terminus-dot pf-terminus-dot--end"></div>
                  <span>END</span>
                </div>

              </div>
            </div>

            <!-- Legend -->
            <div class="pe-canvas-legend">
              <span class="pf-legend-item"><span class="pf-legend-dot pf-legend-dot--parallel"></span>Parallel</span>
              <span class="pf-legend-item"><span class="pf-legend-dot pf-legend-dot--success"></span>On success</span>
              <span class="pf-legend-item"><span class="pf-legend-dot pf-legend-dot--failure"></span>On failure</span>
            </div>
          </div>

        </div>

        <!-- Footer -->
        <div class="pe-footer">
          <div class="pe-footer-errors">
            <div v-for="err in validationErrors" :key="err" class="pe-footer-err">
              <svg style="width:10px;height:10px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ err }}
            </div>
          </div>
          <div class="pe-footer-right">
            <button class="pe-cancel-btn" @click="cancel">Cancel</button>
            <button class="pe-save-btn" @click="save" :disabled="!canSave">
              Save
            </button>
          </div>
        </div>

      </div>
    </div>

    <PlanHistoryModal
      :visible="showHistory"
      :plan="props.plan"
      @close="showHistory = false"
    />
  </Teleport>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { v4 as uuid } from 'uuid'
import { useAgentsStore } from '../../stores/agents'
import { useConfigStore } from '../../stores/config'
import PlanHistoryModal from './PlanHistoryModal.vue'
import EmojiPicker from '../agents/EmojiPicker.vue'

const props = defineProps({
  visible: Boolean,
  plan: { type: Object, default: null },
  tasks: { type: Array, default: () => [] },
})
const emit = defineEmits(['close', 'saved'])

const agentsStore = useAgentsStore()
const configStore = useConfigStore()
const allAgents = computed(() => agentsStore.agents)
const showIconPicker = ref(false)

// ── AI cron description ────────────────────────────────────────────────────────

const cronAiDesc = ref('')
const cronAiDescLoading = ref(false)
const cronAiDescError = ref('')

const cronGenInput = ref('')
const cronGenLoading = ref(false)
const cronGenError = ref('')
const showCronGen = ref(false)

let _cronDescTimer = null

async function fetchCronDesc(cron) {
  cronAiDescLoading.value = true
  cronAiDescError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const result = await window.electronAPI.enhancePrompt({
      prompt: `You are a cron expression expert. Given this cron expression: "${cron}"
Respond with ONLY a single clear English sentence describing when it runs.
Examples: "At 9:00 AM every weekday", "Every 5 minutes", "At 10:00 PM on the last day of every month".
Do not explain what cron is. Just describe the schedule concisely.`,
      config,
    })
    if (result.success) {
      cronAiDesc.value = result.text.trim().replace(/^["']|["']$/g, '')
    } else {
      cronAiDescError.value = result.error || 'Could not explain expression'
    }
  } catch (e) {
    cronAiDescError.value = e.message
  } finally {
    cronAiDescLoading.value = false
  }
}

async function generateCronFromNL() {
  if (!cronGenInput.value.trim()) return
  cronGenLoading.value = true
  cronGenError.value = ''
  try {
    const config = JSON.parse(JSON.stringify(configStore.config))
    const result = await window.electronAPI.enhancePrompt({
      prompt: `Convert this natural language schedule description into a valid 5-field cron expression.
Description: "${cronGenInput.value}"

Respond with ONLY the cron expression (5 fields separated by spaces), nothing else.
Examples: "0 9 * * 1-5" or "*/5 * * * *" or "0 22 28-31 * *"
If you cannot produce a valid cron expression for this description, respond with exactly: ERROR: <reason>`,
      config,
    })
    if (result.success) {
      const text = result.text.trim()
      if (text.startsWith('ERROR:')) {
        cronGenError.value = text.replace('ERROR:', '').trim()
      } else {
        const parts = text.split(/\s+/)
        if (parts.length === 5) {
          draft.value.schedule.cron = text
          showCronGen.value = false
          cronGenInput.value = ''
        } else {
          cronGenError.value = `Invalid cron returned: "${text}"`
        }
      }
    } else {
      cronGenError.value = result.error || 'Failed to generate expression'
    }
  } catch (e) {
    cronGenError.value = e.message
  } finally {
    cronGenLoading.value = false
  }
}

const CRON_PRESETS = [
  { label: 'Hourly',       cron: '0 * * * *' },
  { label: 'Daily 9am',    cron: '0 9 * * *' },
  { label: 'Daily 6pm',    cron: '0 18 * * *' },
  { label: 'Weekdays 9am', cron: '0 9 * * 1-5' },
  { label: 'Weekly Mon',   cron: '0 9 * * 1' },
]

const PERMISSION_MODES = [
  { id: 'inherit',         label: 'Inherit' },
  { id: 'chat_only',       label: 'Chat Only' },
  { id: 'all_permissions', label: 'All Permissions' },
]

const newAllowPattern = ref('')
const newAllowDesc    = ref('')

function addAllowEntry() {
  const pat = newAllowPattern.value.trim()
  if (!pat) return
  draft.value.allowList.push({ id: uuid(), pattern: pat, description: newAllowDesc.value.trim() })
  newAllowPattern.value = ''
  newAllowDesc.value    = ''
}

function removeAllowEntry(idx) {
  draft.value.allowList.splice(idx, 1)
}

const RUN_CONDITIONS = [
  { id: 'always',     label: 'Always' },
  { id: 'on_success', label: 'On success' },
  { id: 'on_failure', label: 'On failure' },
]

const isNew = computed(() => !props.plan?.id)
const showHistory = ref(false)

// Dep panel open state keyed by step.id
const depOpen = ref({})

function makeStep(s) {
  return {
    id:               s?.id || uuid(),
    taskId:           s?.taskId || '',
    defaultAgentIds: [...(s?.defaultAgentIds || [])],
    promptOverride:   s?.promptOverride || '',
    dependsOn:        [...(s?.dependsOn || [])],
    runCondition:     s?.runCondition || 'always',
  }
}

function makeDraft(plan) {
  return {
    id:             plan?.id || uuid(),
    name:           plan?.name || '',
    description:    plan?.description || '',
    icon:           plan?.icon || '',
    steps:          (plan?.steps || []).map(makeStep),
    permissionMode: plan?.permissionMode || 'all_permissions',
    allowList:      (plan?.allowList || []).map(e => ({ ...e })),
    schedule: {
      type:     plan?.schedule?.type     || 'manual',
      cron:     plan?.schedule?.cron     || '',
      runAt:    plan?.schedule?.runAt    || '',
      timezone: plan?.schedule?.timezone || 'UTC',
      enabled:  plan?.schedule?.enabled  ?? false,
    },
  }
}

const draft = ref(makeDraft(props.plan))

watch(() => draft.value?.schedule?.cron, (cron) => {
  cronAiDesc.value = ''
  cronAiDescError.value = ''
  clearTimeout(_cronDescTimer)
  if (!cron || cron.trim().split(/\s+/).length < 5) return
  _cronDescTimer = setTimeout(() => fetchCronDesc(cron), 600)
})

watch(() => props.visible, (v) => {
  if (v) {
    draft.value = makeDraft(props.plan)
    depOpen.value = {}
  }
})

// ── Resizable split ────────────────────────────────────────────────────────────
const splitPct = ref(50) // percentage for left (form) column
let _dragStartX = 0
let _dragStartPct = 0
let _columnsEl = null

function onDividerMousedown(e) {
  e.preventDefault()
  _dragStartX = e.clientX
  _dragStartPct = splitPct.value
  _columnsEl = e.currentTarget.parentElement
  window.addEventListener('mousemove', onDividerMousemove)
  window.addEventListener('mouseup', onDividerMouseup)
}

function onDividerMousemove(e) {
  if (!_columnsEl) return
  const totalW = _columnsEl.getBoundingClientRect().width
  const delta = e.clientX - _dragStartX
  const deltaPct = (delta / totalW) * 100
  splitPct.value = Math.min(75, Math.max(25, _dragStartPct + deltaPct))
}

function onDividerMouseup() {
  window.removeEventListener('mousemove', onDividerMousemove)
  window.removeEventListener('mouseup', onDividerMouseup)
  _columnsEl = null
}

function onKeydown(e) {
  if (e.key === 'Escape') {
    if (showIconPicker.value) { showIconPicker.value = false; return }
    if (showHistory.value) { showHistory.value = false; return }
    cancel()
  }
}
onMounted(() => window.addEventListener('keydown', onKeydown))
onBeforeUnmount(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('mousemove', onDividerMousemove)
  window.removeEventListener('mouseup', onDividerMouseup)
})

// ── Helpers ────────────────────────────────────────────────────────────────────

function taskName(taskId) {
  const t = props.tasks.find(t => t.id === taskId)
  return t ? `${t.icon} ${t.name}` : ''
}

function agentName(pid) {
  return agentsStore.getAgentById(pid)?.name || pid
}

function agentEmoji(pid) {
  const p = agentsStore.getAgentById(pid)
  return p?.avatar || p?.emoji || '🤖'
}

function availableAgentsForStep(step) {
  return allAgents.value.filter(p => !(step.defaultAgentIds || []).includes(p.id))
}

function schedTypeLabel(type) {
  if (type === 'manual') return 'Manual only'
  if (type === 'once')   return 'One-time'
  return 'Recurring (cron)'
}

// ── Cron field matcher ─────────────────────────────────────────────────────────

function cronMatchField(field, value) {
  if (field === '*') return true
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [rangeStr, stepStr] = part.split('/')
      const step = parseInt(stepStr)
      if (rangeStr === '*') { if (value % step === 0) return true; continue }
      if (rangeStr.includes('-')) {
        const [lo, hi] = rangeStr.split('-').map(Number)
        if (value >= lo && value <= hi && (value - lo) % step === 0) return true
      }
    } else if (part.includes('-')) {
      const [lo, hi] = part.split('-').map(Number)
      if (value >= lo && value <= hi) return true
    } else {
      if (parseInt(part) === value) return true
    }
  }
  return false
}

function cronNextOccurrences(expr, count = 7) {
  try {
    const parts = expr.trim().split(/\s+/)
    if (parts.length < 5) return []
    const [minF, hourF, domF, monthF, dowF] = parts
    const results = []
    const now = new Date()
    // Start from next minute
    const start = new Date(now)
    start.setSeconds(0, 0)
    start.setMinutes(start.getMinutes() + 1)

    // Cap search at 2 years to avoid infinite loop
    const limit = new Date(start)
    limit.setFullYear(limit.getFullYear() + 2)

    const d = new Date(start)
    d.setSeconds(0, 0)

    while (d < limit && results.length < count) {
      if (!cronMatchField(monthF, d.getMonth() + 1) ||
          !cronMatchField(domF, d.getDate()) ||
          !cronMatchField(dowF, d.getDay())) {
        d.setDate(d.getDate() + 1)
        d.setHours(0, 0, 0, 0)
        continue
      }
      for (let h = 0; h < 24 && results.length < count; h++) {
        if (!cronMatchField(hourF, h)) continue
        for (let m = 0; m < 60 && results.length < count; m++) {
          if (!cronMatchField(minF, m)) continue
          const dt = new Date(d)
          dt.setHours(h, m, 0, 0)
          if (dt >= start) {
            results.push(dt.toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' }))
          }
        }
      }
      d.setDate(d.getDate() + 1)
      d.setHours(0, 0, 0, 0)
    }
    return results
  } catch { return [] }
}

// Label for a step used in dep chips and output tokens
function stepLabel(stepId) {
  const idx = draft.value.steps.findIndex(s => s.id === stepId)
  if (idx === -1) return '?'
  const step = draft.value.steps[idx]
  const t = props.tasks.find(t => t.id === step.taskId)
  return t ? `${t.name}` : `Step ${idx + 1}`
}

// ── Step management ────────────────────────────────────────────────────────────

function addStep() {
  draft.value.steps.push(makeStep())
}

function removeStep(idx) {
  const removedId = draft.value.steps[idx].id
  draft.value.steps.splice(idx, 1)
  // Remove this step from any other step's dependsOn
  for (const s of draft.value.steps) {
    s.dependsOn = (s.dependsOn || []).filter(id => id !== removedId)
    if (s.dependsOn.length === 0) s.runCondition = 'always'
  }
  // Rebuild depOpen keys
  const next = {}
  for (const [k, v] of Object.entries(depOpen.value)) {
    if (k !== removedId) next[k] = v
  }
  depOpen.value = next
}

function moveStep(idx, delta) {
  const steps = draft.value.steps
  const newIdx = idx + delta
  if (newIdx < 0 || newIdx >= steps.length) return
  const tmp = steps[idx]
  steps[idx] = steps[newIdx]
  steps[newIdx] = tmp
}

function onTaskChange(step) {
  step.defaultAgentIds = []
  step.promptOverride    = ''
}

function addDefaultAgent(step, event) {
  const pid = event.target.value
  if (!pid) return
  if (!step.defaultAgentIds.includes(pid)) step.defaultAgentIds.push(pid)
  event.target.value = ''
}

function removeDefaultAgent(step, pid) {
  step.defaultAgentIds = step.defaultAgentIds.filter(id => id !== pid)
}

// ── Dependency management ──────────────────────────────────────────────────────

function toggleDep(stepId) {
  depOpen.value = { ...depOpen.value, [stepId]: !depOpen.value[stepId] }
}

function toggleDepStep(step, depStepId) {
  if (!step.dependsOn) step.dependsOn = []
  const i = step.dependsOn.indexOf(depStepId)
  if (i === -1) step.dependsOn.push(depStepId)
  else step.dependsOn.splice(i, 1)
  if (step.dependsOn.length === 0) step.runCondition = 'always'
}

function conditionDesc(step) {
  const cond = step.runCondition || 'always'
  const names = (step.dependsOn || []).map(id => stepLabel(id)).join(', ')
  if (cond === 'on_success') return `Runs only if ${names} succeeded`
  if (cond === 'on_failure') return `Runs only if ${names} failed`
  return `Runs after ${names} (regardless of outcome)`
}

function insertOutputToken(step, depStepId) {
  const name = stepLabel(depStepId)
  step.promptOverride = (step.promptOverride || '') + `{{output:${name}}}`
}

// ── Topological wave computation for canvas ────────────────────────────────────

const flowWaves = computed(() => {
  const steps = draft.value.steps
  if (steps.length === 0) return []

  const idSet = new Set(steps.map(s => s.id))
  const resolved = new Set()
  const remaining = [...steps]
  const waves = []

  while (remaining.length > 0) {
    const wave = remaining.filter(s =>
      (s.dependsOn || []).filter(d => idSet.has(d)).every(d => resolved.has(d))
    )
    if (wave.length === 0) {
      // Cycle or bad deps — dump the rest as one wave
      waves.push(remaining.map(s => buildFlowNode(s, steps)))
      break
    }
    waves.push(wave.map(s => buildFlowNode(s, steps)))
    wave.forEach(s => { resolved.add(s.id); remaining.splice(remaining.indexOf(s), 1) })
  }

  return waves
})

function buildFlowNode(step, allSteps) {
  const task = props.tasks.find(t => t.id === step.taskId)
  const agents = (step.defaultAgentIds || []).map(pid => ({
    key:   `fixed-${pid}`,
    name:  agentName(pid),
    emoji: agentEmoji(pid),
  }))

  const hasDeps = (step.dependsOn || []).length > 0
  const cond = step.runCondition || 'always'
  const conditionBadge = hasDeps && cond !== 'always'
    ? (cond === 'on_success' ? 'on success' : 'on failure')
    : null
  const condClass = hasDeps
    ? (cond === 'on_success' ? 'pf-step-block--success' : cond === 'on_failure' ? 'pf-step-block--failure' : '')
    : ''

  return {
    stepId:          step.id,
    stepIndex:       allSteps.indexOf(step),
    taskName:        task?.name || (step.taskId ? '(unknown)' : 'No task'),
    taskIcon:        task?.icon || '✍️',
    agents,
    runCondition:    cond,
    conditionBadge,
    condClass,
    dependsOnLabels: (step.dependsOn || []).map(id => {
      const di = allSteps.findIndex(s => s.id === id)
      return di === -1 ? '?' : `Step ${di + 1}`
    }),
  }
}

// ── Validation ─────────────────────────────────────────────────────────────────

const canSave = computed(() => {
  if (!draft.value.name.trim()) return false
  if (draft.value.steps.length === 0) return false
  for (const step of draft.value.steps) {
    if (!step.taskId) return false
  }
  // Schedule validation
  if (draft.value.schedule.type === 'cron') {
    const parts = (draft.value.schedule.cron || '').trim().split(/\s+/)
    if (parts.length !== 5 || parts.some(p => !p)) return false
  }
  if (draft.value.schedule.type === 'once') {
    if (!draft.value.schedule.runAt) return false
  }
  return true
})

const validationErrors = computed(() => {
  const errs = []
  if (!draft.value.name.trim()) errs.push('Plan name is required')
  if (draft.value.steps.length === 0) errs.push('At least one step is required')
  else if (draft.value.steps.some(s => !s.taskId)) errs.push('All steps must have a task selected')
  if (draft.value.schedule.type === 'cron') {
    const parts = (draft.value.schedule.cron || '').trim().split(/\s+/)
    if (parts.length !== 5 || parts.some(p => !p)) errs.push('Cron expression must have exactly 5 fields')
  }
  if (draft.value.schedule.type === 'once' && !draft.value.schedule.runAt)
    errs.push('One-time schedule requires a date and time')
  return errs
})

function save() {
  if (!canSave.value) return
  emit('saved', JSON.parse(JSON.stringify(draft.value)))
}

function cancel() {
  emit('close')
}
</script>

<style>
/* Unscoped — teleported outside component DOM */
.pe-backdrop {
  position: fixed;
  inset: 0;
  z-index: 200;
  background: rgba(0,0,0,0.65);
  backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.5rem;
}

.pe-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: 90vw;
  height: 90vh;
  max-width: 90vw;
  max-height: 90vh;
  display: flex;
  flex-direction: column;
  box-shadow: 0 25px 60px rgba(0,0,0,0.6);
  animation: peModalIn 0.2s ease-out;
  overflow: hidden;
}
@keyframes peModalIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.pe-header {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem;
  border-bottom: 1px solid #1E1E1E;
  flex-shrink: 0;
}
.pe-header-left { display: flex; align-items: center; gap: 0.625rem; }
.pe-header-center { display: flex; align-items: center; justify-content: center; }
.pe-close-btn { justify-self: end; }
.pe-header-icon {
  width: 2rem; height: 2rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.5rem; color: #FFFFFF; border: 1px solid #2A2A2A;
}
.pe-header-title { font-family: 'Inter', sans-serif; font-size: var(--fs-subtitle); font-weight: 700; color: #FFFFFF; }
.pe-close-btn {
  width: 2rem; height: 2rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.06); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 0.5rem; color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.15s ease;
}
.pe-close-btn:hover { background: rgba(255,255,255,0.12); color: #FFFFFF; }

/* Two-column layout with resizable split */
.pe-columns {
  flex: 1;
  display: flex;
  flex-direction: row;
  min-height: 0;
  overflow: hidden;
  user-select: none; /* prevents text selection during drag */
}

/* LEFT pane takes split percentage */
.pe-columns > .pe-body {
  width: var(--split-pct, 50%);
  flex-shrink: 0;
  flex-grow: 0;
}

/* RIGHT pane takes the rest */
.pe-columns > .pe-canvas {
  flex: 1;
  min-width: 0;
}

/* Drag divider */
.pe-divider {
  width: 5px;
  flex-shrink: 0;
  background: #1A1A1A;
  cursor: col-resize;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: background 0.15s ease;
  user-select: none;
}
.pe-divider:hover,
.pe-divider:active { background: #374151; }
.pe-divider-handle {
  width: 3px;
  height: 2.5rem;
  background: rgba(255,255,255,0.12);
  border-radius: 9999px;
}
.pe-divider:hover .pe-divider-handle { background: rgba(255,255,255,0.3); }

/* LEFT: form */
.pe-body {
  overflow-y: auto;
  padding: 1.5rem;
  display: flex;
  flex-direction: column;
  gap: 1.125rem;
  scrollbar-width: thin;
  scrollbar-color: #2A2A2A transparent;
}

/* RIGHT: canvas */
.pe-canvas {
  display: flex;
  flex-direction: column;
  background: #080808;
  overflow: hidden;
  min-height: 0;
}
.pe-canvas-label {
  display: flex; align-items: center; gap: 0.375rem;
  padding: 0.75rem 1rem 0.5rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 700;
  color: rgba(255,255,255,0.5); text-transform: uppercase; letter-spacing: 0.07em;
  flex-shrink: 0; border-bottom: 1px solid #1E1E1E;
}

/* Vertical flow scroll container */
.pe-flow-scroll {
  flex: 1;
  overflow: auto;
  scrollbar-width: thin;
  scrollbar-color: #2A2A2A transparent;
  display: flex;
  flex-direction: column;
  min-height: 0;
}

/* Empty state */
.pe-flow-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: rgba(255,255,255,0.2);
  text-align: center;
  min-height: 10rem;
  padding: 2rem;
}

/* Vertical flow column */
.pe-flow {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  padding: 1.25rem 1rem;
  min-width: max-content;
  box-sizing: border-box;
}

.pe-canvas-legend {
  display: flex; align-items: center; gap: 0.875rem;
  padding: 0.5rem 1rem; border-top: 1px solid #141414; flex-shrink: 0; flex-wrap: wrap;
}
.pf-legend-item {
  display: flex; align-items: center; gap: 0.3125rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: rgba(255,255,255,0.25); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em;
}
.pf-legend-dot { width: 0.4375rem; height: 0.4375rem; border-radius: 50%; }
.pf-legend-dot--parallel { background: #60A5FA; }
.pf-legend-dot--success  { background: #34D399; }
.pf-legend-dot--failure  { background: #F87171; }
.pf-legend-dot--input    { background: #A78BFA; }

/* Terminus */
.pf-terminus {
  display: flex; flex-direction: column; align-items: center; gap: 0.25rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 700;
  letter-spacing: 0.1em; color: rgba(255,255,255,0.55); flex-shrink: 0;
}
.pf-terminus-dot {
  width: 0.75rem; height: 0.75rem; border-radius: 50%;
  background: #3B82F6; border: 2px solid #60A5FA;
  box-shadow: 0 0 6px rgba(59,130,246,0.5);
}
.pf-terminus-dot--end {
  background: #10B981; border-color: #34D399;
  box-shadow: 0 0 6px rgba(16,185,129,0.5);
}

/* Vertical connector */
.pf-hconn {
  display: flex;
  flex-direction: column;
  align-items: center;
  flex-shrink: 0;
  gap: 0;
  padding: 0.125rem 0;
}
.pf-hconn-line {
  width: 1px;
  height: 1.25rem;
  background: #3A3A3A;
  flex-shrink: 0;
}
.pf-hconn-arrow {
  color: #555555;
  width: 0.625rem;
  height: 0.375rem;
  flex-shrink: 0;
  display: block;
}

/* Wave row (horizontal strip at each depth level) */
.pf-wave-col {
  display: flex;
  flex-direction: row;
  flex-wrap: wrap;
  justify-content: center;
  gap: 0.5rem;
  flex-shrink: 0;
  width: 100%;
}

.pf-wave-tag {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 700;
  color: rgba(255,255,255,0.45); letter-spacing: 0.05em; text-transform: uppercase;
  display: flex; align-items: center; gap: 0.375rem; margin-bottom: 0.25rem;
  width: 100%; justify-content: center;
}
.pf-wave-parallel {
  background: rgba(96,165,250,0.12); color: #60A5FA;
  padding: 0.0625rem 0.375rem; border-radius: 9999px;
  font-size: 0.625rem; font-weight: 700; text-transform: none; letter-spacing: 0;
}

/* Step block */
.pf-step-block {
  background: #161616;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  padding: 0.625rem 0.75rem;
  display: flex; flex-direction: column; gap: 0.375rem;
  flex-shrink: 0;
  min-width: 10rem;
  max-width: 14rem;
  width: 13rem;
}
.pf-step-block--success { border-color: rgba(52,211,153,0.2); background: rgba(52,211,153,0.03); }
.pf-step-block--failure { border-color: rgba(248,113,113,0.2); background: rgba(248,113,113,0.03); }

.pf-step-pill {
  display: flex; align-items: center; justify-content: center; gap: 0.3125rem; flex-wrap: wrap;
}
.pf-step-num {
  width: 0.9375rem; height: 0.9375rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #1A1A1A, #374151);
  border-radius: 50%; font-family: 'Inter', sans-serif;
  font-size: 0.5625rem; font-weight: 700; color: #FFF; flex-shrink: 0;
}
.pf-step-task {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  font-weight: 700; color: #E5E7EB;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis; min-width: 0; flex: 1;
}
.pf-cond-badge {
  display: inline-flex; align-items: center; gap: 0.25rem;
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 600;
  padding: 0.0625rem 0.375rem; border-radius: 9999px; flex-shrink: 0;
}
.pf-cond-badge--on_success { background: rgba(52,211,153,0.12); color: #34D399; }
.pf-cond-badge--on_failure { background: rgba(248,113,113,0.12); color: #F87171; }
.pf-cond-dot { width: 0.3125rem; height: 0.3125rem; border-radius: 50%; }
.pf-cond-dot--on_success { background: #34D399; }
.pf-cond-dot--on_failure { background: #F87171; }

.pf-depends-on {
  font-family: 'JetBrains Mono', monospace; font-size: 0.625rem;
  color: rgba(255,255,255,0.45); text-align: center;
}

.pf-agents-line {
  display: flex; align-items: baseline; justify-content: center; gap: 0.3rem;
  padding-top: 0.25rem; border-top: 1px solid #1E1E1E; margin-top: 0.125rem;
  min-width: 0;
}
.pf-agents-label {
  font-family: 'Inter', sans-serif; font-size: 0.625rem; font-weight: 700;
  color: rgba(255,255,255,0.35); text-transform: uppercase; letter-spacing: 0.05em; flex-shrink: 0;
}
.pf-agents-names {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 600;
  color: #E5E7EB; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
}

/* Form fields */
.pe-field { display: flex; flex-direction: column; gap: 0.375rem; }
.pe-label { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600; color: rgba(255,255,255,0.7); }
.pe-required { color: #EF4444; }
.pe-input {
  padding: 0.5625rem 0.75rem; background: #1A1A1A; border: 1px solid #2A2A2A;
  border-radius: 0.5rem; font-family: 'Inter', sans-serif; font-size: var(--fs-body);
  color: #FFFFFF; outline: none; transition: border-color 0.15s ease; width: 100%; box-sizing: border-box;
}
.pe-input::placeholder { color: rgba(255,255,255,0.25); }
.pe-input:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(255,255,255,0.04); }
.pe-mono { font-family: 'JetBrains Mono', monospace; }
.pe-textarea {
  padding: 0.5rem 0.75rem; background: #1A1A1A; border: 1px solid #2A2A2A;
  border-radius: 0.5rem; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FFFFFF; outline: none; transition: border-color 0.15s ease;
  width: 100%; box-sizing: border-box; resize: vertical; line-height: 1.5;
}
.pe-textarea::placeholder { color: rgba(255,255,255,0.25); }
.pe-textarea:focus { border-color: #4B5563; }
.pe-select {
  padding: 0.5rem 0.625rem; background: #1A1A1A; border: 1px solid #2A2A2A;
  border-radius: 0.5rem; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: rgba(255,255,255,0.8); outline: none; cursor: pointer; transition: border-color 0.15s ease; width: 100%;
}
.pe-select:focus { border-color: #4B5563; }

/* Output tokens */
.pe-output-tokens { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; margin-top: 0.25rem; }
.pe-output-tokens-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: rgba(255,255,255,0.3); font-weight: 600;
}
.pe-output-token {
  font-family: 'JetBrains Mono', monospace; font-size: var(--fs-small);
  color: #60A5FA; background: rgba(96,165,250,0.1);
  border: 1px solid rgba(96,165,250,0.2); border-radius: 0.25rem;
  padding: 0.0625rem 0.375rem; cursor: pointer; transition: all 0.15s ease; white-space: nowrap;
}
.pe-output-token:hover { background: rgba(96,165,250,0.2); }

/* Section */
.pe-section {
  display: flex; flex-direction: column; gap: 0.75rem;
  padding: 1rem; background: rgba(255,255,255,0.03);
  border: 1px solid #1E1E1E; border-radius: 0.75rem;
}
.pe-section-header { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.pe-section-icon {
  width: 1.5rem; height: 1.5rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 0.375rem; color: #FFFFFF; flex-shrink: 0;
}
.pe-section-title { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 700; color: rgba(255,255,255,0.85); }
.pe-section-hint { font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: rgba(255,255,255,0.3); font-style: italic; }
.pe-no-steps { font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); color: rgba(255,255,255,0.3); text-align: center; padding: 0.5rem 0; }

/* Step cards */
.pe-steps-list { display: flex; flex-direction: column; gap: 0.625rem; }
.pe-step-card {
  background: rgba(255,255,255,0.04); border: 1px solid #222222;
  border-radius: 0.625rem; padding: 0.875rem;
  display: flex; flex-direction: column; gap: 0.625rem;
}
.pe-step-head { display: flex; align-items: center; gap: 0.625rem; }
.pe-step-num {
  width: 1.5rem; height: 1.5rem;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 50%; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small); font-weight: 700; color: #FFFFFF; flex-shrink: 0;
}
.pe-step-task-label {
  flex: 1; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: rgba(255,255,255,0.6);
  min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.pe-step-actions { display: flex; align-items: center; gap: 0.25rem; flex-shrink: 0; }
.pe-step-btn {
  width: 1.5rem; height: 1.5rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.05); border: none; border-radius: 0.25rem;
  color: rgba(255,255,255,0.4); cursor: pointer; transition: all 0.15s ease;
}
.pe-step-btn:hover:not(:disabled) { background: rgba(255,255,255,0.1); color: #FFFFFF; }
.pe-step-btn:disabled { opacity: 0.25; cursor: not-allowed; }
.pe-step-remove:hover:not(:disabled) { background: rgba(239,68,68,0.15) !important; color: #EF4444 !important; }

.pe-step-field { display: flex; flex-direction: column; gap: 0.3125rem; }
.pe-step-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 600;
  color: rgba(255,255,255,0.45); text-transform: uppercase; letter-spacing: 0.05em;
}
.pe-step-label-hint {
  font-weight: 400; text-transform: none; letter-spacing: 0;
  color: rgba(255,255,255,0.25); font-style: italic;
}

/* Agent assignments */
.pe-assignments { display: flex; flex-direction: column; gap: 0.5rem; }
.pe-assign-row { display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; }
.pe-assign-slot { font-family: 'JetBrains Mono', monospace; font-size: var(--fs-secondary); font-weight: 700; color: rgba(255,255,255,0.6); flex-shrink: 0; min-width: 6rem; }
.pe-assign-desc { font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: rgba(255,255,255,0.3); font-style: italic; flex: 1; min-width: 6rem; }
.pe-select-agent { flex: 1; min-width: 10rem; }

/* Agent chips */
.pe-agent-chips { display: flex; align-items: center; flex-wrap: wrap; gap: 0.375rem; }
.pe-agent-chip {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.25rem 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 9999px; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small); font-weight: 600; color: #FFFFFF;
}
.pe-chip-remove {
  width: 1rem; height: 1rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.15); border: none; border-radius: 50%;
  color: rgba(255,255,255,0.7); cursor: pointer; flex-shrink: 0; transition: all 0.15s ease;
}
.pe-chip-remove:hover { background: rgba(239,68,68,0.4); color: #FFFFFF; }
.pe-select-add-agent { width: auto; min-width: 9rem; flex-shrink: 0; }

/* Dependencies section */
.pe-dep-section {
  border-top: 1px solid rgba(255,255,255,0.06);
  padding-top: 0.5rem;
  display: flex;
  flex-direction: column;
  gap: 0;
}
.pe-dep-toggle {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.25rem 0.5rem;
  background: transparent; border: none;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 600;
  color: rgba(255,255,255,0.35); cursor: pointer; transition: color 0.15s ease;
  align-self: flex-start; border-radius: 0.25rem;
}
.pe-dep-toggle:hover { color: rgba(255,255,255,0.7); background: rgba(255,255,255,0.05); }
.pe-dep-count {
  padding: 0.0625rem 0.375rem; border-radius: 9999px;
  background: rgba(96,165,250,0.15); color: #60A5FA;
  font-size: 0.625rem; font-weight: 700;
}
.pe-dep-chevron { transition: transform 0.15s ease; }
.pe-dep-chevron--open { transform: rotate(180deg); }

.pe-dep-body {
  margin-top: 0.5rem;
  padding: 0.75rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.07);
  border-radius: 0.5rem;
  display: flex; flex-direction: column; gap: 0.625rem;
}
.pe-dep-hint {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: rgba(255,255,255,0.3); font-style: italic; line-height: 1.5;
}
.pe-dep-chips { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.pe-dep-chip {
  display: inline-flex; align-items: center; gap: 0.3125rem;
  padding: 0.25rem 0.625rem;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.375rem; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small); font-weight: 600; color: rgba(255,255,255,0.5);
  cursor: pointer; transition: all 0.15s ease;
}
.pe-dep-chip:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.8); }
.pe-dep-chip--active {
  background: rgba(96,165,250,0.12); border-color: rgba(96,165,250,0.3);
  color: #60A5FA;
}
.pe-dep-chip-num {
  width: 1rem; height: 1rem;
  display: flex; align-items: center; justify-content: center;
  background: rgba(255,255,255,0.1); border-radius: 50%;
  font-size: 0.5625rem; font-weight: 700;
}
.pe-dep-chip--active .pe-dep-chip-num { background: rgba(96,165,250,0.2); }

.pe-dep-cond-row { display: flex; flex-direction: column; gap: 0.375rem; }
.pe-dep-cond-label { font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 600; color: rgba(255,255,255,0.4); text-transform: uppercase; letter-spacing: 0.05em; }
.pe-dep-cond-btns { display: flex; gap: 0.375rem; flex-wrap: wrap; }
.pe-dep-cond-btn {
  display: inline-flex; align-items: center; gap: 0.3125rem;
  padding: 0.25rem 0.625rem;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.375rem; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small); font-weight: 600; color: rgba(255,255,255,0.5);
  cursor: pointer; transition: all 0.15s ease;
}
.pe-dep-cond-btn:hover { background: rgba(255,255,255,0.09); }
.pe-dep-cond-btn--active.pe-dep-cond-btn--always     { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); color: #FFFFFF; }
.pe-dep-cond-btn--active.pe-dep-cond-btn--on_success { background: rgba(52,211,153,0.12); border-color: rgba(52,211,153,0.3); color: #34D399; }
.pe-dep-cond-btn--active.pe-dep-cond-btn--on_failure { background: rgba(248,113,113,0.12); border-color: rgba(248,113,113,0.3); color: #F87171; }
.pe-dep-cond-dot { width: 0.375rem; height: 0.375rem; border-radius: 50%; flex-shrink: 0; }
.pe-dep-cond-dot--always     { background: rgba(255,255,255,0.4); }
.pe-dep-cond-dot--on_success { background: #34D399; }
.pe-dep-cond-dot--on_failure { background: #F87171; }
.pe-dep-cond-desc { font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: rgba(255,255,255,0.3); font-style: italic; }

.pe-add-step-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.375rem 0.75rem;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.375rem; font-family: 'Inter', sans-serif;
  font-size: var(--fs-small); font-weight: 600; color: rgba(255,255,255,0.5);
  cursor: pointer; transition: all 0.15s ease; align-self: flex-start;
}
.pe-add-step-btn:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.8); }

/* Schedule */
.pe-schedule-types { display: flex; gap: 0.375rem; flex-wrap: wrap; }
.pe-sched-type-btn {
  padding: 0.375rem 0.875rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.5rem; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.15s ease;
}
.pe-sched-type-btn:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.8); }
.pe-sched-type-btn--active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent; color: #FFFFFF;
}
.pe-cron-presets { display: flex; flex-wrap: wrap; gap: 0.375rem; }
.pe-preset-btn {
  padding: 0.25rem 0.625rem; background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 9999px; font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  font-weight: 600; color: rgba(255,255,255,0.45); cursor: pointer; transition: all 0.15s ease;
}
.pe-preset-btn:hover { background: rgba(255,255,255,0.09); color: rgba(255,255,255,0.7); }
.pe-preset-btn--active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent; color: #FFFFFF;
}

/* One-time date picker row */
.pe-datetime-row {
  display: flex; align-items: center; gap: 0.5rem;
}
.pe-pick-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.5rem 0.875rem; flex-shrink: 0;
  background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.15);
  border-radius: 0.5rem; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: rgba(255,255,255,0.75); cursor: pointer; transition: all 0.15s ease;
}
.pe-pick-btn:hover { background: rgba(255,255,255,0.13); color: #FFFFFF; }
.pe-dt-input {
  flex: 1;
  padding: 0.375rem 0.625rem;
  background: #1A1A1A; border: 1px solid #2A2A2A;
  border-radius: 0.5rem; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #FFFFFF; outline: none; transition: border-color 0.15s ease;
  width: 100%; box-sizing: border-box;
  color-scheme: dark;
}
.pe-dt-input:focus { border-color: #4B5563; box-shadow: 0 0 0 3px rgba(75,85,99,0.15); }
.pe-dt-input::-webkit-calendar-picker-indicator { filter: invert(1); opacity: 0.5; cursor: pointer; }

/* Cron description + next occurrences */
.pe-cron-desc {
  display: flex; align-items: flex-start; gap: 0.375rem;
  margin-top: 0.375rem;
  padding: 0.5rem 0.625rem;
  background: rgba(96,165,250,0.07); border: 1px solid rgba(96,165,250,0.15);
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  color: #93C5FD; line-height: 1.4;
}
.pe-cron-next {
  margin-top: 0.5rem; display: flex; flex-direction: column; gap: 0.375rem;
}
.pe-cron-next-label {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 700;
  color: rgba(255,255,255,0.3); text-transform: uppercase; letter-spacing: 0.05em;
}
.pe-cron-next-list { display: flex; flex-wrap: wrap; gap: 0.3125rem; }
.pe-cron-next-chip {
  padding: 0.1875rem 0.5rem;
  background: rgba(255,255,255,0.04); border: 1px solid rgba(255,255,255,0.08);
  border-radius: 9999px;
  font-family: 'JetBrains Mono', monospace; font-size: 0.625rem; color: rgba(255,255,255,0.5);
}

/* Enable schedule hint */
.pe-pass-hint {
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: rgba(255,255,255,0.3); font-style: italic;
}
.pe-sched-enable-hint { padding: 0.25rem 0; }

/* ── Permission section ──────────────────────────────────────────────────── */
.pe-perm-btns {
  display: flex;
  gap: 0.375rem;
}
.pe-perm-btn {
  flex: 1;
  padding: 0.5rem 0;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  background: rgba(255,255,255,0.04);
  border: 1px solid rgba(255,255,255,0.08);
  color: rgba(255,255,255,0.45);
  cursor: pointer;
  transition: all 0.15s ease;
  text-align: center;
}
.pe-perm-btn:hover { border-color: #4B5563; color: #9CA3AF; }
.pe-perm-btn--active {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  border-color: #4B5563;
  color: #FFFFFF;
}
.pe-perm-hint {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #6B7280;
  margin: 0.25rem 0 0;
  display: block;
  line-height: 1.5;
}
.pe-perm-allow-label {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  font-weight: 700;
  color: rgba(255,255,255,0.3);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  margin-top: 0.75rem;
}
.pe-perm-badge {
  padding: 0 0.3rem;
  background: rgba(255,255,255,0.08);
  border-radius: 9999px;
  font-size: 0.5625rem;
  font-weight: 700;
  color: rgba(255,255,255,0.4);
}
.pe-perm-allow-list {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  margin-top: 0.375rem;
}
.pe-perm-empty {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #4B5563;
  padding: 0.375rem 0;
  font-style: italic;
}
.pe-perm-entry {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  background: rgba(255,255,255,0.03);
  border: 1px solid rgba(255,255,255,0.06);
  border-radius: 0.375rem;
}
.pe-perm-pattern {
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  color: #E5E7EB;
  flex-shrink: 0;
}
.pe-perm-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #6B7280;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.pe-perm-remove {
  width: 1.25rem; height: 1.25rem;
  display: flex; align-items: center; justify-content: center;
  background: transparent; border: none;
  color: rgba(255,255,255,0.2); cursor: pointer;
  border-radius: 0.25rem; flex-shrink: 0;
  transition: all 0.15s ease;
  margin-left: auto;
}
.pe-perm-remove:hover { background: rgba(239,68,68,0.15); color: #F87171; }
.pe-perm-add-row {
  display: flex;
  gap: 0.375rem;
  margin-top: 0.25rem;
}
.pe-perm-input {
  padding: 0.4375rem 0.625rem;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.375rem;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.6875rem;
  color: #FFFFFF;
  outline: none;
  flex: 1;
  min-width: 0;
  transition: border-color 0.15s ease;
}
.pe-perm-input--desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  flex: 1.5;
}
.pe-perm-input::placeholder { color: rgba(255,255,255,0.2); }
.pe-perm-input:focus { border-color: #4B5563; }
.pe-perm-add-btn {
  padding: 0.4375rem 0.75rem;
  background: rgba(255,255,255,0.06);
  border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.375rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  color: rgba(255,255,255,0.6);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.pe-perm-add-btn:hover:not(:disabled) { background: rgba(255,255,255,0.12); color: #FFF; }
.pe-perm-add-btn:disabled { opacity: 0.35; cursor: not-allowed; }

/* Icon + Name row */
.pe-name-row { display: flex; align-items: center; gap: 0.5rem; }
.pe-name-row .pe-input { flex: 1; }
.pe-icon-btn {
  font-size: 1.75rem;
  line-height: 1;
  padding: 0.375rem;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  background: #1A1A1A;
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
  flex-shrink: 0;
}
.pe-icon-btn:hover { background: #2A2A2A; border-color: #374151; }

/* Schedule toggle */
.pe-sched-toggle-row { display: flex; align-items: center; gap: 0.5rem; margin-left: auto; }
.pe-toggle-switch {
  position: relative; width: 2.25rem; height: 1.25rem;
  background: rgba(255,255,255,0.12); border: none; border-radius: 9999px;
  cursor: pointer; transition: background 0.2s ease; flex-shrink: 0; padding: 0;
}
.pe-toggle-switch--on { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); }
.pe-toggle-knob {
  position: absolute; top: 0.125rem; left: 0.125rem;
  width: 1rem; height: 1rem; border-radius: 50%;
  background: #FFFFFF; transition: transform 0.2s ease;
  display: block; box-shadow: 0 1px 3px rgba(0,0,0,0.3);
}
.pe-toggle-switch--on .pe-toggle-knob { transform: translateX(1rem); }
.pe-toggle-label { font-family: 'Inter', sans-serif; font-size: var(--fs-small); font-weight: 600; color: rgba(255,255,255,0.65); }

/* Cron gen panel */
.pe-cron-field-header { display: flex; align-items: center; justify-content: space-between; }
.pe-cron-gen-btn {
  display: inline-flex; align-items: center; gap: 0.3rem;
  padding: 0.1875rem 0.5rem;
  background: rgba(96,165,250,0.08); border: 1px solid rgba(96,165,250,0.15);
  border-radius: 9999px; font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  font-weight: 600; color: #60A5FA; cursor: pointer; transition: all 0.15s ease;
}
.pe-cron-gen-btn:hover { background: rgba(96,165,250,0.15); }
.pe-cron-gen-panel {
  margin-top: 0.375rem; padding: 0.625rem; display: flex; flex-direction: column; gap: 0.375rem;
  background: rgba(255,255,255,0.03); border: 1px solid rgba(255,255,255,0.08); border-radius: 0.5rem;
}
.pe-cron-gen-hint { font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: rgba(255,255,255,0.4); }
.pe-cron-gen-row { display: flex; gap: 0.375rem; }
.pe-cron-gen-submit {
  width: 2rem; height: 2.25rem; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; border-radius: 0.375rem; color: #FFFFFF; cursor: pointer; font-size: 1rem;
  transition: all 0.15s ease;
}
.pe-cron-gen-submit:disabled { opacity: 0.5; cursor: not-allowed; }
.pe-cron-gen-error {
  display: flex; align-items: flex-start; gap: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small); color: #F87171;
}
.pe-cron-desc--loading { color: rgba(255,255,255,0.3); }
.pe-cron-desc--error { background: rgba(239,68,68,0.06); border-color: rgba(239,68,68,0.15); color: #F87171; }
.pe-spin { animation: peSpin 0.9s linear infinite; }
@keyframes peSpin { to { transform: rotate(360deg); } }

/* Footer errors */
.pe-footer-errors { display: flex; flex-direction: column; gap: 0.2rem; }
.pe-footer-err {
  display: flex; align-items: center; gap: 0.375rem;
  font-family: 'Inter', sans-serif; font-size: var(--fs-small);
  color: rgba(239,68,68,0.8);
}

/* Footer */
.pe-footer {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
  padding: 1rem 1.5rem; border-top: 1px solid #1A1A1A;
  background: #0A0A0A; border-radius: 0 0 1rem 1rem; flex-shrink: 0;
}
.pe-footer-right { display: flex; align-items: center; gap: 0.5rem; }
.pe-history-btn {
  display: inline-flex; align-items: center; gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  background: rgba(255,255,255,0.05); border: 1px solid rgba(255,255,255,0.12);
  border-radius: 9999px; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: rgba(255,255,255,0.5); cursor: pointer; transition: all 0.15s ease;
}
.pe-history-btn:hover { background: rgba(255,255,255,0.1); border-color: rgba(255,255,255,0.2); color: #FFF; }
.pe-cancel-btn {
  padding: 0.4375rem 0.875rem; background: rgba(255,255,255,0.07); border: 1px solid rgba(255,255,255,0.1);
  border-radius: 0.5rem; font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; color: rgba(255,255,255,0.65); cursor: pointer; transition: all 0.15s ease;
  min-width: 5.5rem; text-align: center;
}
.pe-cancel-btn:hover { background: rgba(255,255,255,0.12); color: #FFFFFF; }
.pe-save-btn {
  padding: 0.4375rem 0.875rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; border-radius: 0.5rem; font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; color: #FFFFFF;
  cursor: pointer; transition: all 0.15s ease; box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  min-width: 5.5rem; text-align: center;
}
.pe-save-btn:hover:not(:disabled) { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.pe-save-btn:disabled { opacity: 0.4; cursor: not-allowed; }
</style>
