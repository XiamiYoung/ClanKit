<template>
  <div class="config-page">

    <!-- Header -->
    <div class="config-header">
      <div class="config-header-top">
        <div>
          <h1 class="config-title">{{ t('config.title') }}</h1>
          <p class="config-subtitle">{{ t('config.configSubtitle') }}</p>
        </div>
      </div>
    </div>

    <!-- Primary tab bar (2 tabs) -->
    <div class="config-primary-tabs">
      <button
        v-for="tab in topTabs" :key="tab.value"
        @click="switchTopTab(tab.value)"
        class="config-primary-tab"
        :class="{ active: activeTopTab === tab.value }"
      >
        <component :is="tab.icon" class="config-tab-icon" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Two-column body: left sub-nav + right content -->
    <div class="config-body">
      <!-- Left vertical sub-nav -->
      <nav class="config-subnav">
        <template v-for="sub in currentSubTabs" :key="sub.value">
          <button
            v-if="sub.group"
            @click="voiceMenuExpanded = !voiceMenuExpanded"
            class="config-subnav-item config-subnav-group-toggle"
          >
            <svg class="config-subnav-icon" :style="{ transform: voiceMenuExpanded ? 'rotate(90deg)' : '' }" style="transition:transform 0.15s;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            <span class="config-subnav-label">{{ sub.label }}</span>
          </button>
          <button
            v-else
            @click="activeSubTab = sub.value"
            class="config-subnav-item"
            :class="{ active: activeSubTab === sub.value }"
            :style="sub.indent ? { paddingLeft: '1.75rem' } : {}"
          >
            <component :is="sub.icon" class="config-subnav-icon" />
            <span class="config-subnav-label">{{ sub.label }}</span>
            <span v-if="getSubTabStatus(sub.value) === 'empty'" class="config-subnav-dot" />
          </button>
        </template>
      </nav>

      <!-- Right scrollable content -->
      <div class="config-content">
        <div class="config-content-inner">

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Account (General > Account) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'account'">

          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('account.title') }}</h3>
            </div>

            <!-- Signed-in state -->
            <div v-if="auth.isAuthenticated.value" class="account-block">
              <div class="account-row">
                <img
                  v-if="auth.picture.value"
                  :src="auth.picture.value"
                  alt=""
                  class="account-avatar account-avatar-img"
                  referrerpolicy="no-referrer"
                />
                <div v-else class="account-avatar">
                  {{ (auth.name.value || auth.email.value || '?').slice(0, 1).toUpperCase() }}
                </div>
                <div class="account-info">
                  <div class="account-name-row">
                    <span class="account-name">{{ auth.name.value || displayedEmail || t('account.signedIn') }}</span>
                    <span v-if="accountMethodLabel" class="account-method-badge">{{ accountMethodLabel }}</span>
                  </div>
                  <div v-if="auth.name.value && displayedEmail" class="account-email-secondary">{{ displayedEmail }}</div>
                </div>
              </div>

              <div v-if="auth.createdAt.value || auth.lastOpenedAt.value" class="account-meta">
                <div v-if="auth.createdAt.value" class="account-meta-row">
                  <span class="account-meta-label">{{ t('account.registeredAt') }}</span>
                  <span class="account-meta-value">{{ formatRegisteredAt(auth.createdAt.value) }}</span>
                </div>
                <div v-if="auth.lastOpenedAt.value" class="account-meta-row">
                  <span class="account-meta-label">{{ t('account.lastOpenedAt') }}</span>
                  <span class="account-meta-value">{{ formatRegisteredAt(auth.lastOpenedAt.value) }}</span>
                </div>
              </div>

              <div class="account-actions">
                <AppButton size="compact" variant="secondary" @click="goToAuth">
                  {{ t('account.switchAccount') }}
                </AppButton>
                <AppButton size="compact" variant="danger-ghost" @click="onSignOut">
                  {{ t('account.signOut') }}
                </AppButton>
              </div>
            </div>

            <!-- Signed-out state -->
            <div v-else class="account-block">
              <div class="account-empty">
                <svg class="account-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <h4 class="account-empty-title">{{ t('account.notSignedIn') }}</h4>
                <p class="account-empty-hint">{{ t('account.notSignedInHint') }}</p>
              </div>
              <div class="account-actions account-actions-center">
                <AppButton size="compact" variant="primary" @click="goToAuth">
                  {{ t('account.signInOrRegister') }}
                </AppButton>
              </div>
            </div>
          </div>

          <!-- Privacy + guest-limits panel — visible regardless of sign-in state -->
          <div class="config-card account-privacy-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                  <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('account.privacyTitle') }}</h3>
            </div>
            <ul class="account-privacy-list">
              <li>{{ t('account.privacyBullet1') }}</li>
              <li>{{ t('account.privacyBullet2') }}</li>
              <li>{{ t('account.privacyBullet3') }}</li>
              <li>{{ t('account.privacyBullet4') }}</li>
            </ul>
            <div v-if="!auth.isAuthenticated.value" class="account-limits-block">
              <div class="account-limits-title">{{ t('account.guestLimitsTitle') }}</div>
              <p class="account-limits-hint">{{ t('account.guestLimitsHint') }}</p>
              <div class="account-limits-grid">
                <div class="account-limit-cell"><span class="lim-num">15</span><span class="lim-lab">{{ t('nav.chats') }}</span></div>
                <div class="account-limit-cell"><span class="lim-num">5</span><span class="lim-lab">{{ t('account.limitFolders') }}</span></div>
                <div class="account-limit-cell"><span class="lim-num">20</span><span class="lim-lab">{{ t('nav.agents') }}</span></div>
                <div class="account-limit-cell"><span class="lim-num">3</span><span class="lim-lab">{{ t('nav.userPersonas') }}</span></div>
                <div class="account-limit-cell"><span class="lim-num">5</span><span class="lim-lab">{{ t('tasks.tabs.tasks') }}</span></div>
                <div class="account-limit-cell"><span class="lim-num">5</span><span class="lim-lab">{{ t('tasks.tabs.plans') }}</span></div>
              </div>
            </div>
          </div>

        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- About (General > About) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'about'">
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('updater.softwareUpdates') }}</h3>
            </div>

            <div class="about-version-row">
              <span class="about-version-label">{{ t('updater.currentVersion', '', { version: updater.currentVersion.value || '—' }) }}</span>
            </div>

            <div class="about-actions-row">
              <AppButton
                size="compact"
                variant="primary"
                :disabled="!updater.enabled || updater.state.value === 'checking' || updater.state.value === 'downloading'"
                :loading="updater.state.value === 'checking'"
                @click="onCheckForUpdates"
              >
                {{ updater.state.value === 'checking' ? t('updater.checking') : t('updater.checkButton') }}
              </AppButton>

              <AppButton
                v-if="updater.state.value === 'available'"
                size="compact"
                variant="primary"
                @click="updater.install()"
              >
                {{ updater.available.value?.manualOnly ? t('updater.download') : t('updater.installNow') }}
              </AppButton>

              <span
                v-if="aboutStatusText"
                class="about-status"
                :class="aboutStatusClass"
              >
                <svg
                  v-if="updater.lastCheckOutcome.value === 'up_to_date'"
                  class="icon-xs"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                ><polyline points="20 6 9 17 4 12"/></svg>
                <svg
                  v-else-if="updater.lastCheckOutcome.value === 'failed'"
                  class="icon-xs"
                  viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"
                ><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                {{ aboutStatusText }}
              </span>
            </div>

            <p v-if="!updater.enabled" class="hint" style="margin-top:0.75rem;">
              {{ t('updater.checkFailed') }}
            </p>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Language (General > Language) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'language'">

          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/>
                </svg>
              </div>
              <h3 class="form-section-title">Language / 语言</h3>
            </div>
            <div class="form-group">
              <label class="form-label">{{ t('config.applicationLanguage') }}</label>
              <select v-model="form.language" class="field" @change="handleLanguageChange">
                <option value="en">English</option>
                <option value="zh">中文</option>
              </select>
              <p class="hint">
                {{ t('config.languageHint') }}
              </p>
            </div>
          </div>

        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Notifications (General > Notifications) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'notifications'">

          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('config.notifications') }}</h3>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <div class="im-enable-row">
                <div>
                  <span class="im-enable-label">{{ t('config.enableNotifications') }}</span>
                  <p class="hint" style="margin-top:4px; margin-bottom:0;">{{ t('config.notificationsHint') }}</p>
                </div>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox"
                    :checked="configStore.config.notifications?.enabled !== false"
                    @change="configStore.saveConfig({ notifications: { ...(configStore.config.notifications || {}), enabled: $event.target.checked } })" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>
              <div class="im-enable-row" style="margin-top:12px;" :style="{ opacity: configStore.config.notifications?.enabled === false ? 0.5 : 1 }">
                <div>
                  <span class="im-enable-label">{{ t('config.silentNotifications') }}</span>
                  <p class="hint" style="margin-top:4px; margin-bottom:0;">{{ t('config.silentNotificationsHint') }}</p>
                </div>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox"
                    :checked="!!configStore.config.notifications?.silent"
                    :disabled="configStore.config.notifications?.enabled === false"
                    @change="configStore.saveConfig({ notifications: { ...(configStore.config.notifications || {}), silent: $event.target.checked } })" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>
              <div class="im-enable-row" style="margin-top:12px;" :style="{ opacity: configStore.config.notifications?.enabled === false ? 0.5 : 1 }">
                <div>
                  <span class="im-enable-label">{{ t('config.summaryTimeout') }}</span>
                  <p class="hint" style="margin-top:4px; margin-bottom:0;">{{ t('config.summaryTimeoutHint') }}</p>
                </div>
                <input type="number" min="5" max="120" step="1"
                  class="field font-mono"
                  style="width:6rem; text-align:center; flex:0 0 auto;"
                  :value="Math.round((configStore.config.notifications?.summaryTimeoutMs ?? 30000) / 1000)"
                  :disabled="configStore.config.notifications?.enabled === false"
                  @change="(e) => {
                    const sec = Math.max(5, Math.min(120, Number(e.target.value) || 30))
                    configStore.saveConfig({ notifications: { ...(configStore.config.notifications || {}), summaryTimeoutMs: sec * 1000 } })
                  }" />
              </div>
            </div>
          </div>

        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Paths (General > Paths) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'paths'">

          <!-- Data Path -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <ellipse cx="12" cy="5" rx="9" ry="3"/><path d="M21 12c0 1.66-4 3-9 3s-9-1.34-9-3"/><path d="M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('config.dataPath') }}</h3>
              <span class="form-label-hint">CLANKIT_DATA_PATH</span>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <div class="input-with-trailing-btn">
                <input id="dataPath" v-model="form.dataPath" type="text" :placeholder="defaultDataPath" class="field font-mono" />
                <AppTooltip :text="t('common.selectFolder', 'Select folder')">
                  <AppButton variant="primary" size="icon" @click="pickDataFolder">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </AppButton>
                </AppTooltip>
              </div>
              <p class="hint">
                {{ t('config.dataPathHint') }} <code class="font-mono" style="font-size:12px; background:#F5F5F5; padding:1px 4px; border-radius:4px;">{{ defaultDataPath }}</code>
              </p>
              <div v-if="dataPathChanged" style="display:flex; gap:0.5rem; align-items:center; margin-top:0.75rem;">
                <AppButton size="compact" @click="showDataPathWarning = true" :disabled="savingGeneral" :loading="savingGeneral">
                  {{ t('config.dataPathApplyRestart') }}
                </AppButton>
                <button class="text-btn" style="font-size:0.8rem; color:var(--text-muted); cursor:pointer;" @click="form.dataPath = originalDataPath">
                  {{ t('config.dataPathResetDefault') }}
                </button>
              </div>
            </div>
          </div>

          <!-- Artifact Path -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('config.artifactPath') }}</h3>
              <span class="form-label-hint">CLANKIT_ARTIFACT_PATH</span>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <div class="input-with-trailing-btn">
                <input id="artifactPath" :value="form.artifactPath || defaultArtifactPath" @input="form.artifactPath = $event.target.value" type="text" class="field font-mono" />
                <AppTooltip :text="t('common.selectFolder', 'Select folder')">
                  <AppButton variant="primary" size="icon" @click="pickArtifactFolder">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </AppButton>
                </AppTooltip>
              </div>
              <p class="hint">
                {{ t('config.artifactPathHint') }} <code class="font-mono" style="font-size:12px; background:#F5F5F5; padding:1px 4px; border-radius:4px;">{{ defaultArtifactPath }}</code>
              </p>
            </div>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveGeneral" :disabled="savingGeneral" :loading="savingGeneral">
              <svg v-if="!savingGeneral" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
            </AppButton>
            <span v-if="savedGeneralMsg" class="save-indicator" :class="savedGeneralMsg.ok ? 'success' : 'error'">
              <svg v-if="savedGeneralMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedGeneralMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Models (AI > Models) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'ai' && activeSubTab === 'models'">

          <!-- New layout: left sidebar + right content -->
          <div class="models-page-layout">
            <!-- Left Sidebar -->
            <div class="models-left-nav">
              <!-- Add button in header row -->
              <div class="models-nav-header">
                <span class="models-nav-section-label">{{ t('config.models') }}</span>
                <AppTooltip :text="t('common.add', 'Add Provider')">
                  <button class="models-add-btn" @click="showAddProviderModal = true">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </button>
                </AppTooltip>
              </div>

              <!-- Models section -->
              <div class="models-nav-section">
                <button
                  v-for="p in configStore.config.providers"
                  :key="p.id"
                  class="models-nav-item"
                  :class="{ active: modelsLeftNav === p.id }"
                  @click="modelsLeftNav = p.id"
                >
                  <span class="models-nav-name">{{ providerDisplayLabel(p) }}</span>
                </button>
                <div v-if="configStore.config.providers.length === 0" class="models-nav-empty">
                  {{ t('config.noProvidersConfigured') }}
                </div>
              </div>

              <div class="models-nav-divider"></div>

              <!-- Global Settings section -->
              <div class="models-nav-section">
                <div class="models-nav-section-label">{{ t('config.globalSettings') }}</div>
                <button
                  class="models-nav-item"
                  :class="{ active: modelsLeftNav === 'utility' }"
                  @click="modelsLeftNav = 'utility'"
                >
                  <span class="models-nav-name">{{ t('config.utilityModel') }}</span>
                </button>
              </div>
            </div>

            <!-- Right Content -->
            <div class="models-right-content">
              <!-- Empty state -->
              <template v-if="modelsLeftNav === 'empty'">
                <div class="config-card">
                  <div style="text-align:center; padding: 3rem 1rem; color: var(--text-muted);">
                    <svg style="width:48px;height:48px;margin:0 auto 1rem;display:block;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                      <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                    </svg>
                    <p style="font-size:var(--fs-body); margin-bottom:0.5rem;">{{ t('config.selectProviderOrSetting') }}</p>
                    <p style="font-size:var(--fs-secondary);">{{ t('config.clickToAddProvider') }}</p>
                  </div>
                </div>
              </template>


              <!-- Utility Model -->
              <template v-else-if="modelsLeftNav === 'utility'">
                <div class="config-card">
                  <div class="form-section-header">
                    <div class="section-icon-sm">
                      <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                        <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
                      </svg>
                    </div>
                    <h3 class="form-section-title">{{ t('config.utilityModel', 'Utility Model') }}</h3>
                  </div>

                  <!-- Provider selector -->
                  <div class="form-group">
                    <label class="form-label">
                      {{ t('agents.provider') }} <span class="cfg-required">*</span>
                    </label>
                    <div v-if="utilityActiveProviderOptions.length === 0" class="hint">
                      {{ t('agents.noActiveProviders') }}
                    </div>
                    <ComboBox
                      v-else
                      :modelValue="form.utilityModel.provider"
                      @update:modelValue="onUtilityProviderChange"
                      :options="utilityActiveProviderOptions"
                      :placeholder="t('agents.selectProvider')"
                    />
                  </div>

                  <!-- Model picker (body-view style — filterable list with ctx / out tags) -->
                  <div class="form-group" v-if="form.utilityModel.provider" style="margin-bottom:0;">
                    <label class="form-label">
                      {{ t('agents.model') }} <span class="cfg-required">*</span>
                      <span class="form-label-hint">{{ t('config.backgroundTasks') }}</span>
                    </label>
                    <div v-if="form.utilityModel.model" class="cv-utility-selected-chip">
                      <span class="cv-utility-selected-label">{{ form.utilityModel.model }}</span>
                      <button
                        type="button"
                        class="cv-utility-selected-remove"
                        :title="t('common.clear') || 'Clear'"
                        @click="form.utilityModel.model = ''; testUtilityModelResult = null"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:0.875rem;height:0.875rem;">
                          <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
                        </svg>
                      </button>
                    </div>
                    <input
                      v-model="utilityModelFilter"
                      type="text"
                      :placeholder="t('agents.searchModels')"
                      class="field font-mono field-sm"
                      style="width:100%; margin-bottom:0.5rem;"
                    />
                    <div class="cv-model-list" ref="utilityModelListRef">
                      <div v-if="utilityModelsLoading" class="test-result" style="border:none; background:transparent;">{{ t('common.loading') }}...</div>
                      <template v-else>
                        <div
                          v-for="m in filteredUtilityModels"
                          :key="m.id"
                          v-memo="[m.id, m._ctxFormatted, m._outFormatted, m._outSource, m._inPriceFormatted, m._outPriceFormatted, m._priceSource, form.utilityModel.model === m.id]"
                          class="cv-model-item"
                          :class="{ active: form.utilityModel.model === m.id }"
                          @click="form.utilityModel.model = m.id; testUtilityModelResult = null; testUtilityModel()"
                        >
                          <span class="cv-model-name">{{ m.displayName }}</span>
                          <AppTooltip :text="m._ctxTitle" placement="top" class="cv-model-tag-tip">
                            <span
                              class="cv-model-ctx"
                              :class="m._ctxVal ? 'has-value' : 'is-missing'"
                            >
                              <template v-if="m._ctxVal">
                                <span class="cv-model-tag-label">{{ modelListI18n.contextLabel }}</span>
                                <span class="cv-model-tag-value">{{ m._ctxFormatted }}</span>
                              </template>
                              <template v-else>{{ modelListI18n.ctxUnavailable }}</template>
                            </span>
                          </AppTooltip>
                          <AppTooltip :text="m._outTitle" placement="top" class="cv-model-tag-tip">
                            <span
                              v-if="m._outSource !== 'fallback'"
                              class="cv-model-out-tag has-value"
                            >
                              <span class="cv-model-tag-label">{{ modelListI18n.maxOutputLabel }}</span>
                              <span class="cv-model-tag-value">{{ m._outFormatted }}</span>
                            </span>
                            <span
                              v-else
                              class="cv-model-out-tag is-missing"
                            >
                              {{ modelListI18n.outUnavailable }}
                              <span class="cv-model-tag-muted">· {{ modelListI18n.defaultPrefix }} {{ m._outFormatted }}</span>
                            </span>
                          </AppTooltip>
                          <AppTooltip :text="m._priceTitle" placement="top" class="cv-model-tag-tip">
                            <span
                              v-if="m._hasPrice"
                              class="cv-model-price-tag has-value"
                            >
                              <span class="cv-model-tag-label">{{ modelListI18n.inputPriceLabel }}</span>
                              <span class="cv-model-tag-value">{{ m._inPriceFormatted || '—' }}</span>
                              <span class="cv-model-tag-label">{{ modelListI18n.outputPriceLabel }}</span>
                              <span class="cv-model-tag-value">{{ m._outPriceFormatted || '—' }}</span>
                            </span>
                            <span
                              v-else
                              class="cv-model-price-tag is-missing"
                            >
                              {{ modelListI18n.priceUnavailable }}
                            </span>
                          </AppTooltip>
                        </div>
                        <div v-if="filteredUtilityModels.length === 0" class="hint" style="padding:0.5rem;">
                          {{ t('config.enterApiKeyFetchModels') }}
                        </div>
                      </template>
                    </div>

                    <!-- Test button + result -->
                    <div style="display:flex; justify-content:flex-end; margin-top:0.5rem;">
                      <AppTooltip :text="testingUtilityModel ? t('config.testing') : t('config.test')">
                        <AppButton
                          size="icon"
                          :disabled="testingUtilityModel || !form.utilityModel.provider || !form.utilityModel.model"
                          :loading="testingUtilityModel"
                          @click="testUtilityModel"
                        ><svg v-if="!testingUtilityModel" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></AppButton>
                      </AppTooltip>
                    </div>
                    <div v-if="testUtilityModelResult" class="test-result" :class="testUtilityModelResult.ok ? 'success' : 'error'" style="margin-top:0.375rem;">
                      {{ testUtilityModelResult.message }}
                    </div>
                    <p class="hint">{{ t('config.utilityModelLabel') }}</p>
                  </div>
                </div>
                <div class="save-row">
                  <AppButton size="save" @click="saveModels" :disabled="savingModels" :loading="savingModels">
                    <svg v-if="!savingModels" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                      <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                      <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
                    </svg>
                  </AppButton>
                  <span v-if="savedModelsMsg" class="save-indicator" :class="savedModelsMsg.ok ? 'success' : 'error'">
                    <svg v-if="savedModelsMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {{ savedModelsMsg.text }}
                  </span>
                </div>
              </template>

              <!-- Provider Config -->
              <template v-else-if="selectedProvider">
                <div class="config-card">
                  <div class="form-section-header" style="justify-content: space-between;">
                    <div style="display: flex; align-items: center; gap: 0.5rem;">
                      <div class="section-icon-sm">
                        <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                          <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                        </svg>
                      </div>
                      <h3 class="form-section-title">{{ providerDisplayLabel(selectedProvider) }}</h3>
                    </div>
                    <div class="header-actions">
                      <AppTooltip :text="t('config.deleteProvider', 'Delete provider')">
                        <button class="action-btn danger icon-only" @click="deleteProvider(selectedProvider.id)">
                          <svg class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                          </svg>
                        </button>
                      </AppTooltip>
                      <!-- Save button removed: provider edits debounce-save automatically.
                           The auto-save indicator below replaces the manual button. -->
                      <span v-if="providerAutoSaveStatus" class="save-indicator" :class="providerAutoSaveStatus.ok ? 'success' : 'error'">
                        <svg v-if="providerAutoSaveStatus.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                        <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                        {{ providerAutoSaveStatus.text }}
                      </span>
                    </div>
                  </div>

                  <!-- Alias -->
                  <div class="form-group compact">
                    <label class="form-label">{{ t('config.providerAlias') }}</label>
                    <input
                      v-model="selectedProvider.alias"
                      type="text"
                      maxlength="20"
                      :placeholder="selectedProvider.name"
                      class="field"
                    />
                    <p class="hint">{{ t('config.providerAliasHint') }}</p>
                  </div>

                  <!-- Credentials -->
                  <div v-if="selectedProvider.type !== 'ollama'" class="form-section-subheader">
                    <div class="section-icon-sm" style="width: 1.25rem; height: 1.25rem;">
                      <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 0.75rem; height: 0.75rem;">
                        <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                      </svg>
                    </div>
                    {{ t('config.credentials') }}
                  </div>
                  <div v-if="selectedProvider.type !== 'ollama'" class="form-group">
                    <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                      <label class="form-label" style="margin:0;">{{ t('config.apiKey') }}</label>
                      <a
                        v-if="configStore.PROVIDER_PRESETS[selectedProvider.type]?.apiKeyUrl"
                        href="#"
                        class="provider-apikey-link"
                        @click.prevent="openUrl(configStore.PROVIDER_PRESETS[selectedProvider.type].apiKeyUrl)"
                      >{{ t('onboarding.getApiKey') }} →</a>
                    </div>
                    <p v-if="selectedProvider.type === 'doubao'" class="hint" style="margin-bottom:0.4rem;">模型 ID 请填写火山方舟控制台创建的推理接入点 ID（格式：ep-xxxxxxxxxx-xxxxx）</p>
                    <div class="apikey-privacy-notice">
                      <svg class="apikey-privacy-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
                      <span>{{ t('setupWizard.apiKeyPrivacyNotice') }}</span>
                    </div>
                    <div class="input-with-action">
                      <input
                        v-model="selectedProvider.apiKey"
                        :type="showProviderKey ? 'text' : 'password'"
                        placeholder="sk-..."
                        class="field font-mono"
                      />
                      <button @click="showProviderKey = !showProviderKey" class="field-action-btn" v-tooltip="showProviderKey ? t('common.hide', 'Hide') : t('common.show', 'Show')">
                        <svg v-if="showProviderKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                        </svg>
                        <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                          <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>
                        </svg>
                      </button>
                    </div>
                  </div>
                  <div v-if="selectedProvider.type === 'custom'" class="form-group">
                    <label class="form-label">Protocol</label>
                    <select v-model="selectedProvider.settings.protocol" class="field" style="max-width:220px;">
                      <option value="openai">OpenAI Compatible</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                    <p class="hint">Determines which API format is used when calling this provider.</p>
                  </div>
                  <div v-if="selectedProvider.type !== 'google'" class="form-group">
                    <label class="form-label">{{ t('config.baseURL') }}</label>
                    <input v-model="selectedProvider.baseURL" type="url" :placeholder="configStore.PROVIDER_PRESETS[selectedProvider.type]?.defaultBaseURL || 'https://...'" class="field" />
                  </div>

                  <!-- Model -->
                  <div class="form-divider"></div>
                  <div class="form-section-subheader">
                    <div class="section-icon-sm" style="width: 1.25rem; height: 1.25rem;">
                      <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 0.75rem; height: 0.75rem;">
                        <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/>
                      </svg>
                    </div>
                    {{ selectedProvider.type === 'anthropic' ? t('config.anthropicModels') : t('config.availableModels') }}
                  </div>

                  <!-- Anthropic: 3 model inputs with Test -->
                  <template v-if="selectedProvider.type === 'anthropic'">
                    <div style="display:flex; align-items:center; gap:0.625rem; margin-bottom: 0.75rem; flex-wrap: wrap;">
                      <AppButton size="compact" @click="fetchAnthropicLatestModels" :disabled="anthropicFetching || !selectedProvider.apiKey" :loading="anthropicFetching">
                        <svg v-if="!anthropicFetching" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-5.88"/></svg>
                        {{ anthropicFetching ? t('config.fetching') : t('config.fetchAnthropicModels') }}
                      </AppButton>
                      <span class="hint" style="margin:0; font-size: 0.75rem; flex:1; min-width: 0;">
                        {{ t('config.anthropicModelHint') }}
                        <a href="#" @click.prevent="openUrl('https://platform.claude.com/docs/en/docs/about-claude/models/overview')" style="color: var(--accent); text-decoration: underline;">{{ t('config.anthropicModelDocs') }}</a>
                      </span>
                    </div>
                    <div v-if="anthropicFetchMsg" class="test-result" :class="anthropicFetchMsg.ok ? 'success' : 'error'" style="margin-bottom: 0.5rem;">
                      <svg v-if="anthropicFetchMsg.ok" class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                      <svg v-else class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{{ anthropicFetchMsg.text }}</span>
                    </div>
                    <div class="form-group compact">
                      <label class="form-label">{{ t('config.sonnetModel') }}</label>
                      <input v-model="selectedProvider.model" type="text" class="field font-mono" placeholder="e.g. claude-sonnet-4-6" />
                    </div>
                    <div class="form-group compact">
                      <label class="form-label">{{ t('config.opusModel') }}</label>
                      <input v-model="selectedProvider.settings.opusModel" type="text" class="field font-mono" placeholder="e.g. claude-opus-4-7" />
                    </div>
                    <div class="form-group compact">
                      <label class="form-label">{{ t('config.haikuModel') }}</label>
                      <input v-model="selectedProvider.settings.haikuModel" type="text" class="field font-mono" placeholder="e.g. claude-haiku-4-5" />
                    </div>
                    <div class="test-connection-row" style="margin-top: 0.5rem;">
                      <select v-model="selectedTestModel" class="field font-mono" style="flex:1;">
                        <option value="">{{ t('config.selectModel') }}</option>
                        <option v-for="m in testableModels" :key="m.id" :value="m.id">{{ m.label }}</option>
                      </select>
                      <AppTooltip :text="testingProviderNew ? t('config.testing') : t('config.test')">
                        <AppButton size="icon" @click="testProviderNew" :disabled="testingProviderNew || !canTestNew" :loading="testingProviderNew"><svg v-if="!testingProviderNew" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></AppButton>
                      </AppTooltip>
                    </div>
                    <div v-if="testResultNew" class="test-result" :class="testResultNew.ok ? 'success' : 'error'" style="margin-top: 0.5rem;">
                      <svg v-if="testResultNew.ok" class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                      <svg v-else class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{{ testResultNew.message }}</span>
                    </div>
                  </template>

                  <!-- Other providers: model list selection -->
                  <template v-else>
                    <div class="test-connection-row">
                      <div>
                        <p class="hint" style="margin-top:2px;">{{ selectedProviderModels.length > 0 ? t('config.modelsLoaded', '', { count: selectedProviderModels.length }) : (selectedProvider.type === 'ollama' ? t('config.fetchModels') : t('config.enterApiKeyFetchModels')) }}</p>
                      </div>
                      <div style="display: flex; gap: 0.375rem; align-items: center;">
                        <AppTooltip :text="providerModelsFetching ? t('config.fetching') : t('config.fetchModels')">
                          <AppButton size="icon" @click="fetchProviderModels" :disabled="providerModelsFetching || (selectedProvider.type !== 'ollama' && !selectedProvider.apiKey) || (selectedProvider.type !== 'google' && !selectedProvider.baseURL && !configStore.PROVIDER_PRESETS[selectedProvider.type]?.defaultBaseURL)" :loading="providerModelsFetching"><svg v-if="!providerModelsFetching" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-.18-5.88"/></svg></AppButton>
                        </AppTooltip>
                        <AppTooltip v-if="selectedProviderModels.length > 0 && providerHasMissingContext" :text="t('config.aiFillContext')">
                          <AppButton size="icon" @click="enrichProviderContext" :disabled="providerContextEnriching" :loading="providerContextEnriching"><svg v-if="!providerContextEnriching" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2v4m0 12v4m-7.07-3.93l2.83-2.83m8.48-8.48l2.83-2.83M2 12h4m12 0h4M4.93 4.93l2.83 2.83m8.48 8.48l2.83 2.83"/></svg></AppButton>
                        </AppTooltip>
                      </div>
                    </div>
                    <div v-if="selectedProviderModels.length > 0" style="margin-top: 0.5rem;">
                      <!-- Default model header — pure label, no interaction. The set-default action
                           lives on each row's star button below. -->
                      <div class="cv-default-model-header">
                        <span class="cv-default-model-label">{{ t('config.defaultModelLabel') }}</span>
                        <span class="cv-default-model-value" v-if="selectedProvider.model">{{ selectedProvider.model }}</span>
                        <span class="cv-default-model-value cv-default-model-empty" v-else>{{ t('config.noDefaultModel') }}</span>
                      </div>
                      <input v-model="providerModelFilter" type="text" placeholder="Filter models…" class="field font-mono field-sm" style="width: 100%; margin-bottom: 0.5rem;" />
                      <div class="cv-model-list">
                        <div
                          v-for="m in filteredProviderModels"
                          :key="m.id"
                          v-memo="[m.id, m._ctxFormatted, m._outFormatted, m._outSource, m._inPriceFormatted, m._outPriceFormatted, m._priceSource, testTargetModel === m.id, selectedProvider.model === m.id]"
                          class="cv-model-item"
                          :class="{ active: testTargetModel === m.id }"
                          @click="selectModelForTest(m.id)"
                        >
                          <span class="cv-model-name">{{ m.displayName }}</span>
                          <!-- Set-as-default button — sits before the metric tags. Click ONLY this
                               to change the persisted default model. Clicking the row body just
                               highlights the model as the Test button's target (transient). -->
                          <button
                            class="cv-model-set-default-btn"
                            :class="{ active: selectedProvider.model === m.id }"
                            :disabled="selectedProvider.model === m.id"
                            @click.stop="setProviderDefaultModel(m.id)"
                            :title="selectedProvider.model === m.id ? t('config.isDefaultModel') : t('config.setAsDefaultModel')"
                            :aria-label="t('config.setAsDefaultModel')"
                            type="button"
                          >
                            <svg v-if="selectedProvider.model === m.id" style="width:11px;height:11px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            <svg v-else style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                            <span class="cv-model-set-default-label">{{ selectedProvider.model === m.id ? t('config.defaultBadge') : t('config.setAsDefaultShort') }}</span>
                          </button>
                          <AppTooltip :text="m._ctxTitle" placement="top" class="cv-model-tag-tip">
                            <span
                              class="cv-model-ctx"
                              :class="m._ctxVal ? 'has-value' : 'is-missing'"
                            >
                              <template v-if="m._ctxVal">
                                <span class="cv-model-tag-label">{{ modelListI18n.contextLabel }}</span>
                                <span class="cv-model-tag-value">{{ m._ctxFormatted }}</span>
                              </template>
                              <template v-else>{{ modelListI18n.ctxUnavailable }}</template>
                            </span>
                          </AppTooltip>
                          <AppTooltip :text="m._outTitle" placement="top" class="cv-model-tag-tip">
                            <span
                              v-if="m._outSource !== 'fallback'"
                              class="cv-model-out-tag has-value"
                            >
                              <span class="cv-model-tag-label">{{ modelListI18n.maxOutputLabel }}</span>
                              <span class="cv-model-tag-value">{{ m._outFormatted }}</span>
                            </span>
                            <span
                              v-else
                              class="cv-model-out-tag is-missing"
                            >
                              {{ modelListI18n.outUnavailable }}
                              <span class="cv-model-tag-muted">· {{ modelListI18n.defaultPrefix }} {{ m._outFormatted }}</span>
                            </span>
                          </AppTooltip>
                          <AppTooltip :text="m._priceTitle" placement="top" class="cv-model-tag-tip">
                            <span
                              v-if="m._hasPrice"
                              class="cv-model-price-tag has-value"
                            >
                              <span class="cv-model-tag-label">{{ modelListI18n.inputPriceLabel }}</span>
                              <span class="cv-model-tag-value">{{ m._inPriceFormatted || '—' }}</span>
                              <span class="cv-model-tag-label">{{ modelListI18n.outputPriceLabel }}</span>
                              <span class="cv-model-tag-value">{{ m._outPriceFormatted || '—' }}</span>
                            </span>
                            <span
                              v-else
                              class="cv-model-price-tag is-missing"
                            >
                              {{ modelListI18n.priceUnavailable }}
                            </span>
                          </AppTooltip>
                          <AppTooltip :text="editModelLimitsLabel">
                            <button class="cv-model-out-edit" @click.stop="openModelLimitsEditor(m)">
                              <svg style="width:10px;height:10px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                            </button>
                          </AppTooltip>
                        </div>
                      </div>
                      <div style="display: flex; justify-content: flex-end; margin-top: 0.5rem;">
                        <AppTooltip :text="testingProviderNew ? t('config.testing') : t('config.test')">
                          <AppButton size="icon" @click="testProviderNew" :disabled="testingProviderNew || !canTestNew" :loading="testingProviderNew"><svg v-if="!testingProviderNew" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></AppButton>
                        </AppTooltip>
                      </div>
                    </div>
                    <div v-if="providerModelsFetchError" class="test-result error" style="margin-top: 0.5rem;">
                      <svg class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{{ providerModelsFetchError }}</span>
                    </div>
                    <div v-if="testResultNew" class="test-result" :class="testResultNew.ok ? 'success' : 'error'" style="margin-top: 0.5rem;">
                      <svg v-if="testResultNew.ok" class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                      <svg v-else class="icon-sm shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                      <span>{{ testResultNew.message }}</span>
                    </div>
                  </template>

                  <!-- Advanced Settings (collapsed by default) -->
                  <div class="form-divider"></div>
                  <button class="provider-advanced-toggle" @click="providerAdvancedOpen = !providerAdvancedOpen">
                    <svg class="icon-xs" :style="{ transform: providerAdvancedOpen ? 'rotate(90deg)' : '' }" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width: 0.75rem; height: 0.75rem; transition: transform 0.15s;">
                      <polyline points="9 18 15 12 9 6"/>
                    </svg>
                    {{ t('config.advancedSettings') }}
                  </button>
                  <div v-if="providerAdvancedOpen" style="margin-top: 0.5rem;">
                    <div class="form-group">
                      <label class="form-label">
                        {{ t('config.maxOutputTokens') }}
                        <span class="form-label-hint" style="color:#9CA3AF;">{{ t('config.maxOutputTokensProviderFallback') }}</span>
                        <span v-if="getHardLimit(selectedProvider, 'maxOutputTokens')" class="form-label-hint" style="color:#EF4444;">
                          {{ t('config.hardLimit', '', { count: getHardLimit(selectedProvider, 'maxOutputTokens') }) }}
                        </span>
                      </label>
                      <input
                        v-model.number="selectedProvider.settings.maxOutputTokens"
                        type="number"
                        min="1"
                        :max="getHardLimit(selectedProvider, 'maxOutputTokens') || 98304"
                        class="field font-mono"
                        style="max-width: 160px;"
                      />
                    </div>
                  </div>
                </div>
              </template>
            </div>
          </div>

          <!-- Add Provider Modal -->
          <Teleport to="body">
            <div v-if="showAddProviderModal" class="modal-backdrop">
              <div class="modal-content add-provider-modal">
                <div class="modal-header">
                  <h3>{{ t('config.addProvider', 'Add Provider') }}</h3>
                  <button class="modal-close" @click="showAddProviderModal = false">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div class="modal-body">
                  <div class="ap-provider-list">
                    <button
                      v-for="opt in addProviderListOptions"
                      :key="opt.value"
                      type="button"
                      class="ap-provider-item"
                      :class="{ selected: addProviderPreset === opt.value }"
                      @click="addProviderPreset = opt.value"
                    >
                      <div class="ap-provider-top">
                        <span class="ap-provider-name">{{ opt.label }}</span>
                        <span v-if="opt.freeInfo" class="ap-badge" :class="opt.freeInfo.badge">{{ t(opt.freeInfo.labelKey) }}</span>
                        <a v-if="opt.apiKeyUrl" href="#" class="ap-apikey-link" @click.stop.prevent="openUrl(opt.apiKeyUrl)">{{ t('onboarding.getApiKey') }} →</a>
                      </div>
                    </button>
                  </div>
                  <div v-if="addProviderPreset === 'custom'" class="form-group" style="margin-top: 0.875rem;">
                    <label class="form-label">Provider Name</label>
                    <input v-model="addProviderName" type="text" class="field" placeholder="My Custom Provider" />
                  </div>
                  <div v-if="addProviderPreset === 'custom'" class="form-group" style="margin-bottom:0;">
                    <label class="form-label">Protocol</label>
                    <select v-model="addProviderProtocol" class="field">
                      <option value="openai">OpenAI Compatible</option>
                      <option value="anthropic">Anthropic</option>
                    </select>
                  </div>
                </div>
                <div class="modal-footer">
                  <AppButton variant="secondary" @click="showAddProviderModal = false">{{ t('common.cancel') }}</AppButton>
                  <AppButton variant="primary" @click="confirmAddProvider">{{ t('common.add') }}</AppButton>
                </div>
              </div>
            </div>
          </Teleport>

        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Skills (AI > Skills) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'ai' && activeSubTab === 'skills'">
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('config.skillsPath') }}</h3>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <div class="input-with-trailing-btn">
                <input id="skillsPath" :value="form.skillsPath || defaultSkillsPath" @input="form.skillsPath = $event.target.value" type="text" class="field font-mono" />
                <AppTooltip :text="t('common.openInExplorer', 'Open in file explorer')">
                  <AppButton variant="primary" size="icon" @click="openInExplorer(form.skillsPath || defaultSkillsPath)">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </AppButton>
                </AppTooltip>
              </div>
              <p class="hint">{{ t('config.skillsPathHint') }}</p>
            </div>
          </div>
          <div class="save-row">
            <AppButton size="save" @click="saveSkillsPath" :disabled="savingSkillsPath" :loading="savingSkillsPath">
              <svg v-if="!savingSkillsPath" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
            </AppButton>
            <span v-if="savedSkillsPathMsg" class="save-indicator" :class="savedSkillsPathMsg.ok ? 'success' : 'error'">
              <svg v-if="savedSkillsPathMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedSkillsPathMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- AI Doc Path (AI > AiDoc) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'ai' && activeSubTab === 'aidoc'">

          <!-- AI Doc Path -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('config.aidocPath') }}</h3>
            </div>
            <div class="form-group">
              <div class="input-with-trailing-btn">
                <input id="DoCPath" :value="form.DoCPath || defaultAidocPath" @input="form.DoCPath = $event.target.value" type="text" class="field font-mono" />
                <AppTooltip :text="t('common.selectFolder', 'Select folder')">
                  <AppButton variant="primary" size="icon" @click="pickAidocFolder">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
                    </svg>
                  </AppButton>
                </AppTooltip>
                <AppTooltip :text="t('common.openInExplorer', 'Open in file explorer')">
                  <AppButton variant="primary" size="icon" @click="openInExplorer(form.DoCPath || defaultAidocPath)">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>
                    </svg>
                  </AppButton>
                </AppTooltip>
              </div>
              <p class="hint">{{ t('config.aidocPathHint') }}</p>
            </div>
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label" style="font-size:0.75rem; color:var(--color-text-secondary);">{{ t('config.aidocFileTypes') }}</label>
              <div style="display:flex; flex-wrap:wrap; gap:0.375rem; margin-top:0.375rem;">
                <span v-for="ext in ['.md','.txt','.docx','.pdf','.pptx','.xlsx','.csv','.html']" :key="ext"
                  style="font-size:0.7rem; font-family:monospace; background:var(--color-bg-secondary); border:1px solid var(--color-border); border-radius:4px; padding:2px 6px; color:var(--color-text-secondary);">{{ ext }}</span>
              </div>
            </div>
          </div>

          <!-- Artifact Path info -->
          <div class="config-card" style="border-left: 3px solid var(--color-border);">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M13 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9z"/><polyline points="13 2 13 9 20 9"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('config.artifactPathLabel') }}</h3>
            </div>
            <p class="hint" style="margin-bottom:0;">{{ t('config.artifactPathDescription') }}</p>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveAidocPath" :disabled="savingAidocPath" :loading="savingAidocPath">
              <svg v-if="!savingAidocPath" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
            </AppButton>
            <span v-if="savedAidocPathMsg" class="save-indicator" :class="savedAidocPathMsg.ok ? 'success' : 'error'">
              <svg v-if="savedAidocPathMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedAidocPathMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Knowledge (AI > Knowledge) — Embedding model info (read-only)
             Model is now bundled with the installer, so this card is purely
             informational. No download / remove buttons. -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'ai' && activeSubTab === 'knowledge'">
          <div class="config-card">

            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              </div>
              <h3 class="form-section-title">{{ t('knowledge.embeddingModel') }}</h3>
            </div>
            <p class="hint" style="margin-bottom:1rem;">{{ t('knowledge.modelSpec') }}</p>

            <div class="form-group">
              <div class="bundled-model-info">
                <div class="bundled-model-row">
                  <span class="bundled-model-label">{{ t('knowledge.modelName') }}</span>
                  <span class="bundled-model-value">{{ knowledgeStore.modelInfo?.modelId || 'sentence-transformers/paraphrase-multilingual-MiniLM-L12-v2' }}</span>
                </div>
                <div class="bundled-model-row">
                  <span class="bundled-model-label">{{ t('knowledge.modelVersion') }}</span>
                  <span class="bundled-model-value">{{ knowledgeStore.modelInfo?.version || '1.0.0' }}</span>
                </div>
                <div class="bundled-model-row">
                  <span class="bundled-model-label">{{ t('knowledge.modelDimension') }}</span>
                  <span class="bundled-model-value">{{ knowledgeStore.modelInfo?.dimension || 384 }}</span>
                </div>
                <div class="bundled-model-row">
                  <span class="bundled-model-label">{{ t('knowledge.modelStatus') }}</span>
                  <span v-if="knowledgeModelChecking" class="bundled-model-value" style="color:var(--c-text-muted); display:flex; align-items:center; gap:0.35rem;">
                    <svg class="icon-sm spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                    {{ t('knowledge.modelChecking') }}
                  </span>
                  <span v-else-if="knowledgeStore.modelReady" class="bundled-model-value" style="color:#10B981;">
                    &#10003; {{ t('knowledge.modelBundled') }}
                  </span>
                  <span v-else class="bundled-model-value" style="color:#EF4444;">{{ t('knowledge.modelNotBundled') }}</span>
                </div>
              </div>
              <p class="hint" style="margin-top:0.5rem;">{{ t('knowledge.modelBundledHint') }}</p>
            </div>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Voice (AI > Voice) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'ai' && activeSubTab === 'tts'">

          <!-- ═══ TTS: Edge TTS ═══ -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
              </div>
              <div style="display: flex; align-items: center; gap: 0.5rem;">
                <h3 class="form-section-title" style="margin: 0;">{{ t('config.ttsTitle') }}</h3>
                <span class="sec-mode-badge">{{ t('config.ttsFree') }}</span>
                <span class="info-tooltip-wrapper" style="position: relative; display: inline-block; flex-shrink: 0;">
                  <svg class="icon-xs" style="cursor:pointer; color:var(--c-text-muted);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="18" height="18">
                    <circle cx="12" cy="12" r="10"/>
                    <line x1="12" y1="8" x2="12" y2="12"/>
                    <circle cx="12" cy="16" r="1"/>
                  </svg>
                  <span class="edge-tts-tooltip" style="
                    display:none;
                    position:absolute;
                    left: 0;
                    top: 100%;
                    background: #18181b;
                    color: #fff;
                    border-radius: 0.5rem;
                    box-shadow: 0 4px 16px rgba(0,0,0,0.35);
                    padding: 0.75rem 1rem;
                    font-size: 0.95rem;
                    min-width: 340px;
                    z-index: 200;
                    white-space: normal;
                    margin-top: 0.5rem;
                    pointer-events: auto;
                  ">
                    <span v-if="configStore.config.language==='zh'">
                      微软 TTS API 限制：<br>
                      · 每分钟请求数、字符数有限制<br>
                      · 免费层：每分钟约 20 请求/5000 字符，每天 50 万字符<br>
                      · 超出限制会返回 429 错误
                    </span>
                    <span v-else>
                      Microsoft TTS API rate limits:<br>
                      · Requests and characters per minute are limited<br>
                      · Free tier: ~20 requests/5000 chars per min, 500,000 chars per day<br>
                      · Exceeding limits returns 429 error
                    </span>
                  </span>
                </span>
              </div>
            </div>
            <p class="hint" style="margin-bottom:1rem;">{{ t('config.ttsDesc') }}</p>

            <div class="form-group">
              <label class="form-label">{{ t('config.defaultVoice') }}</label>
              <div style="display:flex; gap:0.5rem; align-items:center;">
                <select v-model="form.voiceCall.ttsVoice" class="field" style="flex:1; max-width:20rem;">
                  <optgroup v-for="group in edgeVoiceGroups" :key="group.locale" :label="group.locale === 'zh-CN' ? t('common.chinese') : group.locale === 'en-US' ? t('common.english') : group.locale">
                    <option v-for="v in group.voices" :key="v.id" :value="v.id">
                      {{ v.name }} · {{ v.gender === 'Female' ? t('common.female') : t('common.male') }} · {{ v.locale === 'zh-CN' ? t('common.chinese') : v.locale === 'en-US' ? t('common.english') : v.locale }}
                    </option>
                  </optgroup>
                </select>
                <AppButton size="compact" @click="previewVoice(form.voiceCall.ttsVoice)" :disabled="previewingVoice || previewAudioPlaying" :loading="previewingVoice">
                  <svg v-if="previewAudioPlaying" style="width:12px;height:12px;display:inline-block;vertical-align:middle;margin-right:3px;" viewBox="0 0 24 24" fill="currentColor">
                    <rect x="4" y="8" width="3" height="8" rx="1"><animate attributeName="height" values="8;16;8" dur="0.8s" repeatCount="indefinite"/><animate attributeName="y" values="8;4;8" dur="0.8s" repeatCount="indefinite"/></rect>
                    <rect x="10.5" y="6" width="3" height="12" rx="1"><animate attributeName="height" values="12;6;12" dur="0.8s" begin="0.2s" repeatCount="indefinite"/><animate attributeName="y" values="6;9;6" dur="0.8s" begin="0.2s" repeatCount="indefinite"/></rect>
                    <rect x="17" y="8" width="3" height="8" rx="1"><animate attributeName="height" values="8;14;8" dur="0.8s" begin="0.4s" repeatCount="indefinite"/><animate attributeName="y" values="8;5;8" dur="0.4s" begin="0.4s" repeatCount="indefinite"/></rect>
                  </svg>
                  {{ previewAudioPlaying ? t('chats.stopSpeaking') : previewingVoice ? '...' : '▶ ' + t('config.preview') }}
                </AppButton>
              </div>
            </div>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveVoice" :disabled="savingVoice" :loading="savingVoice">
              <svg v-if="!savingVoice" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
            </AppButton>
            <span v-if="savedVoiceMsg" class="save-indicator" :class="savedVoiceMsg.ok ? 'success' : 'error'">
              <svg v-if="savedVoiceMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedVoiceMsg.text }}
            </span>
          </div>
        </template>

        <template v-if="activeTopTab === 'ai' && activeSubTab === 'stt'">

          <!-- ═══ STT Mode Selector ═══ -->
          <div class="config-card">
            <div class="form-section-header">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              </div>
              <h3 class="form-section-title">{{ t('config.sttMode') }}</h3>
            </div>
            <p class="hint" style="margin-bottom:1rem;">{{ t('config.sttModeHint') }}</p>
            <div class="tts-option-list">
              <!-- Disabled -->
              <div class="tts-option" :class="{ active: (form.voiceCall.mode || 'disabled') === 'disabled' }" @click="form.voiceCall.mode = 'disabled'">
                <div class="tts-option-left">
                  <div class="tts-option-icon">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
                  </div>
                  <div>
                    <div class="tts-option-name">{{ t('config.voiceDisabled') }}</div>
                    <div class="tts-option-desc">{{ t('config.sttDisabledDesc') }}</div>
                  </div>
                </div>
              </div>
              <!-- Local -->
              <div class="tts-option" :class="{ active: form.voiceCall.mode === 'local' }" @click="form.voiceCall.mode = 'local'; checkLocalServerIfNeeded()">
                <div class="tts-option-left">
                  <div class="tts-option-icon">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
                  </div>
                  <div>
                    <div class="tts-option-name">{{ t('config.voiceLocal') }} <span class="sec-mode-badge">{{ t('config.localFree') }}</span></div>
                    <div class="tts-option-desc">{{ t('config.sttLocalDesc') }}</div>
                  </div>
                </div>
              </div>
              <!-- OpenAI -->
              <div class="tts-option" :class="{ active: form.voiceCall.mode === 'openai' }" @click="form.voiceCall.mode = 'openai'">
                <div class="tts-option-left">
                  <div class="tts-option-icon">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>
                  </div>
                  <div>
                    <div class="tts-option-name">{{ t('config.voiceOpenAI') }} <span class="tts-cost-badge">{{ t('config.whisperSttCost') }}</span></div>
                    <div class="tts-option-desc">{{ t('config.sttOpenAIDesc') }}</div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- ═══ LOCAL MODE: SenseVoice ONNX Model ═══ -->
          <template v-if="form.voiceCall.mode === 'local'">
            <!-- STT Model Management (sherpa-onnx, no Python) -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.localSTT') }}</h3>
              </div>
              <p class="hint" style="margin-bottom:1rem;">{{ t('config.localSttOnnxHint') }}</p>

              <div class="form-group">
                <label class="form-label">{{ t('config.modelSource') }}</label>
                <select v-model="form.voiceCall.local.modelSource" class="field" style="max-width:16rem;">
                  <option value="huggingface">HuggingFace</option>
                  <option value="mirror">HF Mirror ({{ t('config.modelSourceCN') }})</option>
                </select>
              </div>

              <div class="form-divider"></div>
              <div class="test-connection-row">
                <div>
                  <p class="form-section-title" style="display:flex; align-items:center; gap:0.5rem;">
                    <span v-if="localEnvChecking" style="color:var(--c-text-muted); display:flex; align-items:center; gap:0.35rem;">
                      <svg class="icon-sm spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 11-6.219-8.56"/></svg>
                      {{ t('config.checkingEnv') }}
                    </span>
                    <span v-else-if="form.voiceCall.local.isReady" style="color:#10B981;">✓ {{ t('config.envReady') }}</span>
                    <span v-else style="color:var(--c-text-muted);">{{ t('config.envNotReady') }}</span>
                  </p>
                  <p class="hint" style="margin-top:2px;">{{ t('config.sttModelSpec') }}</p>
                </div>
                <div style="display:flex; gap:0.5rem;">
                  <AppButton v-if="!form.voiceCall.local.isReady" size="compact" @click="setupLocalEnv" :disabled="settingUpLocalEnv || localEnvChecking" :loading="settingUpLocalEnv">
                    {{ settingUpLocalEnv ? t('config.settingUpEnv') : t('config.setupEnvironment') }}
                  </AppButton>
                  <AppButton v-if="form.voiceCall.local.isReady" size="compact" @click="testLocalVoice" :disabled="testingLocal" :loading="testingLocal">
                    {{ testingLocal ? t('config.testingLocal') : t('config.testLocal') }}
                  </AppButton>
                  <AppButton v-if="form.voiceCall.local.isReady" size="compact" style="color:#EF4444;" @click="removeLocalEnv" :disabled="settingUpLocalEnv || removingLocalEnv" :loading="removingLocalEnv">
                    {{ removingLocalEnv ? t('config.removingEnv') : t('config.removeEnv') }}
                  </AppButton>
                </div>
              </div>

              <div v-if="localSetupProgress" style="margin-top:0.75rem;">
                <div style="display:flex; align-items:center; gap:0.5rem; margin-bottom:0.25rem;">
                  <div style="flex:1; height:4px; background:var(--c-border); border-radius:2px; overflow:hidden;">
                    <div style="height:100%; background:linear-gradient(135deg, #0F0F0F, #374151); transition:width 0.3s;" :style="{ width: Math.max(0, localSetupProgress.progress) + '%' }"></div>
                  </div>
                  <span style="font-size:var(--fs-small); color:var(--c-text-muted); min-width:3rem; text-align:right;">{{ localSetupProgress.progress }}%</span>
                </div>
                <p class="hint">{{ localSetupProgress.message }}</p>
              </div>
              <div v-if="localSetupError" class="test-result error" style="margin-top:10px;">
                <svg class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ localSetupError }}</span>
              </div>
              <div v-if="testResultLocal" class="test-result" :class="testResultLocal.ok ? 'success' : 'error'" style="margin-top:10px;">
                <svg v-if="testResultLocal.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ testResultLocal.message }}</span>
              </div>

              <div class="form-group" style="margin-top:1rem;">
                <label class="form-label">
                  {{ t('config.sttLanguage') }}
                  <span class="form-label-hint">{{ t('config.optional') }}</span>
                </label>
                <input v-model="form.voiceCall.language" type="text" placeholder="e.g. en, zh, ja, auto" class="field font-mono" />
              </div>
            </div>

          </template>

          <!-- ═══ OPENAI MODE: Whisper STT ═══ -->
          <template v-if="form.voiceCall.mode === 'openai'">
            <!-- Whisper STT -->
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.whisperSTT') }}</h3>
              </div>
              <p class="hint" style="margin-bottom:1rem;">{{ t('config.voiceCallsUseWhisper') }}</p>

              <div class="form-group">
                <label for="whisperApiKey" class="form-label">{{ t('config.openAIAPIKey') }} <span class="form-label-hint">{{ t('config.forWhisperSTT') }}</span></label>
                <div class="input-with-action">
                  <input id="whisperApiKey" v-model="form.voiceCall.whisperApiKey" :type="showWhisperKey ? 'text' : 'password'" placeholder="sk-..." class="field font-mono" />
                  <button @click="showWhisperKey = !showWhisperKey" class="field-action-btn" v-tooltip="showWhisperKey ? t('common.hide', 'Hide') : t('common.show', 'Show')" :aria-label="showWhisperKey ? 'Hide key' : 'Show key'">
                    <svg v-if="showWhisperKey" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                  </button>
                </div>
                <p class="hint">{{ t('config.whisperApiKeyHint') }}</p>
              </div>

              <div class="form-group">
                <label for="whisperBaseURL" class="form-label">{{ t('config.baseURL') }} <span class="form-label-hint">{{ t('config.optional') }}</span></label>
                <input id="whisperBaseURL" v-model="form.voiceCall.whisperBaseURL" type="url" placeholder="https://api.openai.com" class="field font-mono" />
                <p class="hint">{{ t('config.baseURLHint') }}</p>
              </div>

              <div class="form-group">
                <div style="display:flex; align-items:center; gap:0.5rem;">
                  <label class="im-toggle" @click.stop>
                    <input type="checkbox" v-model="form.voiceCall.whisperDirectAuth" @change="configStore.saveConfig({ voiceCall: voiceConfigToSave() })" />
                    <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                  </label>
                  <span class="form-label" style="margin-bottom:0">{{ t('config.directAuthMode') }}</span>
                </div>
                <p class="hint">{{ t('config.directAuthModeHint') }}</p>
              </div>

              <div class="form-group">
                <label for="whisperLanguage" class="form-label">{{ t('config.sttLanguage') }} <span class="form-label-hint">{{ t('config.recommendedNoiseReduction') }}</span></label>
                <input id="whisperLanguage" v-model="form.voiceCall.language" type="text" placeholder="e.g. en, zh, ja, fr (leave blank for auto)" class="field font-mono" />
                <p class="hint">{{ t('config.sttLanguageHint') }}</p>
              </div>

              <div class="form-divider"></div>
              <div class="test-connection-row">
                <div>
                  <p class="form-section-title">{{ t('config.test') }}</p>
                  <p class="hint" style="margin-top:2px;">{{ t('config.verifyWhisperEndpoint') }}</p>
                </div>
                <AppTooltip :text="testingWhisper ? t('config.testing') : t('config.test')">
                  <AppButton size="icon" @click="testWhisperConnection" :disabled="testingWhisper || !form.voiceCall.whisperApiKey" :loading="testingWhisper"><svg v-if="!testingWhisper" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></AppButton>
                </AppTooltip>
              </div>
              <div v-if="testResultWhisper" class="test-result" :class="testResultWhisper.ok ? 'success' : 'error'" style="margin-top:10px;">
                <svg v-if="testResultWhisper.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
                <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                <span>{{ testResultWhisper.message }}</span>
              </div>
            </div>

          </template>

          <!-- ═══ SHARED: Microphone Sensitivity (VAD) — collapsible advanced section ═══ -->
          <template v-if="form.voiceCall.mode === 'local' || form.voiceCall.mode === 'openai'">
            <div class="config-card">
              <button class="vad-advanced-toggle" @click="vadExpanded = !vadExpanded">
                <svg class="icon-xs" :style="{ transform: vadExpanded ? 'rotate(90deg)' : '' }" style="transition:transform 0.15s;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                <span>{{ t('config.advancedVad') }}</span>
              </button>
              <div v-if="vadExpanded">
                <p class="hint" style="margin-bottom:1rem; margin-top:0.75rem;">{{ t('config.vadSensitivityHint') }}</p>
                <div class="vad-grid">
                  <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">{{ t('config.amplitudeThreshold') }} <span class="form-label-hint">Current: {{ form.voiceCall.vadAmplitude }}</span></label>
                    <input type="range" min="0.005" max="0.06" step="0.001" v-model.number="form.voiceCall.vadAmplitude" class="vad-slider" />
                    <div class="vad-slider-labels"><span>{{ t('config.sensitive') }}</span><span>{{ t('config.selective') }}</span></div>
                    <p class="hint">{{ t('config.amplitudeHint') }}</p>
                  </div>
                  <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">{{ t('config.silenceCutoff') }} <span class="form-label-hint">Current: {{ form.voiceCall.vadSilenceMs }}ms</span></label>
                    <input type="range" min="300" max="2000" step="50" v-model.number="form.voiceCall.vadSilenceMs" class="vad-slider" />
                    <div class="vad-slider-labels"><span>{{ t('config.faster') }} (300ms)</span><span>{{ t('config.slower') }} (2000ms)</span></div>
                    <p class="hint">{{ t('config.silenceHint') }}</p>
                  </div>
                  <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">{{ t('config.minSpeechFrames') }} <span class="form-label-hint">Current: {{ form.voiceCall.vadSpeechFrames }} (~{{ Math.round(form.voiceCall.vadSpeechFrames / 60 * 1000) }}ms)</span></label>
                    <input type="range" min="5" max="60" step="1" v-model.number="form.voiceCall.vadSpeechFrames" class="vad-slider" />
                    <div class="vad-slider-labels"><span>5 frames</span><span>60 frames</span></div>
                    <p class="hint">{{ t('config.speechFramesHint') }}</p>
                  </div>
                  <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">{{ t('config.voiceBandRatio') }} <span class="form-label-hint">Current: {{ Math.round(form.voiceCall.vadVoiceBandRatio * 100) }}%</span></label>
                    <input type="range" min="0.05" max="0.6" step="0.01" v-model.number="form.voiceCall.vadVoiceBandRatio" class="vad-slider" />
                    <div class="vad-slider-labels"><span>{{ t('config.permissive') }} (5%)</span><span>{{ t('config.strict') }} (60%)</span></div>
                    <p class="hint">{{ t('config.voiceBandHint') }}</p>
                  </div>
                  <div class="form-group" style="margin-bottom:0;">
                    <label class="form-label">{{ t('config.backgroundNoiseRejection') }} <span class="form-label-hint">Current: {{ form.voiceCall.vadProximityMult }}×</span></label>
                    <input type="range" min="1.2" max="5" step="0.1" v-model.number="form.voiceCall.vadProximityMult" class="vad-slider" />
                    <div class="vad-slider-labels"><span>{{ t('config.relaxed') }} (1.2×)</span><span>{{ t('config.strict') }} (5×)</span></div>
                    <p class="hint">{{ t('config.backgroundNoiseHint') }}</p>
                  </div>
                </div>
              </div>
            </div>
          </template>

          <div class="save-row">
            <AppButton size="save" @click="saveVoice" :disabled="savingVoice" :loading="savingVoice">
              <svg v-if="!savingVoice" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
            </AppButton>
            <span v-if="savedVoiceMsg" class="save-indicator" :class="savedVoiceMsg.ok ? 'success' : 'error'">
              <svg v-if="savedVoiceMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedVoiceMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Email (General > Email) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'email'">
          <div class="config-card">

            <!-- SMTP Server section -->
            <div class="form-section-header" style="margin-bottom:12px;">
              <div class="section-icon-sm">
                <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
                </svg>
              </div>
              <h3 class="form-section-title">{{ t('config.smtpServer') }}</h3>
            </div>
            <p class="hint" style="margin-bottom:16px;">
              {{ t('config.emailCredentials') }}
            </p>

            <!-- Host -->
            <div class="form-group">
              <label for="smtpHost" class="form-label">
                {{ t('config.smtpServerHostname') }}
              </label>
              <input id="smtpHost" v-model="form.smtp.host" type="text" placeholder="smtp.office365.com" class="field font-mono" />
            </div>

            <!-- Port -->
            <div class="form-group">
              <label for="smtpPort" class="form-label">
                {{ t('config.smtpServerPort') }}
                <span class="form-label-hint">{{ t('config.smtpServerPortHint') }}</span>
              </label>
              <input id="smtpPort" v-model.number="form.smtp.port" type="number" placeholder="587" class="field font-mono" style="max-width:120px;" />
            </div>

            <!-- Username -->
            <div class="form-group">
              <label for="smtpUser" class="form-label">
                {{ t('config.smtpUsername') }}
                <span class="form-label-hint">{{ t('config.smtpUsernameHint') }}</span>
              </label>
              <input id="smtpUser" v-model="form.smtp.user" type="text" placeholder="you@yourdomain.com" class="field font-mono" />
            </div>

            <!-- Password -->
            <div class="form-group">
              <label for="smtpPass" class="form-label">
                {{ t('config.smtpPassword') }}
                <span class="form-label-hint">{{ t('config.smtpPasswordHint') }}</span>
              </label>
              <div class="input-with-action">
                <input
                  id="smtpPass"
                  v-model="form.smtp.pass"
                  :type="showSmtpPass ? 'text' : 'password'"
                  placeholder="••••••••"
                  class="field font-mono"
                />
                <button @click="showSmtpPass = !showSmtpPass" class="field-action-btn" v-tooltip="showSmtpPass ? t('common.hide', 'Hide') : t('common.show', 'Show')" :aria-label="showSmtpPass ? 'Hide password' : 'Show password'">
                  <svg v-if="showSmtpPass" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>
                  </svg>
                  <svg v-else class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/>
                    <line x1="1" y1="1" x2="23" y2="23"/>
                  </svg>
                </button>
              </div>
              <p class="hint">{{ t('config.emailMfaHint') }}</p>
            </div>

            <!-- Test Connection -->
            <div class="form-divider"></div>
              <div class="test-connection-row">
                <div>
                  <p class="form-section-title">{{ t('config.smtpTest') }}</p>
                  <p class="hint" style="margin-top:2px;">{{ t('config.smtpTestButton') }}</p>
                </div>
                <AppTooltip :text="testingSmtp ? t('config.smtpTestTesting') : t('config.smtpTestButton')">
                  <AppButton size="icon" @click="testSmtpConnection" :disabled="testingSmtp || !form.smtp.host || !form.smtp.user" :loading="testingSmtp"><svg v-if="!testingSmtp" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg></AppButton>
                </AppTooltip>
              </div>
            <div v-if="testResultSmtp" class="test-result" :class="testResultSmtp.ok ? 'success' : 'error'" style="margin-top:10px;">
              <svg v-if="testResultSmtp.ok" class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-sm shrink-0 mt-0.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>{{ testResultSmtp.message }}</span>
            </div>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveEmail" :disabled="savingEmail" :loading="savingEmail">
              <svg v-if="!savingEmail" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
            </AppButton>
            <span v-if="savedEmailMsg" class="save-indicator" :class="savedEmailMsg.ok ? 'success' : 'error'">
              <svg v-if="savedEmailMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedEmailMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- Security (General > Security) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'security'">

          <!-- Global Mode -->
          <div class="config-card">
            <div class="form-group" style="margin-bottom:0;">
              <label class="form-label">{{ t('config.globalSandboxMode') }}</label>
              <p class="hint" style="margin-bottom:12px;">{{ t('config.sandboxControls') }}</p>
              <div class="sec-mode-btns">
                <button
                  class="sec-mode-btn"
                  :class="{ active: sandboxForm.defaultMode === 'sandbox' }"
                  @click="sandboxForm.defaultMode = 'sandbox'"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
                  </svg>
                  {{ t('config.sandboxModeSandbox') }}
                  <span class="sec-mode-badge">{{ t('config.sandboxModeDefault') }}</span>
                </button>
                <button
                  class="sec-mode-btn"
                  :class="{ active: sandboxForm.defaultMode === 'all_permissions' }"
                  @click="sandboxForm.defaultMode = 'all_permissions'"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>
                  </svg>
                  {{ t('config.sandboxModeAll') }}
                </button>
              </div>
              <p class="hint" style="margin-top:8px;">
                <template v-if="sandboxForm.defaultMode === 'sandbox'">{{ t('config.sandboxModeSandboxHint') }}</template>
                <template v-else>{{ t('config.sandboxModeAllHint') }}</template>
              </p>
            </div>
          </div>

          <!-- Conditional list: Allow list (Sandbox) or Block list (All Permissions) -->
          <div class="config-card">

            <!-- Sandbox → Global Allow List -->
            <template v-if="sandboxForm.defaultMode === 'sandbox'">
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">{{ t('config.globalAllowList') }} <span class="sec-count-badge">{{ sandboxForm.sandboxAllowList.length }}</span></label>
                <p class="hint" style="margin-bottom:10px;">{{ t('config.globalAllowListHint') }}</p>
                <div class="sec-list">
                  <div v-if="sandboxForm.sandboxAllowList.length === 0" class="sec-list-empty">{{ t('config.noAllowListEntries') }}</div>
                  <div v-for="(entry, idx) in sandboxForm.sandboxAllowList" :key="entry.id || idx" class="sec-list-entry">
                    <div class="sec-entry-info">
                      <span class="sec-entry-pattern">{{ entry.pattern }}</span>
                      <span v-if="entry.description" class="sec-entry-desc">{{ entry.description }}</span>
                    </div>
                    <AppTooltip :text="t('common.remove', 'Remove')">
                      <button class="sec-entry-delete allow" @click="removeAllowEntry(idx)">
                        <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </AppTooltip>
                  </div>
                </div>
                <div class="sec-add-row">
                  <input v-model="newAllowPattern" type="text" :placeholder="t('config.allowListPatternPlaceholder')" class="sec-add-input" @keydown.enter.prevent="addAllowEntry" />
                  <input v-model="newAllowDesc" type="text" :placeholder="t('config.allowListDescPlaceholder')" class="sec-add-input" @keydown.enter.prevent="addAllowEntry" />
                  <button class="sec-add-btn" @click="addAllowEntry" :disabled="!newAllowPattern.trim()">{{ t('common.add') }}</button>
                </div>
              </div>
            </template>

            <!-- All Permissions → Danger Block List -->
            <template v-else>
              <div class="form-group" style="margin-bottom:0;">
                <label class="form-label">{{ t('config.dangerBlockList') }} <span class="sec-count-badge danger">{{ sandboxForm.dangerBlockList.length }}</span></label>
                <p class="hint" style="margin-bottom:10px;">{{ t('config.dangerBlockListHint') }}</p>
                <div class="sec-list">
                  <div v-if="sandboxForm.dangerBlockList.length === 0" class="sec-list-empty">{{ t('config.noBlockListEntries') }}</div>
                  <div v-for="(entry, idx) in sandboxForm.dangerBlockList" :key="entry.id || idx" class="sec-list-entry">
                    <div class="sec-entry-info">
                      <span class="sec-entry-pattern danger">{{ entry.pattern }}</span>
                      <span v-if="entry.description" class="sec-entry-desc">{{ entry.description }}</span>
                    </div>
                    <AppTooltip :text="t('common.remove', 'Remove')">
                      <button class="sec-entry-delete danger" @click="removeDangerEntry(idx)">
                        <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </AppTooltip>
                  </div>
                </div>
                <div class="sec-add-row">
                  <input v-model="newDangerPattern" type="text" :placeholder="t('config.dangerBlockListPatternPlaceholder')" class="sec-add-input" @keydown.enter.prevent="addDangerEntry" />
                  <input v-model="newDangerDesc" type="text" :placeholder="t('config.allowListDescPlaceholder')" class="sec-add-input" @keydown.enter.prevent="addDangerEntry" />
                  <button class="sec-add-btn danger" @click="addDangerEntry" :disabled="!newDangerPattern.trim()">{{ t('common.add') }}</button>
                </div>
              </div>
            </template>

          </div>

          <!-- Telemetry opt-out -->
          <div class="config-card" style="margin-top: 1rem;">
            <div class="form-group" style="margin-bottom:0;">
              <div class="im-enable-row">
                <div>
                  <span class="im-enable-label">{{ t('config.telemetryTitle') }}</span>
                  <p class="hint" style="margin-top:4px; margin-bottom:0;">{{ t('config.telemetryDesc') }}</p>
                </div>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox"
                    :checked="!configStore.config.telemetryOptOut"
                    @change="configStore.saveConfig({ telemetryOptOut: !$event.target.checked })" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>
            </div>
          </div>

          <div class="save-row">
            <AppButton size="save" @click="saveSecurity" :disabled="savingSecurity" :loading="savingSecurity">
              <svg v-if="!savingSecurity" class="icon-sm" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/>
                <polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/>
              </svg>
            </AppButton>
            <span v-if="savedSecurityMsg" class="save-indicator" :class="savedSecurityMsg.ok ? 'success' : 'error'">
              <svg v-if="savedSecurityMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              {{ savedSecurityMsg.text }}
            </span>
          </div>
        </template>

        <!-- ════════════════════════════════════════════════════════════════ -->
        <!-- IM Bridge (General > IM) -->
        <!-- ════════════════════════════════════════════════════════════════ -->
        <template v-if="activeTopTab === 'general' && activeSubTab === 'im'">

          <!-- IM platform tab bar: Telegram | WhatsApp | Feishu | Bridge -->
          <div class="provider-tab-group">
            <button @click="activeIMTab = 'telegram'" class="config-tab-btn" :class="{ active: activeIMTab === 'telegram' }">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              Telegram
              <span class="prov-dot" :class="telegramReady ? 'active' : 'inactive'" />
            </button>
            <button @click="activeIMTab = 'whatsapp'" class="config-tab-btn" :class="{ active: activeIMTab === 'whatsapp' }">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              WhatsApp
              <span class="prov-dot" :class="whatsappReady ? 'active' : (whatsappQr ? 'pending' : 'inactive')" />
            </button>
            <button @click="activeIMTab = 'feishu'" class="config-tab-btn" :class="{ active: activeIMTab === 'feishu' }">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              Feishu
              <span class="prov-dot" :class="feishuReady ? 'active' : 'inactive'" />
            </button>
            <button @click="activeIMTab = 'teams'" class="config-tab-btn" :class="{ active: activeIMTab === 'teams' }">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              Teams
              <span class="prov-dot" :class="teamsReady ? 'active' : 'inactive'" />
            </button>
            <button @click="activeIMTab = 'bridge'" class="config-tab-btn" :class="{ active: activeIMTab === 'bridge' }">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
              Bridge
              <span class="prov-dot" :class="imStatus.running ? 'active' : 'inactive'" />
            </button>
          </div>

          <!-- ══════════ TELEGRAM TAB ══════════ -->
          <template v-if="activeIMTab === 'telegram'">
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.telegram') }}</h3>
                <span class="im-platform-status" :class="telegramReady ? 'ready' : 'idle'">
                  {{ telegramReady ? t('config.telegramConfigured') : t('config.telegramNotConfigured') }}
                </span>
              </div>

              <div class="im-enable-row">
                <span class="im-enable-label">{{ t('config.telegramEnable') }}</span>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox" v-model="form.im.telegram.enabled" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>

              <div class="form-divider" />

              <div class="form-group">
                <label class="form-label" for="tgBotToken">{{ t('config.telegramBotToken') }}</label>
                <div style="position:relative;">
                  <input
                    id="tgBotToken"
                    v-model="form.im.telegram.botToken"
                    :type="showTgToken ? 'text' : 'password'"
                    placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                    class="field font-mono"
                    style="padding-right:2.5rem;"
                  />
                  <button type="button" @click="showTgToken = !showTgToken" class="im-reveal-btn" v-tooltip="showTgToken ? t('common.hide', 'Hide') : t('common.show', 'Show')">
                    <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <template v-if="showTgToken"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></template>
                      <template v-else><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></template>
                    </svg>
                  </button>
                </div>
                <p class="hint">{{ t('config.telegramBotTokenHint') }}</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="tgAllowedUsers">{{ t('config.allowedUsers') }} <span class="form-label-hint">{{ t('config.commaSeparatedUsernames') }}</span></label>
                <input
                  id="tgAllowedUsers"
                  :value="(form.im.telegram.allowedUsers || []).join(',')"
                  @input="form.im.telegram.allowedUsers = $event.target.value.split(',').map(s => s.trim()).filter(Boolean)"
                  placeholder="username1,username2"
                  class="field font-mono"
                />
                <p class="hint">{{ t('config.telegramAllowedUsersHint') }}</p>
              </div>

              <div class="form-divider" />
              <details class="im-setup-guide">
                <summary class="im-setup-guide-summary">
                  <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></svg>
                  {{ t('config.setupGuide') }}
                  <svg class="im-setup-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <ol class="im-setup-steps">
                  <li>{{ t('config.telegramInstructions') }}</li>
                </ol>
                <p class="im-setup-note">{{ t('config.telegramAllowedUsers') }}</p>
              </details>

              <div class="form-divider" style="margin-top:1rem;" />
              <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-top:0.75rem;">
                <AppButton size="compact" @click="saveIM" :loading="savingIM">
                  <svg v-if="!savingIM" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {{ t('common.save') }}
                </AppButton>
                <span v-if="savedIMMsg" class="save-indicator" :class="savedIMMsg.ok ? 'success' : 'error'">
                  <svg v-if="savedIMMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ savedIMMsg.text }}
                </span>
              </div>
            </div>
          </template>

          <!-- ══════════ WHATSAPP TAB ══════════ -->
          <template v-else-if="activeIMTab === 'whatsapp'">
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.whatsapp') }}</h3>
                <span class="im-platform-status" :class="whatsappReady ? 'ready' : (whatsappQr ? 'pending' : 'idle')">
                  {{ whatsappReady ? t('config.whatsappConnected') : (whatsappQr ? t('config.whatsappAwaitingScan') : t('config.whatsappNotConnected')) }}
                </span>
              </div>

              <div class="im-enable-row">
                <span class="im-enable-label">{{ t('config.whatsappEnable') }}</span>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox" v-model="form.im.whatsapp.enabled" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>

              <div class="form-divider" />

              <!-- Self-only toggle -->
              <div class="im-enable-row">
                <span class="im-enable-label">{{ t('config.whatsappSelfOnly') }}</span>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox" v-model="form.im.whatsapp.selfOnly" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>
              <p class="hint" style="margin-top:-0.25rem;">{{ t('config.whatsappSelfOnlyHint') }}</p>

              <div class="form-divider" />

              <div class="form-group">
                <label class="form-label" for="waAllowedUsers">{{ t('config.allowedUsers') }} <span class="form-label-hint">{{ t('config.commaSeparatedPhones') }}</span></label>
                <input
                  id="waAllowedUsers"
                  :value="(form.im.whatsapp.allowedUsers || []).join(',')"
                  @input="form.im.whatsapp.allowedUsers = $event.target.value.split(',').map(s => s.trim()).filter(Boolean)"
                  placeholder="6512345678,6587654321"
                  class="field font-mono"
                />
                <p class="hint">{{ t('config.whatsappAllowedUsersHint') }}</p>
              </div>

              <div class="form-divider" />

              <!-- Device linking section -->
              <div class="im-wa-link-section">
                <div class="im-wa-link-header">
                  <div>
                    <p class="form-label" style="margin:0 0 0.2rem;">{{ t('config.whatsappDeviceLinking') }}</p>
                    <p class="hint" style="margin:0;">
                      <template v-if="whatsappReady">{{ t('config.whatsappLinkedHint') }}</template>
                      <template v-else>{{ t('config.whatsappNotLinkedHint') }}</template>
                    </p>
                  </div>
                  <AppButton size="compact" variant="primary" @click="requestWhatsAppLink" :loading="waLinking" :disabled="waLinking">
                    <svg v-if="!waLinking" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
                    {{ waLinking ? t('config.whatsappGenerating') : (whatsappReady ? t('config.whatsappRelinkDevice') : t('config.whatsappLinkDevice')) }}
                  </AppButton>
                </div>

                <!-- QR code -->
                <div v-if="whatsappQr && !whatsappConnected" class="im-qr-block">
                  <img :src="whatsappQr" alt="WhatsApp QR Code" class="im-qr-img" />
                  <div class="im-qr-instructions">
                    <p style="margin:0 0 0.4rem; font-weight:600; font-size:var(--fs-secondary); color:var(--text-primary);">{{ t('config.whatsappScanWith') }}</p>
                    <ol class="im-inline-steps" style="margin:0; padding-left:1rem;">
                      <li>{{ t('config.whatsappQrInstructions1') }}</li>
                      <li>{{ t('config.whatsappQrInstructions2') }}</li>
                      <li>{{ t('config.whatsappQrInstructions3') }}</li>
                    </ol>
                    <p class="im-inline-note" style="margin-top:0.5rem;">{{ t('config.whatsappQrExpired') }}</p>
                  </div>
                </div>

                <!-- Connected state -->
                <div v-else-if="whatsappReady" class="im-wa-connected">
                  <svg style="width:18px;height:18px;color:#10B981;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>{{ t('config.whatsappLinkedSuccess') }}</span>
                </div>
              </div>

              <div class="form-divider" />
              <details class="im-setup-guide">
                <summary class="im-setup-guide-summary">
                  <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></svg>
                  {{ t('config.setupGuide') }}
                  <svg class="im-setup-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <ol class="im-setup-steps">
                  <li>{{ t('config.whatsappSetupGuide1') }}</li>
                  <li>{{ t('config.whatsappSetupGuide2') }}</li>
                  <li>{{ t('config.whatsappSetupGuide3') }}</li>
                  <li>{{ t('config.whatsappSetupGuide4') }}</li>
                  <li>{{ t('config.whatsappSetupGuide5') }}</li>
                  <li>{{ t('config.whatsappSetupGuide6') }}</li>
                </ol>
                <p class="im-setup-note">{{ t('config.whatsappSetupNote') }}</p>
              </details>

              <div class="form-divider" style="margin-top:1rem;" />
              <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-top:0.75rem;">
                <AppButton size="compact" @click="saveIM" :loading="savingIM">
                  <svg v-if="!savingIM" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {{ t('common.save') }}
                </AppButton>
                <span v-if="savedIMMsg" class="save-indicator" :class="savedIMMsg.ok ? 'success' : 'error'">
                  <svg v-if="savedIMMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ savedIMMsg.text }}
                </span>
              </div>
            </div>
          </template>

          <!-- ══════════ FEISHU TAB ══════════ -->
          <template v-else-if="activeIMTab === 'feishu'">
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.feishu') }}</h3>
                <span class="im-platform-status" :class="feishuReady ? 'ready' : 'idle'">
                  {{ feishuReady ? t('config.feishuConfigured') : t('config.feishuNotConfigured') }}
                </span>
              </div>

              <div class="im-enable-row">
                <span class="im-enable-label">{{ t('config.feishuEnable') }}</span>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox" v-model="form.im.feishu.enabled" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>

              <div class="form-divider" />

              <div class="form-group">
                <label class="form-label" for="feishuAppId">{{ t('config.feishuAppId') }}</label>
                <input
                  id="feishuAppId"
                  v-model="form.im.feishu.appId"
                  type="text"
                  placeholder="cli_xxxxxxxxxxxxxxxx"
                  class="field font-mono"
                />
              </div>

              <div class="form-group">
                <label class="form-label" for="feishuAppSecret">{{ t('config.feishuAppSecret') }}</label>
                <div style="position:relative;">
                  <input
                    id="feishuAppSecret"
                    v-model="form.im.feishu.appSecret"
                    :type="showWaSecret ? 'text' : 'password'"
                    placeholder="••••••••••••••••"
                    class="field font-mono"
                    style="padding-right:2.5rem;"
                  />
                  <button type="button" @click="showWaSecret = !showWaSecret" class="im-reveal-btn" v-tooltip="showWaSecret ? t('common.hide', 'Hide') : t('common.show', 'Show')">
                    <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                      <template v-if="showWaSecret"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></template>
                      <template v-else><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></template>
                    </svg>
                  </button>
                </div>
                <p class="hint">{{ t('config.feishuAppIdHint') }}</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="feishuAllowedUsers">{{ t('config.allowedUsers') }} <span class="form-label-hint">{{ t('config.commaSeparatedOpenIds') }}</span></label>
                <input
                  id="feishuAllowedUsers"
                  :value="(form.im.feishu.allowedUsers || []).join(',')"
                  @input="form.im.feishu.allowedUsers = $event.target.value.split(',').map(s => s.trim()).filter(Boolean)"
                  placeholder="ou_xxxxxxxx,ou_yyyyyyyy"
                  class="field font-mono"
                />
                <p class="hint">{{ t('config.feishuAllowedUsersHint') }}</p>
              </div>

              <div class="form-divider" />
              <details class="im-setup-guide">
                <summary class="im-setup-guide-summary">
                  <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></svg>
                  {{ t('config.setupGuide') }}
                  <svg class="im-setup-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <ol class="im-setup-steps">
                  <li>{{ t('config.feishuSetupGuide1') }}</li>
                  <li>{{ t('config.feishuSetupGuide2') }}</li>
                  <li>{{ t('config.feishuSetupGuide3') }}</li>
                  <li>{{ t('config.feishuSetupGuide4') }}</li>
                  <li>{{ t('config.feishuSetupGuide5') }}</li>
                  <li>{{ t('config.feishuSetupGuide6') }}</li>
                  <li>{{ t('config.feishuSetupGuide7') }}</li>
                  <li>{{ t('config.feishuSetupGuide8') }}</li>
                  <li>{{ t('config.feishuSetupGuide9') }}</li>
                </ol>
                <p class="im-setup-note">{{ t('config.feishuSetupNote') }}</p>
              </details>

              <div class="form-divider" style="margin-top:1rem;" />
              <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-top:0.75rem;">
                <AppButton size="compact" @click="saveIM" :loading="savingIM">
                  <svg v-if="!savingIM" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {{ t('common.save') }}
                </AppButton>
                <span v-if="savedIMMsg" class="save-indicator" :class="savedIMMsg.ok ? 'success' : 'error'">
                  <svg v-if="savedIMMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ savedIMMsg.text }}
                </span>
              </div>
            </div>
          </template>

          <!-- ══════════ TEAMS TAB ══════════ -->
          <template v-else-if="activeIMTab === 'teams' && form.im.teams">
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.teams') }}</h3>
                <span class="im-platform-status" :class="teamsReady ? 'ready' : 'idle'">
                  {{ teamsReady ? t('config.teamsConfigured') : t('config.teamsNotConfigured') }}
                </span>
              </div>

              <div class="im-enable-row">
                <span class="im-enable-label">{{ t('config.teamsEnable') }}</span>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox" v-model="form.im.teams.enabled" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>

              <div class="form-divider" />

              <div class="form-group">
                <label class="form-label" for="teamsTenantId">{{ t('config.teamsTenantId') }}</label>
                <input
                  id="teamsTenantId"
                  v-model="form.im.teams.tenantId"
                  type="text"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  class="field font-mono"
                />
                <p class="hint">{{ t('config.teamsTenantIdHint') }}</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="teamsClientId">{{ t('config.teamsClientId') }}</label>
                <input
                  id="teamsClientId"
                  v-model="form.im.teams.clientId"
                  type="text"
                  placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
                  class="field font-mono"
                />
                <p class="hint">{{ t('config.teamsClientIdHint') }}</p>
              </div>

              <div class="form-divider" />

              <!-- Device code auth section -->
              <div class="im-wa-link-section">
                <div class="im-wa-link-header">
                  <div>
                    <p class="form-label" style="margin:0 0 0.2rem;">Microsoft Account</p>
                    <p class="hint" style="margin:0;">
                      <template v-if="teamsAuthStatus.connected">{{ t('config.teamsConnected') }} {{ teamsAuthStatus.displayName }}</template>
                      <template v-else>{{ t('config.teamsNotConnected') }}</template>
                    </p>
                  </div>
                  <AppButton v-if="!teamsAuthStatus.connected" size="compact" variant="primary" @click="requestTeamsAuth" :loading="teamsAuthLoading" :disabled="teamsAuthLoading || !form.im.teams.tenantId?.trim() || !form.im.teams.clientId?.trim()">
                    <svg v-if="!teamsAuthLoading" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
                    {{ teamsAuthLoading ? t('config.teamsSigningIn') : t('config.teamsSignIn') }}
                  </AppButton>
                  <AppButton v-else size="compact" @click="teamsSignOut">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
                    {{ t('config.teamsSignOut') }}
                  </AppButton>
                </div>

                <!-- Device code prompt -->
                <div v-if="teamsDeviceCode.userCode && !teamsAuthStatus.connected" class="im-qr-block" style="flex-direction:column; align-items:flex-start; gap:0.75rem;">
                  <p style="margin:0; font-size:var(--fs-secondary); color:var(--text-secondary);">{{ t('config.teamsDeviceCodePrompt') }}</p>
                  <div style="display:flex; align-items:center; gap:1rem; flex-wrap:wrap;">
                    <a :href="teamsDeviceCode.verificationUri" target="_blank" rel="noopener" style="color:var(--accent); font-size:var(--fs-secondary);">{{ teamsDeviceCode.verificationUri }}</a>
                    <code style="font-size:1.2rem; font-weight:700; background:var(--bg-tertiary); padding:0.3rem 0.75rem; border-radius:var(--radius-sm); letter-spacing:0.1em; color:var(--text-primary);">{{ teamsDeviceCode.userCode }}</code>
                  </div>
                </div>

                <!-- Connected state -->
                <div v-else-if="teamsAuthStatus.connected" class="im-wa-connected">
                  <svg style="width:18px;height:18px;color:#10B981;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  <span>{{ t('config.teamsConnected') }} {{ teamsAuthStatus.displayName }}</span>
                </div>
              </div>

              <div class="form-divider" />

              <!-- Self-only toggle -->
              <div class="im-enable-row">
                <span class="im-enable-label">{{ t('config.teamsSelfOnly') }}</span>
                <label class="im-toggle" @click.stop>
                  <input type="checkbox" v-model="form.im.teams.selfOnly" />
                  <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                </label>
              </div>
              <p class="hint" style="margin-top:-0.25rem;">{{ t('config.teamsSelfOnlyHint') }}</p>

              <div class="form-group">
                <label class="form-label" for="teamsAllowedUsers">{{ t('config.allowedUsers') }}</label>
                <input
                  id="teamsAllowedUsers"
                  :value="(form.im.teams.allowedUsers || []).join(',')"
                  @input="form.im.teams.allowedUsers = $event.target.value.split(',').map(s => s.trim()).filter(Boolean)"
                  placeholder="user1@company.com,user2@company.com"
                  class="field font-mono"
                />
                <p class="hint">{{ t('config.teamsAllowedUsersHint') }}</p>
              </div>

              <div class="form-group">
                <label class="form-label" for="teamsPollInterval">{{ t('config.teamsPollInterval') }}</label>
                <input
                  id="teamsPollInterval"
                  v-model.number="form.im.teams.pollInterval"
                  type="number"
                  min="1"
                  max="60"
                  placeholder="5"
                  class="field font-mono"
                  style="max-width:8rem;"
                />
                <p class="hint">{{ t('config.teamsPollIntervalHint') }}</p>
              </div>

              <div class="form-divider" />
              <details class="im-setup-guide">
                <summary class="im-setup-guide-summary">
                  <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><circle cx="12" cy="8" r="1" fill="currentColor" stroke="none"/></svg>
                  {{ t('config.setupGuide') }}
                  <svg class="im-setup-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                </summary>
                <ol class="im-setup-steps">
                  <li>{{ t('config.teamsSetupGuide1') }}</li>
                  <li>{{ t('config.teamsSetupGuide2') }}</li>
                  <li>{{ t('config.teamsSetupGuide3') }}</li>
                  <li>{{ t('config.teamsSetupGuide4') }}</li>
                  <li>{{ t('config.teamsSetupGuide5') }}</li>
                  <li>{{ t('config.teamsSetupGuide6') }}</li>
                  <li>{{ t('config.teamsSetupGuide7') }}</li>
                  <li>{{ t('config.teamsSetupGuide8') }}</li>
                  <li>{{ t('config.teamsSetupGuide9') }}</li>
                </ol>
                <p class="im-setup-note">{{ t('config.teamsSetupNote') }}</p>
              </details>

              <div class="form-divider" style="margin-top:1rem;" />
              <div style="display:flex; gap:0.5rem; align-items:center; flex-wrap:wrap; margin-top:0.75rem;">
                <AppButton size="compact" @click="saveIM" :loading="savingIM">
                  <svg v-if="!savingIM" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                  {{ t('common.save') }}
                </AppButton>
                <span v-if="savedIMMsg" class="save-indicator" :class="savedIMMsg.ok ? 'success' : 'error'">
                  <svg v-if="savedIMMsg.ok" class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                  {{ savedIMMsg.text }}
                </span>
              </div>
            </div>
          </template>

          <!-- ══════════ BRIDGE TAB ══════════ -->
          <template v-else-if="activeIMTab === 'bridge'">
            <div class="config-card">
              <div class="form-section-header">
                <div class="section-icon-sm">
                  <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                </div>
                <h3 class="form-section-title">{{ t('config.bridgeControl') }}</h3>
              </div>

              <!-- Per-platform toggle rows -->
              <div class="im-bridge-rows">
                <!-- Telegram -->
                <div class="im-bridge-row">
                  <svg style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                  <div class="im-bridge-info">
                    <span class="im-bridge-name">Telegram</span>
                    <span class="im-bridge-sub" :class="imStatus.platforms?.telegram ? 'running' : (telegramReady ? 'ready' : 'idle')">
                      {{ imStatus.platforms?.telegram ? t('config.bridgeRunning') : (telegramReady ? t('config.bridgeConfigured') : t('config.bridgeNotConfigured')) }}
                    </span>
                  </div>
                  <label class="im-toggle" :class="{ disabled: !telegramReady }" @click.stop>
                    <input type="checkbox" :checked="!!imStatus.platforms?.telegram" :disabled="!telegramReady"
                      @change="togglePlatform('telegram', $event.target.checked)" />
                    <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                  </label>
                </div>

                <div class="form-divider" style="margin:0;" />

                <!-- WhatsApp -->
                <div class="im-bridge-row">
                  <svg style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
                  <div class="im-bridge-info">
                    <span class="im-bridge-name">WhatsApp</span>
                    <span class="im-bridge-sub" :class="imStatus.platforms?.whatsapp ? 'running' : (whatsappReady ? 'ready' : 'idle')">
                      {{ imStatus.platforms?.whatsapp ? t('config.bridgeRunning') : (whatsappReady ? t('config.whatsappLinked') : t('config.whatsappNotLinked')) }}
                    </span>
                  </div>
                  <label class="im-toggle" :class="{ disabled: !whatsappReady }" @click.stop>
                    <input type="checkbox" :checked="!!imStatus.platforms?.whatsapp" :disabled="!whatsappReady"
                      @change="togglePlatform('whatsapp', $event.target.checked)" />
                    <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                  </label>
                </div>

                <div class="form-divider" style="margin:0;" />

                <!-- Feishu -->
                <div class="im-bridge-row">
                  <svg style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
                  <div class="im-bridge-info">
                    <span class="im-bridge-name">{{ t('config.feishuLark') }}</span>
                    <span class="im-bridge-sub" :class="imStatus.platforms?.feishu ? 'running' : (feishuReady ? 'ready' : 'idle')">
                      {{ imStatus.platforms?.feishu ? t('config.bridgeRunning') : (feishuReady ? t('config.bridgeConfigured') : t('config.bridgeNotConfigured')) }}
                    </span>
                  </div>
                  <label class="im-toggle" :class="{ disabled: !feishuReady }" @click.stop>
                    <input type="checkbox" :checked="!!imStatus.platforms?.feishu" :disabled="!feishuReady"
                      @change="togglePlatform('feishu', $event.target.checked)" />
                    <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                  </label>
                </div>

                <div class="form-divider" style="margin:0;" />

                <!-- Teams -->
                <div class="im-bridge-row">
                  <svg style="width:15px;height:15px;flex-shrink:0;color:var(--text-muted);" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                  <div class="im-bridge-info">
                    <span class="im-bridge-name">Teams</span>
                    <span class="im-bridge-sub" :class="imStatus.platforms?.teams ? 'running' : (teamsReady ? 'ready' : 'idle')">
                      {{ imStatus.platforms?.teams ? t('config.bridgeRunning') : (teamsReady ? t('config.teamsConfigured') : t('config.teamsNotConfigured')) }}
                    </span>
                  </div>
                  <label class="im-toggle" :class="{ disabled: !teamsReady }" @click.stop>
                    <input type="checkbox" :checked="!!imStatus.platforms?.teams" :disabled="!teamsReady"
                      @change="togglePlatform('teams', $event.target.checked)" />
                    <span class="im-toggle-track"><span class="im-toggle-thumb"></span></span>
                  </label>
                </div>
              </div>

              <!-- Active sessions -->
              <div v-if="imStatus.sessions?.length" style="margin-top:1.25rem;">
                <p class="form-label" style="margin-bottom:0.5rem;">{{ t('config.activeSessions') }}</p>
                <div class="im-sessions-list">
                  <div v-for="(session, i) in imStatus.sessions" :key="i" class="im-session-row">
                    <span class="font-mono" style="font-size:var(--fs-caption);color:var(--text-secondary);flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">
                      {{ session.channelId || session.id || session }}
                    </span>
                    <span v-if="session.platform" class="im-session-badge">{{ session.platform }}</span>
                  </div>
                </div>
              </div>

              <!-- Demo Mode (hidden) -->
            </div>
          </template>

        </template>

        </div>
      </div>
    </div>
  </div>

  <!-- IM Setup Guide Modal -->
  <Teleport to="body">
    <div v-if="showIMGuide" class="im-guide-backdrop" @keydown.esc="showIMGuide = false">
      <div class="im-guide-modal" role="dialog" aria-modal="true">
        <div class="im-guide-header">
          <div class="im-guide-header-icon">
            <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <span class="im-guide-title">{{ t('config.imBridgeSetupGuide') }}</span>
          <button class="im-guide-close" @click="showIMGuide = false">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="im-guide-body">

          <!-- Telegram Setup -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
              {{ t('config.telegramSteps') }}
            </div>
            <ol class="im-guide-steps">
              <li>{{ t('config.telegramGuide1') }}</li>
              <li>{{ t('config.telegramGuide2') }}</li>
              <li>{{ t('config.telegramGuide3') }}</li>
              <li>{{ t('config.telegramGuide4') }}</li>
            </ol>
            <p class="im-guide-note">To restrict access, add your Telegram username to <em>Allowed Users</em>. Leave empty to allow anyone.</p>
          </div>

          <div class="im-guide-divider" />

          <!-- WhatsApp Setup -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>
              {{ t('config.whatsappSteps') }}
            </div>
            <ol class="im-guide-steps">
              <li>{{ t('config.whatsappGuide1') }}</li>
              <li>{{ t('config.whatsappGuide2') }}</li>
              <li>{{ t('config.whatsappGuide3') }}</li>
            </ol>
            <p class="im-guide-note">{{ t('config.whatsappGuideNote') }}</p>
          </div>

          <div class="im-guide-divider" />

          <!-- Feishu Setup -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              {{ t('config.feishuSteps') }}
            </div>
            <ol class="im-guide-steps">
              <li>{{ t('config.feishuGuide1') }}</li>
              <li>{{ t('config.feishuGuide2') }}</li>
              <li>{{ t('config.feishuGuide3') }}</li>
              <li>{{ t('config.feishuGuide4') }}</li>
              <li>{{ t('config.feishuGuide5') }}</li>
              <li>{{ t('config.feishuGuide6') }}</li>
            </ol>
            <p class="im-guide-note">{{ t('config.feishuGuideNote') }}</p>
          </div>

          <div class="im-guide-divider" />

          <!-- Teams Setup -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
              {{ t('config.teamsSteps') }}
            </div>
            <ol class="im-guide-steps">
              <li>{{ t('config.teamsGuide1') }}</li>
              <li>{{ t('config.teamsGuide2') }}</li>
              <li>{{ t('config.teamsGuide3') }}</li>
              <li>{{ t('config.teamsGuide4') }}</li>
              <li>{{ t('config.teamsGuide5') }}</li>
              <li>{{ t('config.teamsGuide6') }}</li>
            </ol>
            <p class="im-guide-note">{{ t('config.teamsGuideNote') }}</p>
          </div>

          <div class="im-guide-divider" />

          <!-- Agents -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/></svg>
              {{ t('config.imGuideAgents') }}
            </div>
            <p class="im-guide-note" style="border-color:#10B981;">
              {{ t('config.imGuideAgentsNote') }}
            </p>
            <table class="im-guide-table">
              <tbody>
                <tr><td><code>/agents</code></td><td>{{ t('config.imGuideListAgents') }}</td></tr>
                <tr><td><code>/agent &lt;name&gt;</code></td><td>{{ t('config.imGuideShowAgent') }}</td></tr>
                <tr><td><code>/agent add &lt;name&gt;</code></td><td>{{ t('config.imGuideAddAgent') }}</td></tr>
                <tr><td><code>/agent remove &lt;name&gt;</code></td><td>{{ t('config.imGuideRemoveAgent') }}</td></tr>
                <tr><td><code>/agent model &lt;name&gt;</code></td><td>{{ t('config.imGuideChangeAgent') }}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="im-guide-divider" />

          <!-- @mentions -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4"/><path d="M16 8v5a3 3 0 0 0 6 0v-1a10 10 0 1 0-3.92 7.94"/></svg>
              {{ t('config.imGuideMentions') }}
            </div>
            <table class="im-guide-table">
              <tbody>
                <tr><td><code>@all</code></td><td>{{ t('config.imGuideMentionAll') }}</td></tr>
                <tr><td><code>@Mark</code></td><td>{{ t('config.imGuideMentionName') }}</td></tr>
                <tr><td><em>no mention</em></td><td>{{ t('config.imGuideNoMention') }}</td></tr>
              </tbody>
            </table>
          </div>

          <div class="im-guide-divider" />

          <!-- Voice -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>
              {{ t('config.imGuideVoiceNotes') }}
            </div>
            <p class="im-guide-note">
              {{ t('config.imGuideVoiceNote') }}
            </p>
          </div>

          <div class="im-guide-divider" />

          <!-- Commands Reference -->
          <div class="im-guide-section">
            <div class="im-guide-section-title">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="4 17 10 11 4 5"/><line x1="12" y1="19" x2="20" y2="19"/></svg>
              {{ t('config.imGuideCommands') }}
            </div>
            <table class="im-guide-table">
              <tbody>
                <tr><td><code>/list</code></td><td>{{ t('config.imGuideCmdList') }}</td></tr>
                <tr><td><code>/switch &lt;n&gt;</code></td><td>{{ t('config.imGuideCmdSwitch') }}</td></tr>
                <tr><td><code>/new [title]</code></td><td>{{ t('config.imGuideCmdNew') }}</td></tr>
                <tr><td><code>/current</code></td><td>{{ t('config.imGuideCmdCurrent') }}</td></tr>
                <tr><td><code>/status</code></td><td>{{ t('config.imGuideCmdStatus') }}</td></tr>
                <tr><td><code>/help</code></td><td>{{ t('config.imGuideCmdHelp') }}</td></tr>
              </tbody>
            </table>
            <p class="im-guide-note">{{ t('config.imGuideCmdNote') }}</p>
          </div>

        </div>

        <div class="im-guide-footer">
          <button class="im-guide-ok-btn" @click="showIMGuide = false">{{ t('config.imGuideGotIt') }}</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Data Path Change Warning Modal -->
  <Teleport to="body">
    <div v-if="showDataPathWarning" class="modal-backdrop" style="z-index:9999;">
      <div class="modal-content" style="max-width:540px; width:90vw;">
        <div class="modal-header">
          <h3 class="modal-title" style="color:#EF4444; display:flex; align-items:center; gap:0.5rem;">
            <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
            {{ t('config.dataPathWarningTitle') }}
          </h3>
        </div>
        <div class="modal-body" style="padding:1rem 1.5rem;">
          <p style="margin-bottom:1rem; color:var(--text-secondary); line-height:1.6;">{{ t('config.dataPathWarningBody') }}</p>

          <!-- From / To paths -->
          <div style="background:var(--bg-elevated, #f5f5f5); border-radius:0.5rem; padding:1rem; margin-bottom:0.75rem;">
            <div style="display:flex; align-items:baseline; gap:0.5rem; margin-bottom:0.5rem;">
              <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted); white-space:nowrap; min-width:2.5rem;">FROM</span>
              <code class="font-mono" style="font-size:0.75rem; word-break:break-all; user-select:all; color:var(--text-primary);">{{ dataPathFromTo.from }}</code>
            </div>
            <div style="display:flex; align-items:center; justify-content:center; padding:0.15rem 0;">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="var(--text-muted)" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
            </div>
            <div style="display:flex; align-items:baseline; gap:0.5rem;">
              <span style="font-size:0.75rem; font-weight:700; color:var(--text-muted); white-space:nowrap; min-width:2.5rem;">TO</span>
              <code class="font-mono" style="font-size:0.75rem; word-break:break-all; user-select:all; color:var(--text-primary);">{{ dataPathFromTo.to }}</code>
            </div>
          </div>

          <!-- Derived paths that will also change (only shown if they depend on data dir) -->
          <div v-if="derivedPathsAffected.length > 0" style="background:#FEF9C3; border:1px solid #FDE047; border-radius:0.5rem; padding:0.75rem 1rem; margin-bottom:0.75rem; font-size:0.8rem; color:#78350F; line-height:1.6;">
            <div style="font-weight:700; margin-bottom:0.35rem;">{{ t('config.dataPathWarningDerivedTitle') }}</div>
            <div style="display:flex; flex-direction:column; gap:0.2rem;">
              <span v-for="p in derivedPathsAffected" :key="p.label">
                📁 {{ p.label }}: <code class="font-mono" style="font-size:0.72rem; user-select:all;">{{ p.newPath }}</code>
              </span>
            </div>
          </div>

          <!-- Copy command -->
          <div style="background:var(--bg-elevated, #f5f5f5); border-radius:0.5rem; padding:1rem; margin-bottom:1rem;">
            <p style="font-size:0.8rem; color:var(--text-muted); margin-bottom:0.5rem; font-weight:600;">{{ t('config.dataPathWarningCopyCmd') }}</p>
            <div style="display:flex; align-items:flex-start; gap:0.5rem;">
              <code class="font-mono" style="font-size:0.75rem; flex:1; word-break:break-all; white-space:pre-wrap; line-height:1.6; user-select:all;">{{ dataPathCopyCommand }}</code>
              <AppTooltip :text="t('common.copy', 'Copy')">
                <button
                  style="flex-shrink:0; padding:4px 8px; border:1px solid var(--border-primary, #ddd); border-radius:4px; background:transparent; cursor:pointer; font-size:0.7rem; color:var(--text-muted);"
                  @click="copyDataPathCmd"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>
                  </svg>
                </button>
              </AppTooltip>
            </div>
          </div>
        </div>
        <div class="modal-footer" style="display:flex; gap:0.75rem; justify-content:flex-end; padding:1rem 1.5rem;">
          <AppButton size="compact" variant="ghost" @click="showDataPathWarning = false">{{ t('config.dataPathWarningCancel') }}</AppButton>
          <AppButton size="compact" @click="applyDataPathAndRestart" :loading="savingGeneral" style="background:#EF4444; border-color:#EF4444;">
            {{ t('config.dataPathWarningConfirm') }}
          </AppButton>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Delete Confirmation Modal -->
  <ConfirmModal
    :visible="showDeleteConfirm"
    :title="t('common.confirmDelete', 'Confirm Delete')"
    :message="t('config.deleteProviderConfirm', { name: deleteConfirmName })"
    :confirm-text="t('common.delete', 'Delete')"
    :cancel-text="t('common.cancel', 'Cancel')"
    confirm-class="danger"
    :loading-text="t('common.deleting', 'Deleting...')"
    @confirm="confirmDeleteProvider"
    @close="showDeleteConfirm = false"
  />

  <ConfirmModal
    :visible="showPreviewVoiceError"
    :title="t('config.localTestFailed')"
    :message="previewVoiceErrorMsg || t('config.envSetupFailed')"
    :confirm-text="t('common.goToConfig')"
    :cancel-text="t('common.close')"
    confirm-class="primary"
    @confirm="showPreviewVoiceError = false; router.push('/config')"
    @close="showPreviewVoiceError = false"
  />

  <!-- Preview limit modal -->
  <PreviewLimitModal
    :visible="showPreviewLimitModal"
    :message="previewLimitMessage"
    @close="showPreviewLimitModal = false"
  />

  <!-- Model limits editor (context window + max output) -->
  <Teleport to="body">
    <div v-if="modelLimitsEditor.open" class="modal-backdrop" style="z-index:10000;">
      <div class="cv-model-editor">
        <div class="cv-model-editor-header">
          <div>
            <div class="cv-model-editor-title">{{ t('config.editModelLimits') }}</div>
            <div class="cv-model-editor-subtitle font-mono">{{ modelLimitsEditor.modelId }}</div>
          </div>
          <button class="cv-model-editor-close" @click="closeModelLimitsEditor">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <div class="cv-model-editor-body">
          <!-- Catalog picker: click the button to open a dialog with fuzzy search.
               When a catalog entry is already matched (auto-detected on open, or
               picked by the user), a compact card is shown next to the button
               with id + context/max-out/price pills and a clear button. -->
          <div class="cv-model-editor-field">
            <div class="cv-editor-field-head">
              <label>{{ t('config.catalogSearchLabel') }}</label>
            </div>

            <div class="cv-catalog-header-row">
              <button type="button" class="cv-catalog-open-btn" @click="openCatalogDialog">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <span>{{ selectedCatalogEntry ? t('config.catalogChange') : t('config.catalogPickButton') }}</span>
              </button>

              <div v-if="selectedCatalogEntry" class="cv-catalog-match">
                <div class="cv-catalog-match-head">
                  <span class="cv-catalog-match-id font-mono" :title="selectedCatalogEntry.id">{{ selectedCatalogEntry.id }}</span>
                  <button
                    type="button"
                    class="cv-catalog-clear-btn"
                    :aria-label="t('config.catalogClear')"
                    @click.stop="clearSelectedCatalogEntry"
                  >
                    <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  </button>
                </div>
                <div class="cv-catalog-row-meta">
                  <span v-if="selectedCatalogEntry.context_length" class="cv-catalog-pill">
                    {{ t('config.contextLabel') }} {{ formatContextWindow(selectedCatalogEntry.context_length) }}
                  </span>
                  <span v-if="selectedCatalogEntry.max_output_tokens" class="cv-catalog-pill">
                    {{ t('config.maxOutputLabel') }} {{ formatContextWindow(selectedCatalogEntry.max_output_tokens) }}
                  </span>
                  <span v-if="selectedCatalogEntry.input_cost_per_token != null || selectedCatalogEntry.output_cost_per_token != null" class="cv-catalog-pill price">
                    {{ t('config.inputPriceLabel') }} {{ formatPricePerMillion(selectedCatalogEntry.input_cost_per_token) || '—' }}
                    · {{ t('config.outputPriceLabel') }} {{ formatPricePerMillion(selectedCatalogEntry.output_cost_per_token) || '—' }}
                  </span>
                </div>
              </div>
            </div>

            <p class="hint">{{ t('config.catalogSearchHint') }}</p>
          </div>

          <div class="cv-editor-divider"></div>

          <div class="cv-model-editor-field">
            <div class="cv-editor-field-head">
              <label>{{ t('config.contextWindow') }}</label>
              <span
                class="cv-editor-current-badge"
                :class="modelLimitsEditor.contextDefault ? 'ok' : 'warn'"
              >
                {{ modelLimitsEditor.contextDefault
                    ? `${t('config.currentValue')} ${formatContextWindow(modelLimitsEditor.contextDefault)}`
                    : t('config.contextLengthUnavailable') }}
              </span>
            </div>
            <input
              type="text"
              v-model="modelLimitsEditor.contextWindow"
              class="field font-mono"
              :placeholder="modelLimitsEditor.contextDefault ? formatContextWindow(modelLimitsEditor.contextDefault) : '128K'"
            />
            <p class="hint">{{ t('config.contextWindowHint') }}</p>
          </div>

          <div class="cv-model-editor-field">
            <div class="cv-editor-field-head">
              <label>{{ t('config.maxOutputTokens') }}</label>
              <span
                class="cv-editor-current-badge"
                :class="modelLimitsEditor.maxOutputDefault ? 'ok' : 'warn'"
              >
                {{ modelLimitsEditor.maxOutputDefault
                    ? `${t('config.currentValue')} ${formatContextWindow(modelLimitsEditor.maxOutputDefault)}`
                    : t('config.maxOutputUnavailable') }}
              </span>
            </div>
            <input
              type="text"
              v-model="modelLimitsEditor.maxOutputTokens"
              class="field font-mono"
              :placeholder="modelLimitsEditor.maxOutputDefault ? formatContextWindow(modelLimitsEditor.maxOutputDefault) : '32K'"
            />
            <p class="hint">{{ t('config.modelMaxOutputTokensHint') }}</p>
          </div>

          <div class="cv-model-editor-field">
            <div class="cv-editor-field-head">
              <label>{{ t('config.inputPrice') }}</label>
              <span
                class="cv-editor-current-badge"
                :class="modelLimitsEditor.inputPriceDefault != null ? 'ok' : 'warn'"
              >
                {{ modelLimitsEditor.inputPriceDefault != null
                    ? `${t('config.currentValue')} ${formatPricePerMillion(modelLimitsEditor.inputPriceDefault)} USD / 1M`
                    : t('config.priceUnavailableEditor') }}
              </span>
            </div>
            <input
              type="text"
              v-model="modelLimitsEditor.inputPrice"
              class="field font-mono"
              :placeholder="modelLimitsEditor.inputPriceDefault != null ? String((modelLimitsEditor.inputPriceDefault * 1_000_000).toFixed(2)) : '3.00'"
            />
            <p class="hint">{{ t('config.inputPriceHint') }}</p>
          </div>

          <div class="cv-model-editor-field">
            <div class="cv-editor-field-head">
              <label>{{ t('config.outputPrice') }}</label>
              <span
                class="cv-editor-current-badge"
                :class="modelLimitsEditor.outputPriceDefault != null ? 'ok' : 'warn'"
              >
                {{ modelLimitsEditor.outputPriceDefault != null
                    ? `${t('config.currentValue')} ${formatPricePerMillion(modelLimitsEditor.outputPriceDefault)} USD / 1M`
                    : t('config.priceUnavailableEditor') }}
              </span>
            </div>
            <input
              type="text"
              v-model="modelLimitsEditor.outputPrice"
              class="field font-mono"
              :placeholder="modelLimitsEditor.outputPriceDefault != null ? String((modelLimitsEditor.outputPriceDefault * 1_000_000).toFixed(2)) : '15.00'"
            />
            <p class="hint">{{ t('config.outputPriceHint') }}</p>
          </div>
        </div>

        <div class="cv-model-editor-footer">
          <button class="cv-model-editor-btn secondary" @click="closeModelLimitsEditor">{{ t('common.cancel') }}</button>
          <button class="cv-model-editor-btn primary" @click="saveModelLimitsEditor">{{ t('common.save') }}</button>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- LiteLLM catalog picker dialog (nested above the model-limits editor) -->
  <Teleport to="body">
    <div v-if="catalogDialogOpen" class="modal-backdrop" style="z-index:10002;">
      <div class="cv-catalog-dialog">
        <!-- Header -->
        <div class="cv-catalog-dialog-header">
          <div class="cv-catalog-dialog-header-text">
            <div class="cv-catalog-dialog-title">{{ t('config.catalogDialogTitle') }}</div>
            <div class="cv-catalog-dialog-subtitle">{{ t('config.catalogDialogSubtitle') }}</div>
          </div>
          <button class="cv-model-editor-close" @click="closeCatalogDialog" :aria-label="t('common.close')">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Search row -->
        <div class="cv-catalog-dialog-search">
          <svg class="cv-catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            ref="catalogDialogInputRef"
            type="text"
            v-model="catalogDialogQuery"
            class="cv-catalog-dialog-input font-mono"
            :placeholder="t('config.catalogSearchPlaceholder')"
            @keydown.esc="closeCatalogDialog"
          />
          <button
            v-if="catalogDialogQuery"
            type="button"
            class="cv-catalog-dialog-clear"
            @click="catalogDialogQuery = ''"
            :aria-label="t('common.clear') || 'Clear'"
          >
            <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
          <span v-if="catalogRanked.length" class="cv-catalog-dialog-count">
            {{ catalogVisibleCount < catalogRanked.length
                ? `${catalogResults.length} / ${catalogRanked.length}`
                : t('config.catalogMatchesCount', '', { n: catalogRanked.length }) }}
          </span>
        </div>

        <!-- Column header -->
        <div class="cv-catalog-table-head">
          <div>{{ t('config.catalogColProvider') }}</div>
          <div>{{ t('config.catalogColModel') }}</div>
          <div class="num">{{ t('config.catalogColContext') }}</div>
          <div class="num">{{ t('config.catalogColMaxOut') }}</div>
          <div class="num">{{ t('config.catalogColInPrice') }}</div>
          <div class="num">{{ t('config.catalogColOutPrice') }}</div>
        </div>

        <!-- Body: loading / empty / results -->
        <div class="cv-catalog-dialog-body" @scroll.passive="onCatalogScroll">
          <div v-if="catalogLoading" class="cv-catalog-empty">
            <svg class="cv-catalog-empty-icon animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
            <span>{{ t('config.catalogLoading') }}</span>
          </div>
          <div v-else-if="catalogDialogQuery && catalogResults.length === 0" class="cv-catalog-empty">
            <svg class="cv-catalog-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <span>{{ t('config.catalogNoMatches') }}</span>
          </div>
          <div v-else class="cv-catalog-table-body">
            <div
              v-for="entry in catalogResults"
              :key="entry.id"
              class="cv-catalog-tr"
              :class="{ active: selectedCatalogEntry && selectedCatalogEntry.id === entry.id }"
              @click="applyCatalogEntryFromDialog(entry)"
            >
              <div class="cv-catalog-td">
                <span class="cv-catalog-provider-pill">{{ entry.provider || '—' }}</span>
              </div>
              <div class="cv-catalog-td cv-catalog-td-id font-mono" :title="entry.id">{{ entry.id }}</div>
              <div class="cv-catalog-td num font-mono">{{ entry.context_length ? formatContextWindow(entry.context_length) : '—' }}</div>
              <div class="cv-catalog-td num font-mono">{{ entry.max_output_tokens ? formatContextWindow(entry.max_output_tokens) : '—' }}</div>
              <div class="cv-catalog-td num font-mono price">{{ formatPricePerMillion(entry.input_cost_per_token) || '—' }}</div>
              <div class="cv-catalog-td num font-mono price">{{ formatPricePerMillion(entry.output_cost_per_token) || '—' }}</div>
            </div>
            <!-- Footer hint: more available, keep scrolling -->
            <div
              v-if="catalogVisibleCount < catalogRanked.length"
              class="cv-catalog-more-hint"
            >
              {{ t('config.catalogShowMore', '', { n: catalogRanked.length - catalogVisibleCount }) }}
            </div>
          </div>
        </div>
      </div>
    </div>
  </Teleport>

  <!-- Missing context-window warning -->
  <Teleport to="body">
    <div v-if="showMissingCtxWarning" class="modal-backdrop" style="z-index:10001;">
      <div class="cv-warn-modal">
        <div class="cv-warn-header">
          <svg style="width:18px;height:18px;color:#F59E0B;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          <span>{{ t('config.missingCtxTitle') }}</span>
        </div>
        <div class="cv-warn-body">
          <p>{{ t('config.missingCtxBody') }}</p>
          <p class="cv-warn-body-muted">{{ t('config.missingCtxExplain') }}</p>
        </div>
        <div class="cv-warn-footer">
          <button class="cv-model-editor-btn secondary" @click="showMissingCtxWarning = false">{{ t('common.close') }}</button>
          <button class="cv-model-editor-btn primary" @click="openEditorForSelected">{{ t('config.setManually') }}</button>
        </div>
      </div>
    </div>
  </Teleport>

