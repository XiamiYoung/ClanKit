<template>
  <div class="tev-root">

    <!-- Page header -->
    <div class="tev-header">
      <div class="tev-header-left">
        <div class="tev-header-icon">
          <svg style="width:20px;height:20px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="7" width="10" height="10" rx="1"/><path d="M9 2v3M12 2v3M15 2v3M9 19v3M12 19v3M15 19v3M2 9h3M2 12h3M2 15h3M19 9h3M19 12h3M19 15h3"/></svg>
        </div>
        <div>
          <h1 class="tev-title">{{ t('tasks.title') }}</h1>
          <p class="tev-subtitle">{{ t('tasks.subtitle') }}</p>
        </div>
      </div>
      <div class="tev-header-actions">
        <AppButton size="compact" @click="refreshTab" :loading="isRefreshing" :title="t('common.refresh')">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
        </AppButton>
        <AppButton v-if="activeTab !== 'calendar' && activeTab !== 'dashboard'" size="compact" @click="activeTab === 'tasks' ? openTaskEditor(null) : openPlanEditor(null)" :title="activeTab === 'tasks' ? t('tasks.newTask') : t('tasks.plan.newPlan')">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
        </AppButton>
      </div>
    </div>

    <!-- Tabs -->
    <div class="tev-tabs">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        :class="['tev-tab', activeTab === tab.id && 'tev-tab--active']"
        @click="activeTab = tab.id"
      >{{ tab.label }}
        <span v-if="tabCount(tab.id) !== null" class="tev-tab-count">{{ tabCount(tab.id) }}</span>
      </button>
    </div>

    <!-- Tasks tab -->
    <div v-if="activeTab === 'tasks'" class="tev-content">
      <div v-if="tasksStore.tasks.length === 0" class="tev-empty">
        <div class="tev-empty-icon">
          <svg style="width:32px;height:32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
        </div>
        <div class="tev-empty-title">{{ t('tasks.noTasks') }}</div>
        <div class="tev-empty-desc">{{ t('tasks.noTasksHint') }}</div>
        <AppButton size="compact" @click="openTaskEditor(null)">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {{ t('tasks.newTask') }}
        </AppButton>
      </div>

      <div v-else class="tev-tasks-tab-content">
        <div class="tev-two-panel">
          <!-- Left: Category nav -->
          <div class="tev-cat-nav">
            <div class="tev-cat-header">
              <div class="tev-cat-header-title">{{ t('tasks.category.categories') }}</div>
              <button class="tev-cat-add-btn" @click="openTaskCategoryEditor(null)" :title="t('tasks.category.addCategory')">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>

            <!-- All -->
            <button
              class="nav-item nav-item--all"
              :class="{ active: selectedTaskCategoryId === null }"
              @click="selectedTaskCategoryId = null"
            >
              <span class="nav-item-icon">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
              </span>
              <span class="nav-item-label">{{ t('tasks.category.all') }}</span>
              <span class="nav-item-count">{{ tasksStore.tasks.length }}</span>
            </button>

            <!-- Per-category -->
            <div v-for="cat in tasksStore.taskCategories" :key="cat.id" class="nav-item-wrap nav-cat-wrap" :class="{ active: selectedTaskCategoryId === cat.id, 'drag-over': dragOverTaskCategory === cat.id }" @dragover.prevent="dragOverTaskCategory = cat.id" @dragleave="dragOverTaskCategory = null" @drop.prevent="onDropTaskToCategory(cat, $event)">
              <button
                class="nav-item nav-cat-btn"
                :class="{ active: selectedTaskCategoryId === cat.id }"
                @click="selectedTaskCategoryId = cat.id"
              >
                <span class="nav-item-emoji">{{ cat.emoji }}</span>
                <span class="nav-item-label">{{ cat.name }}</span>
              </button>
              <div class="nav-cat-right">
                <span class="nav-cat-count nav-item-count">{{ taskCategoryCount(cat.id) }}</span>
                <div class="nav-item-actions nav-cat-actions">
                  <button class="nav-icon-btn" @click.stop="openTaskCategoryEditor(cat)" :title="t('tasks.category.renameCategory')">
                    <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="nav-icon-btn nav-icon-btn-danger" @click.stop="deleteTaskCategory(cat.id)" :title="t('common.delete')">
                    <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Content -->
          <div class="tev-tab-content-area">
            <div class="tev-tab-toolbar">
              <div class="tev-search-wrap">
                <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input class="tev-search-input" v-model="taskSearch" :placeholder="t('tasks.searchTasks')" />
                <button v-if="taskSearch" class="tev-search-clear" @click="taskSearch = ''">
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
            </div>
            <div v-if="filteredTasks.length === 0" class="tev-filter-empty">{{ t('tasks.misc.noTasksMatch') }}</div>
            <div v-else class="tev-grid">
              <div
                v-for="task in filteredTasks"
                :key="task.id"
                class="tev-task-card"
                draggable="true"
                @click="openTaskViewer(task)"
                @dragstart="startDragTask(task, $event)"
              >
                <div class="tev-task-top-row">
                  <div class="tev-task-icon-wrap">{{ task.icon || '✍️' }}</div>
                  <div class="tev-task-name">{{ task.name }}</div>
                  <div class="tev-task-actions" @click.stop>
                    <button class="tev-action-btn" @click="openTaskViewer(task)" :title="t('tasks.actions.view')">
                      <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </button>
                    <button class="tev-action-btn" @click="openTaskEditor(task)" :title="t('tasks.actions.edit')">
                      <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                    </button>
                    <button
                      class="tev-action-btn tev-action-danger"
                      @click="confirmDeleteTask(task)"
                      :disabled="tasksStore.taskUsedByPlanCount(task.id) > 0"
                      :title="getTaskDeleteTooltip(task)"
                    >
                      <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                    </button>
                  </div>
                </div>
                <div class="tev-task-body">
                  <div v-if="task.description" class="tev-task-desc">{{ task.description }}</div>
                  <div class="tev-task-prompt-preview">{{ task.prompt }}</div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Plans tab -->
    <div v-if="activeTab === 'plans'" class="tev-content">
      <div v-if="tasksStore.plans.length === 0" class="tev-empty">
        <div class="tev-empty-icon">
          <svg style="width:32px;height:32px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
        </div>
        <div class="tev-empty-title">{{ t('tasks.plan.noPlans') }}</div>
        <div class="tev-empty-desc">{{ t('tasks.plan.noPlansHint') }}</div>
        <AppButton size="compact" @click="openPlanEditor(null)" :disabled="tasksStore.tasks.length === 0">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          {{ t('tasks.plan.createFirstPlan') }}
        </AppButton>
        <div v-if="tasksStore.tasks.length === 0" class="tev-empty-hint">{{ t('tasks.plan.createAtLeastOneTask') }}</div>
      </div>

      <div v-else class="tev-plans-tab-content">
        <div class="tev-two-panel">
          <!-- Left: Category nav -->
          <div class="tev-cat-nav">
            <div class="tev-cat-header">
              <div class="tev-cat-header-title">{{ t('tasks.category.categories') }}</div>
              <button class="tev-cat-add-btn" @click="openPlanCategoryEditor(null)" :title="t('tasks.category.addCategory')">
                <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              </button>
            </div>

            <!-- All -->
            <button
              class="nav-item nav-item--all"
              :class="{ active: selectedPlanCategoryId === null }"
              @click="selectedPlanCategoryId = null"
            >
              <span class="nav-item-icon">
                <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/>
                </svg>
              </span>
              <span class="nav-item-label">{{ t('tasks.category.all') }}</span>
              <span class="nav-item-count">{{ tasksStore.plans.length }}</span>
            </button>

            <!-- Per-category -->
            <div v-for="cat in tasksStore.planCategories" :key="cat.id" class="nav-item-wrap nav-cat-wrap" :class="{ active: selectedPlanCategoryId === cat.id, 'drag-over': dragOverPlanCategory === cat.id }" @dragover.prevent="dragOverPlanCategory = cat.id" @dragleave="dragOverPlanCategory = null" @drop.prevent="onDropPlanToCategory(cat, $event)">
              <button
                class="nav-item nav-cat-btn"
                :class="{ active: selectedPlanCategoryId === cat.id }"
                @click="selectedPlanCategoryId = cat.id"
              >
                <span class="nav-item-emoji">{{ cat.emoji }}</span>
                <span class="nav-item-label">{{ cat.name }}</span>
              </button>
              <div class="nav-cat-right">
                <span class="nav-cat-count nav-item-count">{{ planCategoryCount(cat.id) }}</span>
                <div class="nav-item-actions nav-cat-actions">
                  <button class="nav-icon-btn" @click.stop="openPlanCategoryEditor(cat)" title="Rename">
                    <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15t-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button class="nav-icon-btn nav-icon-btn-danger" @click.stop="deletePlanCategory(cat.id)" :title="t('common.delete')">
                    <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Content -->
          <div class="tev-tab-content-area">
            <div class="tev-tab-toolbar">
              <div class="tev-search-wrap">
                <svg style="width:13px;height:13px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                <input class="tev-search-input" v-model="planSearch" :placeholder="t('tasks.plan.searchPlans')" />
                <button v-if="planSearch" class="tev-search-clear" @click="planSearch = ''">
                  <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              </div>
              <div class="tev-plans-filter-bar">
                <button
                  v-for="f in PLAN_STATUS_FILTERS"
                  :key="f.value"
                  :class="['tev-filter-btn', planStatusFilter === f.value && 'tev-filter-btn--active']"
                  @click="planStatusFilter = f.value"
                >{{ f.label }}
                  <span v-if="f.value !== 'all'" class="tev-filter-count">{{ planFilterCount(f.value) }}</span>
                </button>
              </div>
            </div>
            <div v-if="filteredPlans.length === 0" class="tev-filter-empty">{{ t('tasks.misc.noPlansMatch') }}</div>
            <div v-else class="tev-plans-grid">
              <div
                v-for="plan in filteredPlans"
                :key="plan.id"
                class="tev-plan-card"
                draggable="true"
                @click="openPlanViewer(plan)"
                @dragstart="startDragPlan(plan, $event)"
              >
                <div class="tev-plan-info">
                  <div class="tev-plan-name-row">
                    <div v-if="tasksStore.activeRun?.planId === plan.id && tasksStore.isRunning" class="tev-plan-spinner" title="Running…">
                      <svg style="width:18px;height:18px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>
                    </div>
                    <div class="tev-plan-icon" v-if="plan.icon">{{ plan.icon }}</div>
                    <div class="tev-plan-name">{{ plan.name }}</div>
                  </div>
                  <div v-if="plan.description" class="tev-plan-desc">{{ plan.description }}</div>
                  <div class="tev-plan-meta">
                    <span class="tev-plan-meta-item">
                      <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
                      {{ plan.steps?.length || 0 }} {{ plan.steps?.length === 1 ? t('tasks.misc.stepSingular') : t('tasks.misc.stepPlural') }}
                    </span>
                    <span class="tev-plan-meta-item">
                      <svg style="width:11px;height:11px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>
                      {{ scheduleLabel(plan) }}
                    </span>
                    <span v-if="planCardStatus(plan)" :class="['tev-plan-status', `tev-plan-status--${planCardStatus(plan)}`]">
                      {{ PLAN_STATUS_LABEL[planCardStatus(plan)] }}
                    </span>
                  </div>
                  <div v-if="plan.lastRunAt" class="tev-plan-last-run">{{ t('tasks.misc.lastRun') }} {{ relativeTime(plan.lastRunAt) }}</div>
                </div>
                <div class="tev-plan-actions" @click.stop>
                  <button
                    class="tev-action-btn"
                    @click="runPlanNow(plan)"
                    :disabled="tasksStore.isRunning"
                    :title="t('tasks.actions.runNow')"
                  >
                    <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                  </button>
                  <button class="tev-action-btn" @click="openPlanViewer(plan)" :title="t('tasks.actions.view')">
                    <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  </button>
                  <button class="tev-action-btn" @click="openPlanEditor(plan)" :title="t('tasks.actions.edit')">
                    <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                  </button>
                  <button
                    class="tev-action-btn tev-action-danger"
                    @click="confirmDeletePlan(plan)"
                    :disabled="tasksStore.planHasRuns(plan.id)"
                    :title="getPlanDeleteTooltip(plan)"
                  >
                    <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4h6v2"/></svg>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <!-- Calendar tab -->
    <div v-if="activeTab === 'calendar'" class="tev-content">
      <TaskCalendar :plans="tasksStore.plans" :runs="tasksStore.runs" :planColors="planColors" @select-plan="goToPlan" @new-plan="onCalendarNewPlan" @open-history="onDashboardOpenRun" @open-plan="onCalendarOpenPlan" @delete-plan="onCalendarDeletePlan" />
    </div>

    <!-- Dashboard tab -->
    <div v-if="activeTab === 'dashboard'" class="tev-content">
      <TaskDashboard
        :runs="tasksStore.runs"
        :plans="tasksStore.plans"
        :planColors="planColors"
        :plan-categories="tasksStore.planCategories"
        @open-run="onDashboardOpenRun"
      />
    </div>

    <!-- Modals -->
    <TaskEditor
      :visible="showTaskEditor"
      :task="editingTask"
      :plans="tasksStore.plans"
      :task-categories="tasksStore.taskCategories"
      @close="showTaskEditor = false"
      @saved="onTaskSaved"
      @open-plan="(plan) => { showTaskEditor = false; openPlanViewer(plan) }"
    />

    <PlanEditor
      :visible="showPlanEditor"
      :plan="editingPlan"
      :tasks="tasksStore.tasks"
      :plan-categories="tasksStore.planCategories"
      @close="showPlanEditor = false"
      @saved="onPlanSaved"
    />

    <TaskViewModal
      :visible="showTaskViewer"
      :task="viewingTask"
      :plans="tasksStore.plans"
      @close="showTaskViewer = false"
      @edit="showTaskViewer = false; openTaskEditor(viewingTask)"
      @open-plan="(plan) => { showTaskViewer = false; openPlanViewer(plan) }"
    />

    <PlanViewModal
      :visible="showPlanViewer"
      :plan="viewingPlan"
      :tasks="tasksStore.tasks"
      :openHistory="planViewerOpenHistory"
      @close="showPlanViewer = false; planViewerOpenHistory = false"
    />

    <PlanHistoryModal
      :visible="showPlanHistory"
      :plan="historyPlan"
      :initialRunId="historyInitialRunId"
      @close="showPlanHistory = false; historyPlan = null; historyInitialRunId = null"
    />

    <ConfirmModal
      :visible="confirmModal.visible"
      :title="confirmModal.title"
      :message="confirmModal.message"
      confirm-class="danger"
      @confirm="confirmModal.onConfirm(); confirmModal.visible = false"
      @close="confirmModal.visible = false"
    />

    <!-- Task Category Modal -->
    <CategoryModal
      :visible="showTaskCatModal"
      :category="editingCategory"
      :initial="editingCategory || { name: '', emoji: '📁' }"
      noun="Task Category"
      :show-type-selector="false"
      @close="showTaskCatModal = false; editingCategory = null"
      @saved="onSaveTaskCategory"
    />

    <!-- Plan Category Modal -->
    <CategoryModal
      :visible="showPlanCatModal"
      :category="editingCategory"
      :initial="editingCategory || { name: '', emoji: '📁' }"
      noun="Plan Category"
      :show-type-selector="false"
      @close="showPlanCatModal = false; editingCategory = null"
      @saved="onSavePlanCategory"
    />

  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount } from 'vue'
