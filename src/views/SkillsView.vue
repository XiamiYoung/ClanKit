<template>
  <div class="h-full flex flex-col overflow-hidden" style="background:#F2F2F7;">


    <!-- ════════════════════════════════════════════════════════════════════════
         LEVEL 1 — Skills Grid Catalog
         ════════════════════════════════════════════════════════════════════════ -->
    <template v-if="!selectedSkill">
      <!-- Header -->
      <div class="catalog-header">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <h1 style="font-family:'Inter',sans-serif; font-size:var(--fs-page-title); font-weight:700; color:#1A1A1A; margin:0;">{{ t('skills.title') }}</h1>
              <span class="catalog-count-badge">{{ activeTab === 'local' ? filteredSkills.length : activeTab === 'tencent' ? tencentDisplaySkills.length : filteredClawhubSkills.length }}</span>
            </div>
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#6B7280; margin:0.25rem 0 0 0;">
              {{ t('skills.subtitle') }}
            </p>
          </div>
          <div class="flex items-center gap-2">
            <AppButton v-if="activeTab === 'local'" size="icon" @click="refresh" :title="t('skills.refreshSkills')">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </AppButton>
            <AppButton v-else size="icon" @click="refreshRemote(activeTab)" :title="t('skills.refreshSkills')">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </AppButton>
          </div>
        </div>

        <!-- Tabs -->
        <div class="catalog-tabs">
          <button
            class="catalog-tab"
            :class="{ 'catalog-tab--active': activeTab === 'local' }"
            @click="switchTab('local')"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0h6"/></svg>
            {{ t('skills.localSkills') }}
          </button>
          <button
            class="catalog-tab"
            :class="{ 'catalog-tab--active': activeTab === 'tencent' }"
            @click="switchTab('tencent')"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
            {{ t('skills.tencentHub') }}
          </button>
          <button
            class="catalog-tab"
            :class="{ 'catalog-tab--active': activeTab === 'clawhub' }"
            @click="switchTab('clawhub')"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
            {{ t('skills.clawHub') }}
          </button>
        </div>

        <!-- Search bar — local tab -->
        <div v-if="activeTab === 'local'" class="catalog-search-wrap">
          <svg class="catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
          </svg>
          <input
            v-model="searchQuery"
            type="text"
            :placeholder="t('skills.searchSkills')"
            class="catalog-search-input"
          />
          <span v-if="searchQuery" class="catalog-search-clear" @click="searchQuery = ''">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </span>
        </div>
      </div>


      <!-- ── LOCAL TAB ── -->
      <div v-if="activeTab === 'local'" class="flex-1 flex flex-col overflow-hidden">
      <!-- Loading -->
      <div v-if="skillsStore.loading" class="flex-1 overflow-y-auto skill-grid-bg">
        <div class="skills-grid-spinner-overlay">
          <svg class="skills-spinner" viewBox="0 0 50 50">
            <circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke="#1C1C1E" stroke-linecap="round" stroke-dasharray="90 60"/>
          </svg>
        </div>
      </div>

      <!-- Error -->
      <div v-else-if="skillsStore.error" class="flex-1 flex items-center justify-center">
        <div class="text-center">
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#dc2626;">{{ skillsStore.error }}</p>
          <button
            @click="refresh"
            class="mt-3 px-4 py-2 rounded-lg cursor-pointer"
            style="background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%); color:#fff; border:none; font-family:'Inter',sans-serif; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.12);"
          >{{ t('skills.retry') }}</button>
        </div>
      </div>

      <!-- Empty -->
      <div v-else-if="skillsStore.skills.length === 0" class="flex-1 flex items-center justify-center">
        <div class="text-center" style="max-width:26.25rem;">
          <div
            class="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center"
            style="margin-top:2rem; background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);"
          >
            <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <h2 style="font-family:'Inter',sans-serif; font-size:var(--fs-section); font-weight:700; color:#1A1A1A; margin:0 0 0.5rem;">
            {{ t('skills.noSkillsFound') }}
          </h2>
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; line-height:1.6; margin:0 0 1rem;">
            {{ t('skills.skillFolderHint') }}
          </p>
          <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF;">
            Skills path: <code style="background:#F5F5F5; padding:0.125rem 0.375rem; border-radius:0.25rem; font-size:0.875em;">{{ configStore.config.skillsPath || '~/.claude/skills' }}</code>
          </p>
        </div>
      </div>

      <!-- Skills Grid -->
      <div v-else class="flex-1 overflow-y-auto skill-grid-bg">
        <!-- No results for search -->
        <div v-if="filteredSkills.length === 0 && searchQuery" class="flex items-center justify-center" style="padding:3.75rem 2rem;">
          <div class="text-center">
            <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#6B7280; margin:0 0 0.25rem;">{{ t('common.noResults') }} "{{ searchQuery }}"</p>
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF; margin:0;">{{ t('skills.clearSearch') }}</p>
          </div>
        </div>

        <div v-else style="padding:1.5rem 2rem;">
          <div class="skill-grid">
            <div
              v-for="(skill, idx) in sortedLocalSkills"
              :key="skill.id"
              @click="selectSkill(skill)"
              class="skill-card"
            >
              <!-- Gradient accent bar -->
              <div class="skill-card-accent" :style="{ background: cardGradient(idx) }"></div>

              <div class="skill-card-body">
                <!-- Icon + title row -->
                <div class="skill-card-title-row">
                  <div class="skill-card-icon" :style="{ background: cardGradient(idx) }">
                    <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                    </svg>
                  </div>
                  <h3 class="skill-card-name">{{ skillDisplayName(skill) }}</h3>
                </div>

                <!-- Description -->
                <p class="skill-card-desc">{{ skillDescription(skill) }}</p>

                <!-- Meta and actions -->
                <div class="skill-card-footer">
                  <!-- Installed date row -->
                  <div v-if="skill.installedAt" style="display:flex;align-items:center;gap:0.375rem;width:100%;font-size:var(--fs-caption);color:#D1D5DB;">
                    <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
                    {{ new Date(skill.installedAt).toISOString().split('T')[0] }}
                  </div>

                  <!-- Uninstall button row -->
                  <div style="display:flex;justify-content:flex-end;width:100%;margin-top:0.5rem;">
                    <button
                      class="remote-uninstall-btn"
                      @click.stop="confirmUninstall(skill)"
                    >{{ t('skills.uninstall') }}</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
      </div>


      <!-- ── TENCENT HUB TAB ── -->
      <div v-else-if="activeTab === 'tencent'" class="flex-1 flex flex-col overflow-hidden">

          <!-- Tencent sub-tab bar -->
          <div class="tencent-subtab-bar">
            <button class="tencent-subtab" :class="{ 'tencent-subtab--active': tencentSubTab === 'top50' }" @click="switchTencentSubTab('top50')">
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
              Top 50
            </button>
            <button class="tencent-subtab" :class="{ 'tencent-subtab--active': tencentSubTab === 'all' }" @click="switchTencentSubTab('all')">
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              All Skills
            </button>
          </div>

          <!-- Search/sort row (All Skills only) -->
          <div v-if="tencentSubTab === 'all'" class="tencent-search-row" style="display:flex;align-items:center;gap:0.75rem;margin:0.75rem 2rem 0;">
            <div class="tencent-search-wrap" style="flex:1;display:flex;align-items:center;position:relative;">
              <svg class="catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <input
                v-model="tencentSearchQuery"
                type="text"
                :placeholder="t('skills.searchSkills')"
                class="catalog-search-input"
                @keydown.enter="onTencentSearch"
              />
              <span v-if="tencentSearchQuery" class="catalog-search-clear" @click="tencentSearchQuery = ''; onTencentSearch()">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
              </span>
            </div>
            <div class="tencent-sort-wrap" style="flex-shrink:0;margin-right:0;display:flex;align-items:center;">
              <select v-model="tencentSortBy" class="tencent-sort-select" @change="onTencentSearch">
                <option value="downloads">下载量</option>
                <option value="stars">收藏</option>
                <option value="installs">安装量</option>
                <option value="name">名称</option>
              </select>
            </div>
          </div>

          <!-- Category bar — All Skills only -->
          <div v-if="tencentSubTab === 'all'" class="tencent-category-bar">
            <div class="tencent-category-grid tencent-category-center" style="display:flex;justify-content:center;flex-wrap:wrap;gap:0.75rem;padding:0.75rem 2rem;">
              <button
                v-for="cat in tencentCategories"
                :key="cat.slug"
                class="tencent-cat-btn"
                :class="{ 'tencent-cat-btn--active': tencentSelectedCategory === cat.slug }"
                @click="selectTencentCategory(cat.slug)"
                style="min-width:90px;max-width:120px;"
              >
                <div class="tencent-cat-icon-wrap" style="background:#fff;border:1.5px solid #E5E5EA;width:40px;height:40px;border-radius:10px;display:flex;align-items:center;justify-content:center;">
                  <span style="color:#1A1A1E;font-weight:700;font-size:20px;line-height:1;">{{ cat.name[0] }}</span>
                </div>
                <span class="tencent-cat-label" style="color:#1A1A1E;margin-top:4px;font-size:12px;text-align:center;white-space:nowrap;">{{ cat.name }}</span>
              </button>
            </div>
          </div>

          <!-- Error (not fetching) -->
          <div v-if="tencentFetchError && !tencentFetching" class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#dc2626;">{{ tencentFetchError }}</p>
              <button @click="refreshRemote('tencent')" class="mt-3 px-4 py-2 rounded-lg cursor-pointer" style="background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%); color:#fff; border:none; font-family:'Inter',sans-serif; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.12);">{{ t('skills.retry') }}</button>
            </div>
          </div>
          <!-- Not yet fetched -->
          <div v-else-if="!tencentFetched && !tencentFetching" class="flex-1 flex items-center justify-center">
            <div class="text-center" style="max-width:26.25rem;">
              <div class="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center" style="background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%);box-shadow:0 2px 8px rgba(0,0,0,0.12);">
                <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              </div>
              <h2 style="font-family:'Inter',sans-serif;font-size:var(--fs-section);font-weight:700;color:#1A1A1A;margin:0 0 0.5rem;">Tencent Hub</h2>
              <p style="font-family:'Inter',sans-serif;font-size:var(--fs-body);color:#9CA3AF;line-height:1.6;margin:0 0 1rem;">{{ t('skills.tencentDesc') }}</p>
              <button @click="refreshRemote('tencent')" class="px-4 py-2 rounded-lg cursor-pointer" style="background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%);color:#fff;border:none;font-family:'Inter',sans-serif;font-weight:600;">{{ t('skills.browseSkills') }}</button>
            </div>
          </div>
          <!-- Grid area: spinner + content -->
          <div v-else class="flex-1 overflow-y-auto skill-grid-bg">
            <!-- Non-blocking spinner -->
            <div v-if="tencentFetching" class="skills-grid-spinner-overlay">
              <svg class="skills-spinner" viewBox="0 0 50 50">
                <circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke="#1C1C1E" stroke-linecap="round" stroke-dasharray="90 60"/>
              </svg>
            </div>
            <!-- Empty results -->
            <div v-if="tencentDisplaySkills.length === 0 && !tencentFetching" class="flex items-center justify-center" style="padding:3.75rem 2rem; min-height:200px;">
              <div class="text-center">
                <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
                </svg>
                <p style="font-family:'Inter',sans-serif;font-size:var(--fs-body);font-weight:600;color:#6B7280;margin:0 0 0.25rem;">{{ t('common.noResults') }}</p>
                <p style="font-family:'Inter',sans-serif;font-size:var(--fs-secondary);color:#9CA3AF;margin:0;">{{ t('skills.clearSearch') }}</p>
              </div>
            </div>
            <!-- Grid -->
            <div v-if="tencentDisplaySkills.length > 0" style="padding:1.5rem 2rem;">
              <div class="skill-grid">
                <div
                  v-for="(skill, idx) in tencentDisplaySkills"
                  :key="skill.id"
                  class="skill-card remote-skill-card"
                  @click="openRemoteDetail(skill)"
                >
                  <div class="skill-card-accent" :style="{ background: cardGradient(idx) }"></div>
                  <div class="skill-card-body">
                    <div class="skill-card-title-row">
                      <div class="skill-card-icon" :style="{ background: cardGradient(idx) }" style="display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:700;color:#fff;font-family:'Inter',sans-serif;">
                        {{ (skill.name || skill.id || '?')[0].toUpperCase() }}
                      </div>
                      <h3 class="skill-card-name">{{ skill.name || skill.id }}</h3>
                    </div>
                    <p class="skill-card-desc">{{ skill.description || t('skills.noSkillsHint') }}</p>
                    <div class="skill-card-footer">
                      <div class="remote-skill-meta">
                        <span v-if="skill.author" class="remote-skill-author">
                          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                          {{ skill.author }}
                        </span>
                        <span v-if="skill.stars" class="remote-skill-stat">
                          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                          {{ skill.stars }}
                        </span>
                        <span v-if="skill.downloads" class="remote-skill-stat">
                          <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                          {{ skill.downloads.toLocaleString() }}
                        </span>
                      </div>
                    </div>
                    <div style="display: flex; justify-content: flex-end; align-items: center; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgb(242, 242, 247); margin-top: 0.5rem;">
                      <button
                        class="rsd-icon-btn"
                        style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;border:none;background:none;cursor:pointer;color:#6B7280;transition:color 0.2s;"
                        title="Open in browser"
                        @click.stop="openExternal(skill.homepage, skill.sourceId, skill.id)"
                        @mouseenter="e => e.currentTarget.style.color='#1C1C1E'"
                        @mouseleave="e => e.currentTarget.style.color='#6B7280'"
                      >
                        <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                      </button>
                      <button
                        v-if="!skill.installed && !skillsStore.installingSkills[skill.id]"
                        class="remote-install-btn"
                        @click.stop="installSkill('tencent', skill)"
                      >{{ t('skills.install') }}</button>
                      <button
                        v-else-if="skill.installed || skillsStore.installingSkills[skill.id]?.status === 'completed'"
                        class="remote-uninstall-btn"
                        @click.stop="confirmUninstall(skill)"
                      >{{ t('skills.uninstall') }}</button>
                      <span v-else-if="skillsStore.installingSkills[skill.id]?.status === 'installing'" class="remote-installing-badge" @click.stop>
                        <svg class="animate-spin" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#E5E5EA" stroke-width="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#1C1C1E" stroke-width="3" stroke-linecap="round"/></svg>
                      </span>
                      <span v-else-if="skillsStore.installingSkills[skill.id]?.status === 'error'" class="remote-error-badge" :title="skillsStore.installingSkills[skill.id]?.error" @click.stop>
                        ✕ Error
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
      </div>


      <!-- ── CLAWHUB TAB ── -->
      <div v-else-if="activeTab === 'clawhub'" class="flex-1 flex flex-col overflow-hidden">

        <!-- Search row (always visible) -->
        <div class="tencent-search-row" style="display:flex;align-items:center;gap:0.75rem;padding:0.75rem 2rem 0;">
          <div class="tencent-search-wrap" style="flex:1;display:flex;align-items:center;position:relative;">
            <svg class="catalog-search-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
            </svg>
            <input
              v-model="clawhubSearchQuery"
              type="text"
              :placeholder="t('skills.searchSkills')"
              class="catalog-search-input"
              @keydown.enter="onClawhubSearch(clawhubSearchQuery)"
            />
            <span v-if="clawhubSearchQuery" class="catalog-search-clear" @click="clawhubSearchQuery = ''; onClawhubSearch('')">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </span>
          </div>
        </div>

        <!-- Error -->
        <div v-if="skillsStore.remoteError['clawhub'] && !skillsStore.remoteFetching['clawhub']" class="flex-1 flex items-center justify-center">
          <div class="text-center">
            <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#dc2626;">{{ skillsStore.remoteError['clawhub'] }}</p>
            <button @click="refreshRemote('clawhub')" class="mt-3 px-4 py-2 rounded-lg cursor-pointer" style="background:linear-gradient(135deg,#0F0F0F 0%,#1A1A1A 40%,#374151 100%); color:#fff; border:none; font-family:'Inter',sans-serif; font-weight:600; box-shadow:0 2px 8px rgba(0,0,0,0.12);">{{ t('skills.retry') }}</button>
          </div>
        </div>

        <!-- Grid area: spinner + content -->
        <div v-else class="flex-1 overflow-y-auto skill-grid-bg">
          <!-- Non-blocking spinner -->
          <div v-if="skillsStore.remoteFetching['clawhub']" class="skills-grid-spinner-overlay">
            <svg class="skills-spinner" viewBox="0 0 50 50">
              <circle cx="25" cy="25" r="20" fill="none" stroke-width="4" stroke="#1C1C1E" stroke-linecap="round" stroke-dasharray="90 60"/>
            </svg>
          </div>
          <!-- Empty results -->
          <div v-if="filteredClawhubSkills.length === 0 && !skillsStore.remoteFetching['clawhub']" class="flex items-center justify-center" style="padding:3.75rem 2rem; min-height:200px;">
            <div class="text-center">
              <svg class="mx-auto" style="width:40px;height:40px;color:#9CA3AF;margin-bottom:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
              </svg>
              <p style="font-family:'Inter',sans-serif;font-size:var(--fs-body);font-weight:600;color:#6B7280;margin:0 0 0.25rem;">{{ t('common.noResults') }}</p>
              <p style="font-family:'Inter',sans-serif;font-size:var(--fs-secondary);color:#9CA3AF;margin:0;">{{ t('skills.clearSearch') }}</p>
            </div>
          </div>
          <!-- Grid -->
          <div v-if="filteredClawhubSkills.length > 0" style="padding:1.5rem 2rem;">
            <div class="skill-grid">
              <div
                v-for="(skill, idx) in filteredClawhubSkills"
                :key="skill.id"
                class="skill-card remote-skill-card"
                @click="openRemoteDetail(skill)"
              >
                <div class="skill-card-accent" :style="{ background: cardGradient(idx) }"></div>
                <div class="skill-card-body">
                  <div class="skill-card-title-row">
                    <div class="skill-card-icon" :style="{ background: cardGradient(idx) }">
                      <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
                      </svg>
                    </div>
                    <h3 class="skill-card-name">{{ skill.name || skill.id }}</h3>
                  </div>
                  <p class="skill-card-desc">{{ skill.description || t('skills.noSkillsHint') }}</p>
                  <div class="skill-card-footer">
                    <div class="remote-skill-meta">
                      <span v-if="skill.author" class="remote-skill-author">
                        <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                        {{ skill.author }}
                      </span>
                      <span v-if="skill.stars" class="remote-skill-stat">
                        <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                        {{ skill.stars }}
                      </span>
                      <span v-if="skill.downloads" class="remote-skill-stat">
                        <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                        {{ skill.downloads }}
                      </span>
                    </div>
                  </div>

                  <div style="display: flex; justify-content: flex-end; align-items: center; gap: 0.5rem; padding-top: 0.5rem; border-top: 1px solid rgb(242, 242, 247); margin-top: 0.5rem;">
                    <button
                      class="rsd-icon-btn"
                      style="width:32px;height:32px;display:flex;align-items:center;justify-content:center;padding:0;border:none;background:none;cursor:pointer;color:#6B7280;transition:color 0.2s;"
                      title="Open in browser"
                      @click.stop="openExternal(skill.homepage, skill.sourceId, skill.id)"
                      @mouseenter="e => e.currentTarget.style.color='#1C1C1E'"
                      @mouseleave="e => e.currentTarget.style.color='#6B7280'"
                    >
                      <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                    </button>
                    <button
                      v-if="!skill.installed && !skillsStore.installingSkills[skill.id]"
                      class="remote-install-btn"
                      @click.stop="installSkill('clawhub', skill)"
                    >{{ t('skills.install') }}</button>
                    <button
                      v-else-if="skill.installed || skillsStore.installingSkills[skill.id]?.status === 'completed'"
                      class="remote-uninstall-btn"
                      @click.stop="confirmUninstall(skill)"
                    >{{ t('skills.uninstall') }}</button>
                    <span
                      v-else-if="skillsStore.installingSkills[skill.id]?.status === 'installing'"
                      class="remote-installing-badge"
                      @click.stop
                    >
                      <svg class="animate-spin" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="10" stroke="#E5E5EA" stroke-width="3"/><path d="M12 2a10 10 0 0 1 10 10" stroke="#1C1C1E" stroke-width="3" stroke-linecap="round"/></svg>
                    </span>
                    <span v-else-if="skillsStore.installingSkills[skill.id]?.status === 'error'" class="remote-error-badge" :title="skillsStore.installingSkills[skill.id]?.error" @click.stop>
                      ✕ Error
                    </span>
                  </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>

    </template>
    <template v-else>
      <!-- Row 1: back button + refresh (right) -->
      <div class="detail-header">
        <button @click="goBack" class="detail-back-btn">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <button
          @click="refreshTree"
          class="ml-auto p-1.5 rounded-lg transition-all duration-150 cursor-pointer"
          style="color:#fff; border:none; background:linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%); box-shadow:0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);"
          @mouseenter="e => e.currentTarget.style.background='linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)'"
          @mouseleave="e => e.currentTarget.style.background='linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'"
          :title="t('common.refresh')"
        >
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </button>
      </div>

      <!-- Row 2: icon + title (left) + path (right) -->
      <div class="detail-title-row">
        <div style="display:flex;align-items:center;gap:0.625rem;min-width:0;">
          <div class="detail-icon">
            <svg style="width:16px;height:16px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/>
            </svg>
          </div>
          <h1 class="detail-title">{{ skillDisplayName(selectedSkill) }}</h1>
        </div>
        <span class="detail-title-path" :title="selectedSkill.path">{{ selectedSkill.path }}</span>
      </div>

      <!-- File explorer + content viewer -->
      <div class="flex-1 flex overflow-hidden">

        <!-- LEFT: File tree sidebar (resizable) -->
        <div class="detail-sidebar" :style="{ width: skillsSidebarWidth + 'px' }">
          <!-- Resize handle -->
          <div
            class="skills-resize-handle"
            @mousedown="startSkillsResize"
          ></div>
          <!-- File tree -->
          <div class="flex-1 overflow-y-auto py-1.5" style="scrollbar-width:thin;">
            <div v-if="fileTree.length === 0" class="px-4 py-8 text-center">
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF;">{{ t('common.noData') }}</p>
            </div>
            <SkillTreeNode
              v-for="node in fileTree"
              :key="node.path"
              :node="node"
              :depth="0"
              :active-path="activeFilePath"
              :expanded-folders="expandedFolders"
              @select-file="openFile"
              @toggle-folder="toggleFolder"
              @context-menu="(e, node) => openSkillCtxMenu(e, node.path)"
            />
          </div>
        </div>

        <!-- RIGHT: File content viewer -->
        <div class="detail-content-area">
          <!-- No file selected -->
          <div v-if="!activeFilePath" class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <div class="detail-empty-icon">
                <svg style="width:32px;height:32px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
                </svg>
              </div>
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; margin-top:0.75rem;">Select a file to view its contents</p>
            </div>
          </div>

          <!-- File open -->
          <div v-else class="flex-1 flex flex-col overflow-hidden min-h-0">
            <!-- File header bar -->
            <div
              class="px-4 py-2.5 shrink-0 flex items-center gap-3"
              style="border-bottom:1px solid #E5E5EA; background:#F9F9F9;"
            >
              <svg style="width:16px;height:16px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <span style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#1A1A1A;">
                {{ activeFileName }}
              </span>
              <div class="ml-auto flex items-center gap-2">
                <!-- Copy source (markdown files only) -->
                <button
                  v-if="isMarkdownFile"
                  @click="copySource"
                  class="flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors cursor-pointer"
                  style="color:#9CA3AF; background:#F5F5F5; border:1px solid #E5E5EA; font-family:'Inter',sans-serif;"
                  @mouseenter="e => { e.currentTarget.style.background='#E5E5EA'; e.currentTarget.style.color='#1A1A1A' }"
                  @mouseleave="e => { e.currentTarget.style.background='#F5F5F5'; e.currentTarget.style.color='#9CA3AF' }"
                  title="Copy markdown source"
                >
                  <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                  {{ copied ? 'Copied' : 'Copy' }}
                </button>
              </div>
            </div>

            <!-- Content area -->
            <template v-if="loadingFile">
              <div class="flex-1 flex items-center justify-center">
                <p style="color:#9CA3AF; font-family:'Inter',sans-serif; font-size:var(--fs-body);">{{ t('common.loading') }}</p>
              </div>
            </template>
            <template v-else-if="fileError">
              <div class="flex-1 flex items-center justify-center">
                <p style="color:#dc2626; font-family:'Inter',sans-serif; font-size:var(--fs-body);">{{ fileError }}</p>
              </div>
            </template>

            <!-- Markdown: Read-only preview -->
            <div
              v-else-if="isMarkdownFile"
              class="flex-1 overflow-y-auto py-6"
              style="scrollbar-width:thin; display:flex; justify-content:center;"
            >
              <div
                class="prose-skills"
                style="outline:none;"
                v-html="formattedHtml"
              ></div>
            </div>

            <!-- Non-markdown: read-only raw view -->
            <div v-else class="detail-content-scroll">
              <pre class="detail-raw-code">{{ fileContent }}</pre>
            </div>
          </div>
        </div>
      </div>
    </template>

    <!-- ── Skills file tree context menu ── -->
    <Teleport to="body">
      <div v-if="skillCtxMenu.visible">
        <div class="skill-ctx-overlay" @click="closeSkillCtxMenu" @contextmenu.prevent="closeSkillCtxMenu"></div>
        <div
          class="skill-ctx-menu"
          :style="{ top: skillCtxMenu.y + 'px', left: skillCtxMenu.x + 'px' }"
          @click.stop
        >
          <button class="skill-ctx-item" @click="copySkillPath">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {{ skillCtxPathCopied ? 'Copied!' : 'Copy Path' }}
          </button>
          <button class="skill-ctx-item" @click="revealSkillInExplorer(skillCtxMenu.path)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            Open in Explorer
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ── Remote Skill Detail Modal ── -->
    <Teleport to="body">
      <Transition name="rsd-fade">
        <div v-if="remoteDetailSkill" class="rsd-overlay" @keydown.esc="remoteDetailSkill = null">
          <Transition name="rsd-slide">
            <div v-if="remoteDetailSkill" class="rsd-modal" role="dialog">
              <!-- drag handle -->
              <div style="display:flex;justify-content:center;padding:10px 0 4px;"><div style="width:36px;height:4px;border-radius:2px;background:rgba(60,60,67,0.15);"></div></div>

              <!-- sticky header -->
              <div class="rsd-header">
                <div style="display:flex;align-items:center;gap:12px;min-width:0;">
                  <div class="rsd-avatar">{{ (remoteDetailSkill.name || remoteDetailSkill.id || '?')[0].toUpperCase() }}</div>
                  <div style="min-width:0;">
                    <div style="display:flex;align-items:center;gap:7px;">
                      <h2 class="rsd-title">{{ remoteDetailSkill.name || remoteDetailSkill.id }}</h2>
                      <span v-if="remoteDetailSkill.category" class="rsd-category-badge">{{ remoteDetailSkill.category }}</span>
                    </div>
                    <span class="rsd-slug">{{ remoteDetailSkill.id }}</span>
                  </div>
                </div>
                <div style="display:flex;align-items:center;gap:8px;flex-shrink:0;">
                  <!-- Open homepage -->
                  <button class="rsd-icon-btn" title="Open in browser" @click="openExternal(remoteDetailSkill.homepage, remoteDetailSkill.sourceId, remoteDetailSkill.id)">
                    <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                  </button>
                  <!-- Close -->
                  <button class="rsd-icon-btn" @click="remoteDetailSkill = null">
                    <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                  </button>
                </div>
              </div>

              <!-- body -->
              <div class="rsd-body">

                <!-- tags row -->
                <div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap;">
                  <span v-if="remoteDetailSkill.version" class="rsd-tag rsd-tag--black">
                    <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7"/><path d="m7.5 4.27 9 5.15"/></svg>
                    v{{ remoteDetailSkill.version }}
                  </span>
                  <span v-if="remoteDetailSkill.sourceId" class="rsd-tag rsd-tag--black">
                    <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
                    {{ remoteDetailSkill.sourceId === 'tencent' || remoteDetailSkill.sourceId === 'tencent-top' ? 'Tencent Hub' : 'ClawHub' }}
                  </span>
                  <span v-if="remoteDetailSkill.author" class="rsd-tag rsd-tag--black">
                    <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
                    {{ remoteDetailSkill.author }}
                  </span>
                </div>

                <!-- description -->
                <div v-if="remoteDetailSkill.description">
                  <p class="rsd-desc">{{ remoteDetailSkill.description }}</p>
                  <div v-if="remoteDetailSkill.homepage" style="margin-top:10px;">
                    <span class="rsd-source-hint">详情查看：<button class="rsd-link-btn" @click="openExternal(remoteDetailSkill.homepage)">{{ remoteDetailSkill.homepage }}<span style="display:inline-block;margin-left:2px;font-size:10px;">↗</span></button></span>
                  </div>
                </div>

                <!-- stats grid -->
                <div class="rsd-stats-grid">
                  <div class="rsd-stat-cell">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                    <div class="rsd-stat-value">{{ remoteDetailSkill.downloads ? remoteDetailSkill.downloads.toLocaleString() : '—' }}</div>
                    <div class="rsd-stat-label">下载量</div>
                  </div>
                  <div class="rsd-stat-cell">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
                    <div class="rsd-stat-value">{{ remoteDetailSkill.stars ? remoteDetailSkill.stars.toLocaleString() : '—' }}</div>
                    <div class="rsd-stat-label">收藏</div>
                  </div>
                  <div class="rsd-stat-cell">
                    <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
                    <div class="rsd-stat-value">{{ remoteDetailSkill.installs ? remoteDetailSkill.installs.toLocaleString() : '—' }}</div>
                    <div class="rsd-stat-label">安装量</div>
                  </div>
                </div>


              </div>

              <!-- sticky footer: error left, action right -->
              <div class="rsd-footer">
                <div class="rsd-footer-left">
                  <span v-if="skillsStore.installingSkills[remoteDetailSkill.id]?.status === 'error'" class="rsd-error-hint">
                    <svg style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {{ skillsStore.installingSkills[remoteDetailSkill.id]?.error }}
                  </span>
                </div>
                <div class="rsd-footer-right">
                  <span v-if="skillsStore.installingSkills[remoteDetailSkill.id]?.status === 'installing'" class="rsd-state-chip rsd-state-chip--loading">
                    <svg class="animate-spin" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
                    {{ t('skills.installing') }}
                  </span>
                  <span v-else-if="remoteDetailSkill.installed || skillsStore.installingSkills[remoteDetailSkill.id]?.status === 'completed'" class="rsd-state-chip rsd-state-chip--done">
                    <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                    {{ t('skills.installed') }}
                  </span>
                  <span v-else-if="skillsStore.installingSkills[remoteDetailSkill.id]?.status === 'error'" class="rsd-state-chip rsd-state-chip--error">
                    <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
                    {{ t('skills.installError') }}
                  </span>
                </div>
              </div>

            </div>
          </Transition>
        </div>
      </Transition>
    </Teleport>

    <!-- Uninstall Confirm Dialog -->
    <div v-if="showUninstallDialog" class="uninstall-dialog-backdrop">
      <div class="uninstall-dialog">
        <div class="uninstall-dialog-title">{{ t('skills.uninstallConfirmTitle') }}</div>
        <div class="uninstall-dialog-desc">{{ uninstallSkill ? (uninstallSkill.name || uninstallSkill.id) : '' }}</div>
        <div class="uninstall-dialog-actions">
          <button class="uninstall-cancel-btn" @click="cancelUninstall">{{ t('common.cancel') }}</button>
          <button class="uninstall-confirm-btn" @click="doUninstall">{{ t('skills.uninstall') }}</button>
        </div>
      </div>
    </div>

  </div>