</template>

<script setup>
import { ref, reactive, onMounted, onActivated, onUnmounted, computed, watch, nextTick, defineComponent, h } from 'vue'
defineOptions({ inheritAttrs: false })
import { useRoute, useRouter } from 'vue-router'
import { useConfigStore } from '../stores/config'
import { useModelsStore } from '../stores/models'
import { useKnowledgeStore } from '../stores/knowledge'
import { useObsidianStore } from '../stores/obsidian'
import { useToolsStore } from '../stores/tools'
import AppButton from '../components/common/AppButton.vue'
import AppTooltip from '../components/common/AppTooltip.vue'
import ProviderModelPicker from '../components/common/ProviderModelPicker.vue'
import ComboBox from '../components/common/ComboBox.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import PreviewLimitModal from '../components/common/PreviewLimitModal.vue'
import { useI18n } from '../i18n/useI18n'
import { useAuth } from '../composables/useAuth'
import { useUpdater } from '../composables/useUpdater'
import { buildDemoTooltipHtml } from '../utils/demoMode.js'
import { PREVIEW_LIMITS, isLimitEnforced } from '../utils/guestLimits'

const configStore = useConfigStore()
const modelsStore = useModelsStore()
const knowledgeStore = useKnowledgeStore()
const obsidianStore = useObsidianStore()
const toolsStore = useToolsStore()
const route = useRoute()
const router = useRouter()
const { t } = useI18n()
const auth = useAuth()
const updater = useUpdater()