import { v4 as uuid } from 'uuid'
import { useTasksStore } from '../stores/tasks'
import { useI18n } from '../i18n/useI18n'
import AppButton from '../components/common/AppButton.vue'
import CategoryModal from '../components/agents/CategoryModal.vue'
import TaskEditor from '../components/tasks/TaskEditor.vue'
import PlanEditor from '../components/tasks/PlanEditor.vue'
import PlanViewModal from '../components/tasks/PlanViewModal.vue'
import TaskViewModal from '../components/tasks/TaskViewModal.vue'
import TaskCalendar from '../components/tasks/TaskCalendar.vue'
import TaskDashboard from '../components/tasks/TaskDashboard.vue'
import PlanHistoryModal from '../components/tasks/PlanHistoryModal.vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'

const { t } = useI18n()

const tasksStore = useTasksStore()

const PLAN_COLOR_PALETTE = [
  '#3B82F6', // blue
  '#8B5CF6', // purple
  '#EC4899', // pink
  '#F59E0B', // amber
  '#06B6D4', // cyan
  '#84CC16', // lime
  '#F97316', // orange
  '#6366F1', // indigo
  '#EF4444', // red
  '#10B981', // emerald
]

const planColors = computed(() => {
  const map = {}
  tasksStore.plans.forEach((plan, i) => {
    map[plan.id] = PLAN_COLOR_PALETTE[i % PLAN_COLOR_PALETTE.length]
  })
  return map
})

