<template>
  <div class="h-full flex flex-col overflow-hidden personas-page">

    <!-- Header -->
    <div class="personas-header">
      <div class="personas-header-top">
        <div>
          <h1 class="personas-title">Personas</h1>
          <p class="personas-subtitle">
            Manage AI personalities and user profiles for your chats.
          </p>
        </div>
        <div class="personas-header-actions">
          <div class="persona-count-badge">
            {{ personasStore.personas.length }} persona{{ personasStore.personas.length !== 1 ? 's' : '' }}
          </div>
        </div>
      </div>
    </div>

    <!-- Catalog: side-by-side columns -->
    <div class="flex-1 overflow-hidden personas-catalog">
      <div class="personas-columns">

        <!-- ── LEFT: System Personas ──────────────────────────────── -->
        <section class="personas-column">
          <div class="section-header">
            <div class="section-header-left">
              <div class="section-icon system">
                <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M12 8V4H8"/>
                  <path d="M4 12h16"/>
                  <path d="M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1"/>
                  <path d="M9 16h0"/>
                  <path d="M15 16h0"/>
                </svg>
              </div>
              <div>
                <h2 class="section-title">System Personas</h2>
                <p class="section-desc">Define how the AI behaves.</p>
              </div>
            </div>
            <button class="persona-add-btn system" @click="openWizard('system')">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add
            </button>
          </div>

          <div class="personas-grid-scroll">
            <div v-if="systemPersonas.length > 0" class="personas-grid">
              <PersonaCard
                v-for="persona in systemPersonas"
                :key="persona.id"
                :persona="persona"
                :gradient="getAvatarGradient(persona)"
                @click="openEdit(persona)"
                @edit="openEdit(persona)"
                @delete="confirmDelete(persona)"
                @set-default="personasStore.setDefault(persona.id)"
              />
            </div>
            <div v-else class="section-empty">
              <div class="section-empty-inner">
                <svg style="width:28px;height:28px;color:#94A3B8;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M12 8V4H8M4 12h16M5 12a1 1 0 0 0-1 1v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4a1 1 0 0 0-1-1M9 16h0M15 16h0"/>
                </svg>
                <p>No system personas yet.</p>
              </div>
            </div>
          </div>
        </section>

        <!-- ── Vertical divider ──────────────────────────────────── -->
        <div class="column-divider"></div>

        <!-- ── RIGHT: User Personas ──────────────────────────────── -->
        <section class="personas-column">
          <div class="section-header">
            <div class="section-header-left">
              <div class="section-icon user">
                <svg style="width:18px;height:18px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
              </div>
              <div>
                <h2 class="section-title">User Personas</h2>
                <p class="section-desc">Tell the AI who you are.</p>
              </div>
            </div>
            <button class="persona-add-btn user" @click="openWizard('user')">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add
            </button>
          </div>

          <div class="personas-grid-scroll">
            <div v-if="userPersonas.length > 0" class="personas-grid">
              <PersonaCard
                v-for="persona in userPersonas"
                :key="persona.id"
                :persona="persona"
                :gradient="getAvatarGradient(persona)"
                @click="openEdit(persona)"
                @edit="openEdit(persona)"
                @delete="confirmDelete(persona)"
                @set-default="personasStore.setDefault(persona.id)"
              />
            </div>
            <div v-else class="section-empty">
              <div class="section-empty-inner">
                <svg style="width:28px;height:28px;color:#94A3B8;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
                  <circle cx="12" cy="7" r="4"/>
                </svg>
                <p>No user personas yet.</p>
              </div>
            </div>
          </div>
        </section>

      </div>
    </div>

    <!-- Wizard Modal -->
    <PersonaWizard
      v-if="showWizard"
      :type="wizardType"
      :edit-persona="wizardEditPersona"
      @close="showWizard = false"
      @saved="onSaved"
    />
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { usePersonasStore } from '../stores/personas'
import { PERSONA_AVATARS } from '../components/personas/personaAvatars'
import PersonaCard from '../components/personas/PersonaCard.vue'
import PersonaWizard from '../components/personas/PersonaWizard.vue'

const personasStore = usePersonasStore()

onMounted(async () => {
  await personasStore.loadPersonas()
})

const systemPersonas = computed(() =>
  personasStore.personas.filter(p => p.type === 'system')
)
const userPersonas = computed(() =>
  personasStore.personas.filter(p => p.type === 'user')
)

const showWizard = ref(false)
const wizardType = ref('system')
const wizardEditPersona = ref(null)

function openWizard(type) {
  wizardType.value = type
  wizardEditPersona.value = null
  showWizard.value = true
}

function openEdit(persona) {
  wizardType.value = persona.type
  wizardEditPersona.value = persona
  showWizard.value = true
}

function onSaved() {
  showWizard.value = false
}

async function confirmDelete(persona) {
  if (confirm(`Delete persona "${persona.name}"?`)) {
    await personasStore.deletePersona(persona.id)
  }
}

const CIRCLE_COLORS = [
  '#6366F1', '#3B82F6', '#10B981', '#F59E0B', '#EC4899',
  '#8B5CF6', '#14B8A6', '#EF4444', '#0EA5E9', '#F97316',
  '#A855F7', '#06B6D4', '#1E40AF', '#059669', '#D97706',
  '#7C3AED', '#DB2777', '#0891B2', '#DC2626', '#EA580C',
  '#4F46E5', '#0D9488', '#B45309', '#9333EA', '#0369A1',
  '#BE185D', '#1E293B', '#475569', '#78350F', '#064E3B',
  '#312E81', '#831843', '#134E4A', '#7C2D12', '#1E3A5F',
  '#4A1D96',
]