// "About" tab status line. Distinct from the toast banner: this surfaces
// up-to-date / failure feedback after a manual click in Settings, since
// `updater.state` flips back to 'idle' on not_available and the user would
// otherwise see no acknowledgement that the click did anything.
const aboutStatusText = computed(() => {
  if (updater.state.value === 'available' && updater.available.value?.version) {
    return t('updater.newVersionAvailable', '', { version: updater.available.value.version })
  }
  if (updater.lastCheckOutcome.value === 'up_to_date') {
    return t('updater.upToDate', '', { version: updater.currentVersion.value || '' })
  }
  if (updater.lastCheckOutcome.value === 'failed') {
    return t('updater.checkFailed')
  }
  return ''
})
const aboutStatusClass = computed(() => {
  if (updater.lastCheckOutcome.value === 'failed') return 'is-error'
  if (updater.state.value === 'available') return 'is-info'
  if (updater.lastCheckOutcome.value === 'up_to_date') return 'is-success'
  return ''
})
function onCheckForUpdates() {
  updater.check({ trigger: 'manual' })
}

const showPreviewLimitModal = ref(false)
const previewLimitMessage = ref('')

// Built-in model max output token defaults (loaded from main process)
// { table: { modelId: maxTokens }, fallback: 32000 }
const modelDefaultMaxOutput = ref({ table: {}, fallback: 32000 })