const TABS = computed(() => [
  { id: 'dashboard', label: t('tasks.tabs.dashboard') },
  { id: 'plans',     label: t('tasks.tabs.plans') },
  { id: 'tasks',     label: t('tasks.tabs.tasks') },
  { id: 'calendar',  label: t('tasks.tabs.calendar') },
])

const activeTab         = ref('dashboard')
const isRefreshing      = ref(false)
const planStatusFilter  = ref('all')
const planSearch        = ref('')
const taskSearch        = ref('')

// Category selection
const selectedTaskCategoryId = ref(null)
const selectedPlanCategoryId = ref(null)
const showTaskCatModal  = ref(false)
const showPlanCatModal  = ref(false)
const editingCategory   = ref(null)
const editingCategoryType = ref(null) // 'task' or 'plan'
const dragOverTaskCategory = ref(null)
const dragOverPlanCategory = ref(null)
const draggedTask = ref(null)
const draggedPlan = ref(null)

// Modals
const showTaskEditor    = ref(false)
const editingTask       = ref(null)
const showTaskViewer    = ref(false)
const viewingTask       = ref(null)
const showPlanEditor    = ref(false)
const editingPlan       = ref(null)
const showPlanViewer    = ref(false)
const viewingPlan       = ref(null)
const planViewerOpenHistory = ref(false)

const confirmModal = ref({
  visible: false,
  title: '',
  message: '',
  onConfirm: () => {},
})

// Dashboard → history modal
const showPlanHistory       = ref(false)
const historyPlan           = ref(null)
const historyInitialRunId   = ref(null)

// ── Tab counts ────────────────────────────────────────────────────────────────

function tabCount(tabId) {
  if (tabId === 'tasks')     return tasksStore.tasks.length
  if (tabId === 'plans')     return tasksStore.plans.length
  if (tabId === 'dashboard') return tasksStore.runs.length || null
  return null  // calendar: no count badge
}

// ── Task editor ───────────────────────────────────────────────────────────────

function openTaskViewer(task) {
  viewingTask.value = task
  showTaskViewer.value = true
}

function openTaskEditor(task) {
  editingTask.value = task ? JSON.parse(JSON.stringify(task)) : null
  showTaskEditor.value = true
}