</template>

<script setup>
import { ref, computed, reactive, watch, onBeforeUnmount, defineComponent, h, Teleport } from 'vue'
import { marked } from 'marked'
import DOMPurify from 'dompurify'
import { useSkillsStore } from '../stores/skills'
import { useConfigStore } from '../stores/config'
import { useI18n } from '../i18n/useI18n'
import AppButton from '../components/common/AppButton.vue'

const { t } = useI18n()
const skillsStore = useSkillsStore()
const configStore = useConfigStore()

// ── Uninstall dialog state (must be after skillsStore) ──
const showUninstallDialog = ref(false)
const uninstallSkill = ref(null)

function confirmUninstall(skill) {
  uninstallSkill.value = skill
  showUninstallDialog.value = true
}

function doUninstall() {
  if (uninstallSkill.value) {

    skillsStore.uninstallRemoteSkill(uninstallSkill.value.id)
  }
  showUninstallDialog.value = false
  uninstallSkill.value = null
}

function cancelUninstall() {
  showUninstallDialog.value = false
  uninstallSkill.value = null
}

function cardGradient() {
  return 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'
}

function formatName(name) {
  return name
    .replace(/--/g, ' — ')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase())
}

/**
 * Parse skill text — strip YAML frontmatter, extract description.
 * Handles both multi-line and single-line frontmatter.
 */