// Per-model max output tokens inline editing state

const isElectron = !!(typeof window !== 'undefined' && window.electronAPI)

const demoTooltipHtml = computed(() => buildDemoTooltipHtml(configStore.config.language || 'en'))
const showDemoTooltip = ref(false)
const demoTooltipPos = reactive({ x: 0, y: 0 })
function onDemoInfoHover(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  demoTooltipPos.x = rect.left
  demoTooltipPos.y = rect.bottom + 6
  showDemoTooltip.value = true
}
function onDemoInfoLeave() {
  showDemoTooltip.value = false
}

function openInExplorer(path) {
  if (!path || !window.electronAPI?.showInFolder) return
  window.electronAPI.showInFolder(path)
}

function goToAuth() {
  auth.openAuthDialog()
}
function onSignOut() {
  auth.signOut()
}

// Mask the local part of an email by replacing 3 contiguous middle characters
// with `***`. Falls back gracefully for very short locals (where there's no
// natural middle to mask).
function maskEmail(email) {
  if (!email || typeof email !== 'string') return ''
  const at = email.indexOf('@')
  if (at < 0) return email
  const local = email.slice(0, at)
  const domain = email.slice(at)
  if (local.length <= 2) return '***' + domain
  const startKeep = Math.max(1, Math.floor((local.length - 3) / 2))
  const endKeep   = local.length - startKeep - 3
  if (endKeep < 1) return local[0] + '***' + domain
  return local.slice(0, startKeep) + '***' + local.slice(-endKeep) + domain
}

// Only show email when it's a real address. Google sign-in without a returned
// email stores the placeholder `(google)` — never display that as an email.
const displayedEmail = computed(() => {
  const e = auth.email.value
  if (!e || typeof e !== 'string' || !e.includes('@')) return ''
  return maskEmail(e)
})

const accountMethodLabel = computed(() => {
  const m = auth.lastMethod.value
  if (m === 'google') return t('account.signedInWithGoogle')
  if (m === 'email')  return t('account.signedInWithEmail')
  return ''
})

// Format the registration timestamp as a locale-aware date. Uses YYYY-MM-DD
// for stability — relative ("2 months ago") would be cuter but drifts daily.
function formatRegisteredAt(ms) {
  if (!ms || !Number.isFinite(ms)) return ''
  const d = new Date(ms)
  if (isNaN(d.getTime())) return ''
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  const dd = String(d.getDate()).padStart(2, '0')
  return `${yyyy}-${mm}-${dd}`
}
const showKey  = ref(false)
const showOpenRouterKey = ref(false)
const VALID_TABS = ['general', 'ai', 'account', 'models', 'skills', 'knowledge', 'voice', 'email', 'security', 'notifications']
const activeTopTab = ref('general')
const activeProviderTab = ref('openai')

// NOTE: route.query.tab watcher moved below activeSubTab definition to avoid TDZ error.

// Per-tab save state
const savingModels = ref(false)
const savedModelsMsg = ref('')

// Provider auto-save lives here as a forward declaration; the actual watch is
// installed AFTER selectedProvider is defined further down. Keeping the state
// up here so the template can bind to providerAutoSaveStatus without ordering
// issues.
const providerAutoSaveStatus = ref(null) // { ok: bool, text: string } | null
const savingSkills = ref(false)
const savedSkillsMsg = ref('')

// Unified provider test state
const testingProvider = ref(null)  // 'anthropic' | 'openrouter' | 'openai' | 'deepseek' | null
const testResults = ref({})        // { [provider]: { ok, message } }

// Utility model test state
const testingUtilityModel = ref(false)
const testUtilityModelResult = ref(null)
const utilityModelFilter = ref('')
const utilityModelListRef = ref(null)

function scrollActiveCentered(container, active) {
  const cRect = container.getBoundingClientRect()
  const aRect = active.getBoundingClientRect()
  // Active's top in the container's scroll coordinate space.
  const activeTopInScroll = aRect.top - cRect.top + container.scrollTop
  const target = activeTopInScroll - (container.clientHeight - active.offsetHeight) / 2
  const max = container.scrollHeight - container.clientHeight
  container.scrollTop = Math.max(0, Math.min(max, target))
}

function scrollUtilityActiveIntoView() {
  const tryScroll = () => {
    const container = utilityModelListRef.value
    if (!container) return false
    const active = container.querySelector('.cv-model-item.active')
    if (!active) return false
    scrollActiveCentered(container, active)
    return true
  }
  // The active row may not exist yet on the first call (list still loading,
  // filter recomputing, or DOM not yet painted). Retry across frames.
  if (tryScroll()) return
  requestAnimationFrame(() => {
    if (tryScroll()) return
    requestAnimationFrame(() => { tryScroll() })
  })
}

// Providers eligible as utility-model backend — anything with an apiKey.
// Verification of a specific (provider, model) combo happens in the agent
// editor via its Test button; we don't gate the picker on a global "active"
// flag.
const utilityActiveProviderOptions = computed(() =>
  (configStore.config.providers || [])
    .filter(p => p.apiKey)
    .map(p => ({ id: p.type, name: p.alias || p.name }))
)

const utilityModelsLoading = computed(() => {
  const p = form.utilityModel.provider
  return p ? modelsStore.isLoading(p) : false
})

// Model-list i18n strings — cached per locale so we aren't calling t() hundreds of times per render
// across 200+ model rows (biggest single perf hit on the utility model list).
const modelListI18n = computed(() => {
  return {
    contextLabel:   t('config.contextLabel'),
    maxOutputLabel: t('config.maxOutputLabel'),
    ctxUnavailable:     t('config.contextLengthUnavailable'),
    ctxUnavailableHint: t('config.contextLengthUnavailableHint'),
    outUnavailable:     t('config.maxOutputUnavailable'),
    outUnavailableHint: t('config.maxOutputUnavailableHint'),
    defaultPrefix:  t('config.defaultPrefix'),
    fallbackHint:   t('config.modelMaxOutputFallbackHint'),
    ctxFromUser:    t('config.contextFromUser'),
    ctxFromCatalog: t('config.contextFromCatalog'),
    ctxFromApi:     t('config.contextFromApi'),
    ctxUnknown:     t('config.contextUnknown'),
    outFromUser:    t('config.maxOutputFromUser'),
    outFromCatalog: t('config.maxOutputFromCatalog'),
    outFromApi:     t('config.maxOutputFromApi'),
    inputPriceLabel:     t('config.inputPriceLabel'),
    outputPriceLabel:    t('config.outputPriceLabel'),
    priceFromUser:       t('config.priceFromUser'),
    priceFromCatalog:    t('config.priceFromCatalog'),
    priceFromApi:        t('config.priceFromApi'),
    priceUnavailable:    t('config.priceUnavailable'),
    priceUnavailableHint: t('config.priceUnavailableHint'),
  }
})

// Format USD cost-per-token → "$3.00" style string (cost for 1M tokens, always 2 decimals).
function formatPricePerMillion(costPerToken) {
  if (costPerToken == null || !isFinite(costPerToken) || costPerToken < 0) return ''
  return '$' + (costPerToken * 1_000_000).toFixed(2)
}

// Parse user input "3", "3.5", "$3.50", "15" (USD per 1M tokens) → cost per token.
// Returns a number ≥ 0, or null for empty / invalid input.
function parsePricePerMillion(input) {
  if (input == null) return null
  const s = String(input).trim().replace(/[$,\s]/g, '')
  if (!s) return null
  const n = parseFloat(s)
  if (!Number.isFinite(n) || n < 0) return null
  return n / 1_000_000
}

// Total count — kept around for any future UI that needs it.
const utilityModelsTotal = ref(0)

// Model list for the utility provider — fully pre-enriched (title strings, formatted K/M,
// all source-dependent strings resolved) so the v-for template does zero function / t() calls per row.
const filteredUtilityModels = computed(() => {
  const providerType = form.utilityModel.provider
  if (!providerType) { utilityModelsTotal.value = 0; return [] }
  const provider = (configStore.config.providers || []).find(p => p.type === providerType) || null
  const models = modelsStore.getModelsForProvider(provider?.id || providerType) || []
  const settings = provider?.modelSettings || {}
  const q = utilityModelFilter.value ? utilityModelFilter.value.toLowerCase() : ''
  const defaultsTableEntries = Object.entries(modelDefaultMaxOutput.value.table || {})
  const fallbackOut = 32000
  const i = modelListI18n.value
  utilityModelsTotal.value = models.length

  const out = []
  for (const m of models) {
    if (q && !m.id.toLowerCase().includes(q) && !(m.name || '').toLowerCase().includes(q)) continue
    const s = settings[m.id] || null

    let ctxVal, ctxSource
    if (s?.contextWindow) { ctxVal = s.contextWindow; ctxSource = 'user' }
    else if (m.context_length) { ctxVal = m.context_length; ctxSource = m.contextSource || 'api' }
    else { ctxVal = null; ctxSource = null }

    let outVal, outSource
    if (s?.maxOutputTokens) { outVal = s.maxOutputTokens; outSource = 'user' }
    else if (m.max_output_tokens) { outVal = m.max_output_tokens; outSource = m.maxOutputSource || 'api' }
    else {
      const id = (m.id || '').toLowerCase()
      let bestLen = 0, bestVal = null
      for (const [key, val] of defaultsTableEntries) {
        const lk = key.toLowerCase()
        if ((id === lk || id.startsWith(lk)) && lk.length > bestLen) {
          bestLen = lk.length
          bestVal = val
        }
      }
      if (bestVal !== null) { outVal = bestVal; outSource = 'catalog' }
      else { outVal = fallbackOut; outSource = 'fallback' }
    }

    // Effective pricing (USD per token). User override > API > catalog.
    let inCost, outCost, priceSource
    if (s?.inputCostPerToken != null) { inCost = s.inputCostPerToken; priceSource = 'user' }
    else if (m.input_cost_per_token != null) { inCost = m.input_cost_per_token; priceSource = m.priceSource || 'api' }
    else { inCost = null }
    if (s?.outputCostPerToken != null) { outCost = s.outputCostPerToken; priceSource = priceSource || 'user' }
    else if (m.output_cost_per_token != null) { outCost = m.output_cost_per_token; priceSource = priceSource || m.priceSource || 'api' }
    else { outCost = outCost === undefined ? null : outCost }

    const hasPrice = inCost != null || outCost != null
    const priceTitle = hasPrice
      ? (priceSource === 'user' ? i.priceFromUser : priceSource === 'catalog' ? i.priceFromCatalog : i.priceFromApi)
      : i.priceUnavailableHint

    out.push({
      id: m.id,
      displayName: m.name || m.id,
      _ctxVal: ctxVal,
      _ctxFormatted: ctxVal ? formatContextWindow(ctxVal) : '',
      _ctxTitle: ctxVal
        ? (ctxSource === 'user' ? i.ctxFromUser : ctxSource === 'catalog' ? i.ctxFromCatalog : i.ctxFromApi)
        : i.ctxUnavailableHint,
      _outVal: outVal,
      _outFormatted: formatContextWindow(outVal),
      _outSource: outSource,
      _outTitle: outSource === 'fallback'
        ? i.fallbackHint
        : outSource === 'user' ? i.outFromUser
        : outSource === 'catalog' ? i.outFromCatalog
        : i.outFromApi,
      _inCost:  inCost,
      _outCost: outCost,
      _inPriceFormatted:  formatPricePerMillion(inCost),
      _outPriceFormatted: formatPricePerMillion(outCost),
      _priceSource: priceSource || null,
      _hasPrice: hasPrice,
      _priceTitle: priceTitle,
    })
  }
  return out
})

function onUtilityProviderChange(providerType) {
  form.utilityModel.provider = providerType
  form.utilityModel.model = ''
  testUtilityModelResult.value = null
  utilityModelFilter.value = ''
  // Lazy-load the provider's models on first selection (matches body-view behaviour)
  const p = (configStore.config.providers || []).find(x => x.type === providerType)
  if (p && !modelsStore.isCached(p.id) && !modelsStore.isLoading(p.id)) {
    modelsStore.fetchModelsForProvider(p.id)
  }
}



// Knowledge embedding model state — model is bundled now, so only the
// "checking" flag drives any UI. Download / remove state was removed in the
// bundled-model cutover.
const knowledgeModelChecking = ref(false)
const savedKnowledgeMsg = ref('')

// Voice Call tab state
const showWhisperKey = ref(false)
const savingVoice = ref(false)
const savedVoiceMsg = ref(null)
const testingWhisper = ref(false)
const testResultWhisper = ref(null)
// OpenAI TTS removed — TTS is Edge TTS only
// Edge-TTS voices — builtin defaults + full list from server
import { EDGE_VOICES as BUILTIN_EDGE_VOICES } from '../utils/edgeVoices'
const edgeVoices = ref(BUILTIN_EDGE_VOICES)
const previewingVoice = ref(false)
const previewAudioPlaying = ref(false)
const showPreviewVoiceError = ref(false)
const previewVoiceErrorMsg = ref('')
const edgeVoiceGroups = computed(() => {
  const localeOrder = ['zh-CN', 'en-US']
  const groups = {}
  for (const v of edgeVoices.value) {
    const loc = v.locale || 'other'
    if (!groups[loc]) groups[loc] = { locale: loc, voices: [] }
    groups[loc].voices.push(v)
  }
  return localeOrder
    .filter(l => groups[l])
    .map(l => groups[l])
    .concat(Object.values(groups).filter(g => !localeOrder.includes(g.locale)))
})

async function loadEdgeVoices() {
  try {
    const result = await window.electronAPI.voice.edgeVoices()
    if (result?.voices?.length) {
      // Only show zh-CN and en-US voices, normalize names to our friendly format
      edgeVoices.value = result.voices
        .filter(v => v.locale === 'zh-CN' || v.locale === 'en-US')
        .map(v => {
          const known = BUILTIN_EDGE_VOICES.find(b => b.id === v.id)
          if (known) return { ...v, name: known.name }
          // Strip "Microsoft Foo Online (Natural) - Language (Country)" → "Foo"
          const cleaned = (v.name || v.id)
            .replace(/^Microsoft\s+/, '')
            .replace(/\s+Online\s*\([^)]*\)\s*-\s*.+$/, '')
            .trim()
          return { ...v, name: cleaned }
        })
    }
  } catch {}
}

async function previewVoice(voiceId) {
  if (!voiceId || previewingVoice.value || previewAudioPlaying.value) return
  previewingVoice.value = true
  previewVoiceErrorMsg.value = ''
  try {
    const result = await window.electronAPI.voice.edgePreview({ voice: voiceId })
    if (result?.success && result.audio) {
      const audio = new Audio(`data:audio/mpeg;base64,${result.audio}`)
      previewingVoice.value = false
      previewAudioPlaying.value = true
      audio.onended = () => { previewAudioPlaying.value = false }
      audio.onerror = () => { previewAudioPlaying.value = false }
      setTimeout(() => { audio.play().catch(e => console.warn('[audio:play]', e.message)) }, 50)
    } else if (result?.error) {
      console.warn('[voice:preview]', result.error)
      previewVoiceErrorMsg.value = result.error
      showPreviewVoiceError.value = true
    }
  } catch (e) {
    console.warn('[voice:preview] failed:', e.message)
    previewVoiceErrorMsg.value = e.message || 'Preview failed'
    showPreviewVoiceError.value = true
  } finally {
    previewingVoice.value = false
  }
}

// GPU detection
const gpuDetecting = ref(false)
const gpuInfo = ref(null) // { available, name, vram }

async function detectGPU() {
  gpuDetecting.value = true
  gpuInfo.value = null
  try {
    const result = await window.electronAPI.voice.detectGPU()
    gpuInfo.value = result
  } catch {
    gpuInfo.value = { available: false, name: t('config.gpuDetectFailed') }
  } finally {
    gpuDetecting.value = false
  }
}

// Local voice state
const removingLocalEnv = ref(false)
// localServerRunning / localServerHealth / localServerStep removed — no Python server needed
const localSetupProgress = ref(null)   // { step, progress, message }
const localSetupError = ref(null)
const settingUpLocalEnv = ref(false)
// startingLocalServer removed — no Python server needed
const testingLocal = ref(false)
const testResultLocal = ref(null)

// Email tab state
const showSmtpPass = ref(false)
const savingEmail = ref(false)
const savedEmailMsg = ref(null)
const testingSmtp = ref(false)
const testResultSmtp = ref(null)

// Security tab state
const savingSecurity = ref(false)
const savedSecurityMsg = ref(null)
const sandboxForm = reactive({
  defaultMode: 'sandbox',
  sandboxAllowList: [],
  dangerBlockList: [],
})
const newAllowPattern = ref('')
const newAllowDesc = ref('')
const newDangerPattern = ref('')
const newDangerDesc = ref('')

function addAllowEntry() {
  const p = newAllowPattern.value.trim()
  if (!p) return
  sandboxForm.sandboxAllowList.push({ id: `manual-${Date.now()}`, pattern: p, description: newAllowDesc.value.trim() })
  newAllowPattern.value = ''
  newAllowDesc.value = ''
}
function removeAllowEntry(idx) { sandboxForm.sandboxAllowList.splice(idx, 1) }
function addDangerEntry() {
  const p = newDangerPattern.value.trim()
  if (!p) return
  sandboxForm.dangerBlockList.push({ id: `manual-${Date.now()}`, pattern: p, description: newDangerDesc.value.trim() })
  newDangerPattern.value = ''
  newDangerDesc.value = ''
}
function removeDangerEntry(idx) { sandboxForm.dangerBlockList.splice(idx, 1) }

async function saveSecurity() {
  savingSecurity.value = true
  try {
    await configStore.saveConfig({ sandboxConfig: JSON.parse(JSON.stringify(sandboxForm)) })
    savedSecurityMsg.value = { ok: true, text: t('common.successSaved') }
  } catch (err) {
    savedSecurityMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
  } finally {
    savingSecurity.value = false
    setTimeout(() => { savedSecurityMsg.value = null }, 3000)
  }
}

// General tab state
const defaultDataPath = ref('')
const originalDataPath = ref('')
const showDataPathWarning = ref(false)
const osSep = (typeof window !== 'undefined' && window.electronAPI?.platform === 'win32') ? '\\' : '/'
const isWindows = (typeof window !== 'undefined' && window.electronAPI?.platform === 'win32')
const dataPathChanged = computed(() => {
  const current = (form.dataPath || '').trim()
  const original = (originalDataPath.value || '').trim()
  return current !== original
})
const dataPathFromTo = computed(() => ({
  from: originalDataPath.value || defaultDataPath.value,
  to: (form.dataPath || '').trim() || defaultDataPath.value,
}))
const dataPathCopyCommand = computed(() => {
  const { from, to } = dataPathFromTo.value
  if (isWindows) {
    return `xcopy /E /I "${from}" "${to}"`
  }
  return `cp -r "${from}" "${to}"`
})
// Paths that will change because they depend on the current data directory.
// A path "depends" if it's empty (using default) or starts with the current DATA_DIR.
const derivedPathsAffected = computed(() => {
  const from = dataPathFromTo.value.from
  const to = dataPathFromTo.value.to
  const sep = osSep
  const affected = []
  const dependsOnDataDir = (custom) => !custom || custom.startsWith(from)
  if (dependsOnDataDir(form.skillsPath)) {
    affected.push({ label: t('config.skillsPath'), newPath: to + sep + 'skills' })
  }
  if (dependsOnDataDir(form.artifactPath)) {
    affected.push({ label: t('config.artifactPath'), newPath: to + sep + 'artifact' })
  }
  if (dependsOnDataDir(form.DoCPath)) {
    affected.push({ label: t('config.aidocPath'), newPath: to + sep + 'clankit_doc' })
  }
  return affected
})
const defaultArtifactPath = computed(() => {
  const dp = form.dataPath || defaultDataPath.value
  return dp ? `${dp}${osSep}artifact` : ''
})
const defaultSkillsPath = computed(() => {
  const dp = form.dataPath || defaultDataPath.value
  return dp ? `${dp}${osSep}skills` : ''
})
const defaultAidocPath = computed(() => {
  const dp = form.dataPath || defaultDataPath.value
  return dp ? `${dp}${osSep}clankit_doc` : ''
})
const savingGeneral = ref(false)
const savedGeneralMsg = ref('')
const savingSkillsPath = ref(false)
const savedSkillsPathMsg = ref(null)
const savingAidocPath = ref(false)
const savedAidocPathMsg = ref(null)