async function onTaskSaved(task) {
  showTaskEditor.value = false
  await tasksStore.saveTask(task)
}

function confirmDeleteTask(task) {
  const usedCount = tasksStore.taskUsedByPlanCount(task.id)
  if (usedCount > 0) {
    confirmModal.value = {
      visible: true,
      title: t('tasks.deleteConfirm.cannotDeleteTask'),
      message: t('tasks.deleteConfirm.taskUsedInPlans', { count: usedCount }),
      onConfirm: () => {},
    }
    return
  }
  confirmModal.value = {
    visible: true,
    title: t('tasks.deleteConfirm.deleteTask'),
    message: t('tasks.deleteConfirm.deleteTaskConfirm', { name: task.name }),
    onConfirm: () => tasksStore.deleteTask(task.id),
  }
}

// ── Plan viewer ───────────────────────────────────────────────────────────────

function openPlanViewer(plan, openHistory = false) {
  viewingPlan.value = plan ? JSON.parse(JSON.stringify(plan)) : null
  planViewerOpenHistory.value = openHistory
  showPlanViewer.value = true
}

// ── Plan editor ───────────────────────────────────────────────────────────────

function openPlanEditor(plan) {
  editingPlan.value = plan ? JSON.parse(JSON.stringify(plan)) : null
  showPlanEditor.value = true
}

async function onPlanSaved(plan) {
  showPlanEditor.value = false
  await tasksStore.savePlan(plan)
}

function confirmDeletePlan(plan) {
  if (tasksStore.planHasRuns(plan.id)) {
    confirmModal.value = {
      visible: true,
      title: t('tasks.deleteConfirm.cannotDeletePlan'),
      message: t('tasks.deleteConfirm.planHasRuns'),
      onConfirm: () => {},
    }
    return
  }
  confirmModal.value = {
    visible: true,
    title: t('tasks.deleteConfirm.deletePlan'),
    message: t('tasks.deleteConfirm.deletePlanConfirm', { name: plan.name }),
    onConfirm: () => tasksStore.deletePlan(plan.id),
  }
}

// ── Plan execution ────────────────────────────────────────────────────────────

async function runPlanNow(plan) {
  tasksStore.resetActiveRun()
  await tasksStore.runPlan(plan.id)
}

function goToPlan(planId) {
  activeTab.value = 'plans'
}

function onCalendarNewPlan({ date, hour }) {
  // Build a datetime-local string for the prefilled schedule
  const d = new Date(date)
  d.setHours(hour !== null ? hour : 12, 0, 0, 0)
  // datetime-local format: YYYY-MM-DDTHH:MM
  const pad = n => String(n).padStart(2, '0')
  const runAt = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
  editingPlan.value = {
    name: '', description: '', steps: [],
    schedule: { type: 'once', runAt, cron: '', timezone: 'UTC', enabled: true },
  }
  showPlanEditor.value = true
}

// ── Formatting helpers ────────────────────────────────────────────────────────

// ── Plan card status (mirrors calendar logic) ─────────────────────────────────

function planNextOccurrence(plan) {
  const s = plan.schedule
  if (!s || s.type === 'manual') return null
  const now = new Date()
  if (s.type === 'once') {
    const d = s.runAt ? new Date(s.runAt) : null
    return d && d > now ? d : null
  }
  // cron: find next fire within the next 90 days
  if (s.type === 'cron' && s.cron) {
    const end = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000)
    const hits = cronOccurrencesSimple(s.cron, now, end)
    return hits.length > 0 ? hits[0] : null
  }
  return null
}

function cronOccurrencesSimple(cronExpr, rangeStart, rangeEnd) {
  // Minimal cron matcher — returns first match only for perf
  try {
    const parts = cronExpr.trim().split(/\s+/)
    if (parts.length < 5) return []
    const [minF, hourF, domF, monthF, dowF] = parts
    const day = new Date(rangeStart)
    day.setHours(0, 0, 0, 0)
    while (day <= rangeEnd) {
      const mo = day.getMonth() + 1
      const dom = day.getDate()
      const dow = day.getDay()
      if (matchFieldSimple(monthF, mo) && matchFieldSimple(domF, dom) && matchFieldSimple(dowF, dow)) {
        for (let h = 0; h < 24; h++) {
          if (!matchFieldSimple(hourF, h)) continue
          for (let m = 0; m < 60; m++) {
            if (!matchFieldSimple(minF, m)) continue
            const dt = new Date(day)
            dt.setHours(h, m, 0, 0)
            if (dt >= rangeStart) return [dt]
          }
        }
      }
      day.setDate(day.getDate() + 1)
    }
    return []
  } catch { return [] }
}

function matchFieldSimple(field, value) {
  if (field === '*') return true
  for (const part of field.split(',')) {
    if (part.includes('/')) {
      const [r, step] = part.split('/')
      const s = parseInt(step)
      if (r === '*') { if (value % s === 0) return true; continue }
      if (r.includes('-')) { const [lo, hi] = r.split('-').map(Number); if (value >= lo && value <= hi && (value - lo) % s === 0) return true; continue }
    }
    if (part.includes('-')) { const [lo, hi] = part.split('-').map(Number); if (value >= lo && value <= hi) return true; continue }
    if (parseInt(part) === value) return true
  }
  return false
}

function planCardStatus(plan) {
  const s = plan.schedule
  if (!s || s.type === 'manual') return null

  // Currently running — manual or scheduled
  if (tasksStore.isRunning && tasksStore.activeRun?.planId === plan.id) return 'running'
  if (tasksStore.runs.some(r => r.planId === plan.id && r.status === 'running')) return 'running'

  // Schedule disabled
  if (!s.enabled) return 'disabled'

  // Future occurrence exists → planned
  const next = planNextOccurrence(plan)
  if (next) return 'planned'

  // No future occurrence — look at last scheduled run for this plan
  const planRuns = tasksStore.runs.filter(r => r.planId === plan.id && r.triggeredBy === 'schedule')
  if (planRuns.length === 0) return 'not-executed'
  // Most recent scheduled run
  const last = planRuns.sort((a, b) => new Date(b.startedAt) - new Date(a.startedAt))[0]
  if (last.status === 'completed') return 'completed'
  if (last.status === 'error')     return 'error'
  if (last.status === 'skipped')   return 'not-executed'
  return 'not-executed'
}

const PLAN_STATUS_LABEL = computed(() => ({
  running:       t('tasks.status.running'),
  planned:       t('tasks.status.planned'),
  completed:     t('tasks.status.completed'),
  error:         t('tasks.status.error'),
  'not-executed': t('tasks.status.notExecuted'),
  disabled:      t('tasks.status.disabled'),
}))