function parseSkillMeta(text) {
  if (!text) return { name: '', description: '' }

  // Multi-line frontmatter: ---\n...\n---
  const multiLine = text.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (multiLine) {
    const meta = {}
    for (const line of multiLine[1].split('\n')) {
      const m = line.match(/^(\w[\w-]*):\s*(.*)$/)
      if (m) meta[m[1]] = m[2].replace(/^["']|["']$/g, '').trim()
    }
    const body = multiLine[2].trim()
    return { name: meta.name || '', description: meta.description || body || '' }
  }

  // Single-line / broken frontmatter: "--- name: foo description: bar"
  const singleLine = text.match(/^---\s*/)
  if (singleLine) {
    const stripped = text.replace(/^---\s*/, '').replace(/\s*---\s*$/, '')
    const descMatch = stripped.match(/description:\s*["']?(.*?)["']?\s*$/)
    const desc = descMatch ? descMatch[1] : ''
    const nameMatch = stripped.match(/name:\s*["']?(.*?)["']?\s*(?:description:|$)/)
    const name = nameMatch ? nameMatch[1].trim() : ''
    return { name, description: desc || stripped }
  }

  return { name: '', description: text }
}

/** Get clean description for a skill, stripping any frontmatter. */
function skillDescription(skill) {
  // If backend already parsed it, use that
  if (skill.description) return skill.description
  const parsed = parseSkillMeta(skill.summary || '')
  return parsed.description || 'No description available'
}

/** Get display name for a skill. */
function skillDisplayName(skill) {
  if (skill.displayName) return skill.displayName
  const parsed = parseSkillMeta(skill.summary || '')
  if (parsed.name) return formatName(parsed.name)
  return formatName(skill.name)
}

// ── Tabs: local / tencent / clawhub ──
const activeTab = ref('local') // 'local' | 'tencent' | 'clawhub'

// ── Tencent sub-tabs & categories ──
const tencentSubTab = ref('top50') // 'top50' | 'all'
const tencentSelectedCategory = ref('')
const tencentSearchQuery = ref('')
const tencentSortBy = ref('downloads')

const tencentCategories = [
  { name: 'AI 智能',  slug: 'ai-intelligence',   bg: 'rgba(0, 122, 255, 0.1)',   border: 'rgba(0, 122, 255, 0.133)',  color: '#007AFF' },
  { name: '开发工具', slug: 'development-tools',  bg: 'rgba(88, 86, 214, 0.1)',  border: 'rgba(88, 86, 214, 0.133)', color: '#5856D6' },
  { name: '效率提升', slug: 'productivity',        bg: 'rgba(52, 199, 89, 0.1)',  border: 'rgba(52, 199, 89, 0.133)', color: '#34C759' },
  { name: '数据分析', slug: 'data-analytics',      bg: 'rgba(255, 149, 0, 0.1)', border: 'rgba(255, 149, 0, 0.133)', color: '#FF9500' },
  { name: '内容创作', slug: 'content-creation',    bg: 'rgba(255, 45, 85, 0.1)', border: 'rgba(255, 45, 85, 0.133)', color: '#FF2D55' },
  { name: '安全合规', slug: 'security-compliance', bg: 'rgba(50, 173, 230, 0.1)',border: 'rgba(50, 173, 230, 0.133)',color: '#32ADE6' },
  { name: '通讯协作', slug: 'communication',        bg: 'rgba(48, 209, 88, 0.1)', border: 'rgba(48, 209, 88, 0.133)', color: '#30D158' },
]

function categoryIconSvg(slug, color) {
  const icons = {
    'ai-intelligence': `<path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/><path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/><path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/><path d="M17.599 6.5a3 3 0 0 0 .399-1.375"/><path d="M6.003 5.125A3 3 0 0 0 6.401 6.5"/><path d="M3.477 10.896a4 4 0 0 1 .585-.396"/><path d="M19.938 10.5a4 4 0 0 1 .585.396"/><path d="M6 18a4 4 0 0 1-1.967-.516"/><path d="M19.967 17.484A4 4 0 0 1 18 18"/>`,
    'development-tools': `<path d="m18 16 4-4-4-4"/><path d="m6 8-4 4 4 4"/><path d="m14.5 4-5 16"/>`,
    'productivity': `<path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z"/><path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z"/><path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0"/><path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5"/>`,
    'data-analytics': `<path d="M3 3v16a2 2 0 0 0 2 2h16"/><path d="M18 17V9"/><path d="M13 17V5"/><path d="M8 17v-3"/>`,
    'content-creation': `<path d="M15.707 21.293a1 1 0 0 1-1.414 0l-1.586-1.586a1 1 0 0 1 0-1.414l5.586-5.586a1 1 0 0 1 1.414 0l1.586 1.586a1 1 0 0 1 0 1.414z"/><path d="m18 13-1.375-6.874a1 1 0 0 0-.746-.776L3.235 2.028a1 1 0 0 0-1.207 1.207L5.35 15.879a1 1 0 0 0 .776.746L13 18"/><path d="m2.3 2.3 7.286 7.286"/><circle cx="11" cy="11" r="2"/>`,
    'security-compliance': `<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/>`,
    'communication': `<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>`,
  }
  const paths = icons[slug] || ''
  return `<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`
}

function switchTencentSubTab(sub) {
  tencentSubTab.value = sub
  if (sub === 'top50' && !skillsStore.remoteSkills['tencent-top']) {
    skillsStore.fetchRemoteSkills('tencent-top')
  }
  if (sub === 'all' && !skillsStore.remoteSkills['tencent']) {
    skillsStore.fetchRemoteSkills('tencent')
  }
}

function selectTencentCategory(slug) {
  if (tencentSelectedCategory.value === slug) {
    tencentSelectedCategory.value = ''
  } else {
    tencentSelectedCategory.value = slug
  }
  onTencentSearch()
}

function switchTab(tab) {
  activeTab.value = tab
  if (tab === 'local') {
    refresh()
  }
  if (tab === 'tencent' && !skillsStore.remoteSkills['tencent-top']) {
    skillsStore.fetchRemoteSkills('tencent-top')
  }
  if (tab === 'clawhub' && !skillsStore.remoteSkills['clawhub']) {
    skillsStore.fetchRemoteSkills('clawhub')
  }
}

// ── Remote search queries ──
// Already declared above
const clawhubSearchQuery = ref('')
let clawhubSearchTimer = null

function onClawhubSearch(val) {
  if (clawhubSearchTimer) clearTimeout(clawhubSearchTimer)
  clawhubSearchTimer = setTimeout(() => {
    skillsStore.fetchRemoteSkills('clawhub', val.trim() ? { keyword: val.trim() } : {})
  }, 400)
}

watch(clawhubSearchQuery, (val) => onClawhubSearch(val))

const filteredTencentTopSkills = computed(() => {
  const list = skillsStore.remoteSkills['tencent-top'] || []
  const q = tencentSearchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(s => (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
})

const filteredTencentSkills = computed(() => {
  const list = skillsStore.remoteSkills['tencent'] || []
  const q = tencentSearchQuery.value.trim().toLowerCase()
  if (!q) return list
  return list.filter(s => (s.name || '').toLowerCase().includes(q) || (s.description || '').toLowerCase().includes(q))
})

// Unified helpers for tencent tab (shared between top50/all sub-tabs)
const tencentDisplaySkills = computed(() => {
  const list = tencentSubTab.value === 'top50' ? filteredTencentTopSkills.value : filteredTencentSkills.value
  return list.map(skill => ({
    ...skill,
    icon: skill.name ? skill.name[0] : ''
  }))
})

function onTencentSearch() {
  fetchTencentSkills()
}

let tencentSearchTimer = null
watch(tencentSearchQuery, () => {
  if (tencentSearchTimer) clearTimeout(tencentSearchTimer)
  tencentSearchTimer = setTimeout(() => { fetchTencentSkills() }, 350)
})

async function fetchTencentSkills() {
  const params = {
    sortBy: tencentSortBy.value,
    order: 'desc',
    page: 1,
    pageSize: 24,
  }
  if (tencentSearchQuery.value.trim()) params.keyword = tencentSearchQuery.value.trim()
  if (tencentSelectedCategory.value) params.category = tencentSelectedCategory.value
  await skillsStore.fetchRemoteSkills('tencent', params)
}
const tencentFetching = computed(() =>
  !!skillsStore.remoteFetching[tencentSubTab.value === 'top50' ? 'tencent-top' : 'tencent']
)
const tencentFetchError = computed(() =>
  skillsStore.remoteError[tencentSubTab.value === 'top50' ? 'tencent-top' : 'tencent'] || null
)
const tencentFetched = computed(() =>
  !!skillsStore.remoteSkills[tencentSubTab.value === 'top50' ? 'tencent-top' : 'tencent']
)

const filteredClawhubSkills = computed(() => {
  return skillsStore.remoteSkills['clawhub'] || []
})

// Sort local skills by installed date (newest first)
const sortedLocalSkills = computed(() => {
  const sorted = [...filteredSkills.value].sort((a, b) => {
    const dateA = a.installedAt ? new Date(a.installedAt).getTime() : 0
    const dateB = b.installedAt ? new Date(b.installedAt).getTime() : 0
    return dateB - dateA
  })
  return sorted
})

// Format date for display
function formatDate(dateStr) {
  try {
    return new Date(dateStr).toISOString().split('T')[0]
  } catch {
    return 'Unknown'
  }
}

async function refreshRemote(sourceId) {
  if (sourceId === 'tencent') {
    if (tencentSubTab.value === 'top50') {
      await skillsStore.fetchRemoteSkills('tencent-top')
    } else {
      const cat = tencentSelectedCategory.value
      await skillsStore.fetchRemoteSkills('tencent', cat ? { category: cat } : {})
    }
    return
  }
  const query = clawhubSearchQuery.value
  await skillsStore.fetchRemoteSkills(sourceId, query.trim() ? { keyword: query.trim() } : {})
}

// ── Install success toast ──
const installToast = ref('')
let installToastTimer = null

function showInstallToast(msg) {
  installToast.value = msg
  if (installToastTimer) clearTimeout(installToastTimer)
  installToastTimer = setTimeout(() => { installToast.value = '' }, 3000)
}

watch(() => skillsStore.installingSkills, (map) => {
  for (const [skillId, state] of Object.entries(map)) {
    if (state.status === 'completed' && !state._toasted) {
      state._toasted = true
      const skill = skillsStore.allRemoteSkills.find(s => s.id === skillId)
      const name = skill?.name || skillId
      showInstallToast(`${name} — ${t('skills.installSuccess')}`)
      // Note: no auto tab switch – user switches to local tab manually and it auto-refreshes
    }
  }
}, { deep: true })

function installSkill(sourceId, skill) {
  if (!skill.downloadUrl) {
    return
  }
  skillsStore.installRemoteSkill(sourceId, skill.id, skill.downloadUrl, configStore.config.skillsPath)
}

// ── Remote skill detail modal ──
const remoteDetailSkill = ref(null)

function openRemoteDetail(skill) {
  remoteDetailSkill.value = skill
}

function installFromModal() {
  const skill = remoteDetailSkill.value
  if (!skill || !skill.downloadUrl) return
  const sourceId = (skill.sourceId === 'tencent-top' || skill.sourceId === 'tencent') ? 'tencent' : 'clawhub'
  skillsStore.installRemoteSkill(sourceId, skill.id, skill.downloadUrl, configStore.config.skillsPath)
}

function openExternal(url, sourceId, skillId) {
  let finalUrl = url
  
  // If no URL but we have sourceId and skillId, construct the appropriate hub URL
  if (!url && sourceId && skillId) {
    if (sourceId === 'tencent' || sourceId === 'tencent-top') {
      // Tencent hub URL format
      finalUrl = `https://lightmake.site/skill/${skillId}`
    } else if (sourceId === 'clawhub') {
      // ClawHub URL format - needs owner info, fallback to main site
      finalUrl = `https://clawhub.ai/skills/${skillId}`
    }
  }
  
  if (finalUrl) window.electronAPI?.openExternal(finalUrl)
}

const searchQuery = ref('')

const filteredSkills = computed(() => {
  const q = searchQuery.value.trim().toLowerCase()
  if (!q) {
    return skillsStore.skills
  }
  const filtered = skillsStore.skills.filter(skill => {
    const name = (skill.displayName || skill.name || '').toLowerCase()
    const desc = skillDescription(skill).toLowerCase()
    const summary = (skill.summary || '').toLowerCase()
    const prompt = (skill.systemPrompt || '').toLowerCase()
    return name.includes(q) || desc.includes(q) || summary.includes(q) || prompt.includes(q)
  })
  return filtered
})

const selectedSkill = ref(null)
const fileTree = ref([])
const activeFilePath = ref(null)
const activeFileName = ref('')
const fileContent = ref('')
const loadingFile = ref(false)
const fileError = ref(null)
const expandedFolders = reactive({})

// ── Context menu ──
const skillCtxMenu = ref({ visible: false, x: 0, y: 0, path: '' })
const skillCtxPathCopied = ref(false)

function openSkillCtxMenu(e, path) {
  e.preventDefault()
  e.stopPropagation()
  const x = Math.min(e.clientX, window.innerWidth - 200)
  const y = Math.min(e.clientY, window.innerHeight - 80)
  skillCtxPathCopied.value = false
  skillCtxMenu.value = { visible: true, x, y, path }
}

function closeSkillCtxMenu() {
  skillCtxMenu.value.visible = false
}

function copySkillPath() {
  navigator.clipboard.writeText(skillCtxMenu.value.path)
  skillCtxPathCopied.value = true
  setTimeout(() => {
    skillCtxPathCopied.value = false
    closeSkillCtxMenu()
  }, 900)
}

function revealSkillInExplorer(path) {
  window.electronAPI.showInFolder(path)
  closeSkillCtxMenu()
}

const isMarkdownFile = computed(() => {
  if (!activeFileName.value) return false
  return activeFileName.value.endsWith('.md')
})

// ── Editing state ──
const editorContent = ref('')
const copied = ref(false)
let copiedTimer = null
const formattedHtml = ref('')

marked.use({ gfm: true, breaks: true })

function refreshFormattedHtml() {
  if (!editorContent.value) { formattedHtml.value = ''; return }
  try {
    const raw = marked.parse(editorContent.value)
    formattedHtml.value = DOMPurify.sanitize(raw)
  } catch { formattedHtml.value = '' }
}

watch(editorContent, (val) => {
  if (val !== fileContent.value) {
    fileContent.value = val
  }
  refreshFormattedHtml()
})

onBeforeUnmount(() => {
  if (copiedTimer) clearTimeout(copiedTimer)
  if (clawhubSearchTimer) clearTimeout(clawhubSearchTimer)
})

function copySource() {
  navigator.clipboard.writeText(editorContent.value).catch(() => {})
  copied.value = true
  if (copiedTimer) clearTimeout(copiedTimer)
  copiedTimer = setTimeout(() => { copied.value = false }, 2000)
}

async function refresh() {
  await skillsStore.loadSkills(configStore.config.skillsPath)
  await skillsStore.loadSkillPrompts(configStore.config.skillsPath)
  if (selectedSkill.value && !skillsStore.skills.find(s => s.id === selectedSkill.value.id)) {
    goBack()
  }
}

function goBack() {
  selectedSkill.value = null
  fileTree.value = []
  activeFilePath.value = null
  activeFileName.value = ''
  fileContent.value = ''
  fileError.value = null
}

async function selectSkill(skill) {
  selectedSkill.value = skill
  activeFilePath.value = null
  activeFileName.value = ''
  fileContent.value = ''
  fileError.value = null
  Object.keys(expandedFolders).forEach(k => delete expandedFolders[k])
  if (!window.electronAPI?.skills?.readTree) return
  try {
    fileTree.value = await window.electronAPI.skills.readTree(skill.path)
  } catch {
    fileTree.value = []
  }
  // Auto-open SKILL.md (or first .md file as fallback)
  const skillMd = fileTree.value.find(n => n.type === 'file' && n.name === 'SKILL.md')
  const fallbackMd = !skillMd && fileTree.value.find(n => n.type === 'file' && n.name.endsWith('.md'))
  const autoOpen = skillMd || fallbackMd
  if (autoOpen) {
    openFile(autoOpen.path, autoOpen.name)
  }
}

async function openFile(filePath, fileName) {
  activeFilePath.value = filePath
  activeFileName.value = fileName
  fileContent.value = ''
  editorContent.value = ''
  fileError.value = null
  loadingFile.value = true
  if (!window.electronAPI?.skills?.readFile) return
  try {
    const result = await window.electronAPI.skills.readFile(filePath)
    if (result.error) {
      fileError.value = result.error
    } else {
      fileContent.value = result.content
      editorContent.value = result.content
      refreshFormattedHtml()
    }
  } catch (err) {
    fileError.value = err.message
  } finally {
    loadingFile.value = false
  }
}

async function refreshTree() {
  if (!selectedSkill.value || !window.electronAPI?.skills?.readTree) return
  try {
    fileTree.value = await window.electronAPI.skills.readTree(selectedSkill.value.path)
  } catch {
    fileTree.value = []
  }
}

function toggleFolder(folderPath) {
  expandedFolders[folderPath] = !expandedFolders[folderPath]
}

// ── Resizable sidebar ──
const skillsSidebarWidth = ref(260)

function startSkillsResize(e) {
  e.preventDefault()
  const startX = e.clientX
  const startW = skillsSidebarWidth.value

  function onMouseMove(ev) {
    const delta = ev.clientX - startX
    const newW = Math.min(600, Math.max(180, startW + delta))
    skillsSidebarWidth.value = newW
  }
  function onMouseUp() {
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', onMouseUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMouseMove)
  document.addEventListener('mouseup', onMouseUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// ── File-type icon helper ──
function fileTypeIcon(name, color, active = false) {
  const s = `width:18px;height:18px;flex-shrink:0;color:${color};`
  const ext = (name.split('.').pop() || '').toLowerCase()

  // Markdown — official Markdown Mark (dcurtis/markdown-mark), solid variant
  if (ext === 'md') {
    return h('svg', { style: `width:22px;height:14px;flex-shrink:0;`, viewBox: '0 0 208 128', fill: active ? '#fff' : '#1e1e1e' }, [
      h('path', { d: 'M193 128H15a15 15 0 0 1-15-15V15A15 15 0 0 1 15 0h178a15 15 0 0 1 15 15v98a15 15 0 0 1-15 15zM50 98V59l20 25 20-25v39h20V30H90L70 55 50 30H30v68zm134-34h-20V30h-20v34h-20l30 35z' })
    ])
  }

  // Draw.io — official diagrams.net icon (Simple Icons), brand orange #F08705
  if (ext === 'drawio') {
    return h('svg', { style: `width:18px;height:18px;flex-shrink:0;`, viewBox: '0 0 24 24', fill: active ? '#fff' : '#F08705' }, [
      h('path', { d: 'M19.69 13.419h-2.527l-2.667-4.555a1.292 1.292 0 001.035-1.28V4.16c0-.725-.576-1.312-1.302-1.312H9.771c-.726 0-1.312.576-1.312 1.301v3.435c0 .619.426 1.152 1.034 1.28l-2.666 4.555H4.309c-.725 0-1.312.576-1.312 1.301v3.435c0 .725.576 1.312 1.302 1.312h4.458c.726 0 1.312-.576 1.312-1.302v-3.434c0-.726-.576-1.312-1.301-1.312h-.437l2.645-4.523h2.059l2.656 4.523h-.438c-.725 0-1.312.576-1.312 1.301v3.435c0 .725.576 1.312 1.302 1.312H19.7c.726 0 1.312-.576 1.312-1.302v-3.434c0-.726-.576-1.312-1.301-1.312zM24 22.976c0 .565-.459 1.024-1.013 1.024H1.024A1.022 1.022 0 010 22.987V1.024C0 .459.459 0 1.013 0h21.963C23.541 0 24 .459 24 1.013z' })
    ])
  }

  if (ext === 'json') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1' }),
      h('path', { d: 'M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1' }),
    ])
  }

  if (['js', 'ts', 'jsx', 'tsx', 'mjs', 'cjs'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('polyline', { points: '16 18 22 12 16 6' }),
      h('polyline', { points: '8 6 2 12 8 18' }),
    ])
  }

  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }),
      h('circle', { cx: '8.5', cy: '8.5', r: '1.5' }),
      h('polyline', { points: '21 15 16 10 5 21' }),
    ])
  }

  if (ext === 'pdf') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('path', { d: 'M9 15h1a1 1 0 0 0 0-2H9v4' }),
      h('path', { d: 'M14 13h1.5a1.5 1.5 0 0 1 0 3H14v-3z' }),
    ])
  }

  if (['txt', 'log', 'env', 'ini', 'cfg', 'conf', 'toml', 'yaml', 'yml'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('line', { x1: '8', y1: '13', x2: '16', y2: '13' }),
      h('line', { x1: '8', y1: '17', x2: '13', y2: '17' }),
    ])
  }

  return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('polyline', { points: '14 2 14 8 20 8' }),
  ])
}