// ── Tab icon components ─────────────────────────────────────────────────────
const IconGeneral = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '3' }),
    h('path', { d: 'M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z' })
  ])
})
const IconModels = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z' })
  ])
})
const IconSkills = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('polygon', { points: '13 2 3 14 12 14 11 22 21 10 12 10 13 2' })
  ])
})
const IconKnowledge = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z' }),
    h('path', { d: 'M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z' })
  ])
})
const IconSecurity = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z' })
  ])
})
const IconVoice = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z' }),
    h('path', { d: 'M19 10v2a7 7 0 0 1-14 0v-2' }),
    h('line', { x1: '12', y1: '19', x2: '12', y2: '23' }),
    h('line', { x1: '8', y1: '23', x2: '16', y2: '23' })
  ])
})
const IconTTS = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('polygon', { points: '11 5 6 9 2 9 2 15 6 15 11 19 11 5' }),
    h('path', { d: 'M19.07 4.93a10 10 0 0 1 0 14.14' }),
    h('path', { d: 'M15.54 8.46a5 5 0 0 1 0 7.07' })
  ])
})
const IconEmail = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z' }),
    h('polyline', { points: '22,6 12,13 2,6' })
  ])
})
const IconPaths = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '1.75', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z' })
  ])
})
const IconIM = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' })
  ])
})
const IconLanguage = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('line', { x1: '2', y1: '12', x2: '22', y2: '12' }),
    h('path', { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' })
  ])
})
const IconNotifications = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9' }),
    h('path', { d: 'M13.73 21a2 2 0 0 1-3.46 0' })
  ])
})
const IconAccount = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2' }),
    h('circle', { cx: '12', cy: '7', r: '4' })
  ])
})
const IconAbout = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('line', { x1: '12', y1: '16', x2: '12', y2: '12' }),
    h('line', { x1: '12', y1: '8', x2: '12.01', y2: '8' })
  ])
})
const IconAiDoc = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('polyline', { points: '14 2 14 8 20 8' }),
    h('line', { x1: '16', y1: '13', x2: '8', y2: '13' }),
    h('line', { x1: '16', y1: '17', x2: '8', y2: '17' }),
    h('polyline', { points: '10 9 9 9 8 9' })
  ])
})
// Top-level tabs (2 primary)
const topTabs = computed(() => [
  { value: 'general', label: t('config.general'), icon: IconGeneral },
  { value: 'ai',      label: t('config.ai'),      icon: IconModels  },
])

// Sub-tab arrays
const subTabsGeneral = computed(() => [
  { value: 'language',      label: 'Language / 语言',          icon: IconLanguage      },
  { value: 'notifications', label: t('config.notifications'),  icon: IconNotifications },
  { value: 'paths',         label: t('config.paths'),          icon: IconPaths         },
  { value: 'security',      label: t('config.security'),       icon: IconSecurity      },
  { value: 'email',         label: t('config.email'),          icon: IconEmail         },
  { value: 'im',            label: t('config.im'),             icon: IconIM            },
  { value: 'account',       label: t('account.title'),         icon: IconAccount       },
  { value: 'about',         label: t('common.about'),          icon: IconAbout         },
])
const voiceMenuExpanded = ref(false)
const vadExpanded = ref(false)
const subTabsAI = computed(() => {
  const items = [
    { value: 'models',    label: t('config.models'),    icon: IconModels    },
    { value: '_voice',    label: t('config.voice'),     group: true         },
  ]
  if (voiceMenuExpanded.value) {
    items.push(
      { value: 'tts', label: t('config.ttsLabel'), icon: IconTTS,   indent: true },
      { value: 'stt', label: t('config.sttLabel'), icon: IconVoice, indent: true },
    )
  }
  items.push(
    { value: 'aidoc',     label: t('config.aidocPath'),  icon: IconAiDoc    },
    { value: 'skills',    label: t('config.skillsPath'), icon: IconSkills   },
    { value: 'knowledge', label: t('config.knowledge'), icon: IconKnowledge },
  )
  return items
})

const activeSubTab = ref('language')

// Route query → tab mapping (must be after activeSubTab definition to avoid TDZ)
watch(() => route.query.tab, (tab) => {
  if (!tab) return
  if (tab === 'account') { activeTopTab.value = 'general'; activeSubTab.value = 'account'; return }
  if (tab === 'general') { activeTopTab.value = 'general'; activeSubTab.value = 'paths'; return }
  if (tab === 'ai') { activeTopTab.value = 'ai'; activeSubTab.value = 'models'; return }
  if (tab === 'models') { activeTopTab.value = 'ai'; activeSubTab.value = 'models'; return }
  if (tab === 'voice') { activeTopTab.value = 'ai'; voiceMenuExpanded.value = true; activeSubTab.value = 'tts'; return }
  if (tab === 'tts') { activeTopTab.value = 'ai'; voiceMenuExpanded.value = true; activeSubTab.value = 'tts'; return }
  if (tab === 'stt') { activeTopTab.value = 'ai'; voiceMenuExpanded.value = true; activeSubTab.value = 'stt'; return }
  if (tab === 'notifications') { activeTopTab.value = 'general'; activeSubTab.value = 'notifications'; return }
  if (tab === 'knowledge') { activeTopTab.value = 'ai'; activeSubTab.value = 'knowledge'; return }
  if (tab === 'security') { activeTopTab.value = 'general'; activeSubTab.value = 'security'; return }
  if (tab === 'email') { activeTopTab.value = 'general'; activeSubTab.value = 'email'; return }
  if (tab === 'skills') { activeTopTab.value = 'ai'; activeSubTab.value = 'skills'; return }
  if (tab === 'about') { activeTopTab.value = 'general'; activeSubTab.value = 'about'; return }
}, { immediate: true })

// Forward-declared here (before onboarding watcher) to avoid TDZ;
// full watcher + related logic lives in the "Models Page" section below.
const modelsLeftNav = ref('empty')  // 'empty' | providerId | 'global' | 'utility'
const addProviderPreset = ref('anthropic')
const addProviderName = ref('')
const addProviderProtocol = ref('openai')

const currentSubTabs = computed(() =>
  activeTopTab.value === 'general' ? subTabsGeneral.value : subTabsAI.value
)

function switchTopTab(tab) {
  activeTopTab.value = tab
  activeSubTab.value = tab === 'general' ? 'language' : 'models'
}

function getSubTabStatus(subTab) {
  switch (subTab) {
    case 'language':      return form.language ? 'configured' : 'empty'
    case 'notifications': return 'configured'
    case 'paths':         return (form.dataPath || form.artifactPath) ? 'configured' : 'empty'
    case 'skills':    return form.skillsPath ? 'configured' : 'empty'
    case 'aidoc':     return form.DoCPath ? 'configured' : 'empty'
    case 'security':  return 'configured'
    case 'email':     return form.smtp?.host ? 'configured' : 'empty'
    case 'im':        return (form.im?.telegram?.botToken || form.im?.whatsapp?.enabled || form.im?.feishu?.appId) ? 'configured' : 'empty'
    case 'models':    return configStore.config.providers?.some(p => p.apiKey) ? 'configured' : 'empty'
    case 'voice':     return form.voiceCall?.whisperApiKey ? 'configured' : 'empty'
    case 'tts':       return 'configured' // Edge TTS always available
    case 'stt':       return (form.voiceCall?.mode && form.voiceCall.mode !== 'disabled') ? 'configured' : 'empty'
    case 'knowledge': return knowledgeStore.modelReady ? 'configured' : 'empty'
    case 'account':   return auth.isAuthenticated.value ? 'configured' : 'empty'
    default:          return 'empty'
  }
}

// ── IM Bridge state & handlers ────────────────────────────────────────────────
const showTgToken       = ref(false)
const showWaSecret      = ref(false)
const showIMGuide       = ref(false)
const savingIM          = ref(false)
const startingBridge    = ref(false)
const savedIMMsg        = ref(null)
const imStatus          = ref({ running: false, sessions: [] })
const whatsappQr        = ref(null)   // data URI — shown until connected
const whatsappConnected = ref(false)
const activeIMTab       = ref('telegram')  // 'telegram' | 'whatsapp' | 'feishu' | 'bridge'

// Per-platform "properly enabled" indicators
const telegramReady = computed(() =>
  !!(form.im.telegram?.enabled && form.im.telegram?.botToken?.trim())
)
const whatsappReady = computed(() =>
  !!(form.im.whatsapp?.enabled && whatsappConnected.value)
)
const feishuReady = computed(() =>
  !!(form.im.feishu?.enabled && form.im.feishu?.appId?.trim() && form.im.feishu?.appSecret?.trim())
)
const teamsReady = computed(() =>
  !!(form.im.teams?.enabled && form.im.teams?.clientId?.trim() && form.im.teams?.tenantId?.trim())
)
const imAnyReady = computed(() => telegramReady.value || whatsappReady.value || feishuReady.value || teamsReady.value)

// Reset IM inner tab to first platform when navigating back to the IM sub-section
watch(activeSubTab, (val) => {
  if (val === 'im') activeIMTab.value = 'telegram'
  if (val === 'tts') loadEdgeVoices()
  // Clear stale save/test messages when switching sub-tabs
  savedModelsMsg.value = ''
  testResultNew.value = null
  testUtilityModelResult.value = null
  // Utility Model: re-sync form from persisted config on every entry into the
  // models tab so unsaved edits never linger. The form state stays buffered —
  // configStore.config.utilityModel is only written when save AND test both
  // succeed inside saveModels(). Leaving the tab without saving discards edits.
  if (val === 'models') {
    const saved = configStore.config.utilityModel || { provider: '', model: '' }
    form.utilityModel.provider = saved.provider || ''
    form.utilityModel.model    = saved.model    || ''
  }
})
// Ensure form.im.teams exists (handles KeepAlive cache from before Teams was added)
watch(activeIMTab, (val) => {
  if (val === 'teams' && !form.im.teams) {
    form.im.teams = { enabled: false, tenantId: '', clientId: '', allowedUsers: [], pollInterval: 10 }
  }
})


// WhatsApp QR flow state
const waLinking = ref(false)  // true while requestQR is in-flight

async function requestWhatsAppLink() {
  waLinking.value = true
  whatsappQr.value = null
  whatsappConnected.value = false

  // Auto-reset spinner after 10s in case QR never arrives
  const timeout = setTimeout(() => { waLinking.value = false }, 10000)

  try {
    if (window.electronAPI?.im?.requestWhatsAppQr) {
      await window.electronAPI.im.requestWhatsAppQr()
    } else if (window.electronAPI?.im?.start) {
      imStatus.value = await window.electronAPI.im.start()
    }
  } catch (err) {
    console.error('[im] requestWhatsAppLink error:', err.message)
  } finally {
    clearTimeout(timeout)
    waLinking.value = false
  }
}

// Teams auth flow state
const teamsAuthLoading = ref(false)
const teamsAuthStatus  = ref({ connected: false, displayName: '', userId: '' })
const teamsDeviceCode  = ref({ userCode: '', verificationUri: '' })


async function _restartTeamsBridge() {
  if (!window.electronAPI?.im) return
  if (imStatus.value?.platforms?.teams) {
    await window.electronAPI.im.stopPlatform('teams')
    imStatus.value = await window.electronAPI.im.startPlatform('teams')
  }
}

async function requestTeamsAuth() {
  teamsAuthLoading.value = true
  teamsDeviceCode.value = { userCode: '', verificationUri: '' }
  try {
    if (window.electronAPI?.im?.teamsRequestAuth) {
      await window.electronAPI.im.teamsRequestAuth({
        tenantId: form.im.teams.tenantId,
        clientId: form.im.teams.clientId,
      })
    }
  } catch (err) {
    console.error('[im] requestTeamsAuth error:', err.message)
    teamsAuthLoading.value = false
  }
}

async function teamsSignOut() {
  try {
    if (window.electronAPI?.im?.teamsSignOut) {
      await window.electronAPI.im.teamsSignOut()
    }
    teamsAuthStatus.value = { connected: false, displayName: '' }
    teamsDeviceCode.value = { userCode: '', verificationUri: '' }
    await loadIMStatus()
  } catch (err) {
    console.error('[im] teamsSignOut error:', err.message)
  }
}

async function loadIMStatus() {
  if (window.electronAPI?.im) {
    imStatus.value = await window.electronAPI.im.getStatus()
  }
}

async function saveIM() {
  savingIM.value = true
  savedIMMsg.value = null
  try {
    await configStore.saveConfig({ im: JSON.parse(JSON.stringify(form.im)) })
    // Restart Teams bridge if running so new config (allowedUsers etc.) takes effect
    await _restartTeamsBridge()
    savedIMMsg.value = { ok: true, text: t('common.successSaved') }
  } catch (err) {
    savedIMMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
  } finally {
    savingIM.value = false
    setTimeout(() => { savedIMMsg.value = null }, 3000)
  }
}

async function togglePlatform(platform, enable) {
  if (!window.electronAPI?.im) return
  if (enable) {
    imStatus.value = await window.electronAPI.im.startPlatform(platform)
  } else {
    imStatus.value = await window.electronAPI.im.stopPlatform(platform)
  }
}

async function startBridge() {
  startingBridge.value = true
  try {
    imStatus.value = await window.electronAPI.im.start()
  } finally {
    startingBridge.value = false
  }
}

async function stopBridge() {
  imStatus.value = await window.electronAPI.im.stop()
}

// Provider icon components
const IconAnthropic = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 2L2 7l10 5 10-5-10-5z' }),
    h('path', { d: 'M2 17l10 5 10-5' }),
    h('path', { d: 'M2 12l10 5 10-5' })
  ])
})
const IconOpenRouter = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('circle', { cx: '12', cy: '12', r: '10' }),
    h('line', { x1: '2', y1: '12', x2: '22', y2: '12' }),
    h('path', { d: 'M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z' })
  ])
})
const IconOpenAI = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 22V16' }),
    h('path', { d: 'M8 22V16' }),
    h('path', { d: 'M16 22V16' }),
    h('rect', { x: '6', y: '10', width: '12', height: '6', rx: '2' }),
    h('path', { d: 'M9 10V7a3 3 0 0 1 6 0v3' }),
  ])
})

const IconDeepSeek = defineComponent({
  render: () => h('svg', { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }, [
    h('path', { d: 'M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z' }),
    h('path', { d: 'M8 12c0-2.21 1.79-4 4-4s4 1.79 4 4-1.79 4-4 4-4-1.79-4-4z' }),
    h('path', { d: 'M12 8V6M12 18v-2M8 12H6M18 12h-2' })
  ])
})

const providerOptions = [
  { value: 'openai',      label: 'OpenAI (Compatible)',        icon: IconOpenAI      },
  { value: 'anthropic',   label: 'Anthropic',                  icon: IconAnthropic   },
  { value: 'openrouter',  label: 'OpenRouter',                 icon: IconOpenRouter  },
  { value: 'deepseek',    label: 'DeepSeek',                   icon: IconDeepSeek    },
]



// ── Test Connection ──────────────────────────────────────────────────────────

async function testUtilityModel() {
  if (testingUtilityModel.value || !form.utilityModel.provider || !form.utilityModel.model) return
  testingUtilityModel.value = true
  testUtilityModelResult.value = null
  testUtilityModelToken++
  const providerType = form.utilityModel.provider
  const providerCfg = configStore.config.providers?.find(p => p.type === providerType && p.apiKey) || {}
  try {
    const res = await window.electronAPI.testProvider({
      provider: providerType,
      apiKey: providerCfg.apiKey,
      baseURL: providerCfg.baseURL,
      utilityModel: form.utilityModel.model,
    })
    if (res.success) {
      const token = ++testUtilityModelToken
      testUtilityModelResult.value = { ok: true, message: `Connected \u00B7 ${res.ms}ms` }
      setTimeout(() => {
        if (testUtilityModelToken === token) testUtilityModelResult.value = null
      }, 5000)
    } else {
      testUtilityModelResult.value = { ok: false, message: res.error }
    }
  } catch (err) {
    testUtilityModelResult.value = { ok: false, message: err.message || 'Test failed' }
  } finally {
    testingUtilityModel.value = false
  }
}

const form = reactive({
  utilityModel: {
    provider: '',
    model:    '',
  },
  skillsPath:  '',
  DoCPath:             '',
  dataPath:            '',
  artifactPath:        '',
  voiceCall: {
    mode: 'disabled',
    ttsVoice: 'zh-CN-XiaoxiaoNeural',
    local: {
      installPath: '',
      sttModel: 'SenseVoiceSmall',
      ttsVoice: 'zh-CN-XiaoxiaoNeural',
      modelSource: 'modelscope',
      device: 'cuda',
      serverPort: 8199,
      isReady: false,
    },
    whisperApiKey:  '',
    whisperBaseURL: '',
    whisperDirectAuth: false,
    ttsMode: 'browser',
    language: '',
    vadAmplitude:      0.018,
    vadSilenceMs:      700,
    vadSpeechFrames:   20,
    vadVoiceBandRatio: 0.25,
    vadProximityMult:  2.5,
    isActive: false,
  },
  smtp: {
    host: '',
    port: 587,
    user: '',
    pass: '',
  },
  im: {
    telegram: { enabled: false, botToken: '', allowedUsers: [] },
    whatsapp: { enabled: false, selfOnly: true, allowedUsers: [] },
    feishu:   { enabled: false, appId: '', appSecret: '', allowedUsers: [] },
    teams:    { enabled: false, tenantId: '', clientId: '', selfOnly: true, allowedUsers: [], pollInterval: 5 },
  },
  language: 'en',
})

// Sync: when Teams is disabled, auto-stop the running bridge platform
watch(() => form.im.teams?.enabled, async (enabled) => {
  if (enabled === false && imStatus.value?.platforms?.teams) {
    await window.electronAPI?.im?.stopPlatform?.('teams')
    await loadIMStatus()
  }
})


// ── Models Page: New left sidebar logic ────────────────────────────────
// (modelsLeftNav is forward-declared near the onboarding watcher above)

// Whenever the user arrives at the Models sub-tab (via top-nav, sub-tab click,
// or ?tab=models route), auto-select the first configured provider so the
// right panel shows real content instead of the empty "select a provider"
// placeholder. Only fires when the current nav is 'empty' — respects any
// explicit choice the user has already made.
watch(
  [activeTopTab, activeSubTab, () => configStore.config.providers?.length ?? 0],
  ([topTab, subTab]) => {
    if (topTab !== 'ai' || subTab !== 'models') return
    if (modelsLeftNav.value !== 'empty') return
    const providers = configStore.config.providers || []
    if (providers.length > 0) modelsLeftNav.value = providers[0].id
  },
  { immediate: true }
)

const providerAdvancedOpen = ref(false)
watch(modelsLeftNav, (val) => {
  providerAdvancedOpen.value = false
  modelsFetchedOnce.value = false
  savedModelsMsg.value = ''
  testResultNew.value = null
  testingProviderNew.value = false
  providerModelsFetchError.value = ''
  anthropicFetchMsg.value = null
  anthropicFetchToken++
  testResultNewToken++
  testUtilityModelResult.value = null
  testUtilityModelToken++
  // Re-sync the Utility Model form from persisted config every time the user
  // enters the utility sub-page. Unsaved edits are discarded on leaving.
  if (val === 'utility') {
    const saved = configStore.config.utilityModel || { provider: '', model: '' }
    form.utilityModel.provider = saved.provider || ''
    form.utilityModel.model    = saved.model    || ''
    nextTick(() => scrollUtilityActiveIntoView())
  }
})

// Keep the selected utility model in view as the list re-renders
// (filter changes, models finish loading, selection changes programmatically).
watch(
  [filteredUtilityModels, utilityModelFilter, () => form.utilityModel.model],
  () => { nextTick(() => scrollUtilityActiveIntoView()) }
)
const showAddProviderModal = ref(false)

const showDeleteConfirm = ref(false)
const deleteConfirmId = ref(null)
const deleteConfirmName = ref('')
const testModelTemp = ref('')
const selectedTestModel = ref('')
const testingProviderNew = ref(false)
const testResultNew = ref(null)
const showProviderKey = ref(false)

// Selected provider model fetching state
const providerModelsFetching = ref(false)
const providerModelsFetchError = ref('')
const modelsFetchedOnce = ref(false) // tracks if user clicked "Fetch Models" at least once
const providerModelFilter = ref('')

const providerPresetOptions = [
  { value: 'anthropic', label: 'Anthropic' },
  { value: 'openai_official', label: 'OpenAI' },
  { value: 'openai', label: 'OpenAI Compatible' },
  { value: 'openrouter', label: 'OpenRouter' },
  { value: 'deepseek', label: 'DeepSeek（深度求索）' },
  { value: 'google', label: 'Google' },
  { value: 'mistral', label: 'Mistral' },
  { value: 'groq', label: 'Groq' },
  { value: 'xai', label: 'xAI (Grok)' },
  { value: 'ollama', label: 'Ollama (Local)' },
  { value: 'minimax', label: 'MiniMax（稀宇科技）' },
  { value: 'qwen', label: 'Qwen（通义千问）' },
  { value: 'glm', label: 'GLM（智谱清言）' },
  { value: 'moonshot', label: 'Moonshot（月之暗面）' },
  { value: 'doubao', label: 'Doubao（豆包）' },
  { value: 'custom', label: 'Custom' },
]

const addProviderListOptions = computed(() => providerPresetOptions.map(opt => {
  const preset = configStore.PROVIDER_PRESETS[opt.value] || {}
  return {
    ...opt,
    freeInfo: preset.freeInfo || null,
    apiKeyUrl: preset.apiKeyUrl || null,
  }
}))

const PROVIDER_CHINESE_NAMES = {
  deepseek: '深度求索',
  minimax: '稀宇科技',
  qwen: '通义千问',
  glm: '智谱清言',
  moonshot: '月之暗面',
  doubao: '豆包',
}

function providerDisplayLabel(provider) {
  const base = provider.alias || provider.name
  const cn = PROVIDER_CHINESE_NAMES[provider.type]
  return cn ? `${base}（${cn}）` : base
}

const selectedProvider = computed(() => {
  if (modelsLeftNav.value === 'empty' || modelsLeftNav.value === 'global' || modelsLeftNav.value === 'utility') return null
  return configStore.config.providers.find(p => p.id === modelsLeftNav.value)
})

// Local UI state — which model the user has highlighted for testing. Does NOT
// persist; clicking a row only marks it as the Test button's target. Only the
// explicit "set as default" star in the row updates `provider.model` (the
// persisted default model used as fallback for new agents).
const testTargetModel = ref('')

// Reset / hydrate testTargetModel when the user navigates between providers,
// defaulting to the provider's saved default model so the Test button always
// has a sensible target without a fresh click.
watch(
  () => selectedProvider.value?.id,
  (newId) => {
    if (!newId) { testTargetModel.value = ''; return }
    const p = configStore.config.providers.find(x => x.id === newId)
    testTargetModel.value = p?.model || ''
    testResultNew.value = null
  },
  { immediate: true }
)

function selectModelForTest(modelId) {
  if (!modelId) return
  if (testTargetModel.value === modelId) return
  testTargetModel.value = modelId
  // Stale test result — was for a different model
  testResultNew.value = null
}

function setProviderDefaultModel(modelId) {
  if (!selectedProvider.value || !modelId) return
  if (selectedProvider.value.model === modelId) return
  selectedProvider.value.model = modelId
  // Auto-align the test target with the new default. User would expect this:
  // "I just chose this as my default, of course Test should hit it next."
  testTargetModel.value = modelId
  testResultNew.value = null
}

// Provider auto-save (debounced): replaces the manual Save Provider button.
// Any edit to apiKey / baseURL / alias / model / settings persists 500ms after
// the last change. The status indicator in the header surfaces the result.
let _providerAutoSaveTimer = null
let _providerAutoSaveLastKey = ''
function triggerProviderAutoSave() {
  if (!selectedProvider.value) return
  const key = selectedProvider.value.id
  _providerAutoSaveLastKey = key
  if (_providerAutoSaveTimer) clearTimeout(_providerAutoSaveTimer)
  _providerAutoSaveTimer = setTimeout(async () => {
    try {
      await configStore.saveConfig({ providers: configStore.config.providers })
      // Success: stay silent. The user's mental model is "settings just persist";
      // a flashing "Saved!" chip after every keystroke is noise and steals
      // attention from the test result, which IS the meaningful feedback.
      // Only failures need the user's eyes.
    } catch (err) {
      if (_providerAutoSaveLastKey !== key) return
      providerAutoSaveStatus.value = { ok: false, text: err.message || t('common.saveFailed') }
      setTimeout(() => { providerAutoSaveStatus.value = null }, 4000)
    }
  }, 500)
}
// Split id from content signature: navigation (id changes) is NOT an edit, so
// it must not trigger save. Only when the SAME provider's content changes do
// we persist. This kills the "click around → spurious 'saved' chip" noise.
watch(
  () => selectedProvider.value && {
    id: selectedProvider.value.id,
    sig: JSON.stringify({
      apiKey: selectedProvider.value.apiKey,
      baseURL: selectedProvider.value.baseURL,
      alias: selectedProvider.value.alias,
      model: selectedProvider.value.model,
      settings: selectedProvider.value.settings,
      modelSettings: selectedProvider.value.modelSettings,
    }),
  },
  (val, old) => {
    if (!val || !old) return        // initial mount or selectedProvider became null
    if (val.id !== old.id) return   // navigation between providers — not an edit
    if (val.sig === old.sig) return // identical content — no edit
    triggerProviderAutoSave()
  }
)

// The Test button hits whichever model the user selected in the list (the
// "test target" — transient UI state). Falls back to the persisted default
// model when nothing has been clicked yet.
const effectiveTestModel = computed(() => testTargetModel.value || selectedProvider.value?.model || '')

const canTestNew = computed(() => {
  if (!selectedProvider.value) return false
  if (selectedProvider.value.type === 'anthropic') {
    return !!(selectedProvider.value.apiKey && selectedProvider.value.baseURL && selectedTestModel.value)
  }
  if (selectedProvider.value.type === 'google') {
    return !!(selectedProvider.value.apiKey && effectiveTestModel.value)
  }
  const hasBaseURL = !!(selectedProvider.value.baseURL || configStore.PROVIDER_PRESETS[selectedProvider.value.type]?.defaultBaseURL)
  // Ollama runs locally with no auth — apiKey is optional.
  if (selectedProvider.value.type === 'ollama') {
    return !!(hasBaseURL && effectiveTestModel.value)
  }
  return !!(selectedProvider.value.apiKey && hasBaseURL && effectiveTestModel.value)
})

const selectedProviderModels = computed(() => {
  if (!selectedProvider.value) return []
  return modelsStore.getModelsForProvider(selectedProvider.value.id || selectedProvider.value.type)
})

const providerHasMissingContext = computed(() => {
  if (!selectedProvider.value) return false
  return modelsStore.hasMissingContext(selectedProvider.value.id || selectedProvider.value.type)
})

const providerContextEnriching = computed(() => {
  if (!selectedProvider.value) return false
  return modelsStore.isEnriching(selectedProvider.value.id || selectedProvider.value.type)
})

const providerModelsTotal = ref(0)
const filteredProviderModels = computed(() => {
  const models = selectedProviderModels.value
  const provider = selectedProvider.value
  const settings = provider?.modelSettings || {}
  const q = providerModelFilter.value ? providerModelFilter.value.toLowerCase() : ''
  const defaultsTable = modelDefaultMaxOutput.value.table || {}
  const defaultsTableEntries = Object.entries(defaultsTable)
  // Hard-code the display fallback to 32K so the UI stays consistent even if the backend
  // IPC handler was loaded before the constant in modelDefaults.js was updated (no restart).
  const fallbackOut = 32000
  const i = modelListI18n.value
  providerModelsTotal.value = models.length

  // Pre-compute effective context / max-output + fully-resolved titles/formatted strings
  // for each visible row so the v-for template does zero function / t() calls per row.
  const out = []
  for (const m of models) {
    if (q && !m.id.toLowerCase().includes(q) && !(m.name || '').toLowerCase().includes(q)) continue

    const s = settings[m.id] || null

    // Effective context window
    let ctxVal, ctxSource
    if (s?.contextWindow) { ctxVal = s.contextWindow; ctxSource = 'user' }
    else if (m.context_length) { ctxVal = m.context_length; ctxSource = m.contextSource || 'api' }
    else { ctxVal = null; ctxSource = null }

    // Effective max output
    let outVal, outSource
    if (s?.maxOutputTokens) { outVal = s.maxOutputTokens; outSource = 'user' }
    else if (m.max_output_tokens) { outVal = m.max_output_tokens; outSource = m.maxOutputSource || 'api' }
    else {
      const id = (m.id || '').toLowerCase()
      let bestLen = 0, bestVal = null
      for (const [key, val] of defaultsTableEntries) {
        const lk = key.toLowerCase()
        if ((id === lk || id.startsWith(lk)) && lk.length > bestLen) {
          bestLen = lk.length
          bestVal = val
        }
      }
      if (bestVal !== null) { outVal = bestVal; outSource = 'catalog' }
      else { outVal = fallbackOut; outSource = 'fallback' }
    }

    // Effective pricing (USD per token). User override > API > catalog.
    let inCost, outCost, priceSource
    if (s?.inputCostPerToken != null) { inCost = s.inputCostPerToken; priceSource = 'user' }
    else if (m.input_cost_per_token != null) { inCost = m.input_cost_per_token; priceSource = m.priceSource || 'api' }
    else { inCost = null }
    if (s?.outputCostPerToken != null) { outCost = s.outputCostPerToken; priceSource = priceSource || 'user' }
    else if (m.output_cost_per_token != null) { outCost = m.output_cost_per_token; priceSource = priceSource || m.priceSource || 'api' }
    else { outCost = outCost === undefined ? null : outCost }

    const hasPrice = inCost != null || outCost != null
    const priceTitle = hasPrice
      ? (priceSource === 'user' ? i.priceFromUser : priceSource === 'catalog' ? i.priceFromCatalog : i.priceFromApi)
      : i.priceUnavailableHint

    out.push({
      id: m.id,
      displayName: m.name || m.id,
      _ctxVal: ctxVal,
      _ctxFormatted: ctxVal ? formatContextWindow(ctxVal) : '',
      _ctxTitle: ctxVal
        ? (ctxSource === 'user' ? i.ctxFromUser : ctxSource === 'catalog' ? i.ctxFromCatalog : i.ctxFromApi)
        : i.ctxUnavailableHint,
      _outVal: outVal,
      _outFormatted: formatContextWindow(outVal),
      _outSource: outSource,
      _outTitle: outSource === 'fallback'
        ? i.fallbackHint
        : outSource === 'user' ? i.outFromUser
        : outSource === 'catalog' ? i.outFromCatalog
        : i.outFromApi,
      _inCost:  inCost,
      _outCost: outCost,
      _inPriceFormatted:  formatPricePerMillion(inCost),
      _outPriceFormatted: formatPricePerMillion(outCost),
      _priceSource: priceSource || null,
      _hasPrice: hasPrice,
      _priceTitle: priceTitle,
    })
  }
  return out
})

// Shared label for the edit-limits pencil tooltip (cached for the same perf reason as modelListI18n).
const editModelLimitsLabel = computed(() => t('config.editModelLimits'))

const testableModels = computed(() => {
  if (!selectedProvider.value) return []
  const p = selectedProvider.value
  if (p.type === 'anthropic') {
    return [
      { id: p.model, label: p.model },
      { id: p.settings?.opusModel, label: p.settings?.opusModel },
      { id: p.settings?.haikuModel, label: p.settings?.haikuModel },
    ].filter(m => m.id)
  }
  if (p.model) return [{ id: p.model, label: p.model }]
  return filteredProviderModels.value.slice(0, 10).map(m => ({ id: m.id, label: m.id }))
})

function openUrl(url) {
  window.electronAPI?.openExternal(url)
}

function openAddProvider(preset) {
  addProviderPreset.value = preset
  addProviderName.value = ''
  addProviderProtocol.value = 'openai'
  showAddProviderModal.value = true
}

function confirmAddProvider() {
  const preset = addProviderPreset.value
  // Check preview limit before adding a new provider
  if (isLimitEnforced() && configStore.config.providers.length >= PREVIEW_LIMITS.maxProviders) {
    showAddProviderModal.value = false
    previewLimitMessage.value = t('limits.maxProviders')
    showPreviewLimitModal.value = true
    return
  }
  // Non-custom presets: if a provider of the same type already exists, select it instead of creating a duplicate
  if (preset !== 'custom') {
    const existing = configStore.config.providers.find(p => p.type === preset)
    if (existing) {
      modelsLeftNav.value = existing.id
      showAddProviderModal.value = false
      return
    }
  }
  const name = preset === 'custom' ? (addProviderName.value || 'Custom') : null
  const newProvider = configStore.addProvider(preset, name)
  if (preset === 'custom') {
    newProvider.settings.protocol = addProviderProtocol.value
  }
  modelsLeftNav.value = newProvider.id
  showAddProviderModal.value = false
}

function deleteProvider(id) {
  const provider = configStore.config.providers.find(p => p.id === id)
  deleteConfirmId.value = id
  deleteConfirmName.value = provider?.name || 'this provider'
  showDeleteConfirm.value = true
}

async function confirmDeleteProvider() {
  if (deleteConfirmId.value) {
    configStore.removeProvider(deleteConfirmId.value)
    if (modelsLeftNav.value === deleteConfirmId.value) {
      modelsLeftNav.value = configStore.config.providers.length > 0 ? configStore.config.providers[0].id : 'empty'
    }
    // Persist immediately — removeProvider() only mutates the in-memory array,
    // without saveConfig() the deletion is lost on next app start.
    await configStore.saveConfig({ providers: configStore.config.providers })
  }
  showDeleteConfirm.value = false
  deleteConfirmId.value = null
  deleteConfirmName.value = ''
}