function getAvatarGradient(persona) {
  const idx = PERSONA_AVATARS.findIndex(a => a.id === persona.avatar)
  if (idx >= 0) {
    const c = CIRCLE_COLORS[idx % CIRCLE_COLORS.length]
    return `linear-gradient(135deg, ${c}, ${c}dd)`
  }
  return persona.type === 'system'
    ? 'linear-gradient(135deg, #6366F1, #8B5CF6)'
    : 'linear-gradient(135deg, #10B981, #059669)'
}
</script>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
.personas-page {
  background:
    radial-gradient(ellipse at 10% 5%, rgba(99, 102, 241, 0.08) 0%, transparent 50%),
    radial-gradient(ellipse at 90% 15%, rgba(236, 72, 153, 0.06) 0%, transparent 45%),
    radial-gradient(ellipse at 50% 85%, rgba(16, 185, 129, 0.06) 0%, transparent 50%),
    #F8FAFC;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.personas-header {
  padding: 24px 32px 20px;
  background: rgba(255, 255, 255, 0.7);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-bottom: 1px solid rgba(226, 232, 240, 0.6);
}
.personas-header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.personas-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: #0F172A;
  margin: 0;
}
.personas-subtitle {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-body);
  color: #475569;
  margin: 4px 0 0 0;
}
.personas-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.persona-count-badge {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #64748B;
  background: rgba(241, 245, 249, 0.8);
  padding: 4px 12px;
  border-radius: 9999px;
  border: 1px solid rgba(226, 232, 240, 0.5);
}

/* ── Catalog container ───────────────────────────────────────────────────── */
.personas-catalog {
  padding: 0 32px;
  display: flex;
  flex-direction: column;
}

/* ── Side-by-side columns ────────────────────────────────────────────────── */
.personas-columns {
  display: flex;
  gap: 0;
  padding-top: 24px;
  flex: 1;
  min-height: 0; /* allow children to shrink below content size */
}
.personas-column {
  flex: 1;
  min-width: 0;
  display: flex;
  flex-direction: column;
  min-height: 0;
}
.column-divider {
  width: 1px;
  align-self: stretch;
  margin: 0 24px;
  background: linear-gradient(180deg, transparent, rgba(148, 163, 184, 0.3) 15%, rgba(148, 163, 184, 0.3) 85%, transparent);
}
@media (max-width: 800px) {
  .personas-columns {
    flex-direction: column;
    gap: 24px;
  }
  .column-divider {
    width: 100%;
    height: 1px;
    margin: 0;
    background: linear-gradient(90deg, transparent, rgba(148, 163, 184, 0.3), transparent);
  }
}

/* ── Section header ──────────────────────────────────────────────────────── */
.section-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 16px;
}
.section-header-left {
  display: flex;
  align-items: center;
  gap: 10px;
}
.section-icon {
  width: 34px;
  height: 34px;
  border-radius: 9px;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}
.section-icon.system {
  background: linear-gradient(135deg, #6366F1, #8B5CF6);
}
.section-icon.user {
  background: linear-gradient(135deg, #10B981, #059669);
}
.section-title {
  font-family: 'Figtree', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #0F172A;
  margin: 0;
}
.section-desc {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  color: #64748B;
  margin: 2px 0 0 0;
}

/* ── Scrollable grid area within each column ─────────────────────────────── */
.personas-grid-scroll {
  flex: 1;
  overflow-y: auto;
  scrollbar-width: thin;
  padding-bottom: 24px;
}
.personas-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14px;
}
@media (max-width: 1400px) {
  .personas-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 900px) {
  .personas-grid { grid-template-columns: 1fr; }
}

/* ── Section empty state ─────────────────────────────────────────────────── */
.section-empty {
  padding: 24px;
}
.section-empty-inner {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  padding: 28px 24px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.5);
  border: 1.5px dashed rgba(148, 163, 184, 0.35);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
}
.section-empty-inner p {
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  color: #94A3B8;
  margin: 0;
  text-align: center;
}

/* ── Add buttons ─────────────────────────────────────────────────────────── */
.persona-add-btn {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 7px 14px;
  border-radius: 8px;
  font-family: 'Noto Sans', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  border: none;
  cursor: pointer;
  transition: background 0.2s, transform 0.15s, box-shadow 0.2s;
}
.persona-add-btn:active {
  transform: scale(0.97);
}
.persona-add-btn.system {
  background: #6366F1;
  color: #fff;
  box-shadow: 0 2px 8px rgba(99, 102, 241, 0.25);
}
.persona-add-btn.system:hover {
  background: #4F46E5;
  box-shadow: 0 4px 12px rgba(99, 102, 241, 0.35);
}
.persona-add-btn.user {
  background: #10B981;
  color: #fff;
  box-shadow: 0 2px 8px rgba(16, 185, 129, 0.25);
}
.persona-add-btn.user:hover {
  background: #059669;
  box-shadow: 0 4px 12px rgba(16, 185, 129, 0.35);
}

@media (prefers-reduced-motion: reduce) {
  .persona-add-btn {
    transition: none;
  }
  .persona-add-btn:active {
    transform: none;
  }
}
</style>