// ── SkillTreeNode: recursive file tree component (matches DocsView TreeNode) ──
const SkillTreeNode = defineComponent({
  name: 'SkillTreeNode',
  props: {
    node: Object,
    depth: Number,
    activePath: String,
    expandedFolders: Object
  },
  emits: ['select-file', 'toggle-folder', 'context-menu'],
  setup(props, { emit }) {
    const hovered = ref(false)

    return () => {
      const isDir = props.node.type === 'dir'
      const isExpanded = props.expandedFolders[props.node.path]
      const isActive = props.activePath === props.node.path
      const indent = 12 + props.depth * 18

      const children = []

      children.push(
        h('div', {
          class: 'flex items-center gap-2 py-1.5 pr-2 cursor-pointer',
          style: {
            paddingLeft: indent + 'px',
            background: isActive ? 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)' : (hovered.value ? 'rgba(0,0,0,0.03)' : 'transparent'),
            color: isActive ? '#fff' : '#6B7280',
            boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)' : 'none',
            borderRadius: isActive ? '0.5rem' : '0',
            margin: isActive ? '0 0.5rem' : '0',
            fontFamily: "'Inter',sans-serif",
            fontSize: 'var(--fs-secondary)',
            transition: 'background 0.15s, color 0.15s, box-shadow 0.15s',
          },
          onClick: () => {
            if (isDir) emit('toggle-folder', props.node.path)
            else emit('select-file', props.node.path, props.node.name)
          },
          onContextmenu: (e) => { e.preventDefault(); e.stopPropagation(); emit('context-menu', e, props.node) },
          onMouseenter: () => { hovered.value = true },
          onMouseleave: () => { hovered.value = false },
        }, [
          isDir ? h('svg', {
            style: {
              width: '14px', height: '14px', flexShrink: 0, color: isActive ? '#fff' : '#9CA3AF',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s'
            },
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2'
          }, [h('polyline', { points: '9 18 15 12 9 6' })]) : h('span', { style: 'width:14px;display:inline-block;' }),

          isDir
            ? h('svg', { style: `width:18px;height:18px;flex-shrink:0;color:${isActive ? '#fff' : '#6B7280'};`, viewBox: '0 0 24 24', fill: 'currentColor' }, [
                h('path', { d: 'M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z' })
              ])
            : fileTypeIcon(props.node.name, isActive ? '#fff' : '#9CA3AF', isActive),

          h('span', {
            class: 'truncate flex-1',
            style: { fontWeight: isDir ? '600' : '400' }
          }, props.node.name.replace(/\.md$/, ''))
        ])
      )

      if (isDir && isExpanded && props.node.children) {
        for (const child of props.node.children) {
          children.push(
            h(SkillTreeNode, {
              node: child,
              depth: props.depth + 1,
              activePath: props.activePath,
              expandedFolders: props.expandedFolders,
              'onSelect-file': (p, n) => emit('select-file', p, n),
              'onToggle-folder': (p) => emit('toggle-folder', p),
              'onContext-menu': (e, node) => emit('context-menu', e, node),
            })
          )
        }
      }

      return h('div', null, children)
    }
  }
})
</script>