async function testProviderNew() {
  if (!selectedProvider.value || testingProviderNew.value) return
  const myProviderId = selectedProvider.value.id
  testingProviderNew.value = true
  testResultNew.value = null
  testResultNewToken++
  try {
    // For non-Anthropic, test whichever model the user highlighted in the list
    // (testTargetModel) — falls back to the persisted default. Anthropic still
    // uses its dedicated dropdown since its model is set via sonnet/opus/haiku
    // override fields, not the model list.
    const model = selectedProvider.value.type === 'anthropic'
      ? selectedTestModel.value
      : effectiveTestModel.value
    const baseURL = selectedProvider.value.baseURL ||
      configStore.PROVIDER_PRESETS[selectedProvider.value.type]?.defaultBaseURL || ''
    const res = await window.electronAPI.testProvider({
      provider: selectedProvider.value.type,
      apiKey: selectedProvider.value.apiKey,
      baseURL,
      utilityModel: model,
    })
    // Guard: user may have switched providers while the request was in-flight
    if (selectedProvider.value?.id !== myProviderId) return
    if (res.success) {
      selectedProvider.value.testedAt = Date.now()
      const token = ++testResultNewToken
      testResultNew.value = { ok: true, message: `Connected · ${res.ms}ms · ${model}` }
      setTimeout(() => {
        if (testResultNewToken === token) testResultNew.value = null
      }, 5000)
      // After a successful test for a non-Anthropic provider, warn if the tested
      // model has no known context window (neither API / catalog / manual override).
      if (selectedProvider.value.type !== 'anthropic') {
        const m = model ? selectedProviderModels.value.find(x => x.id === model) : null
        if (m && !getEffectiveContext(m).value) {
          showMissingCtxWarning.value = true
        }
      }
    } else {
      testResultNew.value = { ok: false, message: res.error }
    }
    // The Test button used to flip provider.isActive; that gate is gone now —
    // a provider is usable in the agent picker as soon as it has an apiKey.
    // Test is still useful to verify creds, just doesn't drive any persisted
    // state beyond `testedAt` for the result hint.
    await configStore.saveConfig({ providers: configStore.config.providers })
  } catch (err) {
    if (selectedProvider.value?.id !== myProviderId) return
    testResultNew.value = { ok: false, message: err.message || 'Test failed' }
  } finally {
    if (selectedProvider.value?.id === myProviderId) {
      testingProviderNew.value = false
    }
  }
}

async function fetchProviderModels() {
  if (!selectedProvider.value) {
    providerModelsFetchError.value = 'Enter API key first.'
    return
  }
  // Ollama runs locally with no auth — apiKey is optional.
  if (selectedProvider.value.type !== 'ollama' && !selectedProvider.value.apiKey) {
    providerModelsFetchError.value = 'Enter API key first.'
    return
  }
  const type = selectedProvider.value.type
  const hasDefaultBaseURL = !!configStore.PROVIDER_PRESETS[type]?.defaultBaseURL
  if (type !== 'google' && !selectedProvider.value.baseURL && !hasDefaultBaseURL) {
    providerModelsFetchError.value = 'Enter API key and Base URL first.'
    return
  }
  providerModelsFetching.value = true
  providerModelsFetchError.value = ''
  try {
    const success = await modelsStore.fetchModelsForProvider(selectedProvider.value.id)
    if (success) {
      modelsFetchedOnce.value = true
      // Auto-pick the first model if the user hasn't picked one yet — the
      // model list used to be read-only, so existing providers may have an
      // empty `model` field. Auto-fill so the Test button has something to hit
      // and the provider's default model is set for any agent that doesn't
      // override it.
      const list = selectedProviderModels.value || []
      if (list.length > 0 && !selectedProvider.value.model) {
        selectedProvider.value.model = list[0].id
      }
      // Sync the test target so the user doesn't see the Test button as disabled
      // right after fetch finishes.
      if (!testTargetModel.value) {
        testTargetModel.value = selectedProvider.value.model || list[0]?.id || ''
      }
    } else {
      providerModelsFetchError.value = 'Fetch failed — check API key and Base URL.'
    }
  } catch (err) { providerModelsFetchError.value = err.message }
  finally { providerModelsFetching.value = false }
}

// Anthropic: Fetch latest models and auto-fill sonnet/opus/haiku slots.
// Strategy: GET /v1/models, group by tier (id contains 'opus'/'sonnet'/'haiku'),
// pick the lexicographically newest id per tier (Anthropic IDs encode date,
// e.g. claude-sonnet-4-5-20250929 sorts correctly).
const anthropicFetching = ref(false)
const anthropicFetchMsg = ref(null)
// Token-based generation counters — incremented every time a new banner is set
// or the user navigates away. The auto-dismiss callback only clears the banner
// if the token still matches, so a newer message (or a manual reset via the
// left-nav watcher) is never wiped by a stale timeout. Vue's ref(<object>)
// returns a reactive Proxy, so reference-equality comparison on .value would
// silently fail — that's why we track a primitive token instead.
let anthropicFetchToken = 0
let testResultNewToken = 0
let testUtilityModelToken = 0

async function fetchAnthropicLatestModels() {
  if (!selectedProvider.value || selectedProvider.value.type !== 'anthropic') return
  anthropicFetchToken++
  if (!selectedProvider.value.apiKey) {
    anthropicFetchMsg.value = { ok: false, text: 'Enter API key first.' }
    return
  }
  anthropicFetching.value = true
  anthropicFetchMsg.value = null
  try {
    const baseURL = selectedProvider.value.baseURL ||
      configStore.PROVIDER_PRESETS.anthropic?.defaultBaseURL || ''
    if (!baseURL) {
      anthropicFetchMsg.value = { ok: false, text: 'Base URL not configured.' }
      return
    }
    const result = await window.electronAPI.fetchAnthropicModels({
      apiKey: selectedProvider.value.apiKey,
      baseURL,
    })
    if (!result?.success) {
      anthropicFetchMsg.value = { ok: false, text: result?.error || 'Fetch failed.' }
      return
    }
    const models = result.models || []
    const pickLatest = (tier) => {
      const candidates = models.filter(m => String(m.id).toLowerCase().includes(tier))
      if (candidates.length === 0) return null
      // Prefer created_at if present; else lexicographic (date-suffixed ids sort correctly).
      candidates.sort((a, b) => {
        if (a.created_at && b.created_at) return String(b.created_at).localeCompare(String(a.created_at))
        return String(b.id).localeCompare(String(a.id))
      })
      return candidates[0].id
    }
    const opus = pickLatest('opus')
    const sonnet = pickLatest('sonnet')
    const haiku = pickLatest('haiku')
    if (!opus && !sonnet && !haiku) {
      anthropicFetchMsg.value = { ok: false, text: t('config.fetchAnthropicNoMatch') }
      return
    }
    const filled = []
    if (sonnet) { selectedProvider.value.model = sonnet; filled.push(`Sonnet=${sonnet}`) }
    if (opus) {
      if (!selectedProvider.value.settings) selectedProvider.value.settings = {}
      selectedProvider.value.settings.opusModel = opus
      filled.push(`Opus=${opus}`)
    }
    if (haiku) {
      if (!selectedProvider.value.settings) selectedProvider.value.settings = {}
      selectedProvider.value.settings.haikuModel = haiku
      filled.push(`Haiku=${haiku}`)
    }
    const token = ++anthropicFetchToken
    anthropicFetchMsg.value = {
      ok: true,
      text: t('config.fetchAnthropicSuccess').replace('{filled}', filled.join(', ')),
    }
    setTimeout(() => {
      if (anthropicFetchToken === token) anthropicFetchMsg.value = null
    }, 5000)
  } catch (err) {
    anthropicFetchMsg.value = { ok: false, text: err.message || String(err) }
  } finally {
    anthropicFetching.value = false
  }
}

async function enrichProviderContext() {
  if (!selectedProvider.value) return
  const result = await modelsStore.enrichContextWindows(selectedProvider.value.id)
  if (!result?.success) {
    providerModelsFetchError.value = result?.error
      ? `${t('config.aiFillContextFailed')} ${result.error}`
      : t('config.aiFillContextFailed')
  }
}

function getHardLimit(provider, key) {
  const { PROVIDER_PRESETS } = configStore
  const preset = PROVIDER_PRESETS[provider.type]
  return preset?.hardLimits?.[key]
}

// Per-model max output tokens helpers
// Format context window / token counts with K / M units.
// < 1000 → raw number, < 1_000_000 → "128K", ≥ 1_000_000 → "1M" / "1.04M"
function formatContextWindow(n) {
  if (!n || n <= 0) return ''
  if (n >= 1_000_000) {
    const m = n / 1_000_000
    return (m >= 10 ? Math.round(m) : Number(m.toFixed(2))) + 'M'
  }
  if (n >= 1000) return Math.round(n / 1000) + 'K'
  return String(n)
}

// Parse user input that may be "128K", "1M", "1.5M", "32000", etc.
// Returns an integer number of tokens, or 0 for invalid / empty input.
function parseTokenCount(input) {
  if (input == null) return 0
  const s = String(input).trim().toLowerCase().replace(/[,\s]/g, '')
  if (!s) return 0
  const m = s.match(/^([0-9]*\.?[0-9]+)\s*([km]?)$/)
  if (!m) {
    const n = Number(s)
    return Number.isFinite(n) && n > 0 ? Math.round(n) : 0
  }
  const value = parseFloat(m[1])
  if (!Number.isFinite(value) || value <= 0) return 0
  const unit = m[2]
  if (unit === 'k') return Math.round(value * 1000)
  if (unit === 'm') return Math.round(value * 1_000_000)
  return Math.round(value)
}

function getUserContextWindow(provider, modelId) {
  return provider?.modelSettings?.[modelId]?.contextWindow || null
}

function getUserMaxOutput(provider, modelId) {
  return provider?.modelSettings?.[modelId]?.maxOutputTokens || null
}

/** Returns { value: number|null, source: 'user' | 'api' | 'catalog' | null } */
function getEffectiveContext(model) {
  const uv = getUserContextWindow(selectedProvider.value, model.id)
  if (uv) return { value: uv, source: 'user' }
  if (model.context_length) return { value: model.context_length, source: model.contextSource || 'api' }
  return { value: null, source: null }
}

/** Returns { value: number|null, source: 'user' | 'api' | 'catalog' | 'fallback' | null } */
function getEffectiveMaxOutput(model) {
  const uv = getUserMaxOutput(selectedProvider.value, model.id)
  if (uv) return { value: uv, source: 'user' }
  if (model.max_output_tokens) return { value: model.max_output_tokens, source: model.maxOutputSource || 'api' }

  // Look up built-in defaults table (litellm catalog via backend helper)
  const id = (model.id || '').toLowerCase()
  const table = modelDefaultMaxOutput.value.table || {}
  let bestLen = 0
  let bestVal = null
  for (const [key, val] of Object.entries(table)) {
    const lk = key.toLowerCase()
    if ((id === lk || id.startsWith(lk)) && lk.length > bestLen) {
      bestLen = lk.length
      bestVal = val
    }
  }
  if (bestVal !== null) return { value: bestVal, source: 'catalog' }
  const fb = 32000
  return { value: fb, source: 'fallback' }
}

// ── Unified model-limits editor (context window + max output + pricing) ──────
const modelLimitsEditor = reactive({
  open: false,
  modelId: null,
  contextWindow: '',
  maxOutputTokens: '',
  contextDefault: null,
  maxOutputDefault: null,
  inputPrice: '',          // User-entered string, USD per 1M tokens
  outputPrice: '',
  inputPriceDefault: null, // USD per token (cost unit), or null
  outputPriceDefault: null,
})

// ── LiteLLM catalog (chat-model entries) — loaded lazily on first modal open ──
const catalogEntries = ref([])
const catalogLoading = ref(false)

// Catalog picker dialog state — separate from the model-limits editor so the
// dialog can layer on top, and so the dialog's search box doesn't churn the
// parent modal's computed graph.
const catalogDialogOpen = ref(false)
const catalogDialogQuery = ref('')
const catalogDialogInputRef = ref(null)

// The catalog entry the user picked (shown as a summary card in the main modal).
const selectedCatalogEntry = ref(null)

async function _ensureCatalogLoaded() {
  if (catalogEntries.value.length || !window.electronAPI?.getCatalogEntries) return
  catalogLoading.value = true
  try {
    const res = await window.electronAPI.getCatalogEntries()
    if (res?.entries?.length) catalogEntries.value = res.entries
  } catch (err) {
    console.warn('[modelLimits] failed to load catalog', err)
  } finally {
    catalogLoading.value = false
  }
}

// Client-side replica of `lookupModelCatalog` (electron/agent/modelDefaults.js):
// exact id → provider-prefixed id → bare id → longest-prefix match. Used to
// auto-surface the catalog entry that already matched this model so the user
// sees it next to the "Pick from catalog" button without lifting a finger.
const _CATALOG_PROVIDER_MAP = {
  openai_official: 'openai',
  anthropic: 'anthropic',
  deepseek: 'deepseek',
  qwen: 'dashscope',
  google: 'gemini',
  mistral: 'mistral',
  groq: 'groq',
  xai: 'xai',
}
function _findCatalogMatchFor(modelId, providerType) {
  if (!modelId || !catalogEntries.value.length) return null
  const id = String(modelId).toLowerCase()
  const litellmProvider = providerType ? _CATALOG_PROVIDER_MAP[providerType] : null
  const prefixed = litellmProvider ? `${litellmProvider}/${id}` : null
  for (const e of catalogEntries.value) {
    const lk = e.id.toLowerCase()
    if (lk === id || (prefixed && lk === prefixed)) return e
  }
  for (const e of catalogEntries.value) {
    const lk = e.id.toLowerCase()
    const bare = lk.includes('/') ? lk.split('/').pop() : lk
    if (bare === id) return e
  }
  let best = null, bestLen = 0
  for (const e of catalogEntries.value) {
    const lk = e.id.toLowerCase()
    const bare = lk.includes('/') ? lk.split('/').pop() : lk
    if (id.startsWith(bare) && bare.length > bestLen) {
      bestLen = bare.length
      best = e
    }
  }
  return best
}

// Ranked fuzzy match. Splits the query on whitespace, comma, slash, colon, or
// plus — so users can type `qwen flash 3.6`, `qwen + flash + 3.6`, `claude/sonnet`,
// etc. Every token must appear in the id (order-insensitive). Scoring: exact id
// match > bare-id exact > prefix > earliest-position hits.
//
// Empty query: return ALL entries sorted by provider then id so users can browse
// the catalog even without typing anything.
const catalogRanked = computed(() => {
  const raw = (catalogDialogQuery.value || '').trim().toLowerCase()
  if (!raw) {
    return [...catalogEntries.value].sort((a, b) => {
      const pa = (a.provider || '').localeCompare(b.provider || '')
      if (pa !== 0) return pa
      return a.id.localeCompare(b.id)
    })
  }
  const tokens = raw.split(/[\s,/:+]+/).filter(Boolean)
  if (tokens.length === 0) return []
  const scored = []
  for (const e of catalogEntries.value) {
    const id = e.id.toLowerCase()
    const bare = id.includes('/') ? id.split('/').pop() : id
    let hitAll = true
    let posSum = 0
    for (const tk of tokens) {
      const idx = id.indexOf(tk)
      if (idx < 0) { hitAll = false; break }
      posSum += idx
    }
    if (!hitAll) continue
    let score = -posSum
    if (id === raw) score += 1000
    else if (bare === raw) score += 900
    else if (id.startsWith(raw) || bare.startsWith(raw)) score += 400
    scored.push({ entry: e, score })
  }
  scored.sort((a, b) => b.score - a.score)
  return scored.map(s => s.entry)
})

// Infinite-scroll window: start with CATALOG_PAGE_SIZE rows, bump by the same
// amount when the user scrolls near the bottom of the list. Reset to one page
// whenever the query changes (so users always see "best first" at the top).
const CATALOG_PAGE_SIZE = 100
const catalogVisibleCount = ref(CATALOG_PAGE_SIZE)

const catalogResults = computed(() => catalogRanked.value.slice(0, catalogVisibleCount.value))

watch(catalogDialogQuery, () => {
  catalogVisibleCount.value = CATALOG_PAGE_SIZE
})

function onCatalogScroll(e) {
  const el = e.target
  if (!el) return
  // Trigger load when within ~240px of the bottom — bigger than one row height
  // so the next page is ready before the user actually hits the end.
  if (el.scrollHeight - el.scrollTop - el.clientHeight < 240) {
    const total = catalogRanked.value.length
    if (catalogVisibleCount.value < total) {
      catalogVisibleCount.value = Math.min(total, catalogVisibleCount.value + CATALOG_PAGE_SIZE)
    }
  }
}

async function openCatalogDialog() {
  // Seed the search box with the currently-selected/matched entry id so the
  // user sees what's active (combobox style). Clearing the box reveals the
  // full browseable list.
  const matched = selectedCatalogEntry.value
  catalogDialogQuery.value = matched?.id || ''
  catalogVisibleCount.value = CATALOG_PAGE_SIZE
  catalogDialogOpen.value = true
  await _ensureCatalogLoaded()
  await nextTick()
  catalogDialogInputRef.value?.focus?.()
  // Pre-select the seeded text so typing replaces it instantly.
  if (matched) catalogDialogInputRef.value?.select?.()
  // Make sure the selected/matched row is in the rendered window and scroll
  // it to center — users should see their current pick immediately.
  if (matched) {
    const idx = catalogRanked.value.findIndex(e => e.id === matched.id)
    if (idx >= 0 && idx >= catalogVisibleCount.value) {
      catalogVisibleCount.value = Math.max(CATALOG_PAGE_SIZE, idx + 20)
      await nextTick()
    }
    const el = document.querySelector('.cv-catalog-tr.active')
    if (el && typeof el.scrollIntoView === 'function') {
      el.scrollIntoView({ block: 'center', behavior: 'auto' })
    }
  }
}

function closeCatalogDialog() {
  catalogDialogOpen.value = false
}

function applyCatalogEntryFromDialog(entry) {
  if (!entry) return
  selectedCatalogEntry.value = entry
  if (entry.context_length) modelLimitsEditor.contextWindow = formatContextWindow(entry.context_length)
  if (entry.max_output_tokens) modelLimitsEditor.maxOutputTokens = formatContextWindow(entry.max_output_tokens)
  if (entry.input_cost_per_token  != null) modelLimitsEditor.inputPrice  = (entry.input_cost_per_token  * 1_000_000).toFixed(2)
  if (entry.output_cost_per_token != null) modelLimitsEditor.outputPrice = (entry.output_cost_per_token * 1_000_000).toFixed(2)
  closeCatalogDialog()
}

function clearSelectedCatalogEntry() {
  selectedCatalogEntry.value = null
}

function openModelLimitsEditor(model) {
  const provider = selectedProvider.value
  if (!provider) return

  // The caller may pass either an enriched row (has `_ctxVal` / `_outVal` / `_inCost`)
  // or a raw model entry (has `context_length` / `max_output_tokens` / `input_cost_per_token`).
  let ctxVal, outVal, outIsFallback, inCost, outCost, priceSource
  if ('_ctxVal' in model) {
    ctxVal = model._ctxVal ?? null
    outVal = model._outVal ?? null
    outIsFallback = model._outSource === 'fallback'
    inCost  = model._inCost  ?? null
    outCost = model._outCost ?? null
    priceSource = model._priceSource || null
  } else {
    const eff = getEffectiveContext(model)
    const out = getEffectiveMaxOutput(model)
    ctxVal = eff.value
    outVal = out.value
    outIsFallback = out.source === 'fallback'
    inCost  = model.input_cost_per_token  ?? null
    outCost = model.output_cost_per_token ?? null
    priceSource = model.priceSource || (inCost != null || outCost != null ? 'api' : null)
    // Apply per-model user override if present
    const s = provider.modelSettings?.[model.id] || null
    if (s?.inputCostPerToken  != null) { inCost  = s.inputCostPerToken;  priceSource = 'user' }
    if (s?.outputCostPerToken != null) { outCost = s.outputCostPerToken; priceSource = 'user' }
  }

  modelLimitsEditor.modelId = model.id
  modelLimitsEditor.contextWindow = ctxVal ? formatContextWindow(ctxVal) : ''
  modelLimitsEditor.maxOutputTokens = (outVal && !outIsFallback) ? formatContextWindow(outVal) : ''
  modelLimitsEditor.contextDefault = ctxVal
  modelLimitsEditor.maxOutputDefault = outIsFallback ? null : outVal
  modelLimitsEditor.inputPrice  = inCost  != null ? (inCost  * 1_000_000).toFixed(2) : ''
  modelLimitsEditor.outputPrice = outCost != null ? (outCost * 1_000_000).toFixed(2) : ''
  modelLimitsEditor.inputPriceDefault  = inCost
  modelLimitsEditor.outputPriceDefault = outCost
  // Reset catalog selection/dialog — each model opens fresh.
  selectedCatalogEntry.value = null
  catalogDialogOpen.value = false
  catalogDialogQuery.value = ''
  modelLimitsEditor.open = true
  // Load catalog, then try to auto-detect a match for this model id so the
  // user sees the current catalog match inline (next to the "Pick" button)
  // without having to open the picker first.
  const providerType = provider?.type || null
  const myModelId = model.id
  _ensureCatalogLoaded().then(() => {
    if (!modelLimitsEditor.open || modelLimitsEditor.modelId !== myModelId) return
    if (selectedCatalogEntry.value) return  // user already picked
    const match = _findCatalogMatchFor(myModelId, providerType)
    if (match) selectedCatalogEntry.value = match
  })
}

function closeModelLimitsEditor() {
  modelLimitsEditor.open = false
  modelLimitsEditor.modelId = null
}

function saveModelLimitsEditor() {
  const provider = selectedProvider.value
  const modelId = modelLimitsEditor.modelId
  if (!provider || !modelId) return closeModelLimitsEditor()

  if (!provider.modelSettings) provider.modelSettings = {}
  const bucket = provider.modelSettings[modelId] || {}

  // Context window: 1024 .. 10_000_000 tokens (accepts "128K", "1M", or raw digits)
  const ctxNum = parseTokenCount(modelLimitsEditor.contextWindow)
  if (!ctxNum) delete bucket.contextWindow
  else bucket.contextWindow = Math.min(10_000_000, Math.max(1024, ctxNum))

  // Max output: 256 .. 98304 tokens
  const outNum = parseTokenCount(modelLimitsEditor.maxOutputTokens)
  if (!outNum) delete bucket.maxOutputTokens
  else bucket.maxOutputTokens = Math.min(98304, Math.max(256, outNum))

  // Pricing: USD per 1M tokens → cost per token. Only persist when the user changed
  // the value away from the catalog/API default (so future catalog updates still apply).
  const inCostEntered  = parsePricePerMillion(modelLimitsEditor.inputPrice)
  const outCostEntered = parsePricePerMillion(modelLimitsEditor.outputPrice)
  const nearlyEqual = (a, b) => a != null && b != null && Math.abs(a - b) < 1e-12
  if (inCostEntered == null || nearlyEqual(inCostEntered, modelLimitsEditor.inputPriceDefault)) delete bucket.inputCostPerToken
  else bucket.inputCostPerToken = inCostEntered
  if (outCostEntered == null || nearlyEqual(outCostEntered, modelLimitsEditor.outputPriceDefault)) delete bucket.outputCostPerToken
  else bucket.outputCostPerToken = outCostEntered

  if (Object.keys(bucket).length === 0) delete provider.modelSettings[modelId]
  else provider.modelSettings[modelId] = bucket

  configStore.saveConfig(configStore.config)
  closeModelLimitsEditor()
}

// ── Missing-context warning (shown after a successful Test) ────────────────
const showMissingCtxWarning = ref(false)

function openEditorForSelected() {
  showMissingCtxWarning.value = false
  const modelId = selectedProvider.value?.model
  if (!modelId) return
  const m = selectedProviderModels.value.find(x => x.id === modelId) || { id: modelId }
  openModelLimitsEditor(m)
}

onMounted(async () => {
  const c = JSON.parse(JSON.stringify(configStore.config))
  delete c.defaultProvider

  if (c.voiceCall)    Object.assign(form.voiceCall, c.voiceCall)
  if (c.smtp)         Object.assign(form.smtp, c.smtp)
  if (c.utilityModel) Object.assign(form.utilityModel, c.utilityModel)

  // Load built-in model max output token defaults
  try { modelDefaultMaxOutput.value = await window.electronAPI.getAllDefaultMaxOutputTokens() } catch (_) {}

  // Check local voice server status immediately after config loaded
  if (form.voiceCall.mode === 'local') {
    checkLocalServerIfNeeded()
    detectGPU()
  }

  // Initialize left nav
  if (c.providers && c.providers.length > 0) {
    modelsLeftNav.value = c.providers[0].id
  } else {
    modelsLeftNav.value = 'empty'
  }
  
  form.im = {
    telegram: {
      enabled:      c.im?.telegram?.enabled      ?? false,
      botToken:     c.im?.telegram?.botToken      ?? '',
      allowedUsers: c.im?.telegram?.allowedUsers  ?? [],
    },
    whatsapp: {
      enabled:      c.im?.whatsapp?.enabled      ?? false,
      selfOnly:     c.im?.whatsapp?.selfOnly     !== false,  // default true
      allowedUsers: c.im?.whatsapp?.allowedUsers ?? [],
    },
    feishu: {
      enabled:      c.im?.feishu?.enabled      ?? false,
      appId:        c.im?.feishu?.appId        ?? '',
      appSecret:    c.im?.feishu?.appSecret    ?? '',
      allowedUsers: c.im?.feishu?.allowedUsers ?? [],
    },
    teams: {
      enabled:      c.im?.teams?.enabled      ?? false,
      tenantId:     c.im?.teams?.tenantId     ?? '',
      clientId:     c.im?.teams?.clientId     ?? '',
      selfOnly:     c.im?.teams?.selfOnly     !== false,  // default true
      allowedUsers: c.im?.teams?.allowedUsers ?? [],
      pollInterval: c.im?.teams?.pollInterval ?? 5,
    },
  }
  // Merge top-level scalar fields
  const NESTED_KEYS = new Set(['anthropic', 'openrouter', 'openai', 'deepseek', 'voiceCall', 'smtp', 'utilityModel'])
  for (const key of Object.keys(c)) {
    if (!NESTED_KEYS.has(key) && key in form) {
      form[key] = c[key]
    }
  }
  // Check knowledge embedding model status
  await knowledgeStore.checkModel()
  // Load data path from main process
  if (window.electronAPI?.getDataPath) {
    const info = await window.electronAPI.getDataPath()
    defaultDataPath.value = info.defaultDataPath || ''
    form.dataPath = info.dataPath || info.defaultDataPath || ''
    originalDataPath.value = form.dataPath
  }
  // Load env-backed paths (skillsPath, artifactPath)
  if (window.electronAPI?.getEnvPaths) {
    const envPaths = await window.electronAPI.getEnvPaths()
    form.skillsPath  = envPaths.skillsPath  || defaultSkillsPath.value
    form.artifactPath = envPaths.artifactPath || ''
    form.DoCPath      = envPaths.DoCPath      || defaultAidocPath.value
  }
  // Load sandboxConfig for security tab
  const sc = c.sandboxConfig || {}
  sandboxForm.defaultMode = sc.defaultMode || 'sandbox'
  sandboxForm.sandboxAllowList = JSON.parse(JSON.stringify(sc.sandboxAllowList || []))
  sandboxForm.dangerBlockList  = JSON.parse(JSON.stringify(sc.dangerBlockList  || []))
  // Load IM bridge status
  await loadIMStatus()
  // Seed connection state from current bridge status (handles case where
  // bridge was already running before ConfigView was opened)
  if (imStatus.value?.platforms?.whatsapp) {
    whatsappConnected.value = true
  }
  // Subscribe to WhatsApp QR / Ready events from main process
  if (window.electronAPI?.im?.onWhatsAppQr) {
    window.electronAPI.im.onWhatsAppQr((d) => {
      whatsappQr.value = d.qr
      whatsappConnected.value = false
    })
    window.electronAPI.im.onWhatsAppReady(async () => {
      whatsappConnected.value = true
      whatsappQr.value = null
      // Socket is now live — attach the real message handler and refresh status
      await window.electronAPI.im.startPlatform?.('whatsapp')
      await loadIMStatus()
    })
  }
  if (window.electronAPI?.im?.onPlatformStopped) {
    window.electronAPI.im.onPlatformStopped(async ({ platform }) => {
      if (platform === 'whatsapp') {
        whatsappConnected.value = false
        whatsappQr.value = null
      }
      // Refresh bridge status so toggle switches reflect reality
      await loadIMStatus()
    })
  }
  // Teams auth event listeners
  if (window.electronAPI?.im?.onTeamsDeviceCode) {
    window.electronAPI.im.onTeamsDeviceCode((d) => {
      teamsDeviceCode.value = { userCode: d.userCode, verificationUri: d.verificationUri }
    })
    window.electronAPI.im.onTeamsReady(async (d) => {
      teamsAuthStatus.value = { connected: true, displayName: d.displayName, userId: d.userId || '' }
      teamsDeviceCode.value = { userCode: '', verificationUri: '' }
      teamsAuthLoading.value = false
      await loadIMStatus()
    })
    window.electronAPI.im.onTeamsAuthError((d) => {
      teamsAuthLoading.value = false
      teamsDeviceCode.value = { userCode: '', verificationUri: '' }
      console.error('[im] Teams auth error:', d.error)
    })
  }
  // Seed Teams auth status from bridge status
  if (imStatus.value?.teamsAuth?.connected) {
    teamsAuthStatus.value = { connected: true, displayName: imStatus.value.teamsAuth.userDisplayName, userId: imStatus.value.teamsAuth.userId || '' }
  }

})

async function handleLanguageChange() {
  await configStore.saveConfig({ language: form.language })
}

// KeepAlive: re-hydrate Teams config from store when reactivated
onActivated(async () => {
  const c = configStore.config
  if (c.im?.teams) {
    form.im.teams = {
      enabled:      c.im.teams.enabled      ?? false,
      tenantId:     c.im.teams.tenantId     ?? '',
      clientId:     c.im.teams.clientId     ?? '',
      selfOnly:     c.im.teams.selfOnly     !== false,
      allowedUsers: c.im.teams.allowedUsers ?? [],
      pollInterval: c.im.teams.pollInterval ?? 10,
    }
  }
  await loadIMStatus()
  // Refresh Teams auth status
  if (imStatus.value?.teamsAuth?.connected) {
    teamsAuthStatus.value = { connected: true, displayName: imStatus.value.teamsAuth.userDisplayName, userId: imStatus.value.teamsAuth.userId || '' }
  }

  // Check local voice server status (after config loaded into form)
})

onUnmounted(() => {
  window.electronAPI?.im?.onWhatsAppQr?.(() => {})
  window.electronAPI?.im?.onWhatsAppReady?.(() => {})
  window.electronAPI?.im?.onPlatformStopped?.(() => {})
  window.electronAPI?.im?.onTeamsDeviceCode?.(() => {})
  window.electronAPI?.im?.onTeamsReady?.(() => {})
  window.electronAPI?.im?.onTeamsAuthError?.(() => {})
})

async function pickDataFolder() {
  const folder = await window.electronAPI?.obsidian?.pickFolder()
  if (folder) form.dataPath = folder
}

function copyDataPathCmd() {
  navigator.clipboard?.writeText(dataPathCopyCommand.value)
}

async function pickArtifactFolder() {
  const folder = await window.electronAPI?.obsidian?.pickFolder()
  if (folder) form.artifactPath = folder
}

async function pickAidocFolder() {
  const folder = await window.electronAPI?.obsidian?.pickFolder()
  if (folder) form.DoCPath = folder
}

async function applyDataPathAndRestart() {
  savingGeneral.value = true
  try {
    const newPath = (form.dataPath || '').trim()
    if (window.electronAPI?.saveDataPath) {
      const result = await window.electronAPI.saveDataPath(newPath)
      if (!result.success) throw new Error(result.error || 'Failed to save data path')
    }
    showDataPathWarning.value = false
    // Relaunch the app so the new data path takes effect
    await window.electronAPI?.relaunchApp?.()
  } catch (err) {
    savedGeneralMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
    showDataPathWarning.value = false
  } finally {
    savingGeneral.value = false
  }
}

async function saveGeneral() {
  savingGeneral.value = true
  try {
    // Save artifactPath to config
    await configStore.saveEnvPath('artifactPath', String(form.artifactPath))
    savedGeneralMsg.value = { ok: true, text: t('config.saved') }
  } catch (err) {
    savedGeneralMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
  } finally {
    savingGeneral.value = false
    setTimeout(() => { savedGeneralMsg.value = '' }, 4000)
  }
}

async function saveSkillsPath() {
  savingSkillsPath.value = true
  try {
    await configStore.saveEnvPath('skillsPath', String(form.skillsPath))
    savedSkillsPathMsg.value = { ok: true, text: t('config.saved') }
  } catch (err) {
    savedSkillsPathMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
  } finally {
    savingSkillsPath.value = false
    setTimeout(() => { savedSkillsPathMsg.value = null }, 4000)
  }
}

async function saveAidocPath() {
  savingAidocPath.value = true
  try {
    const newPath = String(form.DoCPath)
    await configStore.saveEnvPath('DoCPath', newPath)
    await obsidianStore.setVaultManually(newPath)
    savedAidocPathMsg.value = { ok: true, text: t('config.saved') }
  } catch (err) {
    savedAidocPathMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
  } finally {
    savingAidocPath.value = false
    setTimeout(() => { savedAidocPathMsg.value = null }, 4000)
  }
}

async function saveModels() {
  // Validate utility model when on utility page: must be filled AND tested
  if (modelsLeftNav.value === 'utility') {
    if (!form.utilityModel.provider || !form.utilityModel.model) {
      savedModelsMsg.value = { ok: false, text: t('config.utilityModelRequired') }
      setTimeout(() => { savedModelsMsg.value = '' }, 5000)
      return
    }
    if (!testUtilityModelResult.value?.ok) {
      savedModelsMsg.value = { ok: false, text: t('config.utilityModelTestFirst') }
      setTimeout(() => { savedModelsMsg.value = '' }, 5000)
      return
    }
  }
  savingModels.value = true
  try {
    const modelFields = JSON.parse(JSON.stringify(form))
    delete modelFields.skillsPath
    delete modelFields.dataPath
    delete modelFields.artifactPath
    delete modelFields.DoCPath
    delete modelFields.voiceCall
    // Include providers from configStore
    modelFields.providers = JSON.parse(JSON.stringify(configStore.config.providers))
    // Utility model is only persisted when the save originates from the utility
    // page (where validation + test gating runs). For saves triggered from any
    // other models sub-page, reuse the last-known-good utilityModel from
    // configStore so unsaved/untested edits on the utility page never leak.
    if (modelsLeftNav.value !== 'utility') {
      modelFields.utilityModel = JSON.parse(JSON.stringify(
        configStore.config.utilityModel || { provider: '', model: '' }
      ))
    }
    await configStore.saveConfig(modelFields)
    savedModelsMsg.value = { ok: true, text: t('common.successSaved') }
  } catch (err) {
    savedModelsMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
  } finally {
    savingModels.value = false
    setTimeout(() => { savedModelsMsg.value = '' }, 3000)
  }
}

async function saveSkills() {
  savingSkills.value = true
  try {
    await configStore.saveEnvPath('skillsPath', String(form.skillsPath))
    savedSkillsMsg.value = { ok: true, text: t('common.successSaved') }
  } catch (err) {
    savedSkillsMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
  } finally {
    savingSkills.value = false
    setTimeout(() => { savedSkillsMsg.value = '' }, 3000)
  }
}

// ── Local Voice helpers ──────────────────────────────────────────────────
const defaultLocalInstallPath = ref('')

async function loadDefaultInstallPath() {
  try {
    const result = await window.electronAPI.getDataPath()
    const dir = result?.dataPath || result?.defaultDataPath || ''
    const sep = result?.platform === 'win32' ? '\\' : '/'
    defaultLocalInstallPath.value = dir + sep + 'local-voice-env'
    // Set the actual form value if not already customized
    if (!form.voiceCall.local.installPath) {
      form.voiceCall.local.installPath = defaultLocalInstallPath.value
    }
  } catch {}
}
loadDefaultInstallPath()

