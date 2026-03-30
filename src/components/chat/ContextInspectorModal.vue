<template>
  <div
    v-if="visible"
    class="fixed inset-0 z-50 flex items-center justify-center"
    style="background:rgba(0,0,0,0.6);"
  >
    <div
      class="relative flex flex-col"
      style="background:#111111; border:1px solid #2A2A2A; border-radius:16px; width:82vw; max-height:88vh; box-shadow:0 16px 48px rgba(0,0,0,0.7); overflow:hidden;"
    >
      <!-- ── Header ── -->
      <div class="flex items-center justify-between px-5 py-3 shrink-0" style="border-bottom:1px solid #2A2A2A;">
        <div class="flex items-center gap-2">
          <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2">
            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
          </svg>
          <span class="font-semibold" style="color:#F5F5F5; font-size:var(--fs-subtitle);">{{ t('chats.contextInspector') }}</span>
        </div>
        <div class="flex items-center gap-1.5">
          <button
            @click="debugDialogOpen = true"
            class="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg cursor-pointer"
            style="color:#6B7280; font-size:var(--fs-small);"
            @mouseenter="e => e.currentTarget.style.background='#1E1E1E'"
            @mouseleave="e => e.currentTarget.style.background=''"
          >
            <svg class="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="currentColor" stroke="none"/><circle cx="8.5" cy="15.5" r="1.5" fill="currentColor" stroke="none"/><line x1="13" y1="8.5" x2="19" y2="8.5"/><line x1="13" y1="15.5" x2="19" y2="15.5"/>
            </svg>
            <span>{{ t('chats.debugLog') }}</span>
            <span v-if="debugLogs.length" style="color:#374151;">{{ debugLogs.length }}</span>
          </button>
          <button
            @click="$emit('close')"
            class="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
            style="color:#6B7280;"
            @mouseenter="e => e.currentTarget.style.background='#1E1E1E'"
            @mouseleave="e => e.currentTarget.style.background=''"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
      </div>

      <!-- ── Body ── -->
      <div class="overflow-y-auto px-4 py-3 space-y-2" style="height:70vh;">

        <!-- Metrics -->
        <div style="border:1px solid #2A2A2A; border-radius:12px; overflow:hidden;">
          <button
            @click="metricsOpen = !metricsOpen"
            class="w-full flex items-center justify-between px-4 py-2.5 cursor-pointer"
            style="background:#161616;"
            @mouseenter="e => e.currentTarget.style.background='#1A1A1A'"
            @mouseleave="e => e.currentTarget.style.background='#161616'"
          >
            <span style="color:#E5E5EA; font-size:var(--fs-body); font-weight:600;">{{ t('chats.metrics') }}</span>
            <svg class="w-4 h-4 transition-transform" :style="metricsOpen ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
          </button>
          <div v-if="metricsOpen" class="px-4 py-3" style="border-top:1px solid #2A2A2A;">
            <table style="width:100%; font-size:var(--fs-body);">
              <tbody>
                <tr style="border-bottom:1px solid #1E1E1E;">
                  <td class="py-1.5 pr-4" style="color:#6B7280; white-space:nowrap;">{{ t('chats.inputTokens') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace; color:#E5E5EA;">{{ (aggregateMetrics.inputTokens ?? 0).toLocaleString() }}</td>
                </tr>
                <tr style="border-bottom:1px solid #1E1E1E;">
                  <td class="py-1.5 pr-4" style="color:#6B7280; white-space:nowrap;">{{ t('chats.maxTokens') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace; color:#E5E5EA;">{{ (aggregateMetrics.maxTokens ?? 0).toLocaleString() }}</td>
                </tr>
                <tr style="border-bottom:1px solid #1E1E1E;">
                  <td class="py-1.5 pr-4" style="color:#6B7280; white-space:nowrap;">{{ t('chats.context') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace;"
                    :style="(aggregateMetrics.percentage ?? 0) > 85 ? 'color:#f87171;' : (aggregateMetrics.percentage ?? 0) > 65 ? 'color:#fbbf24;' : 'color:#E5E5EA;'">
                    {{ Math.round(aggregateMetrics.percentage ?? 0) }}%
                  </td>
                </tr>
                <tr :style="(contextMetrics.voiceInputTokens || contextMetrics.voiceOutputTokens) ? 'border-bottom:1px solid #1E1E1E;' : ''">
                  <td class="py-1.5 pr-4" style="color:#6B7280; white-space:nowrap;">{{ t('chats.compactions') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace; color:#E5E5EA;">{{ aggregateMetrics.compactionCount ?? 0 }}</td>
                </tr>
                <template v-if="contextMetrics.voiceInputTokens || contextMetrics.voiceOutputTokens">
                  <tr style="border-bottom:1px solid #1E1E1E;">
                    <td class="py-1.5 pr-4" style="color:#6B7280; white-space:nowrap;">{{ t('chats.voiceIn') }}</td>
                    <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace; color:#E5E5EA;">{{ (contextMetrics.voiceInputTokens ?? 0).toLocaleString() }} {{ t('chats.tok') }}</td>
                  </tr>
                  <tr :style="contextMetrics.whisperCalls ? 'border-bottom:1px solid #1E1E1E;' : ''">
                    <td class="py-1.5 pr-4" style="color:#6B7280; white-space:nowrap;">{{ t('chats.voiceOut') }}</td>
                    <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace; color:#E5E5EA;">{{ (contextMetrics.voiceOutputTokens ?? 0).toLocaleString() }} {{ t('chats.tok') }}</td>
                  </tr>
                </template>
                <tr v-if="contextMetrics.whisperCalls">
                  <td class="py-1.5 pr-4" style="color:#6B7280; white-space:nowrap;">{{ t('chats.whisperStt') }}</td>
                  <td class="py-1.5 font-medium" style="font-family:'JetBrains Mono',monospace; color:#E5E5EA;">{{ contextMetrics.whisperCalls }} {{ t('chats.rounds') }}, {{ (contextMetrics.whisperSecs ?? 0).toFixed(1) }}{{ t('chats.audioUnit') }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <!-- ── Main tab bar ── -->
        <div class="flex" style="border:1px solid #2A2A2A; border-radius:12px; overflow:hidden;">
          <button
            @click="mainTab = 'user'"
            class="flex-1 py-2 text-center cursor-pointer transition-colors"
            style="font-size:var(--fs-body); font-weight:600;"
            :style="mainTab === 'user'
              ? 'background:#1E1E1E; color:#E5E5EA; border-right:1px solid #2A2A2A;'
              : 'background:#161616; color:#4B5563; border-right:1px solid #2A2A2A;'"
          >{{ t('chats.userPersona') }}</button>
          <button
            @click="mainTab = 'system'"
            class="flex-1 py-2 text-center cursor-pointer transition-colors"
            style="font-size:var(--fs-body); font-weight:600;"
            :style="mainTab === 'system'
              ? 'background:#1E1E1E; color:#E5E5EA;'
              : 'background:#161616; color:#4B5563;'"
          >{{ agentCards.length === 1 ? (agentCards[0].name || t('chats.systemAgent')) : t('chats.agents') }}</button>
        </div>

        <!-- ── User Persona tab ── -->
        <template v-if="mainTab === 'user'">
          <div style="border:1px solid #2A2A2A; border-radius:12px; overflow:hidden;">
            <!-- Agent name row -->
            <div class="flex items-center gap-2 px-4 py-3" style="border-bottom:1px solid #222222;">
              <template v-if="userPersonaData.agent">
                <span class="font-semibold" style="color:#E5E5EA; font-size:var(--fs-body);">{{ userPersonaData.agent.name }}</span>
                <span v-if="userPersonaData.agent.modelId" style="color:#4B5563; font-size:var(--fs-small); font-family:'JetBrains Mono',monospace;">{{ userPersonaData.agent.modelId }}</span>
              </template>
              <p v-else style="color:#4B5563; font-size:var(--fs-small);">{{ t('chats.noUserPersona') }}</p>
            </div>

            <!-- Pre-## block (identity/base prompt): always visible inline -->
            <div
              v-if="userPersonaData.rawSections.length && userPersonaData.rawSections[0].title === null"
              class="px-4 py-3"
              :style="(userPersonaData.rawSections.length > 1 || userPersonaData.memorySections.length) ? 'border-bottom:1px solid #222222;' : ''"
            >
              <pre class="whitespace-pre-wrap leading-relaxed" style="font-family:'JetBrains Mono',monospace; font-size:var(--fs-small); color:#9CA3AF; max-height:220px; overflow-y:auto; background:#0D0D0D; border-radius:8px; padding:0.75rem;">{{ userPersonaData.rawSections[0].content }}</pre>
            </div>
            <div v-else-if="!userPersonaData.rawSections.length" class="px-4 py-3" :style="userPersonaData.memorySections.length ? 'border-bottom:1px solid #222222;' : ''">
              <p style="color:#374151; font-size:var(--fs-small);">{{ t('chats.snapshotCapturedDuringRun') }}</p>
            </div>

            <!-- ## sections from user agent's own prompt -->
            <template
              v-for="(sec, si) in userPersonaData.rawSections.filter(s => s.title !== null)"
              :key="'ur-' + si"
            >
              <div style="border-bottom:1px solid #222222;">
                <button
                  @click="toggleSection('user-raw', si)"
                  class="w-full flex items-center justify-between px-4 py-2 cursor-pointer"
                  style="background:transparent;"
                  @mouseenter="e => e.currentTarget.style.background='#161616'"
                  @mouseleave="e => e.currentTarget.style.background='transparent'"
                >
                  <span style="color:#6B7280; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">{{ sec.title }}</span>
                  <svg class="w-3.5 h-3.5 transition-transform" :style="isSectionOpen('user-raw', si) ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div v-if="isSectionOpen('user-raw', si)" class="px-4 pb-3" style="border-top:1px solid #1A1A1A;">
                  <div style="margin-top:0.75rem;" class="space-y-2">
                    <template v-for="(sub, ssi) in parseSubSections(sec.content)" :key="ssi">
                      <p v-if="sub.subTitle" style="color:#4B5563; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em; padding-top:0.25rem;">{{ sub.subTitle }}</p>
                      <pre class="whitespace-pre-wrap leading-relaxed" style="font-family:'JetBrains Mono',monospace; font-size:var(--fs-small); color:#9CA3AF; max-height:280px; overflow-y:auto; background:#0D0D0D; border-radius:8px; padding:0.75rem;">{{ sub.content }}</pre>
                    </template>
                  </div>
                </div>
              </div>
            </template>

            <!-- Injected memory sections from system prompt (e.g. ## User Profile) -->
            <template v-for="(sec, si) in userPersonaData.memorySections" :key="'um-' + si">
              <div :style="si < userPersonaData.memorySections.length - 1 ? 'border-bottom:1px solid #222222;' : ''">
                <button
                  @click="toggleSection('user-mem', si)"
                  class="w-full flex items-center justify-between px-4 py-2 cursor-pointer"
                  style="background:transparent;"
                  @mouseenter="e => e.currentTarget.style.background='#161616'"
                  @mouseleave="e => e.currentTarget.style.background='transparent'"
                >
                  <span style="color:#6B7280; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">{{ sec.title }}</span>
                  <svg class="w-3.5 h-3.5 transition-transform" :style="isSectionOpen('user-mem', si) ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div v-if="isSectionOpen('user-mem', si)" class="px-4 pb-3" style="border-top:1px solid #1A1A1A;">
                  <div style="margin-top:0.75rem;" class="space-y-2">
                    <template v-for="(sub, ssi) in parseSubSections(sec.content)" :key="ssi">
                      <p v-if="sub.subTitle" style="color:#4B5563; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em; padding-top:0.25rem;">{{ sub.subTitle }}</p>
                      <pre class="whitespace-pre-wrap leading-relaxed" style="font-family:'JetBrains Mono',monospace; font-size:var(--fs-small); color:#9CA3AF; max-height:280px; overflow-y:auto; background:#0D0D0D; border-radius:8px; padding:0.75rem;">{{ sub.content }}</pre>
                    </template>
                  </div>
                </div>
              </div>
            </template>
          </div>
        </template>

        <!-- ── System Agent(s) tab ── -->
        <template v-if="mainTab === 'system'">

          <!-- Secondary agent tabs (group chat only) -->
          <div v-if="agentCards.length > 1" class="flex gap-1 flex-wrap">
            <button
              v-for="(card, idx) in agentCards"
              :key="card.agentId || idx"
              @click="selectedAgentIdx = idx"
              class="px-3 py-1.5 rounded-lg cursor-pointer text-sm transition-colors"
              :style="selectedAgentIdx === idx
                ? 'background:#1E1E1E; color:#E5E5EA; border:1px solid #3A3A3A;'
                : 'background:#161616; color:#4B5563; border:1px solid #2A2A2A;'"
            >{{ card.name }}</button>
          </div>

          <!-- Current agent content -->
          <div v-if="currentCard" style="border:1px solid #2A2A2A; border-radius:12px; overflow:hidden;">

            <!-- Agent name row -->
            <div class="flex items-center gap-2 px-4 py-3" style="border-bottom:1px solid #222222;">
              <span class="font-semibold" style="color:#E5E5EA; font-size:var(--fs-body);">{{ currentCard.name }}</span>
              <span v-if="currentCard.model" style="color:#4B5563; font-size:var(--fs-small); font-family:'JetBrains Mono',monospace;">{{ currentCard.model }}</span>
            </div>

            <!-- Per-agent metrics row -->
            <div class="px-4 py-3" style="border-bottom:1px solid #222222;">
              <p class="mb-2" style="color:#4B5563; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">{{ t('chats.metrics') }}</p>
              <div class="flex items-center gap-5 flex-wrap" style="font-family:'JetBrains Mono',monospace; font-size:var(--fs-small);">
                <span style="color:#6B7280;">in <span style="color:#E5E5EA; font-weight:600;">{{ (currentCard.metrics?.inputTokens ?? 0).toLocaleString() }}</span></span>
                <span style="color:#6B7280;">out <span style="color:#E5E5EA; font-weight:600;">{{ (currentCard.metrics?.outputTokens ?? 0).toLocaleString() }}</span></span>
                <span style="color:#6B7280;">ctx <span :style="(currentCard.metrics?.percentage ?? 0) > 85 ? 'color:#f87171;font-weight:600;' : (currentCard.metrics?.percentage ?? 0) > 65 ? 'color:#fbbf24;font-weight:600;' : 'color:#E5E5EA;font-weight:600;'">{{ Math.round(currentCard.metrics?.percentage ?? 0) }}%</span></span>
                <span v-if="currentCard.metrics?.compactionCount" style="color:#fbbf24; font-weight:600;">{{ currentCard.metrics.compactionCount }} compact</span>
              </div>
            </div>

            <!-- Prompt sections (dynamic, parsed from assembled prompt) -->
            <template v-if="currentCard.promptSections.length">
              <!-- First section (identity block, no ## header): always visible inline -->
              <div v-if="currentCard.promptSections[0].title === null" class="px-4 py-3" style="border-bottom:1px solid #222222;">
                <pre class="whitespace-pre-wrap leading-relaxed" style="font-family:'JetBrains Mono',monospace; font-size:var(--fs-small); color:#9CA3AF; max-height:220px; overflow-y:auto; background:#0D0D0D; border-radius:8px; padding:0.75rem;">{{ currentCard.promptSections[0].content }}</pre>
              </div>

              <!-- Remaining ## sections: each collapsible -->
              <template v-for="(sec, si) in currentCard.promptSections.slice(currentCard.promptSections[0].title === null ? 1 : 0)" :key="'sys-' + selectedAgentIdx + '-' + si">
                <div :style="si < currentCard.promptSections.length - 2 ? 'border-bottom:1px solid #222222;' : 'border-bottom:1px solid #222222;'">
                  <button
                    @click="toggleSection('sys-' + selectedAgentIdx, si)"
                    class="w-full flex items-center justify-between px-4 py-2 cursor-pointer"
                    style="background:transparent;"
                    @mouseenter="e => e.currentTarget.style.background='#161616'"
                    @mouseleave="e => e.currentTarget.style.background='transparent'"
                  >
                    <span style="color:#6B7280; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">{{ sec.title }}</span>
                    <svg class="w-3.5 h-3.5 transition-transform" :style="isSectionOpen('sys-' + selectedAgentIdx, si) ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                  </button>
                  <div v-if="isSectionOpen('sys-' + selectedAgentIdx, si)" class="px-4 pb-3" style="border-top:1px solid #1A1A1A;">
                    <div style="margin-top:0.75rem;" class="space-y-2">
                      <template v-for="(sub, ssi) in parseSubSections(sec.content)" :key="ssi">
                        <p v-if="sub.subTitle" style="color:#4B5563; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em; padding-top:0.25rem;">{{ sub.subTitle }}</p>
                        <pre class="whitespace-pre-wrap leading-relaxed" style="font-family:'JetBrains Mono',monospace; font-size:var(--fs-small); color:#9CA3AF; max-height:280px; overflow-y:auto; background:#0D0D0D; border-radius:8px; padding:0.75rem;">{{ sub.content }}</pre>
                      </template>
                    </div>
                  </div>
                </div>
              </template>
            </template>
            <div v-else class="px-4 py-3" style="border-bottom:1px solid #222222;">
              <p style="color:#374151; font-size:var(--fs-small);">{{ t('chats.snapshotCapturedDuringRun') }}</p>
            </div>

            <!-- Memory sections (My Knowledge Base, Recent Session Logs, Relevant Past Context) -->
            <template v-for="(sec, si) in currentCard.memorySections" :key="'mem-' + selectedAgentIdx + '-' + si">
              <div style="border-bottom:1px solid #222222;">
                <button
                  @click="toggleSection('mem-' + selectedAgentIdx, si)"
                  class="w-full flex items-center justify-between px-4 py-2 cursor-pointer"
                  style="background:transparent;"
                  @mouseenter="e => e.currentTarget.style.background='#161616'"
                  @mouseleave="e => e.currentTarget.style.background='transparent'"
                >
                  <span style="color:#6B7280; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">{{ sec.title }}</span>
                  <svg class="w-3.5 h-3.5 transition-transform" :style="isSectionOpen('mem-' + selectedAgentIdx, si) ? 'transform:rotate(180deg)' : ''" viewBox="0 0 24 24" fill="none" stroke="#4B5563" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
                </button>
                <div v-if="isSectionOpen('mem-' + selectedAgentIdx, si)" class="px-4 pb-3" style="border-top:1px solid #1A1A1A;">
                  <div style="margin-top:0.75rem;" class="space-y-2">
                    <template v-for="(sub, ssi) in parseSubSections(sec.content)" :key="ssi">
                      <p v-if="sub.subTitle" style="color:#4B5563; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em; padding-top:0.25rem;">{{ sub.subTitle }}</p>
                      <pre class="whitespace-pre-wrap leading-relaxed" style="font-family:'JetBrains Mono',monospace; font-size:var(--fs-small); color:#9CA3AF; max-height:280px; overflow-y:auto; background:#0D0D0D; border-radius:8px; padding:0.75rem;">{{ sub.content }}</pre>
                    </template>
                  </div>
                </div>
              </div>
            </template>

            <!-- Skills -->
            <div class="px-4 py-3" style="border-bottom:1px solid #222222;">
              <p class="mb-2" style="color:#4B5563; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">{{ t('chats.skillsLabel') }} ({{ currentCard.skills.length }})</p>
              <div v-if="currentCard.skills.length" class="flex flex-wrap gap-1.5">
                <span v-for="skill in currentCard.skills" :key="skill.id" class="px-2 py-0.5 rounded text-xs" style="background:#1E1E1E; color:#9CA3AF; border:1px solid #2A2A2A;">{{ skill.name }}</span>
              </div>
              <span v-else style="color:#374151; font-size:var(--fs-small);">—</span>
            </div>

            <!-- Tools -->
            <div class="px-4 py-3" style="border-bottom:1px solid #222222;">
              <p class="mb-2" style="color:#4B5563; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">{{ t('chats.tools') }} ({{ currentCard.tools.length }})</p>
              <div v-if="currentCard.tools.length" class="flex flex-wrap gap-1.5">
                <span v-for="tool in currentCard.tools" :key="tool.id" class="px-2 py-0.5 rounded text-xs" style="background:#1E1E1E; color:#9CA3AF; border:1px solid #2A2A2A;">{{ tool.name }}</span>
              </div>
              <span v-else style="color:#374151; font-size:var(--fs-small);">—</span>
            </div>

            <!-- MCP -->
            <div class="px-4 py-3" style="border-bottom:1px solid #222222;">
              <p class="mb-2" style="color:#4B5563; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">{{ t('chats.mcpLabel') }} ({{ currentCard.mcpServers.length }})</p>
              <div v-if="currentCard.mcpServers.length" class="flex flex-wrap gap-1.5">
                <span v-for="srv in currentCard.mcpServers" :key="srv.id" class="px-2 py-0.5 rounded text-xs" style="background:#1E1E1E; color:#9CA3AF; border:1px solid #2A2A2A;">{{ srv.name }}</span>
              </div>
              <span v-else style="color:#374151; font-size:var(--fs-small);">—</span>
            </div>

            <!-- RAG -->
            <div class="px-4 py-3">
              <p class="mb-2" style="color:#4B5563; font-size:var(--fs-small); font-weight:600; text-transform:uppercase; letter-spacing:0.06em;">{{ t('chats.ragLabel') }} ({{ currentCard.knowledgeBases.length }})</p>
              <div v-if="currentCard.knowledgeBases.length" class="flex flex-wrap gap-1.5">
                <span v-for="kb in currentCard.knowledgeBases" :key="kb" class="px-2 py-0.5 rounded text-xs" style="background:#1E1E1E; color:#9CA3AF; border:1px solid #2A2A2A;">{{ kb }}</span>
              </div>
              <span v-else style="color:#374151; font-size:var(--fs-small);">—</span>
            </div>

          </div>
        </template>

      </div>
    </div>
  </div>

  <!-- ── Debug Log dialog ── -->
  <Teleport to="body">
    <div
      v-if="debugDialogOpen"
      class="fixed inset-0 flex items-center justify-center"
      style="z-index:60; background:rgba(0,0,0,0.7);"
      @click.self="debugDialogOpen = false"
    >
      <div
        class="flex flex-col"
        style="background:#0A0A0A; border:1px solid #2A2A2A; border-radius:16px; width:72vw; height:72vh; box-shadow:0 20px 60px rgba(0,0,0,0.8); overflow:hidden;"
      >
        <div class="flex items-center justify-between px-5 py-3 shrink-0" style="border-bottom:1px solid #1E1E1E;">
          <div class="flex items-center gap-3">
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="#6B7280" stroke-width="2">
              <rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5" fill="#6B7280" stroke="none"/><circle cx="8.5" cy="15.5" r="1.5" fill="#6B7280" stroke="none"/><line x1="13" y1="8.5" x2="19" y2="8.5"/><line x1="13" y1="15.5" x2="19" y2="15.5"/>
            </svg>
            <span class="font-semibold" style="color:#E5E5EA; font-size:var(--fs-subtitle);">{{ t('chats.debugLog') }}</span>
            <span style="color:#374151; font-size:var(--fs-small);">{{ debugLogs.length }} {{ t('chats.entries') }}</span>
          </div>
          <button
            @click="debugDialogOpen = false"
            class="w-7 h-7 rounded-lg flex items-center justify-center cursor-pointer"
            style="color:#6B7280;"
            @mouseenter="e => e.currentTarget.style.background='#1A1A1A'"
            @mouseleave="e => e.currentTarget.style.background=''"
          >
            <svg class="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
            </svg>
          </button>
        </div>
        <div
          ref="debugLogEl"
          class="flex-1 overflow-y-auto px-4 py-3"
          style="font-family:'JetBrains Mono',monospace;"
          @scroll="onDebugScroll"
        >
          <div v-if="debugLogs.length === 0" style="color:#374151; font-size:var(--fs-secondary);">{{ t('chats.noEventsYet') }}</div>
          <div
            v-for="(entry, i) in debugLogs"
            :key="i"
            class="py-0.5"
            style="font-size:var(--fs-secondary); line-height:1.6;"
            :style="entry.level === 'error' ? 'color:#f87171;' : entry.level === 'warn' ? 'color:#fbbf24;' : entry.level === 'success' ? 'color:#34d399;' : entry.level === 'chunk' ? 'color:#60a5fa;' : 'color:#6B7280;'"
          >
            <span style="color:#2D2D2D; margin-right:8px; user-select:none;">{{ entry.time }}</span>{{ entry.msg }}
          </div>
        </div>
        <div v-if="!autoScroll" class="flex justify-center py-2 shrink-0" style="border-top:1px solid #1A1A1A;">
          <button
            @click="resumeAutoScroll"
            class="flex items-center gap-1.5 px-3 py-1 rounded-full cursor-pointer text-xs"
            style="background:#1E1E1E; color:#6B7280; border:1px solid #2A2A2A;"
            @mouseenter="e => e.currentTarget.style.background='#252525'"
            @mouseleave="e => e.currentTarget.style.background='#1E1E1E'"
          >
            <svg class="w-3 h-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="6 9 12 15 18 9"/></svg>
            scroll to latest
          </button>
        </div>
      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, reactive, computed, watch, nextTick } from 'vue'
import { useChatsStore }  from '../../stores/chats'
import { useConfigStore } from '../../stores/config'
import { useAgentsStore } from '../../stores/agents'
import { useSkillsStore } from '../../stores/skills'
import { useToolsStore }  from '../../stores/tools'
import { useMcpStore }    from '../../stores/mcp'
import { useI18n }        from '../../i18n/useI18n'

const props = defineProps({
  visible:                Boolean,
  chatId:                 String,
  contextMetrics:         { type: Object, default: () => ({}) },
  perAgentContextMetrics: { type: Object, default: () => ({}) },
  debugLogs:              { type: Array,  default: () => [] },
})

const emit = defineEmits(['close'])

const chatsStore  = useChatsStore()
const configStore = useConfigStore()
const agentsStore = useAgentsStore()
const skillsStore = useSkillsStore()
const toolsStore  = useToolsStore()
const mcpStore    = useMcpStore()
const { t }       = useI18n()

// ── UI state ──────────────────────────────────────────────────────────────────

const contextSnapshot  = ref(null)
const metricsOpen      = ref(true)
const mainTab          = ref('user')
const selectedAgentIdx = ref(0)
const sectionState     = reactive({}) // key: `${group}-${idx}` → bool (open)
const debugDialogOpen  = ref(false)
const debugLogEl       = ref(null)
const autoScroll       = ref(true)

const hasElectron = !!(typeof window !== 'undefined' && window.electronAPI)

// ── Section expand helpers ────────────────────────────────────────────────────

function sectionKey(group, idx) { return `${group}:${idx}` }
function isSectionOpen(group, idx) { return !!sectionState[sectionKey(group, idx)] }
function toggleSection(group, idx) {
  const k = sectionKey(group, idx)
  sectionState[k] = !sectionState[k]
}

// ── Sub-section parser (### headers within a section body) ───────────────────
// Returns [{ subTitle: string|null, content: string }]

function parseSubSections(content) {
  if (!content) return []
  const text = content.replace(/\r\n/g, '\n').trim()
  if (!text.includes('\n### ') && !text.startsWith('### ')) return [{ subTitle: null, content: text }]
  const parts = text.split(/\n(?=### )/)
  return parts.map(part => {
    const trimmed = part.trim()
    if (!trimmed) return null
    const m = trimmed.match(/^### (.+?)(?:\n|$)/)
    if (m) return { subTitle: m[1].trim(), content: trimmed.slice(m[0].length).trim() }
    return { subTitle: null, content: trimmed }
  }).filter(Boolean)
}

// ── Prompt section parser ─────────────────────────────────────────────────────
// Splits a prompt string on `## ` headings (with optional `---` separator before).
// Returns [{ title: string|null, content: string }]

function parsePromptSections(prompt) {
  if (!prompt) return []
  const text = prompt.replace(/\r\n/g, '\n').trim()
  // Normalize "---\n## " into "\n## " so splitting is uniform
  const normalized = text.replace(/\n---+\n(?=## )/g, '\n')
  const parts = normalized.split(/\n(?=## )/)
  return parts.map(part => {
    const trimmed = part.trim()
    if (!trimmed) return null
    const m = trimmed.match(/^## (.+?)(?:\n|$)/)
    if (m) return { title: m[1].trim(), content: trimmed.slice(m[0].length).trim() }
    return { title: null, content: trimmed }
  }).filter(Boolean)
}

// ── Aggregate metrics ─────────────────────────────────────────────────────────

const aggregateMetrics = computed(() => {
  const entries = Object.values(props.perAgentContextMetrics || {})
  if (entries.length === 0) return props.contextMetrics || {}
  const maxTokens       = props.contextMetrics?.maxTokens || entries[0]?.maxTokens || 0
  const inputTokens     = entries.reduce((s, e) => s + (e.inputTokens    || 0), 0)
  const outputTokens    = entries.reduce((s, e) => s + (e.outputTokens   || 0), 0)
  const compactionCount = entries.reduce((s, e) => s + (e.compactionCount || 0), 0)
  const percentage      = maxTokens > 0 ? (inputTokens / maxTokens) * 100 : 0
  return { inputTokens, outputTokens, maxTokens, compactionCount, percentage }
})

// ── Chat agent IDs ────────────────────────────────────────────────────────────

const chatAgentIds = computed(() => {
  const chat = chatsStore.activeChat
  if (!chat) return []
  if (chat.groupAgentIds?.length > 0) return chat.groupAgentIds
  if (chat.systemAgentId) return [chat.systemAgentId]
  return []
})

// ── Agent cards ───────────────────────────────────────────────────────────────

const agentCards = computed(() => {
  const snaps = contextSnapshot.value?.agentSnapshots || []
  const snapMap = {}
  snaps.forEach(s => { if (s.agentId) snapMap[s.agentId] = s })
  const isSingle = chatAgentIds.value.length === 1

  return chatAgentIds.value.map(agentId => {
    const agent = agentsStore.getAgentById(agentId)
    // Single-agent: use the top-level snapshot; group: use per-agent snap
    const snap = snapMap[agentId] || (isSingle ? contextSnapshot.value : null)
    const metrics = props.perAgentContextMetrics?.[agentId] || null

    const skills = (agent?.requiredSkillIds || [])
      .map(id => skillsStore.skills.find(s => s.id === id)).filter(Boolean)
      .map(s => ({ id: s.id, name: s.name }))
    const tools = (agent?.requiredToolIds || [])
      .map(id => toolsStore.tools.find(t => t.id === id)).filter(Boolean)
      .map(t => ({ id: t.id, name: t.name }))
    const mcpServers = (agent?.requiredMcpServerIds || [])
      .map(id => mcpStore.servers.find(s => s.id === id)).filter(Boolean)
      .map(s => ({ id: s.id, name: s.name }))
    const knowledgeBases = agent?.requiredKnowledgeBaseIds || []

    const chat  = chatsStore.activeChat
    const model = snap?.model || agent?.modelId || chat?.model || ''

    // Use the raw agent base prompt (before memory injection).
    // systemPromptCore still contains ## Session entries from log files which break the parser.
    // snap.agents.systemAgentPrompt is the clean identity/guidelines text only.
    const rawCore = snap?.agents?.systemAgentPrompt || agent?.prompt || null
    const promptSections = parsePromptSections(rawCore)

    // Memory sections are stored explicitly in the snapshot (structured, no parsing needed).
    // 'User Profile' belongs in the User Persona tab; the rest (Knowledge Base, Logs, Past Context) shown here.
    const USER_TAB_TITLES = new Set(['User Profile'])
    const memorySections = (snap?.memorySections || []).filter(s => !USER_TAB_TITLES.has(s.title))

    return { agentId, name: agent?.name || snap?.agentName || agentId, model, metrics, promptSections, memorySections, skills, tools, mcpServers, knowledgeBases }
  })
})

const currentCard = computed(() => agentCards.value[selectedAgentIdx.value] || agentCards.value[0] || null)

// ── User persona data ─────────────────────────────────────────────────────────

const userPersonaData = computed(() => {
  const chat = chatsStore.activeChat
  const uid  = chat?.userAgentId
  const agent = uid ? agentsStore.getAgentById(uid) : agentsStore.defaultUserAgent

  const isSingle = chatAgentIds.value.length === 1
  const snaps = contextSnapshot.value?.agentSnapshots || []
  const firstSnap = snaps[0] || (isSingle ? contextSnapshot.value : null)

  // Raw user agent prompt: prefer snapshot, fall back to agent definition
  const rawPrompt = firstSnap?.agents?.userAgentPrompt || agent?.prompt || null

  // Parse user agent's own prompt into sections (may contain ## headings)
  const rawSections = parsePromptSections(rawPrompt)

  // Show all memory sections from the snapshot (User Profile, My Knowledge Base, session logs, past context)
  const memorySections = firstSnap?.memorySections || []

  return { agent, rawSections, memorySections }
})

// ── Debug log ─────────────────────────────────────────────────────────────────

function onDebugScroll() {
  const el = debugLogEl.value
  if (!el) return
  autoScroll.value = el.scrollHeight - el.scrollTop - el.clientHeight < 40
}

function resumeAutoScroll() {
  autoScroll.value = true
  nextTick(() => { if (debugLogEl.value) debugLogEl.value.scrollTop = debugLogEl.value.scrollHeight })
}

watch(() => props.debugLogs.length, () => {
  if (debugDialogOpen.value && autoScroll.value)
    nextTick(() => { if (debugLogEl.value) debugLogEl.value.scrollTop = debugLogEl.value.scrollHeight })
})

watch(debugDialogOpen, (open) => {
  if (open) {
    autoScroll.value = true
    nextTick(() => { if (debugLogEl.value) debugLogEl.value.scrollTop = debugLogEl.value.scrollHeight })
  }
})

// ── Data fetch ────────────────────────────────────────────────────────────────

async function refreshContextSnapshot() {
  const cid = props.chatId
  if (!cid || !window.electronAPI?.getContextSnapshot) return
  try {
    const snap = await window.electronAPI.getContextSnapshot(cid)
    contextSnapshot.value = snap || chatsStore.activeChat?.lastContextSnapshot || null
  } catch {}
}

watch(() => props.visible, (open) => {
  if (open) {
    refreshContextSnapshot()
  } else {
    contextSnapshot.value = null
    selectedAgentIdx.value = 0
    Object.keys(sectionState).forEach(k => delete sectionState[k])
    debugDialogOpen.value = false
  }
})

watch(() => props.contextMetrics?.inputTokens, () => {
  if (props.visible) refreshContextSnapshot()
})

</script>