<style>
/* ══════════════════════════════════════════════════════════════════════════
   LEVEL 1 — Catalog Header + Search
   ══════════════════════════════════════════════════════════════════════════ */
.catalog-header {
  flex-shrink: 0;
  padding: 1rem 1.5rem 0.875rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.catalog-count-badge {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  padding: 0.1875rem 0.5rem;
  border-radius: 9999px;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  line-height: 1.4;
}

/* ── Search bar ────────────────────────────────────────────────────────── */
.catalog-search-wrap {
  position: relative;
  margin-top: 0.875rem;
}
.catalog-search-icon {
  position: absolute;
  left: 0.875rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.125rem;
  height: 1.125rem;
  color: #9CA3AF;
  pointer-events: none;
  transition: color 0.2s;
}
.catalog-search-input {
  width: 100%;
  padding: 0.6875rem 2.625rem 0.6875rem 2.625rem;
  border-radius: 0.75rem;
  border: 1.5px solid #D1D1D6;
  background: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #1A1A1A;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06);
}
.catalog-search-input::placeholder {
  color: #9CA3AF;
  font-weight: 400;
}
.catalog-search-input:hover {
  border-color: #9CA3AF;
}
.catalog-search-input:focus {
  border-color: #1A1A1A;
  box-shadow: 0 0 0 3px rgba(0, 0, 0, 0.06);
}
.catalog-search-wrap:focus-within .catalog-search-icon {
  color: #1A1A1A;
}
.catalog-search-clear {
  position: absolute;
  right: 0.625rem;
  top: 50%;
  transform: translateY(-50%);
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 0.4375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  color: #9CA3AF;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
}
.catalog-search-clear:hover {
  background: #F5F5F5;
  color: #6B7280;
}

/* ── Catalog Tabs ──────────────────────────────────────────────────────── */
.catalog-tabs {
  display: flex;
  gap: 0.25rem;
  margin-top: 0.875rem;
  border-bottom: 1.5px solid #E5E5EA;
  padding-bottom: 0;
}
.catalog-tab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.5rem 0.875rem;
  border: none;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #9CA3AF;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  margin-bottom: -1.5px;
  border-radius: 0.375rem 0.375rem 0 0;
  transition: color 0.15s, border-color 0.15s, background 0.15s;
}
.catalog-tab:hover {
  color: #374151;
  background: rgba(0,0,0,0.03);
}
.catalog-tab--active {
  color: #1A1A1A;
  font-weight: 600;
  border-bottom-color: #1A1A1A;
}