const localEnvDetail = ref(null)  // { packages, sttModel, ttsModel, reason }
const localEnvChecking = ref(false)
const localEnvCheckLog = ref('')

function voiceConfigToSave() {
  const v = JSON.parse(JSON.stringify(form.voiceCall))
  delete v.local?.isReady  // always computed at runtime, never persisted
  return v
}

async function checkLocalServerIfNeeded() {
  localEnvChecking.value = true
  localEnvCheckLog.value = ''
  try {
    const envCheck = await window.electronAPI.voice.localCheckEnv()
    localEnvDetail.value = envCheck
    form.voiceCall.local.isReady = envCheck.ready
    localEnvCheckLog.value = envCheck.ready ? t('config.envReady') : (envCheck.reason || t('config.envNotReady'))
  } catch (err) {
    localEnvCheckLog.value = `Check failed: ${err.message}`
  } finally {
    localEnvChecking.value = false
  }
}

async function setupLocalEnv() {
  settingUpLocalEnv.value = true
  localSetupProgress.value = null
  localSetupError.value = null
  // Save installPath to config first so all operations use the same path
  await configStore.saveConfig({ voiceCall: voiceConfigToSave() })
  // Mark as not ready during setup — will be set to true only on success
  form.voiceCall.local.isReady = false
  const cleanup = window.electronAPI.voice.onSetupProgress((data) => {
    localSetupProgress.value = data
    if (data.step === 'error') localSetupError.value = data.message
  })
  try {
    const result = await window.electronAPI.voice.localSetupEnv()
    if (result.success) {
      form.voiceCall.local.isReady = true
    } else {
      form.voiceCall.local.isReady = false
      localSetupError.value = result.error
    }
    await configStore.saveConfig({ voiceCall: voiceConfigToSave() })
  } catch (err) {
    localSetupError.value = err.message
  } finally {
    settingUpLocalEnv.value = false
    cleanup()
  }
}


async function removeLocalEnv() {
  removingLocalEnv.value = true
  try {
    await window.electronAPI.voice.removeLocalEnv()
    form.voiceCall.local.isReady = false
    localEnvDetail.value = null
    localEnvCheckLog.value = ''
  } catch (err) {
    testResultLocal.value = { ok: false, message: err.message }
  } finally {
    removingLocalEnv.value = false
  }
}

async function testLocalVoice() {
  testingLocal.value = true
  testResultLocal.value = null
  try {
    const result = await window.electronAPI.voice.localTest()
    if (result.success) {
      testResultLocal.value = { ok: true, message: t('config.localTestSuccess') }
    } else {
      testResultLocal.value = { ok: false, message: result.error || t('config.localTestFailed') }
    }
  } catch (err) {
    testResultLocal.value = { ok: false, message: err.message }
  } finally {
    testingLocal.value = false
  }
}

async function saveVoice() {
  savingVoice.value = true
  try {
    await configStore.saveConfig({ voiceCall: voiceConfigToSave() })
    savedVoiceMsg.value = { ok: true, text: t('common.successSaved') }
  } catch (err) {
    savedVoiceMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
  } finally {
    savingVoice.value = false
    setTimeout(() => { savedVoiceMsg.value = null }, 3000)
  }
}

async function testWhisperConnection() {
  const key = form.voiceCall.whisperApiKey
  if (!key) { testResultWhisper.value = { ok: false, message: 'Enter a Whisper API key first.' }; return }
  testingWhisper.value = true
  testResultWhisper.value = null
  try {
    // Send a tiny silent WAV to Whisper to verify credentials
    const baseURL = (form.voiceCall.whisperBaseURL || 'https://api.openai.com').replace(/\/+$/, '')
    const directAuth = form.voiceCall.whisperDirectAuth === true
    const url = directAuth ? `${baseURL}/v1/models` : `${baseURL}/proxy/openai/v1/models`
    const authHeader = directAuth ? { 'Authorization': `Bearer ${key}` } : { 'x-api-key': key }
    const resp = await fetch(url, { headers: authHeader })
    if (resp.ok) {
      testResultWhisper.value = { ok: true, message: 'Connected — Whisper API key is valid' }
      form.voiceCall.isActive = true
      await configStore.saveConfig({ voiceCall: voiceConfigToSave() })
    } else {
      const body = await resp.text()
      testResultWhisper.value = { ok: false, message: `API error ${resp.status}: ${body.slice(0, 120)}` }
      form.voiceCall.isActive = false
    }
  } catch (err) {
    testResultWhisper.value = { ok: false, message: err.message }
    form.voiceCall.isActive = false
  } finally {
    testingWhisper.value = false
  }
}

// demoTts() removed — TTS is Edge TTS only, preview via previewVoice()

async function saveEmail() {
  savingEmail.value = true
  try {
    await configStore.saveConfig({ smtp: JSON.parse(JSON.stringify(form.smtp)) })
    await syncSmtpTool()
    savedEmailMsg.value = { ok: true, text: t('common.successSaved') }
  } catch (err) {
    savedEmailMsg.value = { ok: false, text: err.message || t('common.saveFailed') }
  } finally {
    savingEmail.value = false
    setTimeout(() => { savedEmailMsg.value = null }, 3000)
  }
}

// Auto-create / update a default SMTP tool so the host is reflected in the tool name.
// Option A: single source of truth — one SMTP tool, renamed in place when host changes.
async function syncSmtpTool() {
  const host = (form.smtp.host || '').trim()
  const user = (form.smtp.user || '').trim()
  if (!host) return
  try {
    if (!toolsStore.tools.length) await toolsStore.loadTools()
    const existing = toolsStore.tools.find(x => x.type === 'smtp')
    const name = t('tools.smtpAutoName', { host })
    const description = t('tools.smtpAutoDescription', { host, user: user || host })
    if (existing) {
      if (existing.name === name && existing.description === description) return
      await toolsStore.saveTool({ ...existing, name, description })
    } else {
      await toolsStore.saveTool({
        id: `smtp-${host.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`,
        type: 'smtp',
        name,
        description,
        category: t('tools.smtp'),
      })
    }
  } catch (err) {
    // Non-fatal — config was already saved; just log.
    console.warn('[ConfigView] syncSmtpTool failed:', err?.message || err)
  }
}

async function testSmtpConnection() {
  if (!form.smtp.host || !form.smtp.user || !form.smtp.pass) {
    testResultSmtp.value = { ok: false, message: t('config.smtpTestFillFirst') }
    return
  }
  if (!window.electronAPI?.testSmtp) {
    testResultSmtp.value = { ok: false, message: 'Not running inside Electron.' }
    return
  }
  testingSmtp.value = true
  testResultSmtp.value = null
  try {
    const result = await window.electronAPI.testSmtp(JSON.parse(JSON.stringify(form.smtp)))
    testResultSmtp.value = result.success
      ? { ok: true, message: t('config.smtpTestSuccess') }
      : { ok: false, message: result.error || t('config.smtpTestFailed') }
  } catch (err) {
    testResultSmtp.value = { ok: false, message: err.message }
  } finally {
    testingSmtp.value = false
  }
}

async function checkKnowledgeModelIfNeeded() {
  knowledgeModelChecking.value = true
  try {
    await knowledgeStore.checkModel()
  } finally {
    knowledgeModelChecking.value = false
  }
}

</script>

<style scoped>
/* ══════════════════════════════════════════════════════════════════════════
   CONFIG PAGE — Matches Sidebar / ChatsView / AgentsView design language
   ══════════════════════════════════════════════════════════════════════════ */

.config-page { height: 100%; display: flex; flex-direction: column; overflow: hidden; background: var(--bg-main); }

/* ── Header ─────────────────────────────────────────────────────────────── */
.config-header { padding: 24px 32px 20px; background: var(--bg-card); border-bottom: 1px solid var(--border); flex-shrink: 0; }
.config-header-top { display: flex; align-items: flex-start; justify-content: space-between; }
.config-title { font-family: 'Inter', sans-serif; font-size: var(--fs-page-title); font-weight: 700; color: var(--text-primary); margin: 0; }
.config-subtitle { font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: var(--text-primary); margin: 4px 0 0 0; }

/* ── Primary tab bar ────────────────────────────────────────────────────── */
.config-primary-tabs {
  display: flex;
  gap: 4px;
  padding: 0 1.5rem;
  border-bottom: 1px solid var(--border);
  background: var(--bg-card);
  flex-shrink: 0;
}
.config-primary-tab {
  display: flex;
  align-items: center;
  gap: 0.4375rem;
  padding: 0.75rem 1.125rem;
  border: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-secondary);
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
  transition: color 0.15s, border-color 0.15s;
}
.config-primary-tab:hover { color: var(--text-primary); }
.config-primary-tab.active {
  color: var(--text-primary);
  border-bottom-color: var(--text-primary);
}
.config-tab-icon { width: 16px; height: 16px; flex-shrink: 0; }