const PLAN_STATUS_FILTERS = computed(() => [
  { value: 'all',           label: t('tasks.status.all') },
  { value: 'running',       label: t('tasks.status.running') },
  { value: 'planned',       label: t('tasks.status.planned') },
  { value: 'completed',     label: t('tasks.status.completed') },
  { value: 'error',         label: t('tasks.status.error') },
  { value: 'not-executed',  label: t('tasks.status.notExecuted') },
  { value: 'disabled',      label: t('tasks.status.disabled') },
])

const filteredPlans = computed(() => {
  let plans = planStatusFilter.value === 'all' ? tasksStore.plans : tasksStore.plans.filter(p => planCardStatus(p) === planStatusFilter.value)
  // Filter by category
  if (selectedPlanCategoryId.value) {
    plans = plans.filter(p => p.categoryId === selectedPlanCategoryId.value)
  }
  const q = planSearch.value.trim().toLowerCase()
  if (q) plans = plans.filter(p => p.name?.toLowerCase().includes(q) || p.description?.toLowerCase().includes(q))
  return plans
})

const filteredTasks = computed(() => {
  let tasks = tasksStore.tasks
  // Filter by category
  if (selectedTaskCategoryId.value) {
    tasks = tasks.filter(t => t.categoryId === selectedTaskCategoryId.value)
  }
  // Filter by search
  const q = taskSearch.value.trim().toLowerCase()
  if (!q) return tasks
  return tasks.filter(t => t.name?.toLowerCase().includes(q) || t.description?.toLowerCase().includes(q) || t.prompt?.toLowerCase().includes(q))
})

function planFilterCount(statusValue) {
  return tasksStore.plans.filter(p => planCardStatus(p) === statusValue).length
}

function scheduleLabel(plan) {
  const s = plan.schedule
  if (!s || s.type === 'manual') return t('tasks.schedule.manual')
  if (s.type === 'once') return s.runAt ? `${t('tasks.schedule.oneTime')} ${t('tasks.schedule.runAt')} ${new Date(s.runAt).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })}` : t('tasks.schedule.oneTime')
  return s.cron || t('tasks.schedule.cronExpression')
}

function relativeTime(iso) {
  if (!iso) return ''
  const diff = Date.now() - new Date(iso).getTime()
  const m = Math.floor(diff / 60000)
  if (m < 1) return t('tasks.misc.justNow')
  if (m < 60) return t('tasks.misc.minutesAgo', { count: m })
  const h = Math.floor(m / 60)
  if (h < 24) return t('tasks.misc.hoursAgo', { count: h })
  return t('tasks.misc.daysAgo', { count: Math.floor(h / 24) })
}

// ── Tooltip helpers ───────────────────────────────────────────────────────────

function getTaskDeleteTooltip(task) {
  const usedCount = tasksStore.taskUsedByPlanCount(task.id)
  if (usedCount > 0) {
    return t('tasks.deleteConfirm.taskUsedInPlans', { count: usedCount })
  }
  return t('tasks.actions.delete')
}

function getPlanDeleteTooltip(plan) {
  if (tasksStore.planHasRuns(plan.id)) {
    return t('tasks.deleteConfirm.planHasRuns')
  }
  return t('tasks.actions.delete')
}

// ── Category management ────────────────────────────────────────────────────────

function taskCategoryCount(categoryId) {
  return tasksStore.tasks.filter(t => t.categoryId === categoryId).length
}

function planCategoryCount(categoryId) {
  return tasksStore.plans.filter(p => p.categoryId === categoryId).length
}

function openTaskCategoryEditor(category = null) {
  editingCategory.value = category ? JSON.parse(JSON.stringify(category)) : null
  editingCategoryType.value = 'task'
  showTaskCatModal.value = true
}

function openPlanCategoryEditor(category = null) {
  editingCategory.value = category ? JSON.parse(JSON.stringify(category)) : null
  editingCategoryType.value = 'plan'
  showPlanCatModal.value = true
}

async function onSaveTaskCategory(data) {
  try {
    const cat = editingCategory.value || { id: uuid() }
    cat.name = data.name
    cat.emoji = data.emoji
    await tasksStore.saveTaskCategory(cat)
    showTaskCatModal.value = false
    editingCategory.value = null
  } catch (err) {
    console.error('[TaskEngineView] saveTaskCategory error:', err)
  }
}

async function onSavePlanCategory(data) {
  try {
    const cat = editingCategory.value || { id: uuid() }
    cat.name = data.name
    cat.emoji = data.emoji
    await tasksStore.savePlanCategory(cat)
    showPlanCatModal.value = false
    editingCategory.value = null
  } catch (err) {
    console.error('[TaskEngineView] savePlanCategory error:', err)
  }
}

async function deleteTaskCategory(categoryId) {
  const count = taskCategoryCount(categoryId)
  if (count > 0) {
    confirmModal.value = {
      visible: true,
      title: t('tasks.category.cannotDeleteCategory'),
      message: t('tasks.category.categoryHasItems', { count }),
      confirmText: t('common.ok'),
      cancelText: '',
      onConfirm: () => {},
    }
    return
  }
  confirmModal.value = {
    visible: true,
    title: t('tasks.category.deleteCategory'),
    message: t('tasks.category.deleteThisCategory'),
    onConfirm: () => tasksStore.deleteTaskCategory(categoryId),
  }
}

async function deletePlanCategory(categoryId) {
  const count = planCategoryCount(categoryId)
  if (count > 0) {
    confirmModal.value = {
      visible: true,
      title: t('tasks.category.cannotDeleteCategory'),
      message: t('tasks.category.categoryHasItems', { count }),
      confirmText: t('common.ok'),
      cancelText: '',
      onConfirm: () => {},
    }
    return
  }
  confirmModal.value = {
    visible: true,
    title: t('tasks.category.deleteCategory'),
    message: t('tasks.category.deleteThisCategory'),
    onConfirm: () => tasksStore.deletePlanCategory(categoryId),
  }
}

// ── Drag and drop for assigning tasks/plans to categories ────────────────────

function startDragTask(task, event) {
  draggedTask.value = task
  event.dataTransfer.effectAllowed = 'move'
}

function startDragPlan(plan, event) {
  draggedPlan.value = plan
  event.dataTransfer.effectAllowed = 'move'
}