/* ── Tencent sub-tab bar ──────────────────────────────────────────────── */
.tencent-subtab-bar {
  display: flex;
  gap: 0.25rem;
  padding: 0.5rem 1.5rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
}
.tencent-subtab {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.375rem 0.875rem;
  border: 1.5px solid transparent;
  border-radius: 0.5rem;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #9CA3AF;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tencent-subtab:hover {
  background: rgba(0,0,0,0.04);
  color: #374151;
}
.tencent-subtab--active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

/* ── Tencent category bar ─────────────────────────────────────────────── */
.tencent-category-bar {
  flex-shrink: 0;
  padding: 0.875rem 1.5rem;
  background: #F2F2F7;
  border-bottom: 1px solid #E5E5EA;
  overflow-y: auto;
  max-height: 40vh;
  scrollbar-width: thin;
  scrollbar-color: #D1D1D6 transparent;
}
.tencent-category-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(88px, 1fr));
  gap: 0.625rem;
}
.tencent-cat-btn {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 0.375rem;
  border-radius: 1rem;
  background: rgba(255, 255, 255, 0.8);
  backdrop-filter: blur(20px) saturate(180%);
  border: 1.5px solid rgba(255, 255, 255, 0.9);
  box-shadow: rgba(255,255,255,0.95) 0px 1px 0px inset, rgba(0,0,0,0.05) 0px 2px 10px;
  cursor: pointer;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s, border-color 0.2s;
}
.tencent-cat-btn:hover {
  transform: scale(1.06);
  box-shadow: rgba(255,255,255,0.95) 0px 1px 0px inset, rgba(0,0,0,0.10) 0px 4px 16px;
}
.tencent-cat-btn--active {
  border-color: #1A1A1A;
  background: rgba(255, 255, 255, 1);
  box-shadow: rgba(255,255,255,0.95) 0px 1px 0px inset, rgba(0,0,0,0.15) 0px 4px 16px;
}
.tencent-cat-icon-wrap {
  width: 2.75rem;
  height: 2.75rem;
  border-radius: 0.875rem;
  display: flex;
  align-items: center;
  justify-content: center;
  transition: transform 0.25s cubic-bezier(0.34, 1.56, 0.64, 1);
}
.tencent-cat-btn:hover .tencent-cat-icon-wrap {
  transform: scale(1.1);
}
.tencent-cat-label {
  display: block;
  font-size: 0.6875rem;
  font-weight: 700;
  letter-spacing: 0.01em;
  color: #3A3A3C;
  font-family: 'Inter', sans-serif;
  text-align: center;
  line-height: 1.3;
}

/* ── Grid background: flat iOS style ──────────────────────────────────── */
.skill-grid-bg {
  background: #F2F2F7;
  scrollbar-width: thin;
  scrollbar-color: #D1D5DB transparent;
}
.skill-grid-bg::-webkit-scrollbar {
  width: 6px;
}
.skill-grid-bg::-webkit-scrollbar-track {
  background: transparent;
}
.skill-grid-bg::-webkit-scrollbar-thumb {
  background: #D1D5DB;
  border-radius: 3px;
}
.skill-grid-bg::-webkit-scrollbar-thumb:hover {
  background: #9CA3AF;
}

/* ── Skills Grid ───────────────────────────────────────────────────────────── */
.skill-grid {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 1rem;
}
@media (max-width: 1800px) { .skill-grid { grid-template-columns: repeat(5, 1fr); } }
@media (max-width: 1400px) { .skill-grid { grid-template-columns: repeat(4, 1fr); } }
@media (max-width: 1100px) { .skill-grid { grid-template-columns: repeat(3, 1fr); } }

/* ── Skill Card — iOS Minimalist ─────────────────────────────────────── */
.skill-card {
  position: relative;
  display: flex;
  flex-direction: column;
  border-radius: 1rem;
  cursor: pointer;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  overflow: hidden;
  transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              box-shadow 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              border-color 0.25s cubic-bezier(0.4, 0, 0.2, 1),
              background 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
}
.skill-card:hover {
  transform: translateY(-0.1875rem);
  background: #FFFFFF;
  border-color: #D1D1D6;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.08);
}
.skill-card:active {
  transform: translateY(-0.0625rem);
  transition-duration: 0.1s;
}