/* ── Two-column body ─────────────────────────────────────────────────────── */
.config-body {
  display: flex;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

/* ── Left sub-nav ────────────────────────────────────────────────────────── */
.config-subnav {
  width: 11rem;
  min-width: 11rem;
  padding: 0.75rem 0.5rem;
  border-right: 1px solid var(--border);
  background: var(--bg-card);
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  overflow-y: auto;
  flex-shrink: 0;
}
@media (min-width: 2560px) {
  .config-subnav { width: 12.5rem; min-width: 12.5rem; }
}
.config-subnav-group-toggle {
  color: var(--c-text-muted);
  font-weight: 600;
}
.config-subnav-item {
  display: flex;
  align-items: center;
  gap: 0.5625rem;
  padding: 0.5625rem 0.75rem;
  border: none;
  border-radius: 0.625rem;
  background: transparent;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: var(--text-secondary);
  text-align: left;
  transition: all 0.15s ease;
  width: 100%;
}
.config-subnav-item:hover:not(.active) {
  background: var(--bg-hover);
  color: var(--text-primary);
}
.config-subnav-item.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.config-subnav-icon {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
}
.config-subnav-label { flex: 1; }
.config-subnav-dot {
  width: 0.375rem;
  height: 0.375rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.config-subnav-dot { background: #EF4444; }
.config-subnav-item.active .config-subnav-dot { background: #FCA5A5; }

/* ── Content area ───────────────────────────────────────────────────────── */
.config-content { flex: 1; min-width: 0; overflow-y: auto; padding: 1.5rem 2rem 5rem; scrollbar-width: thin; }
.config-content-inner { max-width: 860px; width: 100%; margin: 0 auto; display: flex; flex-direction: column; gap: 20px; }
/* Models page needs the full viewport height — disable scroll on parent, let inner fill */
.config-content:has(.models-page-layout) { overflow-y: hidden; padding-bottom: 1.5rem; display: flex; flex-direction: column; }
/* Models page: stretch the inner full-width so the left nav sits flush against
   the config sidebar (only the parent's 2rem padding separates them) and the
   right config-card uses every remaining pixel up to the viewport edge. */
.config-content-inner:has(.models-page-layout) { max-width: none; flex: 1; min-height: 0; }
@media (min-width: 2560px) {
  .config-content-inner { max-width: 1000px; }
  .config-content-inner:has(.models-page-layout) { max-width: none; }
}

/* ── Provider tabs ──────────────────────────────────────────────────────── */
.provider-tab-group { display: flex; gap: 2px; margin-bottom: 4px; }
.config-tab-btn {
  display: flex; align-items: center; gap: 7px; padding: 8px 16px; border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 500;
  color: var(--text-primary); background: transparent; border: none; cursor: pointer; transition: all 0.15s ease;
}
.config-tab-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.config-tab-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

/* ── Config card ────────────────────────────────────────────────────────── */
.config-card {
  background: var(--bg-card); border: 1px solid var(--border); border-radius: var(--radius-lg);
  padding: 20px; box-shadow: 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02);
}

/* ── Form elements ──────────────────────────────────────────────────────── */
.form-group { margin-bottom: 16px; }
.form-group:last-child { margin-bottom: 0; }
.form-group.compact { margin-bottom: 10px; }
.form-label { display: block; margin-bottom: 6px; font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 500; color: var(--text-primary); }
.form-label-hint { color: var(--text-muted); font-weight: 400; margin-left: 0.25rem; font-size: var(--fs-caption); font-family: 'JetBrains Mono', monospace; }
.form-divider { height: 1px; background: var(--border); margin: 1rem 0; }


.form-section-header { display: flex; align-items: center; gap: 0.5rem; margin-bottom: 0.75rem; }
.form-section-header:has(.header-actions) { justify-content: space-between; }
.header-actions { display: flex; align-items: center; gap: 0.5rem; }
.section-icon-sm { width: 1.75rem; height: 1.75rem; border-radius: 0.4375rem; display: flex; align-items: center; justify-content: center; background: var(--text-primary); color: #fff; flex-shrink: 0; }
.form-section-title { font-family: 'Inter', sans-serif; font-size: var(--fs-body); font-weight: 700; color: var(--text-primary); margin: 0; }
.hint { margin-top: 4px; color: var(--text-primary); font-family: 'Inter', sans-serif; font-size: var(--fs-caption); }
.selected-hint { color: var(--text-primary); }

/* ── Input fields ───────────────────────────────────────────────────────── */
.field {
  width: 100%; display: block; padding: 9px 12px; border-radius: var(--radius-sm);
  background: var(--bg-card); border: 1px solid var(--border); color: var(--text-primary);
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.field::placeholder { color: var(--text-muted); }
.field:focus { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06); }
.field-sm { font-size: var(--fs-secondary); }
.input-with-action { position: relative; }
.input-with-action .field { padding-right: 38px; }
.field-action-btn {
  position: absolute; right: 8px; top: 50%; transform: translateY(-50%);
  background: none; border: none; color: var(--text-muted); cursor: pointer;
  padding: 4px; border-radius: 4px; transition: color 0.15s;
}
.field-action-btn:hover { color: var(--text-primary); }

/* ── Input with trailing button ────────────────────────────────────────── */
.input-with-trailing-btn { display: flex; gap: 6px; align-items: stretch; }
.input-with-trailing-btn .field { flex: 1; }
.field-action-btn.danger:hover { color: #FF3B30; }

/* ── Icon sizes ─────────────────────────────────────────────────────────── */
.icon-sm { width: 18px; height: 18px; flex-shrink: 0; }
.icon-xs { width: 14px; height: 14px; flex-shrink: 0; }

/* ── Models grid ────────────────────────────────────────────────────────── */
.models-grid { display: flex; flex-direction: column; gap: 0; }

/* ── Model list area ────────────────────────────────────────────────────── */
.model-list-area { display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.75rem; }

/* ── Model filter + select ──────────────────────────────────────────────── */
.model-filter {
  width: 100%; display: block;
  padding: 0.5rem 0.75rem;
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  border: 1px solid var(--border);
  color: var(--text-primary);
  font-size: var(--fs-secondary);
  outline: none;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.model-filter::placeholder { color: var(--text-muted); }
.model-filter:focus { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }

.model-list {
  width: 100%;
  max-height: 12rem;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--bg-card);
  padding: 0.25rem;
  scrollbar-width: thin;
  scrollbar-color: #D1D1D6 transparent;
}
.model-list:focus-within { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }

.model-list-item {
  padding: 0.3125rem 0.5rem;
  border-radius: 0.375rem;
  font-size: var(--fs-caption);
  color: var(--text-primary);
  cursor: pointer;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transition: background 0.1s, color 0.1s;
  user-select: none;
}
.model-list-item:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); color: #FFFFFF; }
.model-list-item.selected {
  background: #1A1A1A;
  color: #FFFFFF;
}

/* ── Bundled-model info card (read-only) ────────────────────────────────── */
.bundled-model-info {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.75rem 0.875rem;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
}
.bundled-model-row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  font-size: var(--fs-secondary);
}
.bundled-model-label {
  color: var(--text-muted);
  min-width: 5.5rem;
  font-weight: 500;
}
.bundled-model-value {
  color: var(--text-primary);
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-caption);
  word-break: break-all;
}

/* ── Test connection row ────────────────────────────────────────────────── */
.test-connection-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
.test-result {
  display: flex; align-items: flex-start; gap: 8px; margin-top: 10px; padding: 10px 14px;
  border-radius: var(--radius-sm); font-family: 'Inter', sans-serif; font-size: var(--fs-secondary);
  font-weight: 600; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.test-result.success { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #FFFFFF; }
.test-result.success .icon-sm { color: #FFFFFF; }
.test-result.error { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); color: #FF6B6B; }
.test-result.error .icon-sm { color: #FF6B6B; }

/* ── Simple test row (selected model label + Test button) ───────────────── */
.test-simple-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 0.75rem;
}
.test-selected-label {
  font-size: var(--fs-caption);
  color: var(--text-muted);
  font-family: 'JetBrains Mono', monospace;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* ── Provider status dot on tab buttons ────────────────────────────────── */
.prov-dot {
  width: 8px; height: 8px; border-radius: 50%; flex-shrink: 0; margin-left: 2px;
}
.prov-dot.active   { background: #22c55e; box-shadow: 0 0 6px rgba(34,197,94,0.5); }
.prov-dot.inactive { background: #9CA3AF; }
.prov-dot.pending  { background: #F59E0B; box-shadow: 0 0 4px rgba(245,158,11,0.5); }
.cfg-required { color: #EF4444; margin-left: 2px; }
.cfg-hint { display: block; font-size: var(--fs-caption); color: var(--text-muted); margin-bottom: 6px; line-height: 1.4; }

/* ── Save row ───────────────────────────────────────────────────────────── */
.save-row { display: flex; align-items: center; gap: 12px; margin-top: 1rem; }
.save-row.fixed-bottom {
  position: fixed;
  bottom: 1.5rem;
  left: 280px;
  z-index: 10;
  background: var(--bg-page, #F2F2F7);
  padding: 0.5rem 1rem;
  border-radius: var(--radius-md);
}
.save-indicator {
  display: inline-flex; align-items: center; gap: 6px;
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  padding: 6px 14px; border-radius: 8px; animation: fadeIn 0.2s ease;
}
.save-indicator.success { background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); color: #FFFFFF; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); }
.save-indicator.error { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); color: #FF6B6B; box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08); }

.about-version-row {
  margin-bottom: 0.875rem;
  font-size: var(--fs-body);
  color: var(--text-secondary);
  font-variant-numeric: tabular-nums;
}
.about-version-label { font-family: 'Inter', sans-serif; }
.about-actions-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex-wrap: wrap;
}
.about-status {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  font-size: var(--fs-secondary);
  font-weight: 500;
  animation: fadeIn 0.2s ease;
}
.about-status.is-success { color: var(--text-secondary); }
.about-status.is-info    { color: #3B82F6; }
.about-status.is-error   { color: #EF4444; }

@keyframes fadeIn {
  from { opacity: 0; transform: translateY(2px); }
  to   { opacity: 1; transform: translateY(0); }
}

/* ── Inline code ────────────────────────────────────────────────────────── */
.inline-code {
  font-family: 'JetBrains Mono', monospace; font-size: 0.85em;
  background: var(--accent-light, rgba(0,122,255,0.08)); color: var(--accent, #007AFF);
  padding: 1px 4px; border-radius: 4px;
}

/* ── Security tab ───────────────────────────────────────────────────────── */
.sec-mode-btns {
  display: flex; gap: 8px; flex-wrap: wrap;
}
.sec-mode-btn {
  display: flex; align-items: center; gap: 6px;
  padding: 7px 14px; border-radius: 8px; border: 1px solid #E5E5EA;
  background: #FFFFFF; color: #6B7280; font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary); font-weight: 600; cursor: pointer;
  transition: all 0.15s ease;
}
.sec-mode-btn:hover { border-color: #1A1A1A; color: #1A1A1A; }
.sec-mode-btn.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent; color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.sec-mode-badge {
  font-size: 0.65rem; font-weight: 700; letter-spacing: 0.04em;
  background: rgba(255,255,255,0.15); padding: 1px 5px; border-radius: 99px;
}
.sec-mode-btn:not(.active) .sec-mode-badge {
  background: #F0F0F0; color: #9CA3AF;
}
/* ── TTS option list ────────────────────────────────────────────────────── */
.tts-option-list { display: flex; flex-direction: column; gap: 0.5rem; }
.tts-option {
  display: flex; align-items: center; justify-content: space-between; gap: 1rem;
  padding: 0.75rem 1rem; border-radius: var(--radius-md); border: 1px solid var(--border);
  background: var(--bg-card); cursor: pointer; transition: all 0.15s ease;
}
.tts-option:hover { border-color: #C0C0C0; background: var(--bg-hover); }
.tts-option.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.tts-option-left { display: flex; align-items: center; gap: 0.75rem; flex: 1; min-width: 0; }
.tts-option-icon {
  width: 2rem; height: 2rem; border-radius: 0.5rem; flex-shrink: 0;
  display: flex; align-items: center; justify-content: center;
  background: rgba(0,0,0,0.06); color: #6B7280;
  transition: all 0.15s ease;
}
.tts-option.active .tts-option-icon { background: rgba(255,255,255,0.12); color: #FFFFFF; }
.tts-option-name {
  font-family: 'Inter', sans-serif; font-size: var(--fs-secondary); font-weight: 600;
  color: var(--text-primary); display: flex; align-items: center; gap: 0.375rem;
}
.tts-option.active .tts-option-name { color: #FFFFFF; }
.tts-option-desc {
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); color: var(--text-muted);
  margin-top: 0.125rem; line-height: 1.4;
}
.tts-option.active .tts-option-desc { color: rgba(255,255,255,0.55); }
.tts-cost-badge {
  font-size: 0.625rem; font-weight: 700; letter-spacing: 0.04em;
  background: rgba(0,0,0,0.07); color: #6B7280;
  padding: 1px 5px; border-radius: 99px;
}
.tts-option.active .tts-cost-badge { background: rgba(255,255,255,0.15); color: rgba(255,255,255,0.7); }
.tts-demo-btn {
  display: flex; align-items: center; gap: 0.3125rem; flex-shrink: 0;
  padding: 0.3125rem 0.625rem; border-radius: var(--radius-sm);
  border: 1px solid rgba(0,0,0,0.1); background: rgba(0,0,0,0.04);
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); font-weight: 600;
  color: var(--text-secondary); cursor: pointer; transition: all 0.15s ease;
  white-space: nowrap;
}
.tts-demo-btn:hover:not(:disabled) { background: rgba(0,0,0,0.08); color: var(--text-primary); }
.tts-demo-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.tts-demo-btn.playing { background: rgba(0,0,0,0.08); color: var(--text-primary); }
.tts-option.active .tts-demo-btn {
  border-color: rgba(255,255,255,0.2); background: rgba(255,255,255,0.1); color: #FFFFFF;
}
.tts-option.active .tts-demo-btn:hover:not(:disabled) { background: rgba(255,255,255,0.18); }
.tts-option.active .tts-demo-btn.playing { background: rgba(255,255,255,0.18); }

.sec-count-badge {
  display: inline-flex; align-items: center; justify-content: center;
  min-width: 18px; height: 18px; padding: 0 5px;
  background: #F0F0F0; color: #6B7280;
  border-radius: 99px; font-size: 0.65rem; font-weight: 700;
  margin-left: 6px; vertical-align: middle;
}
.sec-count-badge.danger { background: rgba(239,68,68,0.1); color: #DC2626; }
.sec-list {
  display: flex; flex-direction: column; gap: 4px; margin-bottom: 10px;
  max-height: 220px; overflow-y: auto;
}
.sec-list-empty {
  font-size: var(--fs-caption); color: #9CA3AF;
  padding: 8px 0; font-style: italic;
}
.sec-list-entry {
  display: flex; align-items: center; justify-content: space-between; gap: 8px;
  padding: 7px 10px; background: #F9F9F9; border: 1px solid #E5E5EA;
  border-radius: 8px;
}
.sec-entry-info {
  display: flex; flex-direction: column; gap: 2px; flex: 1; min-width: 0;
}
.sec-entry-pattern {
  font-family: 'JetBrains Mono', monospace; font-size: 0.75rem;
  color: #1A1A1A; font-weight: 600;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sec-entry-pattern.danger { color: #DC2626; }
.sec-entry-desc {
  font-size: var(--fs-small); color: #9CA3AF;
  white-space: nowrap; overflow: hidden; text-overflow: ellipsis;
}
.sec-entry-delete {
  display: flex; align-items: center; justify-content: center;
  width: 22px; height: 22px; flex-shrink: 0;
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  border-radius: 6px; color: #DC2626; cursor: pointer; transition: all 0.15s;
}
.sec-entry-delete:hover { background: rgba(239,68,68,0.18); }
.sec-add-row {
  display: flex; gap: 6px; align-items: center; margin-top: 2px;
}
.sec-add-input {
  flex: 1; min-width: 0; padding: 6px 10px;
  background: #FFFFFF; border: 1px solid #E5E5EA;
  border-radius: 8px; color: #1A1A1A;
  font-family: 'Inter', sans-serif; font-size: var(--fs-caption); outline: none;
  transition: border-color 0.15s;
}
.sec-add-input:focus { border-color: #1A1A1A; }
.sec-add-input::placeholder { color: #9CA3AF; }
.sec-add-btn {
  padding: 6px 14px; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none; border-radius: 8px; color: #FFFFFF; font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption); font-weight: 600; cursor: pointer; transition: all 0.15s;
  white-space: nowrap; box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.sec-add-btn:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }
.sec-add-btn:disabled { opacity: 0.4; cursor: not-allowed; }
.sec-add-btn.danger {
  background: rgba(239,68,68,0.08); border: 1px solid rgba(239,68,68,0.2);
  color: #DC2626; box-shadow: none;
}
.sec-add-btn.danger:hover { background: rgba(239,68,68,0.18); }

/* ── Voice tab ─────────────────────────────────────────────────────────── */
.vad-advanced-toggle {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  background: none;
  border: none;
  color: var(--c-text-secondary);
  font-size: var(--fs-base);
  font-weight: 600;
  cursor: pointer;
  padding: 0;
}
.vad-advanced-toggle:hover { color: var(--c-text-primary); }
.vad-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 20px;
  margin-bottom: 4px;
}
.vad-slider {
  width: 100%;
  accent-color: var(--text-primary);
  cursor: pointer;
  margin: 6px 0 2px;
}
.vad-slider-labels {
  display: flex;
  justify-content: space-between;
  font-size: var(--fs-small);
  color: var(--text-muted);
  margin-bottom: 4px;
}

/* Shared action button (used for delete-provider, etc.) */
.action-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  border-radius: var(--radius-sm, 0.5rem);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  white-space: nowrap;
  flex-shrink: 0;
}
.action-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
.action-btn:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.action-btn.icon-only {
  width: 2rem;
  height: 2rem;
  padding: 0;
  justify-content: center;
}
.action-btn.danger {
  background: linear-gradient(135deg, #DC2626 0%, #EF4444 40%, #F87171 100%);
}
.action-btn.danger:hover {
  background: linear-gradient(135deg, #B91C1C 0%, #DC2626 40%, #EF4444 100%);
}

/* Shared form section description style */
.form-section-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: var(--text-muted);
  margin: 0.125rem 0 0;
}

/* IM Guide button */
.im-guide-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  background: var(--bg-hover);
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.im-guide-btn:hover {
  background: var(--bg-card);
  color: var(--text-primary);
  border-color: var(--text-primary);
}

/* ── IM enable toggle row ───────────────────────────────────────────────── */
.im-enable-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.125rem 0;
}
.im-enable-label {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
}
.im-toggle {
  display: inline-flex;
  align-items: center;
  cursor: pointer;
  flex-shrink: 0;
}
.im-toggle input { display: none; }
.im-toggle-track {
  position: relative;
  width: 2.5rem;
  height: 1.375rem;
  border-radius: 0.6875rem;
  background: #D1D5DB;
  border: 1px solid #E5E7EB;
  transition: background 0.2s, border-color 0.2s;
}
.im-toggle input:checked + .im-toggle-track {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: #1A1A1A;
}
.im-toggle-thumb {
  position: absolute;
  top: 0.125rem;
  left: 0.125rem;
  width: 1rem;
  height: 1rem;
  border-radius: 50%;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.2s, background 0.2s;
}
.im-toggle input:checked + .im-toggle-track .im-toggle-thumb {
  transform: translateX(1.125rem);
}

/* ── IM reveal (eye) button inside inputs ──────────────────────────────── */
.im-reveal-btn {
  position: absolute;
  right: 0.5rem;
  top: 50%;
  transform: translateY(-50%);
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-secondary);
  padding: 0.25rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: color 0.15s;
}
.im-reveal-btn:hover { color: var(--text-primary); }

/* ── Platform status label (in card header) ────────────────────────────── */
.im-platform-status {
  margin-left: auto;
  font-size: var(--fs-caption);
  font-weight: 600;
  transition: color 0.15s;
  flex-shrink: 0;
}
.im-platform-status.ready   { color: #10B981; }
.im-platform-status.pending { color: #F59E0B; }
.im-platform-status.idle    { color: #9CA3AF; }

/* ── Inline collapsible setup guide ────────────────────────────────────── */
.im-inline-guide { border: none; outline: none; }
.im-inline-guide-summary {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  cursor: pointer;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--text-secondary);
  list-style: none;
  padding: 0.25rem 0;
  transition: color 0.15s;
  user-select: none;
}
.im-inline-guide-summary:hover { color: var(--text-primary); }
.im-inline-guide-summary::-webkit-details-marker { display: none; }
.im-inline-steps {
  margin: 0.625rem 0 0;
  padding-left: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.4rem;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  line-height: 1.6;
}
.im-inline-steps li { padding-left: 0.25rem; }
.im-inline-steps code {
  background: var(--accent-light);
  color: var(--accent);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}
.im-inline-note {
  margin: 0.5rem 0 0;
  padding: 0.5rem 0.75rem;
  background: rgba(0,122,255,0.05);
  border-left: 2px solid rgba(0,122,255,0.3);
  border-radius: 0 4px 4px 0;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  line-height: 1.5;
}

/* ── Collapsible setup guide ────────────────────────────────────────────── */
.im-setup-guide {
  background: #FAFAFA;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.im-setup-guide-summary {
  display: flex;
  align-items: center;
  gap: 0.35rem;
  padding: 0.625rem 0.875rem;
  cursor: pointer;
  list-style: none;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: 0.01em;
  user-select: none;
  transition: background 0.12s;
}
.im-setup-guide-summary::-webkit-details-marker { display: none; }
.im-setup-guide-summary:hover { background: #F5F5F5; }
.im-setup-chevron {
  width: 12px;
  height: 12px;
  margin-left: auto;
  flex-shrink: 0;
  color: var(--text-muted);
  transition: transform 0.15s ease;
}
.im-setup-guide[open] .im-setup-chevron { transform: rotate(180deg); }
.im-setup-guide[open] .im-setup-summary { border-bottom: 1px solid var(--border-light); }
.im-setup-steps {
  margin: 0;
  padding: 0.75rem 1rem 0.75rem 2.25rem;
  display: flex;
  flex-direction: column;
  gap: 0.35rem;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  line-height: 1.6;
  border-top: 1px solid var(--border-light);
}
.im-setup-steps li { padding-left: 0.2rem; }
.im-setup-steps code {
  background: var(--accent-light);
  color: var(--accent);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.75rem;
}
.im-setup-note {
  margin: 0;
  padding: 0.5rem 1rem;
  background: rgba(0,122,255,0.04);
  border-top: 1px solid rgba(0,122,255,0.12);
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  line-height: 1.5;
}

/* ── WhatsApp device linking ────────────────────────────────────────────── */
.im-wa-link-section {
  display: flex;
  flex-direction: column;
  gap: 1rem;
  padding: 0.875rem;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-md);
}
.im-wa-link-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1rem;
}
.im-wa-connected {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #059669;
}

/* ── QR code block ──────────────────────────────────────────────────────── */
.im-qr-block {
  display: flex;
  gap: 1.25rem;
  align-items: flex-start;
  flex-wrap: wrap;
}
.im-qr-instructions {
  flex: 1;
  min-width: 10rem;
}
.im-qr-img {
  width: 10rem;
  height: 10rem;
  border-radius: var(--radius-sm);
  border: 1px solid var(--border);
  flex-shrink: 0;
}

/* ── Save tab summary rows ──────────────────────────────────────────────── */
.im-save-summary {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.im-save-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
}
.im-save-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.im-save-dot.ready   { background: #10B981; box-shadow: 0 0 4px rgba(16,185,129,0.4); }
.im-save-dot.pending { background: #F59E0B; }
.im-save-dot.idle    { background: #D1D5DB; }
.im-save-label {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
  width: 7rem;
  flex-shrink: 0;
}
.im-save-state {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
}

/* ── Manage tab platform rows ───────────────────────────────────────────── */
/* ── Bridge per-platform toggle rows ────────────────────────────────────── */
.im-bridge-rows {
  display: flex;
  flex-direction: column;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.im-bridge-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
}
.im-bridge-info {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}
.im-bridge-name {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
}
.im-bridge-sub {
  font-size: var(--fs-caption);
  font-weight: 500;
}
.im-bridge-sub.running { color: #10B981; }
.im-bridge-sub.ready   { color: #6B7280; }
.im-bridge-sub.idle    { color: #9CA3AF; }
.im-toggle.disabled { opacity: 0.4; pointer-events: none; }

.im-manage-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.im-manage-row {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.5rem 0.75rem;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  border: 1px solid var(--border-light);
}
.im-manage-label {
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-primary);
  width: 5.5rem;
  flex-shrink: 0;
}
.im-manage-dot {
  width: 0.5rem;
  height: 0.5rem;
  border-radius: 50%;
  flex-shrink: 0;
}
.im-manage-dot.ready   { background: #10B981; box-shadow: 0 0 4px rgba(16,185,129,0.4); }
.im-manage-dot.pending { background: #F59E0B; }
.im-manage-dot.idle    { background: #D1D5DB; }
.im-manage-state {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  flex: 1;
}
.im-manage-badge {
  font-size: var(--fs-small);
  font-weight: 700;
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-full);
  flex-shrink: 0;
}
.im-manage-badge.running {
  background: rgba(16,185,129,0.1);
  color: #059669;
}

/* ── Active sessions list ───────────────────────────────────────────────── */
.im-sessions-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  max-height: 10rem;
  overflow-y: auto;
}
.im-session-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.625rem;
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
}
.im-session-badge {
  font-size: var(--fs-small);
  font-weight: 700;
  padding: 0.1rem 0.5rem;
  border-radius: var(--radius-full);
  background: rgba(0,122,255,0.08);
  color: var(--accent);
  flex-shrink: 0;
}
.demo-info-icon {
  display: inline-flex;
  align-items: center;
  margin-left: 0.25rem;
  color: var(--text-muted);
  cursor: help;
  opacity: 0.6;
  transition: opacity 0.15s;
}
/* ── Utility model selected chip (ComboBox chip style) ─────────────────── */
.cv-utility-selected-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
  padding: 0.3125rem 0.5rem 0.3125rem 0.75rem;
  border: 1px solid #1A1A1A;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  max-width: 100%;
}
.cv-utility-selected-label {
  font-family: 'JetBrains Mono', 'Inter', monospace;
  font-size: 0.8125rem;
  font-weight: 600;
  color: #FFFFFF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex: 1;
  min-width: 0;
}
.cv-utility-selected-remove {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.25rem;
  height: 1.25rem;
  border-radius: 0.375rem;
  flex-shrink: 0;
  background: rgba(255,255,255,0.15);
  border: none;
  color: rgba(255,255,255,0.7);
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
.cv-utility-selected-remove:hover {
  background: rgba(255,255,255,0.25);
  color: #FFFFFF;
}

/* ── Model list (matching AgentBodyViewer style) ───────────────────────── */
.cv-model-list {
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 15rem;
  overflow-y: auto;
  scrollbar-width: thin;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  padding: 0.25rem;
}
.cv-model-list::-webkit-scrollbar { width: 4px; }
.cv-model-list::-webkit-scrollbar-thumb { background: #374151; border-radius: 2px; }

.cv-model-item {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.625rem;
  background: transparent;
  border: none;
  border-radius: 0.375rem;
  color: var(--text-secondary);
  font-size: var(--fs-caption);
  font-family: 'JetBrains Mono', monospace;
  text-align: left;
  cursor: pointer;
  transition: all 0.12s ease;
}
.cv-model-item:hover {
  background: rgba(255,255,255,0.04);
  color: var(--text-primary);
}
.cv-model-item.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}

/* "Set as default" pill — sits before the metric tags. Outlined when not
   default, filled gold when default (and disabled — clicking the already-
   default row is a no-op so we make that visible). */
.cv-model-set-default-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.125rem 0.4375rem;
  height: 1.375rem;
  border: 1px solid rgba(251,191,36,0.4);
  background: transparent;
  border-radius: 0.25rem;
  color: #FBBF24;
  font-size: 0.6875rem;
  font-weight: 600;
  letter-spacing: 0.02em;
  cursor: pointer;
  flex-shrink: 0;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.cv-model-set-default-btn:hover {
  background: rgba(251,191,36,0.12);
  border-color: #FBBF24;
}
.cv-model-set-default-btn.active {
  background: rgba(251,191,36,0.18);
  cursor: default;
  text-transform: uppercase;
}
.cv-model-set-default-btn.active:hover { background: rgba(251,191,36,0.18); }
.cv-model-set-default-btn:disabled { cursor: default; }
.cv-model-set-default-label { line-height: 1; }

/* "Default" badge inside the row, next to the model name. */
/* Header row above the model list — pure label, no interaction. */
.cv-default-model-header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.375rem 0.5rem;
  margin-bottom: 0.5rem;
  background: rgba(251,191,36,0.06);
  border: 1px solid rgba(251,191,36,0.2);
  border-radius: 0.375rem;
  font-size: var(--fs-caption);
}
.cv-default-model-label {
  color: var(--text-secondary);
  font-weight: 500;
}
.cv-default-model-value {
  color: #FBBF24;
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}
.cv-default-model-value.cv-default-model-empty {
  color: var(--text-muted);
  font-weight: 400;
  font-style: italic;
}

.cv-model-select {
  display: flex;
  align-items: center;
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
  padding: 0;
}

.cv-model-name {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.cv-model-ctx {
  flex-shrink: 0;
  font-size: 0.6875rem;
  font-weight: 500;
  padding: 0 0.5rem;
  border-radius: 0.25rem;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  white-space: nowrap;
}
.cv-model-tag-label {
  font-size: 0.625rem;
  opacity: 0.8;
  letter-spacing: 0.02em;
}
.cv-model-tag-value {
  font-family: 'JetBrains Mono', monospace;
  font-weight: 600;
}
.cv-model-tag-muted {
  opacity: 0.7;
  font-weight: 400;
  margin-left: 0.125rem;
}
/* Green when any value is known (API / catalog / user), amber when unavailable */
.cv-model-ctx.has-value {
  color: #059669; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35);
}
.cv-model-ctx.is-missing {
  color: #B45309; background: rgba(245,158,11,0.1); border: 1px dashed rgba(245,158,11,0.4);
  font-style: italic;
}
.cv-model-out-tag.has-value {
  background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35);
  color: #059669;
}
.cv-model-out-tag.is-missing {
  background: rgba(245,158,11,0.1); border: 1px dashed rgba(245,158,11,0.4);
  color: #B45309;
}
.cv-model-item.active .cv-model-ctx.has-value,
.cv-model-item.active .cv-model-out-tag.has-value {
  color: #A7F3D0; background: rgba(16,185,129,0.22); border-color: rgba(167,243,208,0.45);
}
.cv-model-item.active .cv-model-ctx.is-missing,
.cv-model-item.active .cv-model-out-tag.is-missing,
.cv-model-item.active .cv-model-price-tag.is-missing {
  color: #FCD34D; background: rgba(245,158,11,0.22); border-color: rgba(253,224,71,0.45);
}

/* Shared helper: AppTooltip wrapper should not shrink inside the flex row */
.cv-model-tag-tip { flex-shrink: 0; }

/* Price tag (USD per 1M tokens) */
.cv-model-price-tag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 500;
  white-space: nowrap;
}
.cv-model-price-tag.has-value {
  color: #1D4ED8; background: rgba(59,130,246,0.1); border: 1px solid rgba(59,130,246,0.3);
}
.cv-model-price-tag.is-missing {
  color: #B45309; background: rgba(245,158,11,0.1); border: 1px dashed rgba(245,158,11,0.4);
  font-style: italic;
}
.cv-model-item.active .cv-model-price-tag.has-value {
  color: #BFDBFE; background: rgba(59,130,246,0.22); border-color: rgba(191,219,254,0.45);
}

/* Model-limits editor modal */
.cv-model-editor {
  width: min(960px, 94vw);
  max-height: 92vh;
  background: var(--bg-surface, #FFFFFF);
  border-radius: 0.875rem;
  box-shadow: 0 24px 72px rgba(0,0,0,0.32);
  overflow: hidden;
  display: flex; flex-direction: column;
}
.cv-model-editor-header {
  display: flex; align-items: flex-start; justify-content: space-between; gap: 1rem;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border-secondary, #E5E7EB);
  background: linear-gradient(180deg, #FAFAFA 0%, #FFFFFF 100%);
}
.cv-model-editor-title { font-weight: 600; font-size: 0.95rem; color: var(--text-primary, #111827); letter-spacing: -0.005em; }
.cv-model-editor-subtitle { font-size: 0.75rem; color: var(--text-muted, #6B7280); margin-top: 0.25rem; word-break: break-all; }
.cv-model-editor-close {
  background: none; border: none; cursor: pointer; color: var(--text-muted, #6B7280);
  padding: 0.25rem; border-radius: 0.25rem; display: flex; align-items: center; justify-content: center;
}
.cv-model-editor-close:hover { background: rgba(0,0,0,0.05); color: var(--text-primary); }
.cv-model-editor-body {
  padding: 1rem 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1rem;
  /* Flex child fills available modal height; scroll the body (not the whole
     modal) when content is tall. Outer modal's max-height + overflow:hidden
     establishes the bounding box. */
  flex: 1;
  min-height: 0;
  overflow-y: auto;
}
.cv-editor-divider {
  height: 1px;
  background: var(--border-secondary, #E5E7EB);
  margin: 0 -0.25rem;
}
.cv-catalog-status {
  font-size: 0.75rem;
  color: var(--text-muted, #6B7280);
  padding: 0.5rem 0.25rem;
  font-style: italic;
}
.cv-catalog-status.small { font-size: 0.6875rem; padding: 0.375rem 0.25rem; }
/* Header: button on its own line; match card fills the full width BELOW so long
   ids and price pills never get truncated. */
.cv-catalog-header-row {
  display: flex;
  flex-direction: column;
  align-items: stretch;
  gap: 0.5rem;
}

/* Open-picker button — also acts as the "Change" trigger when a match exists */
.cv-catalog-open-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.75rem;
  border: 1px dashed var(--border-primary, #D1D5DB);
  border-radius: 0.5rem;
  background: var(--bg-surface, #FFFFFF);
  color: var(--text-primary, #111827);
  font-size: 0.75rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s;
  align-self: flex-start;
  white-space: nowrap;
}
.cv-catalog-open-btn:hover {
  background: var(--bg-hover, #F3F4F6);
  border-color: #6B7280;
}

/* Match card on its own full-width row below the button */
.cv-catalog-match {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.625rem 0.75rem;
  border: 1px solid rgba(59, 130, 246, 0.35);
  border-radius: 0.5rem;
  background: rgba(59, 130, 246, 0.06);
}
.cv-catalog-match-head {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.cv-catalog-match-id {
  flex: 1;
  min-width: 0;
  font-size: 0.75rem;
  font-weight: 600;
  color: var(--text-primary, #111827);
  /* Long ids wrap across lines rather than ellipsis-truncate — every character
     is meaningful when identifying a model. */
  word-break: break-all;
  white-space: normal;
}

.cv-catalog-clear-btn {
  background: none;
  border: none;
  padding: 0.25rem;
  border-radius: 0.25rem;
  color: var(--text-muted, #6B7280);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cv-catalog-clear-btn:hover { background: rgba(0,0,0,0.06); color: var(--text-primary); }

/* Nested picker dialog (teleported above the model-limits editor) */
.cv-catalog-dialog {
  width: min(960px, 94vw);
  height: min(720px, 90vh);
  background: var(--bg-surface, #FFFFFF);
  border-radius: 0.875rem;
  box-shadow: 0 28px 80px rgba(0,0,0,0.38);
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

.cv-catalog-dialog-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 1.25rem;
  padding: 1rem 1.25rem 0.875rem;
  background: linear-gradient(180deg, #FAFAFA 0%, #FFFFFF 100%);
  border-bottom: 1px solid var(--border-secondary, #E5E7EB);
}
.cv-catalog-dialog-header-text { display: flex; flex-direction: column; gap: 0.25rem; }
.cv-catalog-dialog-title {
  font-weight: 600;
  font-size: 0.95rem;
  color: var(--text-primary, #111827);
  letter-spacing: -0.005em;
}
.cv-catalog-dialog-subtitle {
  font-size: 0.75rem;
  color: var(--text-muted, #6B7280);
  line-height: 1.4;
}

/* Search row */
.cv-catalog-dialog-search {
  position: relative;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem;
  border-bottom: 1px solid var(--border-secondary, #E5E7EB);
  background: #FFFFFF;
}
.cv-catalog-search-icon {
  width: 14px; height: 14px;
  color: var(--text-muted, #6B7280);
  flex-shrink: 0;
}
.cv-catalog-dialog-input {
  flex: 1;
  min-width: 0;
  background: transparent;
  border: none;
  outline: none;
  padding: 0.125rem 0;
  font-size: 0.8125rem;
  color: var(--text-primary);
}
.cv-catalog-dialog-input::placeholder { color: #9CA3AF; }
.cv-catalog-dialog-clear {
  background: none;
  border: none;
  padding: 0.25rem;
  border-radius: 999px;
  color: var(--text-muted);
  cursor: pointer;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}
.cv-catalog-dialog-clear:hover { background: rgba(0,0,0,0.06); color: var(--text-primary); }
.cv-catalog-dialog-count {
  font-size: 0.6875rem;
  color: var(--text-muted, #6B7280);
  font-family: 'JetBrains Mono', monospace;
  white-space: nowrap;
  padding: 0.125rem 0.5rem;
  background: rgba(0,0,0,0.04);
  border-radius: 999px;
}

/* Column header — matches row grid template exactly */
.cv-catalog-table-head,
.cv-catalog-tr {
  display: grid;
  grid-template-columns: 8.5rem minmax(12rem, 1fr) 5rem 5rem 5.5rem 5.5rem;
  align-items: center;
  column-gap: 0.75rem;
  padding: 0 1.25rem;
}
.cv-catalog-table-head {
  padding-top: 0.625rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid var(--border-secondary, #E5E7EB);
  background: #FAFAFA;
  font-size: 0.625rem;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--text-muted, #6B7280);
}
.cv-catalog-table-head .num { text-align: right; }

/* Body */
.cv-catalog-dialog-body {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  background: #FFFFFF;
}
.cv-catalog-dialog-body::-webkit-scrollbar { width: 8px; }
.cv-catalog-dialog-body::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 4px; }
.cv-catalog-dialog-body::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }

.cv-catalog-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 0.625rem;
  height: 100%;
  min-height: 12rem;
  padding: 2rem 3rem;
  color: var(--text-muted, #6B7280);
  font-size: 0.8125rem;
  text-align: center;
  line-height: 1.5;
}
.cv-catalog-empty-icon {
  width: 28px; height: 28px;
  color: #9CA3AF;
  opacity: 0.7;
}

.cv-catalog-table-body { padding: 0.25rem 0; }

/* Footer hint shown under the last row when more entries are available —
   infinite-scroll loads the next page automatically as the user approaches. */
.cv-catalog-more-hint {
  padding: 0.625rem 1.25rem;
  text-align: center;
  font-size: 0.6875rem;
  color: var(--text-muted, #6B7280);
  font-style: italic;
  border-top: 1px solid #F3F4F6;
}

.cv-catalog-tr {
  padding-top: 0.5rem;
  padding-bottom: 0.5rem;
  border-bottom: 1px solid #F3F4F6;
  cursor: pointer;
  transition: background 0.1s;
}
.cv-catalog-tr:last-child { border-bottom: none; }
.cv-catalog-tr:hover { background: #F5F7FB; }
.cv-catalog-tr:active { background: #E5ECFA; }

/* Currently-picked / auto-matched row — persistent highlight so users see
   their current selection after opening the dialog with an existing match. */
.cv-catalog-tr.active {
  background: linear-gradient(90deg, rgba(59,130,246,0.12) 0%, rgba(59,130,246,0.04) 100%);
  box-shadow: inset 3px 0 0 0 #3B82F6;
}
.cv-catalog-tr.active:hover { background: linear-gradient(90deg, rgba(59,130,246,0.18) 0%, rgba(59,130,246,0.08) 100%); }
.cv-catalog-tr.active .cv-catalog-td-id { color: #1D4ED8; }

.cv-catalog-td {
  font-size: 0.75rem;
  color: var(--text-primary, #111827);
  min-width: 0;
}
.cv-catalog-td.num { text-align: right; font-variant-numeric: tabular-nums; }
.cv-catalog-td.price { color: #1D4ED8; font-weight: 600; }
.cv-catalog-td-id {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-weight: 500;
}
.cv-catalog-provider-pill {
  display: inline-block;
  max-width: 100%;
  padding: 0.1875rem 0.5rem;
  border-radius: 0.375rem;
  background: #EEF2FF;
  color: #4338CA;
  border: 1px solid #E0E7FF;
  font-family: 'JetBrains Mono', monospace;
  font-size: 0.625rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  vertical-align: middle;
}

/* Compact mode when the viewport is narrow — collapse prices to spare columns */
@media (max-width: 760px) {
  .cv-catalog-table-head,
  .cv-catalog-tr {
    grid-template-columns: 6rem minmax(10rem, 1fr) 4rem 4rem;
  }
  .cv-catalog-table-head > :nth-child(5),
  .cv-catalog-table-head > :nth-child(6),
  .cv-catalog-tr > :nth-child(5),
  .cv-catalog-tr > :nth-child(6) { display: none; }
}
.cv-catalog-row-meta {
  display: flex;
  flex-wrap: wrap;
  gap: 0.375rem;
}
.cv-catalog-pill {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.0625rem 0.375rem;
  border-radius: 0.25rem;
  font-size: 0.625rem;
  font-weight: 500;
  color: #059669;
  background: rgba(16,185,129,0.1);
  border: 1px solid rgba(16,185,129,0.25);
  white-space: nowrap;
}
.cv-catalog-pill.price {
  color: #1D4ED8;
  background: rgba(59,130,246,0.08);
  border-color: rgba(59,130,246,0.25);
}
.cv-model-editor-field { display: flex; flex-direction: column; gap: 0.375rem; }
.cv-model-editor-field label {
  font-size: 0.75rem; font-weight: 600; color: var(--text-primary);
  text-transform: uppercase; letter-spacing: 0.03em;
}
.cv-editor-field-head {
  display: flex; align-items: center; justify-content: space-between; gap: 0.5rem;
}
.cv-editor-current-badge {
  font-family: 'JetBrains Mono', monospace; font-size: 0.6875rem; font-weight: 600;
  padding: 0.125rem 0.5rem; border-radius: 0.25rem; letter-spacing: 0.02em;
  white-space: nowrap;
}
.cv-editor-current-badge.ok {
  color: #059669; background: rgba(16,185,129,0.12); border: 1px solid rgba(16,185,129,0.35);
}
.cv-editor-current-badge.warn {
  color: #B45309; background: rgba(245,158,11,0.12); border: 1px solid rgba(245,158,11,0.4);
}
.cv-model-editor-footer {
  display: flex; justify-content: flex-end; gap: 0.5rem;
  padding: 0.75rem 1.25rem; border-top: 1px solid var(--border-secondary, #E5E7EB);
  background: var(--bg-subtle, #F9FAFB);
}
.cv-model-editor-btn {
  padding: 0.375rem 0.875rem; border-radius: 0.375rem; font-size: 0.8125rem; font-weight: 500;
  cursor: pointer; border: 1px solid transparent;
}
.cv-model-editor-btn.primary {
  background: linear-gradient(135deg, #0F0F0F, #1A1A1A, #374151); color: #FFFFFF;
}
.cv-model-editor-btn.primary:hover { opacity: 0.9; }
.cv-model-editor-btn.secondary {
  background: var(--bg-surface); color: var(--text-primary); border-color: var(--border-primary, #D1D5DB);
}
.cv-model-editor-btn.secondary:hover { background: var(--bg-hover, #F3F4F6); }
.cv-model-editor-btn.ghost {
  background: transparent; color: var(--text-muted); border-color: transparent;
}
.cv-model-editor-btn.ghost:hover { background: rgba(0,0,0,0.04); color: var(--text-primary); }

/* Missing-context warning modal */
.cv-warn-modal {
  width: min(480px, 92vw);
  background: var(--bg-surface, #FFFFFF);
  border-radius: 0.75rem;
  box-shadow: 0 20px 60px rgba(0,0,0,0.3);
  overflow: hidden;
  display: flex; flex-direction: column;
}
.cv-warn-header {
  display: flex; align-items: center; gap: 0.5rem;
  padding: 1rem 1.25rem; border-bottom: 1px solid var(--border-secondary, #E5E7EB);
  font-weight: 600; font-size: 0.95rem; color: var(--text-primary);
}
.cv-warn-body { padding: 1rem 1.25rem; display: flex; flex-direction: column; gap: 0.5rem; }
.cv-warn-body p { font-size: 0.8125rem; line-height: 1.5; color: var(--text-primary); margin: 0; }
.cv-warn-body-muted { color: var(--text-muted) !important; }
.cv-warn-footer {
  display: flex; justify-content: flex-end; gap: 0.5rem;
  padding: 0.75rem 1.25rem; border-top: 1px solid var(--border-secondary, #E5E7EB);
  background: var(--bg-subtle, #F9FAFB);
}
/* Max output tag (base — specific has-value/is-missing rules above override colors) */
.cv-model-out-tag {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0 0.5rem;
  border-radius: 0.25rem;
  font-size: 0.6875rem;
  font-weight: 500;
}

.cv-model-out-fallback {
  color: #EAB308;
  font-size: 0.5625rem;
  font-weight: 600;
  line-height: 1;
  cursor: help;
}
.cv-model-item.active .cv-model-out-fallback { color: #FACC15; }

.cv-model-out-label {
  color: #9CA3AF;
  font-size: 0.5625rem;
  text-transform: uppercase;
  letter-spacing: 0.03em;
  pointer-events: none;
  user-select: none;
}
.cv-model-item.active .cv-model-out-label { color: #9CA3AF; }

.cv-model-out-text {
  color: var(--text-secondary);
  font-size: 0.6875rem;
}
.cv-model-out-text.is-custom { color: var(--text-primary); }
.cv-model-item.active .cv-model-out-text { color: #E5E7EB; }
.cv-model-item.active .cv-model-out-text.is-custom { color: #FFFFFF; }

/* Edit pencil button — always visible */
.cv-model-out-edit {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.125rem;
  height: 1.125rem;
  background: rgba(0,0,0,0.06);
  border: 1px solid rgba(0,0,0,0.12);
  border-radius: 0.25rem;
  color: var(--text-secondary);
  cursor: pointer;
  transition: background 0.12s, border-color 0.12s, color 0.12s;
}
.cv-model-out-edit:hover {
  background: rgba(0,0,0,0.1);
  border-color: rgba(0,0,0,0.2);
  color: var(--text-primary);
}
.cv-model-item.active .cv-model-out-edit {
  background: rgba(255,255,255,0.1);
  border-color: rgba(255,255,255,0.2);
  color: #D1D5DB;
}
.cv-model-item.active .cv-model-out-edit:hover {
  background: rgba(255,255,255,0.18);
  border-color: rgba(255,255,255,0.3);
  color: #FFFFFF;
}

/* Edit mode input */
.cv-model-out-input {
  width: 3.5rem;
  background: transparent;
  border: none;
  outline: none;
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.6875rem;
  font-weight: 500;
  text-align: right;
  padding: 0;
}
.cv-model-item.active .cv-model-out-input { color: #FFFFFF; }

/* Confirm / Cancel buttons */
.cv-model-out-confirm,
.cv-model-out-cancel {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.125rem;
  height: 1.125rem;
  border: none;
  border-radius: 0.25rem;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
}
/* Normal row: dark tones for light background */
.cv-model-out-confirm {
  background: rgba(0,0,0,0.06);
  color: var(--text-secondary);
}
.cv-model-out-confirm:hover { background: rgba(0,0,0,0.12); color: var(--text-primary); }
.cv-model-out-cancel {
  background: rgba(0,0,0,0.04);
  color: var(--text-secondary);
}
.cv-model-out-cancel:hover { background: rgba(0,0,0,0.1); color: var(--text-primary); }
/* Active row: brighter confirm/cancel */
.cv-model-item.active .cv-model-out-confirm {
  background: rgba(255,255,255,0.1);
  color: #D1D5DB;
}
.cv-model-item.active .cv-model-out-confirm:hover { background: rgba(255,255,255,0.2); color: #FFFFFF; }
.cv-model-item.active .cv-model-out-cancel {
  background: rgba(255,255,255,0.06);
  color: #D1D5DB;
}
.cv-model-item.active .cv-model-out-cancel:hover { background: rgba(255,255,255,0.15); color: #FFFFFF; }

.info-tooltip-wrapper:hover .edge-tts-tooltip,
.edge-tts-tooltip:hover { display: block !important; }
.edge-tts-tooltip a { color: #60a5fa; text-decoration: underline; cursor: pointer; }

.demo-info-icon:hover { opacity: 1; }

/* ── Account section (General > Account) ───────────────────────────────── */
.account-block { padding: 0.25rem 0 0; }
.account-row {
  display: flex;
  align-items: center;
  gap: 0.875rem;
  padding: 0.25rem 0 0.75rem;
}
.account-avatar {
  width: 2.75rem; height: 2.75rem;
  border-radius: 50%;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-weight: 600;
  font-size: var(--fs-body);
  display: grid; place-items: center;
  flex-shrink: 0;
}
.account-avatar-img {
  background: transparent;
  object-fit: cover;
}
.account-info {
  min-width: 0;
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}
.account-name-row {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.account-name {
  font-size: var(--fs-body);
  font-weight: 600;
  color: var(--text-primary);
  line-height: 1.25;
}
.account-method-badge {
  display: inline-flex;
  align-items: center;
  padding: 0.0625rem 0.4375rem;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: var(--text-secondary);
  background: var(--bg-hover);
  border: 1px solid var(--border-light);
  border-radius: 999px;
  line-height: 1.4;
}
.account-email-secondary {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  word-break: break-all;
  font-family: 'JetBrains Mono', monospace;
}
.account-meta {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
  padding: 0.75rem 0;
  margin: 0.25rem 0 0;
  border-top: 1px solid var(--border-light);
  border-bottom: 1px solid var(--border-light);
}
.account-meta-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: var(--fs-caption);
}
.account-meta-label {
  color: var(--text-muted);
  min-width: 5.5rem;
}
.account-meta-value {
  color: var(--text-secondary);
  font-family: 'JetBrains Mono', monospace;
}
.account-actions {
  display: flex;
  gap: 0.5rem;
  flex-wrap: wrap;
  margin-top: 0.875rem;
}
.account-actions-center { justify-content: center; }

.account-empty { text-align: center; padding: 1.5rem 1rem; }
.account-empty-icon {
  display: block;
  width: 36px;
  height: 36px;
  color: var(--text-muted);
  margin: 0 auto 12px;
}
.account-empty-title {
  margin: 0 0 6px;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  color: var(--text-primary);
}
.account-empty-hint {
  margin: 0 auto;
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  max-width: 360px;
  line-height: 1.55;
}

.account-privacy-card { margin-top: 1rem; }
.account-privacy-list {
  margin: 0.5rem 0 0;
  padding-left: 1.25rem;
  list-style: disc;
}
.account-privacy-list li {
  font-size: var(--fs-caption);
  color: var(--text-secondary);
  line-height: 1.6;
  padding: 0.15rem 0;
}
.account-limits-block {
  margin-top: 1rem;
  padding-top: 0.875rem;
  border-top: 1px dashed var(--border-color, #E5E5EA);
}
.account-limits-title {
  font-size: var(--fs-caption);
  font-weight: 600;
  color: var(--text-primary);
  margin-bottom: 0.25rem;
}
.account-limits-hint {
  margin: 0 0 0.75rem;
  font-size: var(--fs-tiny, 0.75rem);
  color: var(--text-secondary);
  line-height: 1.5;
}
.account-limits-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(7rem, 1fr));
  gap: 0.5rem;
}
.account-limit-cell {
  display: flex;
  align-items: baseline;
  gap: 0.4rem;
  padding: 0.5rem 0.625rem;
  background: rgba(0, 0, 0, 0.025);
  border: 1px solid var(--border-color, #E5E5EA);
  border-radius: var(--radius-sm, 8px);
}
.account-limit-cell .lim-num {
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: var(--text-primary);
  font-variant-numeric: tabular-nums;
}
.account-limit-cell .lim-lab {
  font-size: var(--fs-tiny, 0.75rem);
  color: var(--text-secondary);
}
</style>

<style>
/* IM Setup Guide modal — unscoped (Teleport escapes component DOM) */
.im-guide-backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0,0,0,0.5);
  backdrop-filter: blur(6px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 9999;
  animation: imGuideIn 0.2s ease-out;
}
@keyframes imGuideIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}
.im-guide-modal {
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1rem;
  width: min(540px, 92vw);
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  animation: imGuideSlide 0.2s ease-out;
}
@keyframes imGuideSlide {
  from { transform: scale(0.95) translateY(8px); opacity: 0; }
  to   { transform: scale(1) translateY(0); opacity: 1; }
}
.im-guide-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem 1rem;
  border-bottom: 1px solid #1E1E1E;
}
.im-guide-header-icon {
  width: 2rem; height: 2rem;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex; align-items: center; justify-content: center;
  color: #fff; flex-shrink: 0;
}
.im-guide-title {
  font-size: 1rem;
  font-weight: 700;
  color: #FFFFFF;
  flex: 1;
}
.im-guide-close {
  background: transparent;
  border: none;
  color: #6B7280;
  cursor: pointer;
  padding: 0.25rem;
  border-radius: 0.375rem;
  display: flex; align-items: center; justify-content: center;
  transition: all 0.15s;
}
.im-guide-close:hover { background: #1E1E1E; color: #fff; }
.im-guide-body {
  padding: 1.25rem 1.5rem;
  overflow-y: auto;
  max-height: 60vh;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
}
.im-guide-section { display: flex; flex-direction: column; gap: 0.75rem; }
.im-guide-section-title {
  display: flex; align-items: center; gap: 0.4rem;
  color: #FFFFFF; font-size: 0.875rem; font-weight: 700;
}
.im-guide-steps {
  margin: 0; padding-left: 1.25rem;
  display: flex; flex-direction: column; gap: 0.5rem;
  color: #9CA3AF; font-size: 0.875rem; line-height: 1.6;
}
.im-guide-steps li { padding-left: 0.25rem; }
.im-guide-steps code {
  background: #1A1A1A; color: #E5E7EB;
  padding: 0.1rem 0.35rem; border-radius: 4px;
  font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
}
.im-guide-note {
  margin: 0; padding: 0.625rem 0.875rem;
  background: rgba(0,122,255,0.08); border-left: 3px solid #007AFF;
  border-radius: 0 6px 6px 0;
  color: #9CA3AF; font-size: 0.8125rem; line-height: 1.5;
}
.im-guide-divider { border: none; border-top: 1px solid #1E1E1E; margin: 0; }
.im-guide-table {
  width: 100%; border-collapse: collapse;
  font-size: 0.875rem;
}
.im-guide-table td {
  padding: 0.4rem 0.5rem;
  border-bottom: 1px solid #1A1A1A;
  color: #9CA3AF; vertical-align: top;
}
.im-guide-table tr:last-child td { border-bottom: none; }
.im-guide-table td:first-child { width: 38%; }
.im-guide-table code {
  background: #1A1A1A; color: #E5E7EB;
  padding: 0.1rem 0.35rem; border-radius: 4px;
  font-family: 'JetBrains Mono', monospace; font-size: 0.8rem;
  white-space: nowrap;
}
.im-guide-footer {
  padding: 1rem 1.5rem;
  border-top: 1px solid #1A1A1A;
  display: flex; justify-content: flex-end;
  background: #0A0A0A;
  border-radius: 0 0 1rem 1rem;
}
.im-guide-ok-btn {
  padding: 0.5rem 1.5rem;
  border-radius: 0.5rem;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-weight: 600; font-size: 0.875rem;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.im-guide-ok-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

/* ══════════════════════════════════════════════════════════════════════════
   MODELS PAGE — New left sidebar layout
   ══════════════════════════════════════════════════════════════════════════ */
.models-page-layout {
  display: flex;
  gap: 1.5rem;
  height: 100%;
}

.models-left-nav {
  width: 280px;
  min-width: 280px;
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  padding: 0.5rem;
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
}

.models-nav-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.25rem 0.5rem;
}

.models-add-btn {
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  cursor: pointer;
  transition: all 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.models-add-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.models-add-btn svg {
  width: 16px;
  height: 16px;
  flex-shrink: 0;
}

.models-nav-divider {
  height: 1px;
  background: var(--border-light);
  margin: 0.25rem 0;
}

.models-nav-section {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
}

.models-nav-section-label {
  font-size: var(--fs-small);
  font-weight: 600;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.5rem;
}

.models-nav-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.5rem 0.625rem;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  cursor: pointer;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
  transition: all 0.15s;
  text-align: left;
}

.models-nav-item:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

.models-nav-item.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
}

.models-nav-name {
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.models-nav-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  flex-shrink: 0;
  margin-left: 0.5rem;
}

.models-nav-dot.active {
  background: #10B981;
}

.models-nav-dot.inactive {
  background: #D1D5DB;
}

.models-nav-empty {
  padding: 0.5rem;
  font-size: var(--fs-small);
  color: var(--text-muted);
  text-align: center;
}

.models-right-content {
  flex: 1;
  overflow-y: auto;
  padding-right: 0.5rem;
}

.form-section-subheader {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-secondary);
  margin-bottom: 0.75rem;
  padding-top: 0.5rem;
}

.provider-advanced-toggle {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  background: none;
  border: none;
  cursor: pointer;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-tertiary);
  padding: 0.375rem 0;
}
.provider-advanced-toggle:hover { color: var(--text-secondary); }

.modal-backdrop {
  position: fixed;
  inset: 0;
  z-index: 100;
  background: rgba(0, 0, 0, 0.5);
  display: flex;
  align-items: center;
  justify-content: center;
}

.modal-content {
  background: var(--bg-card);
  border-radius: var(--radius-lg);
  border: 1px solid var(--border);
  box-shadow: 0 25px 50px rgba(0, 0, 0, 0.25);
}

.modal-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid var(--border);
}

.modal-header h3 {
  margin: 0;
  font-size: var(--fs-subtitle);
  font-weight: 700;
}

.modal-close {
  background: none;
  border: none;
  cursor: pointer;
  padding: 0.25rem;
  color: var(--text-muted);
}

.modal-close:hover {
  color: var(--text-primary);
}

.modal-body {
  padding: 1.25rem;
}

.modal-footer {
  display: flex;
  justify-content: flex-end;
  gap: 0.5rem;
  padding: 1rem 1.25rem;
  border-top: 1px solid var(--border);
}
.demo-tooltip {
  position: fixed;
  z-index: 99999;
  background: #1A1A1A;
  color: #F5F5F5;
  font-size: 0.75rem;
  line-height: 1.5;
  padding: 0.5rem 0.75rem;
  border-radius: 0.5rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  pointer-events: none;
  max-width: 15rem;
}
.demo-tooltip ul { list-style: disc; }
.demo-tooltip li { margin: 0.1rem 0; }
.spin { animation: spin 1s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }

/* Provider API key link in config form */
.provider-apikey-link {
  font-size: 0.75rem;
  color: #818CF8;
  text-decoration: none;
  white-space: nowrap;
}
.provider-apikey-link:hover { color: #A5B4FC; text-decoration: underline; }

.apikey-privacy-notice {
  display: flex;
  align-items: flex-start;
  gap: 0.5rem;
  padding: 0.5rem 0.625rem;
  margin-bottom: 0.5rem;
  background: rgba(34, 197, 94, 0.06);
  border: 1px solid rgba(34, 197, 94, 0.2);
  border-radius: 0.375rem;
  font-size: 0.75rem;
  line-height: 1.45;
  color: var(--text-secondary);
}
.apikey-privacy-icon {
  flex-shrink: 0;
  width: 0.875rem;
  height: 0.875rem;
  margin-top: 0.125rem;
  color: #22C55E;
}

/* Add Provider modal — list-based picker (light theme, mirrors SetupWizard layout) */
.add-provider-modal {
  width: min(44rem, 92vw);
  max-height: 85vh;
  display: flex;
  flex-direction: column;
}
.add-provider-modal .modal-body {
  overflow-y: auto;
  flex: 1;
}
.ap-provider-list {
  display: flex;
  flex-direction: column;
  gap: 0.375rem;
}
.ap-provider-item {
  width: 100%;
  text-align: left;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: 0.5rem;
  padding: 0.625rem 0.75rem;
  cursor: pointer;
  transition: border-color 0.15s, background 0.15s;
  font-family: inherit;
  color: var(--text-primary);
}
.ap-provider-item:hover {
  border-color: var(--accent);
  background: var(--accent-light);
}
.ap-provider-item.selected {
  border-color: var(--accent);
  background: var(--accent-light);
  box-shadow: 0 0 0 1px var(--accent) inset;
}
.ap-provider-top {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  flex-wrap: wrap;
}
.ap-provider-name {
  font-size: 0.9375rem;
  font-weight: 500;
  color: var(--text-primary);
}
.ap-badge {
  font-size: 0.6875rem;
  font-weight: 600;
  padding: 0.125rem 0.4rem;
  border-radius: 0.25rem;
  letter-spacing: 0.02em;
  text-transform: uppercase;
}
.ap-badge.free { background: rgba(16, 185, 129, 0.12); color: #047857; border: 1px solid rgba(16, 185, 129, 0.3); }
.ap-badge.trial { background: rgba(245, 158, 11, 0.12); color: #B45309; border: 1px solid rgba(245, 158, 11, 0.3); }
.ap-badge.paid { background: rgba(107, 114, 128, 0.12); color: #4B5563; border: 1px solid rgba(107, 114, 128, 0.3); }
.ap-apikey-link {
  margin-left: auto;
  font-size: 0.75rem;
  color: var(--accent);
  text-decoration: none;
  white-space: nowrap;
  flex-shrink: 0;
}
.ap-apikey-link:hover { color: var(--accent-hover); text-decoration: underline; }
</style>