async function onDropTaskToCategory(category, event) {
  dragOverTaskCategory.value = null
  if (!draggedTask.value) return
  try {
    const task = JSON.parse(JSON.stringify(draggedTask.value))
    task.categoryId = category.id
    await tasksStore.saveTask(task)
  } catch (err) {
    console.error('[TaskEngineView] dropTaskToCategory error:', err)
  } finally {
    draggedTask.value = null
  }
}

async function onDropPlanToCategory(category, event) {
  dragOverPlanCategory.value = null
  if (!draggedPlan.value) return
  try {
    const plan = JSON.parse(JSON.stringify(draggedPlan.value))
    plan.categoryId = category.id
    await tasksStore.savePlan(plan)
  } catch (err) {
    console.error('[TaskEngineView] dropPlanToCategory error:', err)
  } finally {
    draggedPlan.value = null
  }
}

// ── Refresh ───────────────────────────────────────────────────────────────────

// ── Calendar / Dashboard handlers ─────────────────────────────────────────────

function onCalendarOpenPlan({ planId }) {
  const plan = tasksStore.plans.find(p => p.id === planId)
  if (plan) openPlanViewer(plan)
}

function onCalendarDeletePlan({ planId, planName }) {
  const plan = tasksStore.plans.find(p => p.id === planId)
  if (plan) confirmDeletePlan(plan)
}


function onDashboardOpenRun({ plan, planId, runId }) {
  const resolved = plan || tasksStore.plans.find(p => p.id === planId)
  if (!resolved) return
  historyPlan.value         = JSON.parse(JSON.stringify(resolved))
  historyInitialRunId.value = runId || null
  showPlanHistory.value     = true
}

async function refreshTab() {
  isRefreshing.value = true
  try {
    if (activeTab.value === 'tasks') {
      await tasksStore.loadTasks()
    } else if (activeTab.value === 'plans') {
      await Promise.all([tasksStore.loadPlans(), tasksStore.loadRuns()])
    } else if (activeTab.value === 'calendar') {
      await Promise.all([tasksStore.loadPlans(), tasksStore.loadRuns()])
    } else if (activeTab.value === 'dashboard') {
      await Promise.all([tasksStore.loadPlans(), tasksStore.loadRuns()])
    }
  } finally {
    isRefreshing.value = false
  }
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

watch(activeTab, (tab) => {
  if (tab === 'plans' || tab === 'calendar' || tab === 'dashboard') tasksStore.loadRuns()
})

// ── Pending plan open (from minibar click) ────────────────────────────────────

function _tryOpenPendingPlan() {
  const planId = tasksStore.pendingOpenPlanId
  if (!planId) return
  const plan = tasksStore.plans.find(p => p.id === planId)
  if (plan) {
    activeTab.value = 'plans'
    openPlanViewer(plan, true)
  }
  tasksStore.clearPendingOpenPlan()
}

watch(() => tasksStore.pendingOpenPlanId, (planId) => {
  if (planId) _tryOpenPendingPlan()
})

onMounted(async () => {
  await Promise.all([
    tasksStore.loadTasks(),
    tasksStore.loadPlans(),
    tasksStore.loadRuns(),
    tasksStore.loadTaskCategories(),
    tasksStore.loadPlanCategories(),
  ])
  tasksStore.subscribeToScheduledRuns()
  // Handle minibar click that navigated here before plans loaded
  _tryOpenPendingPlan()
})

onBeforeUnmount(() => {
  tasksStore.unsubscribeFromScheduledRuns()
})
</script>

<style scoped>
.tev-root {
  height: 100%;
  display: flex;
  flex-direction: column;
  padding: 2rem 2rem 2rem 2rem;
  gap: 1.25rem;
  overflow: hidden;
}

/* Header */
.tev-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-shrink: 0;
}
.tev-header-left {
  display: flex;
  align-items: center;
  gap: 1rem;
}
.tev-header-icon {
  width: 3rem;
  height: 3rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: var(--radius-md);
  color: #FFFFFF;
  flex-shrink: 0;
}
.tev-title {
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: var(--text-primary);
  letter-spacing: -0.02em;
  margin: 0;
}
.tev-subtitle {
  font-size: var(--fs-secondary);
  color: var(--text-muted);
  margin: 0.125rem 0 0;
}
.tev-header-actions { display: flex; align-items: center; gap: 0.5rem; padding-top: 0.25rem; }

/* Tabs */
.tev-tabs {
  display: flex;
  gap: 0.25rem;
  border-bottom: 1px solid var(--border);
  flex-shrink: 0;
}
.tev-tab {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.5rem 1rem;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  margin-bottom: -1px;
}
.tev-tab:hover { color: var(--text-primary); }
.tev-tab--active { color: var(--text-primary); border-bottom-color: var(--text-primary); }
.tev-tab-count {
  padding: 0.0625rem 0.4375rem;
  background: var(--bg-hover);
  border-radius: 9999px;
  font-size: var(--fs-small);
  font-weight: 700;
  color: var(--text-secondary);
  min-width: 1.25rem;
  text-align: center;
}
.tev-tab--active .tev-tab-count { background: var(--text-primary); color: #FFFFFF; }

/* Content area */
.tev-content {
  flex: 1;
  overflow: hidden;
  display: flex;
  flex-direction: column;
}

/* Empty state */
.tev-empty {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 1rem;
  text-align: center;
  padding: 3rem;
}
.tev-empty-icon {
  width: 5rem;
  height: 5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: var(--radius-xl);
  color: #FFFFFF;
}
.tev-empty-title {
  font-size: var(--fs-section);
  font-weight: 700;
  color: var(--text-primary);
}
.tev-empty-desc {
  font-size: var(--fs-body);
  color: var(--text-muted);
  max-width: 28rem;
  line-height: 1.6;
}
.tev-empty-hint {
  font-size: var(--fs-secondary);
  color: var(--text-muted);
  font-style: italic;
}

/* Task grid */
.tev-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 0.75rem;
  overflow-y: auto;
  padding-bottom: 1rem;
  padding-right: 0.25rem;
  align-content: start;
  scrollbar-width: thin;
  flex: 1;
  min-height: 0;
}
@media (min-width: 1920px) { .tev-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 2560px) { .tev-grid { grid-template-columns: repeat(4, 1fr); } }