/* Top accent bar */
.skill-card-accent {
  height: 4px;
  width: 100%;
  flex-shrink: 0;
}

/* Card body — single section */
.skill-card-body {
  padding: 1.25rem 1.25rem 1rem;
  display: flex;
  flex-direction: column;
  flex: 1;
}

/* Icon + title inline row */
.skill-card-title-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin-bottom: 0.875rem;
}
.skill-card-icon {
  width: 2.25rem;
  height: 2.25rem;
  border-radius: 0.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.skill-card-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
  line-height: 1.3;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  flex: 1;
  min-width: 0;
}

/* Description — the main content */
.skill-card-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #6B7280;
  line-height: 1.65;
  margin: 0 0 1rem 0;
  flex: 1;
  display: -webkit-box;
  -webkit-line-clamp: 3;
  line-clamp: 3;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

/* Footer */
.skill-card-footer {
  border-top: 1px solid #E5E5EA;
  padding-top: 0.75rem;
  margin-top: auto;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.skill-card-file {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #9CA3AF;
  display: flex;
  align-items: center;
  gap: 0.3125rem;
}
.skill-card-date {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #D1D5DB;
  display: flex;
  align-items: center;
  gap: 0.3125rem;
}
.skill-card-open {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #1A1A1A;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.1875rem;
  transition: gap 0.2s ease, color 0.2s ease;
}
.skill-card:hover .skill-card-open {
  gap: 0.375rem;
  color: #374151;
}

/* Reduced motion */
@media (prefers-reduced-motion: reduce) {
  .skill-card,
  .skill-card-open {
    transition: none;
  }
  .skill-card:hover {
    transform: none;
  }
}

/* ── Remote skill card enhancements ──────────────────────────────────── */
.remote-skill-card {
  cursor: pointer;
  transition: box-shadow 0.15s ease, transform 0.15s ease;
}
.remote-skill-card:hover {
  box-shadow: 0 4px 20px rgba(0,0,0,0.12);
  transform: translateY(-1px);
}
.remote-skill-meta {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  flex: 1;
  min-width: 0;
  overflow: hidden;
}
.remote-skill-author {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #9CA3AF;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  max-width: 7.5rem;
}
.remote-skill-stat {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #9CA3AF;
  white-space: nowrap;
}
.remote-install-btn {
  flex-shrink: 0;
  padding: 0.3125rem 0.875rem;
  border-radius: 0.5rem;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.remote-install-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18);
}
.remote-install-btn:active {
  transform: scale(0.97);
}
.remote-installing-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0.3125rem 0.5rem;
  border-radius: 0.5rem;
  background: transparent;
}
.remote-installed-badge {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  gap: 0.3125rem;
  padding: 0.3125rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(16,185,129,0.08);
  color: #059669;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
}
.remote-error-badge {
  flex-shrink: 0;
  padding: 0.3125rem 0.75rem;
  border-radius: 0.5rem;
  background: rgba(220,38,38,0.08);
  color: #dc2626;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: help;
}

/* ══════════════════════════════════════════════════════════════════════════
   LEVEL 2 — Skill Detail Page
   ══════════════════════════════════════════════════════════════════════════ */

/* ── Detail header bar ─────────────────────────────────────────────────── */
.detail-header {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  padding: 0.625rem 1.25rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.03);
}
.detail-title-row {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 1rem;
  padding: 0.5rem 1.25rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.detail-title-path {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-small);
  color: #9CA3AF;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  flex-shrink: 1;
  min-width: 0;
  max-width: 50%;
  text-align: right;
}
.detail-back-btn {
  display: flex;
  align-items: center;
  gap: 0;
  width: 2rem; height: 2rem; padding: 0;
  border-radius: var(--radius-sm, 8px);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary, 0.875rem);
  font-weight: 600;
  justify-content: center;
  color: #FFFFFF;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border: none;
  cursor: pointer;
  transition: all 0.15s ease;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.detail-back-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 2px 12px rgba(0,0,0,0.18), 0 1px 3px rgba(0,0,0,0.10);
}
.detail-divider {
  width: 1px;
  height: 1.375rem;
  background: #E5E5EA;
}
.detail-icon {
  width: 2rem;
  height: 2rem;
  flex-shrink: 0;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12);
}
.detail-description {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
  margin: 0;
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

/* ── Sidebar file tree panel ───────────────────────────────────────────── */
.detail-sidebar {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  min-width: 11.25rem;
  max-width: 37.5rem;
  background: #F9F9F9;
  border-right: none;
  position: relative;
}

/* Resize handle */
.skills-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 0.3125rem;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: #E5E5EA;
  transition: background 0.15s;
}
.skills-resize-handle:hover,
.skills-resize-handle:active {
  background: #007AFF;
}
.detail-sidebar-header {
  padding: 0.5rem 0.875rem;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 0.2rem;
  border-bottom: 1px solid #E5E5EA;
}
.detail-sidebar-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 700;
  color: #6B7280;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.detail-sidebar-path {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-small);
  color: #9CA3AF;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  width: 100%;
  display: block;
}

/* ── Content area ──────────────────────────────────────────────────────── */
.detail-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #FFFFFF;
}
.detail-empty-icon {
  width: 4rem;
  height: 4rem;
  border-radius: 1rem;
  background: #F5F5F5;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto;
  border: 1px solid #E5E5EA;
}
.detail-file-tab {
  flex-shrink: 0;
  padding: 0.625rem 1.25rem 0;
  background: #F5F5F5;
  border-bottom: 1px solid #E5E5EA;
}
.detail-file-tab-inner {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  border-radius: 0.625rem 0.625rem 0 0;
  background: #fff;
  border: 1px solid #E5E5EA;
  border-bottom: 1px solid #fff;
  margin-bottom: -1px;
  position: relative;
}
.detail-file-name {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #1A1A1A;
}
.detail-file-badge {
  padding: 0.0625rem 0.4375rem;
  border-radius: 0.375rem;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-small);
  font-weight: 600;
  background: rgba(0, 0, 0, 0.05);
  color: #1A1A1A;
}
.detail-content-scroll {
  flex: 1;
  overflow-y: auto;
  padding: 1.75rem 2.25rem;
  scrollbar-width: thin;
}
.detail-raw-code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-secondary);
  line-height: 1.7;
  color: #1A1A1A;
  white-space: pre-wrap;
  word-wrap: break-word;
  margin: 0;
  background: #F5F5F5;
  padding: 1.25rem;
  border-radius: 0.75rem;
  border: 1px solid #E5E5EA;
}

/* ── Prose (markdown preview) ──────────────────────────────────────────────── */
.prose-skills {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  line-height: 1.75;
  color: #1A1A1A;
  max-width: 51.25rem;
}
.prose-skills h1 {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  margin: 0 0 1.25rem;
  color: #1A1A1A;
  border-bottom: 2px solid rgba(0, 0, 0, 0.08);
  padding-bottom: 0.625rem;
}
.prose-skills h2 {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  margin: 2rem 0 0.875rem;
  color: #1A1A1A;
  padding-left: 0.75rem;
  border-left: 3px solid #1A1A1A;
}
.prose-skills h3 {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-subtitle);
  font-weight: 600;
  margin: 1.5rem 0 0.625rem;
  color: #374151;
}
.prose-skills p { margin: 0 0 0.875rem; }
.prose-skills ul, .prose-skills ol { margin: 0 0 0.875rem; padding-left: 1.5rem; }
.prose-skills li { margin: 0.3125rem 0; }
.prose-skills li::marker { color: #1A1A1A; }
.prose-skills code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.85em;
  background: rgba(0, 0, 0, 0.04);
  padding: 0.125rem 0.4375rem;
  border-radius: 0.3125rem;
  color: #1A1A1A;
  border: 1px solid rgba(0, 0, 0, 0.06);
}
.prose-skills pre {
  background: #1A1A1A;
  color: #E5E5EA;
  padding: 1.125rem 1.25rem;
  border-radius: 0.75rem;
  overflow-x: auto;
  margin: 0 0 1.125rem;
  font-size: var(--fs-secondary);
  line-height: 1.6;
  border: 1px solid #1A1A1A;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.12);
}
.prose-skills pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
  border: none;
}
.prose-skills blockquote {
  border-left: 3px solid #1A1A1A;
  margin: 0 0 0.875rem;
  padding: 0.625rem 1.125rem;
  color: #6B7280;
  background: rgba(0, 0, 0, 0.02);
  border-radius: 0 0.625rem 0.625rem 0;
}
.prose-skills a { color: #007AFF; text-decoration: none; font-weight: 500; }
.prose-skills a:hover { text-decoration: underline; color: #0056CC; }
.prose-skills hr { border: none; border-top: 1px solid #E5E5EA; margin: 1.75rem 0; }
.prose-skills table { border-collapse: collapse; margin: 0 0 1.125rem; width: 100%; border-radius: 0.625rem; overflow: hidden; }
.prose-skills th, .prose-skills td { border: 1px solid #E5E5EA; padding: 0.5625rem 0.875rem; text-align: left; }
.prose-skills th { background: rgba(0, 0, 0, 0.02); font-weight: 600; color: #1A1A1A; }

/* ── Source editor (textarea) ──────────────────────────────────────────── */
.skills-source-editor {
  width: 95%;
  max-width: 95%;
  height: 100%;
  resize: none;
  outline: none;
  padding: 1.5rem 0;
  font-family: 'JetBrains Mono', 'Fira Code', 'Cascadia Code', monospace;
  font-size: var(--fs-secondary);
  line-height: 1.7;
  color: #1A1A1A;
  background: #fff;
  border: none;
  white-space: pre-wrap;
  word-wrap: break-word;
  overflow-wrap: break-word;
}

/* ── Skills file tree context menu ── */
.skill-ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}
.skill-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  padding: 0.25rem;
  min-width: 10rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
  animation: skillCtxEnter 0.1s ease-out;
}
@keyframes skillCtxEnter {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1)  translateY(0); }
}
.skill-ctx-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4375rem 0.625rem;
  border: none;
  border-radius: 0.375rem;
  background: transparent;
  color: #E5E5EA;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.skill-ctx-item:hover { background: #1F1F1F; color: #FFFFFF; }

/* ══════════════════════════════════════════════════════════════════════════
   Remote Skill Detail Modal
   ══════════════════════════════════════════════════════════════════════════ */
.rsd-overlay {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.45);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1.25rem;
}
.rsd-modal {
  position: relative;
  width: 50vw;
  height: 50vh;
  min-width: 340px;
  min-height: 340px;
  max-width: 90vw;
  max-height: 90vh;
  background: #FFFFFF;
  border-radius: 1.25rem;
  border: 1px solid #E5E5EA;
  box-shadow: 0 24px 64px rgba(0,0,0,0.18), 0 1px 0px rgba(255,255,255,0.9) inset;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
/* sticky header */
.rsd-header {
  flex-shrink: 0;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(20px);
  z-index: 10;
  padding: 0.75rem 1.25rem 0.875rem;
  border-bottom: 0.5px solid #E5E5EA;
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.rsd-avatar {
  width: 2.625rem;
  height: 2.625rem;
  border-radius: 0.875rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  color: #FFFFFF;
  font-size: 1rem;
  font-weight: 700;
  font-family: 'Inter', sans-serif;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
}
.rsd-title {
  font-family: 'Inter', sans-serif;
  font-size: 1.0625rem;
  font-weight: 700;
  color: #1C1C1E;
  letter-spacing: -0.02em;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.rsd-category-badge {
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  padding: 0.125rem 0.4375rem;
  border-radius: 0.375rem;
  background: rgba(0,0,0,0.06);
  color: #374151;
  font-size: 0.6875rem;
  font-weight: 600;
  font-family: 'Inter', sans-serif;
}
.rsd-slug {
  font-family: 'JetBrains Mono','Fira Code',monospace;
  font-size: 0.6875rem;
  color: #8E8E93;
}
.rsd-icon-btn {
  width: 2.125rem;
  height: 2.125rem;
  border-radius: 9999px;
  background: rgba(255,255,255,0.8);
  backdrop-filter: blur(12px);
  border: 1px solid #E5E5EA;
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  color: #8E8E93;
  text-decoration: none;
  transition: all 0.2s;
}
.rsd-icon-btn:hover {
  background: #F5F5F5;
  color: #1A1A1A;
  border-color: #D1D1D6;
}
/* body */
.rsd-body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  padding: 1.25rem;
  display: flex;
  flex-direction: column;
  gap: 1.25rem;
  scrollbar-width: thin;
  scrollbar-color: #E5E5EA transparent;
}
/* tags */
.rsd-tag {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  border-radius: 0.5rem;
  font-size: 0.6875rem;
  font-weight: 500;
  font-family: 'JetBrains Mono','Fira Code',monospace;
}
.rsd-tag--green { background: rgba(52,199,89,0.1); color: #34C759; border: 1px solid rgba(52,199,89,0.15); }
.rsd-tag--blue  { background: rgba(0,122,255,0.08); color: #007AFF; border: 1px solid rgba(0,122,255,0.12); }
.rsd-tag--gray  { background: rgba(116,116,128,0.08); color: #6B7280; border: 1px solid rgba(116,116,128,0.12); }
.rsd-tag--black { background: rgba(15,15,15,0.07); color: #1C1C1E; border: 1px solid rgba(15,15,15,0.12); }
/* description */
.rsd-desc {
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  color: #3A3A3C;
  line-height: 1.65;
  margin: 0;
  min-height: 4rem;
  white-space: pre-wrap;
  word-break: break-word;
  flex: 1;
}
.rsd-source-hint {
  font-size: 0.75rem;
  color: #8E8E93;
  font-family: 'Inter', sans-serif;
}
.rsd-link {
  color: #007AFF;
  text-decoration: none;
  font-weight: 500;
}
.rsd-link:hover { text-decoration: underline; }
.rsd-link-btn {
  background: none;
  border: none;
  padding: 0;
  font-family: inherit;
  font-size: inherit;
  color: #1C1C1E;
  font-weight: 500;
  cursor: pointer;
  text-decoration: underline;
  text-decoration-color: rgba(28,28,30,0.35);
  text-underline-offset: 2px;
  transition: opacity 0.15s;
}
.rsd-link-btn:hover { opacity: 0.65; }
/* stats */
.rsd-stats-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 0.625rem;
}
.rsd-stat-cell {
  padding: 0.875rem 0.625rem;
  border-radius: 0.875rem;
  background: #F9F9F9;
  border: 1px solid #E5E5EA;
  text-align: center;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0;
  color: #1C1C1E;
}
.rsd-stat-cell svg {
  margin-bottom: 0.375rem;
  color: #1C1C1E;
  stroke: #1C1C1E;
}
.rsd-stat-value {
  font-family: 'Inter', sans-serif;
  font-size: 1.125rem;
  font-weight: 700;
  color: #1C1C1E;
  letter-spacing: -0.02em;
  line-height: 1.2;
}
.rsd-stat-label {
  font-family: 'Inter', sans-serif;
  font-size: 0.625rem;
  color: #AEAEB2;
  margin-top: 0.125rem;
}
/* footer */
.rsd-footer {
  flex-shrink: 0;
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 1rem;
  padding: 0.75rem 1.5rem 1rem;
  border-top: 0.5px solid #E5E5EA;
  background: rgba(255,255,255,0.95);
  backdrop-filter: blur(20px);
  border-radius: 0 0 1.25rem 1.25rem;
}
.rsd-footer-left {
  flex: 1;
  min-width: 0;
}
.rsd-footer-right {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.rsd-error-hint {
  display: inline-flex;
  align-items: center;
  gap: 0.3125rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.6875rem;
  color: #dc2626;
  line-height: 1.4;
}
.rsd-install-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  padding: 0.5rem 1rem;
  border-radius: 0.5rem;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  transition: all 0.15s ease;
  white-space: nowrap;
}
.rsd-install-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 4px 12px rgba(0,0,0,0.24);
}
.rsd-install-btn:active { transform: scale(0.97); }
.rsd-state-chip {
  display: inline-flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.4375rem 0.875rem;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 600;
  white-space: nowrap;
}
.rsd-state-chip--loading {
  background: rgba(28,28,30,0.08);
  color: #1C1C1E;
}
.rsd-state-chip--done {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  box-shadow: 0 2px 8px rgba(0,0,0,0.18);
  transition: all 0.15s ease;
}
.rsd-state-chip--done:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  box-shadow: 0 4px 12px rgba(0,0,0,0.24);
}
.rsd-state-chip--error {
  background: rgba(220,38,38,0.08);
  color: #dc2626;
}
/* transitions */
.rsd-fade-enter-active, .rsd-fade-leave-active { transition: opacity 0.2s ease; }
.rsd-fade-enter-from, .rsd-fade-leave-to { opacity: 0; }
.rsd-slide-enter-active { transition: transform 0.3s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.2s ease; }
.rsd-slide-leave-active { transition: transform 0.2s ease, opacity 0.15s ease; }
.rsd-slide-enter-from { transform: translateY(24px) scale(0.97); opacity: 0; }
.rsd-slide-leave-to { transform: translateY(12px) scale(0.98); opacity: 0; }
/* ── Uninstall dialog ─────────────────────────────────────────────────── */
.uninstall-dialog-backdrop {
  position: fixed;
  top: 0; left: 0; right: 0; bottom: 0;
  background: rgba(0,0,0,0.32);
  z-index: 1000;
  display: flex;
  align-items: center;
  justify-content: center;
}
.uninstall-dialog {
  background: #18181b;
  color: #fff;
  border-radius: 1rem;
  box-shadow: 0 4px 32px rgba(0,0,0,0.18);
  padding: 2rem 2.5rem 1.5rem 2.5rem;
  min-width: 320px;
  max-width: 90vw;
  text-align: center;
}
.uninstall-dialog-title {
  font-size: 1.25rem;
  font-weight: 700;
  margin-bottom: 0.5rem;
}
.uninstall-dialog-desc {
  font-size: 1rem;
  color: #d1d5db;
  margin-bottom: 1.5rem;
}
.uninstall-dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 1rem;
}
.uninstall-cancel-btn {
  background: #232326;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem 1.5rem;
  font-size: 1rem;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.uninstall-cancel-btn:hover { background: #35353a; }
.uninstall-confirm-btn {
  background: #dc2626;
  color: #fff;
  border: none;
  border-radius: 0.5rem;
  padding: 0.5rem 1.5rem;
  font-size: 1rem;
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  cursor: pointer;
  transition: background 0.15s;
}
.uninstall-confirm-btn:hover { background: #b91c1c; }
.remote-uninstall-btn {
  flex-shrink: 0;
  padding: 0.3125rem 0.875rem;
  border-radius: 0.5rem;
  border: 1.5px solid rgba(255,59,48,0.2);
  background: rgba(255,59,48,0.06);
  color: #FF3B30;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.remote-uninstall-btn:hover { background: #dc2626; color: #fff; border-color: transparent; box-shadow: 0 2px 12px rgba(220,38,38,0.25); }
.remote-uninstall-btn:active { transform: scale(0.97); }
.skill-open-btn {
  flex-shrink: 0;
  padding: 0.3125rem 0.875rem;
  border-radius: 0.5rem;
  border: 1.5px solid #D1D5DB;
  background: #fff;
  color: #1A1A1A;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
}
.skill-open-btn:hover { background: #F9FAFB; border-color: #9CA3AF; }
.skill-open-btn:active { transform: scale(0.97); }
/* ── Tencent sort select ──────────────────────────────────────────────── */
.tencent-sort-select {
  appearance: none;
  -webkit-appearance: none;
  background: #F2F2F7 url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%236B7280' stroke-width='2.5' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E") no-repeat right 0.65rem center;
  color: #1C1C1E;
  border: 1px solid #E5E5EA;
  border-radius: 0.5rem;
  padding: 0.4rem 2rem 0.4rem 0.75rem;
  font-size: var(--fs-secondary, 0.875rem);
  font-family: 'Inter', sans-serif;
  font-weight: 600;
  outline: none;
  cursor: pointer;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
  transition: border-color 0.15s, background 0.15s;
}
.tencent-sort-select:hover { border-color: #D1D1D6; background-color: #EBEBF0; }
.tencent-sort-select:focus { border-color: #9CA3AF; background-color: #EBEBF0; }

/* ── Grid-area spinner ───────────────────────────────────────────────── */
.skills-grid-spinner-overlay {
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 2.5rem 0;
  pointer-events: none;
}
.skills-spinner {
  width: 48px;
  height: 48px;
  animation: skills-spin 0.9s linear infinite;
}
@keyframes skills-spin {
  to { transform: rotate(360deg); }
}

/* Install success toast */
.skill-toast {
  position: fixed;
  bottom: 1.5rem;
  left: 50%;
  transform: translateX(-50%);
  background: #1C1C1E;
  color: #fff;
  padding: 0.625rem 1rem;
  border-radius: 0.625rem;
  font-size: 0.875rem;
  font-family: 'Inter', sans-serif;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  box-shadow: 0 4px 16px rgba(0,0,0,0.25);
  z-index: 9999;
  white-space: nowrap;
}
.skill-toast-fade-enter-active,
.skill-toast-fade-leave-active {
  transition: opacity 0.25s ease, transform 0.25s ease;
}
.skill-toast-fade-enter-from,
.skill-toast-fade-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(0.5rem);
}

</style>