.tev-task-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 1rem;
  display: flex;
  flex-direction: column;
  gap: 0.625rem;
  transition: box-shadow 0.15s ease;
  cursor: pointer;
}
.tev-task-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.tev-task-top-row {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.tev-task-icon-wrap {
  font-size: 1.5rem;
  width: 2.5rem;
  height: 2.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border-radius: var(--radius-sm);
  flex-shrink: 0;
}
.tev-task-name {
  flex: 1;
  min-width: 0;
  font-size: var(--fs-subtitle);
  font-weight: 700;
  color: var(--text-primary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tev-task-body { display: flex; flex-direction: column; gap: 0.3125rem; }
.tev-task-desc {
  font-size: var(--fs-secondary);
  color: var(--text-secondary);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.tev-task-prompt-preview {
  font-size: var(--fs-small);
  color: var(--text-muted);
  font-style: italic;
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  line-height: 1.5;
}
.tev-task-actions {
  display: flex;
  flex-direction: row;
  gap: 0.25rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.tev-task-card:hover .tev-task-actions { opacity: 1; }

/* Two-panel layout */
.tev-two-panel {
  display: flex;
  gap: 1rem;
  flex: 1;
  min-height: 0;
  overflow: hidden;
}

.tev-cat-nav {
  width: 300px;
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  background: var(--bg-card);
  overflow-y: auto;
  overflow-x: hidden;
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  scrollbar-width: thin;
}

.tev-cat-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.75rem 0.75rem;
  border-bottom: 1px solid var(--border);
  gap: 0.5rem;
  flex-shrink: 0;
}

.tev-cat-header-title {
  font-size: var(--fs-secondary);
  font-weight: 700;
  color: var(--text-muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}

.tev-cat-add-btn {
  width: 1.5rem;
  height: 1.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: transparent;
  border: none;
  color: var(--text-muted);
  cursor: pointer;
  transition: all 0.15s ease;
  border-radius: var(--radius-sm);
}

.tev-cat-add-btn:hover {
  background: var(--bg-hover);
  color: var(--text-primary);
}

/* Category nav items — match AgentsView styling */

/* nav item wrapper — needed for action icon reveal on hover */
.tev-cat-nav .nav-item-wrap {
  position: relative;
  border-radius: 0.5rem;
  transition: background 0.12s ease;
}
.tev-cat-nav .nav-item-wrap:hover .nav-item-actions { opacity: 1; }

/* ── All button ─────────────────────────────────────────────────────────────── */
.tev-cat-nav .nav-item--all {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: calc(100% - 1rem);
  padding: 0.625rem 0.75rem;
  margin: 0.25rem 0.5rem;
  border: none;
  border-radius: 0.5rem;
  background: transparent;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #4B5563;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
  min-width: 0;
}
.tev-cat-nav .nav-item--all:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
}
.tev-cat-nav .nav-item--all:hover .nav-item-icon { opacity: 1; }
.tev-cat-nav .nav-item--all:hover .nav-item-count {
  background: transparent;
  color: rgba(255,255,255,0.6);
}
.tev-cat-nav .nav-item--all.active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-weight: 600;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  border-radius: var(--radius-sm);
  margin-right: 0.5rem;
}

.tev-cat-nav .nav-item-icon {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  opacity: 0.6;
}
.tev-cat-nav .nav-item--all.active .nav-item-icon { opacity: 1; }

.tev-cat-nav .nav-item-emoji {
  font-size: 0.875rem;
  flex-shrink: 0;
  line-height: 1;
}

.tev-cat-nav .nav-item-label {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tev-cat-nav .nav-item-count {
  font-size: var(--fs-small);
  color: #9CA3AF;
  background: transparent;
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  flex-shrink: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
  font-weight: 700;
  font-size: var(--fs-secondary);
}

/* ── Category rows: full-row hover background on wrapper ─────────────────── */
.tev-cat-nav .nav-item-wrap.nav-cat-wrap {
  display: flex;
  align-items: center;
  border-radius: 0.5rem;
  transition: background 0.12s ease, box-shadow 0.12s ease;
  padding: 0 0.5rem;
  margin: 0.25rem 0.5rem;
}
/* Hover: full row gets the dark gradient */
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
/* Active: same gradient + bold */
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:has(.nav-item.active) {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}

/* The button inside a category row is transparent — wrapper provides bg */
.tev-cat-nav .nav-cat-btn {
  flex: 1;
  min-width: 0;
  background: transparent !important;
  box-shadow: none !important;
  /* Actual styles inherited from .nav-item */
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.625rem 0 0.625rem 0;
  border: none;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease, color 0.12s ease;
}
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:hover .nav-cat-btn,
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:has(.nav-item.active) .nav-cat-btn {
  color: #FFFFFF;
}
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:has(.nav-item.active) .nav-cat-btn {
  font-weight: 600;
}

/* Right side: count + action buttons */
.tev-cat-nav .nav-cat-right {
  display: flex;
  align-items: center;
  flex-shrink: 0;
  position: relative;
  min-width: 3.5rem;
  height: 1.5rem;
  justify-content: flex-end;
  gap: 0.25rem;
}

.tev-cat-nav .nav-cat-count {
  font-size: var(--fs-small);
  padding: 0.125rem 0.375rem;
  border-radius: 9999px;
  flex-shrink: 0;
  transition: opacity 0.12s ease, background 0.12s ease, color 0.12s ease;
  color: #9CA3AF;
  background: #F0F0F0;
}
/* On hover or active row: white badge, then hide it for actions */
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:hover .nav-cat-count,
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:has(.nav-item.active) .nav-cat-count {
  background: rgba(255,255,255,0.15);
  color: rgba(255,255,255,0.8);
}
/* Hide count on hover/active to show action buttons */
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:hover .nav-cat-count,
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:has(.nav-item.active) .nav-cat-count {
  opacity: 0;
  pointer-events: none;
}

.tev-cat-nav .nav-cat-actions {
  position: absolute;
  right: 0;
  top: 50%;
  transform: translateY(-50%);
  display: flex;
  gap: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
}
/* Show actions on hover OR when active */
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:hover .nav-cat-actions,
.tev-cat-nav .nav-item-wrap.nav-cat-wrap:has(.nav-item.active) .nav-cat-actions {
  opacity: 1;
}

/* Icon buttons */
.tev-cat-nav .nav-item-actions {
  display: flex;
  gap: 0;
  opacity: 0;
  transition: opacity 0.12s ease;
  flex-shrink: 0;
}

.tev-cat-nav .nav-icon-btn {
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.5);
  border-radius: 0.3125rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s ease, color 0.12s ease;
}
.tev-cat-nav .nav-icon-btn:hover { background: rgba(255, 255, 255, 0.15); color: #FFFFFF; }
.tev-cat-nav .nav-icon-btn-danger:hover { background: rgba(255, 59, 48, 0.25); color: #FF6B6B; }

/* Drag-over state for categories */
.tev-cat-nav .nav-item-wrap.nav-cat-wrap.drag-over {
  background: rgba(59, 130, 246, 0.1) !important;
  outline: 2px dashed rgba(59, 130, 246, 0.5);
  outline-offset: -2px;
}

.tev-task-card[draggable="true"],
.tev-plan-card[draggable="true"] {
  cursor: grab;
}
.tev-task-card[draggable="true"]:active,
.tev-plan-card[draggable="true"]:active {
  cursor: grabbing;
}

.tev-tab-content-area {
  flex: 1;
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 0.75rem;
}

/* Plan grid */
.tev-plans-tab-content,
.tev-tasks-tab-content {
  display: flex;
  flex-direction: column;
  flex: 1;
  min-height: 0;
  gap: 0.75rem;
}
.tev-tab-toolbar {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  flex-shrink: 0;
  flex-wrap: wrap;
}
.tev-search-wrap {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.625rem;
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-full);
  color: var(--text-muted);
}
.tev-search-input {
  border: none;
  background: transparent;
  font-family: inherit;
  font-size: var(--fs-small);
  color: var(--text-primary);
  outline: none;
  width: 12rem;
}
.tev-search-input::placeholder { color: var(--text-muted); }
.tev-search-clear {
  display: flex;
  align-items: center;
  justify-content: center;
  background: none;
  border: none;
  padding: 0;
  cursor: pointer;
  color: var(--text-muted);
  line-height: 1;
}
.tev-search-clear:hover { color: var(--text-primary); }
.tev-plans-filter-bar {
  display: flex;
  gap: 0.375rem;
  flex-wrap: wrap;
  flex-shrink: 0;
}
.tev-filter-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.25rem 0.75rem;
  border-radius: var(--radius-full);
  border: 1px solid var(--border);
  background: transparent;
  font-size: var(--fs-small);
  color: var(--text-secondary);
  cursor: pointer;
  font-family: inherit;
  transition: all 0.15s ease;
}
.tev-filter-btn:hover { background: var(--bg-hover); color: var(--text-primary); }
.tev-filter-btn--active {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  color: #FFFFFF;
}
.tev-filter-count {
  padding: 0 0.3125rem;
  background: rgba(0,0,0,0.12);
  border-radius: 9999px;
  font-size: var(--fs-small);
  font-weight: 700;
  min-width: 1.125rem;
  text-align: center;
}
.tev-filter-btn--active .tev-filter-count { background: rgba(255,255,255,0.2); }
.tev-filter-empty {
  padding: 2.5rem;
  text-align: center;
  font-size: var(--fs-secondary);
  color: var(--text-muted);
}
.tev-plans-grid {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1rem;
  overflow-y: auto;
  align-content: start;
  padding-bottom: 1rem;
  padding-right: 0.25rem;
  scrollbar-width: thin;
  flex: 1;
  min-height: 0;
}
@media (min-width: 1920px) { .tev-plans-grid { grid-template-columns: repeat(3, 1fr); } }
@media (min-width: 2560px) { .tev-plans-grid { grid-template-columns: repeat(4, 1fr); } }

.tev-plan-card {
  background: var(--bg-card);
  border: 1px solid var(--border);
  border-radius: var(--radius-lg);
  padding: 0.875rem 1rem;
  display: flex;
  align-items: flex-start;
  gap: 0.625rem;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tev-plan-card:hover { box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
.tev-plan-info { flex: 1; min-width: 0; }
.tev-plan-name-row { display: flex; align-items: center; gap: 0.5rem; }
.tev-plan-name { font-size: var(--fs-subtitle); font-weight: 700; color: var(--text-primary); }
.tev-plan-spinner {
  flex-shrink: 0;
  animation: tevSpin 0.9s linear infinite;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-radius: 50%;
  color: #FFFFFF;
}
@keyframes tevSpin { to { transform: rotate(360deg); } }
.tev-plan-icon {
  font-size: 1.25rem;
  flex-shrink: 0;
}
.tev-plan-desc { font-size: var(--fs-secondary); color: var(--text-secondary); margin-top: 0.125rem; }
.tev-plan-meta { display: flex; align-items: center; gap: 0.625rem; margin-top: 0.375rem; flex-wrap: wrap; }
.tev-plan-meta-item {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--fs-small);
  color: var(--text-muted);
}
.tev-plan-status {
  padding: 0.0625rem 0.5rem;
  border-radius: 9999px;
  font-size: var(--fs-small);
  font-weight: 600;
}
.tev-plan-status--running      { background: rgba(245,158,11,0.12);  color: #D97706; }
.tev-plan-status--planned      { background: rgba(96,165,250,0.12);  color: #3B82F6; }
.tev-plan-status--completed    { background: rgba(16,185,129,0.12);  color: #059669; }
.tev-plan-status--error        { background: rgba(239,68,68,0.12);   color: #DC2626; }
.tev-plan-status--not-executed { background: var(--bg-hover);        color: var(--text-muted); }
.tev-plan-status--disabled     { background: var(--bg-hover);        color: var(--text-muted); }
.tev-plan-last-run { font-size: var(--fs-small); color: var(--text-muted); margin-top: 0.25rem; }
.tev-plan-actions {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  flex-shrink: 0;
  opacity: 0;
  transition: opacity 0.15s ease;
}
.tev-plan-card:hover .tev-plan-actions { opacity: 1; }

/* Action buttons */
.tev-action-btn {
  width: 1.75rem;
  height: 1.75rem;
  display: flex;
  align-items: center;
  justify-content: center;
  background: var(--bg-hover);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  color: var(--text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.tev-action-btn:hover:not(:disabled) { background: var(--text-primary); color: #FFFFFF; border-color: var(--text-primary); }
.tev-action-btn:disabled { opacity: 0.35; cursor: not-allowed; }
.tev-action-danger:hover:not(:disabled) { background: #EF4444 !important; border-color: #EF4444 !important; }

/* Active run panel (floating, triggered from card) */
.tev-stop-btn {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  padding: 0.3125rem 0.75rem;
  background: rgba(239,68,68,0.08);
  border: 1px solid rgba(239,68,68,0.2);
  border-radius: var(--radius-sm);
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  color: #EF4444;
  cursor: pointer;
  transition: all 0.15s ease;
}
.tev-stop-btn:hover { background: rgba(239,68,68,0.15); }
</style>
