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
                <svg style="width:28px;height:28px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
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
                <svg style="width:28px;height:28px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
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
  personasStore.personas
    .filter(p => p.type === 'system')
    .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)
const userPersonas = computed(() =>
  personasStore.personas
    .filter(p => p.type === 'user')
    .sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
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
  '#007AFF', '#007AFF', '#10B981', '#F59E0B', '#EC4899',
  '#5856D6', '#14B8A6', '#EF4444', '#0EA5E9', '#F97316',
  '#A855F7', '#06B6D4', '#1E40AF', '#059669', '#D97706',
  '#7C3AED', '#DB2777', '#0891B2', '#DC2626', '#EA580C',
  '#0056CC', '#0D9488', '#B45309', '#9333EA', '#0369A1',
  '#BE185D', '#1A1A1A', '#6B7280', '#78350F', '#064E3B',
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
    ? 'linear-gradient(135deg, #007AFF, #5856D6)'
    : 'linear-gradient(135deg, #10B981, #059669)'
}
</script>

<style scoped>
/* ── Page shell ──────────────────────────────────────────────────────────── */
.personas-page {
  background: #F2F2F7;
}

/* ── Header ──────────────────────────────────────────────────────────────── */
.personas-header {
  padding: 24px 32px 20px;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.personas-header-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.personas-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.personas-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #6B7280;
  margin: 4px 0 0 0;
}
.personas-header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.persona-count-badge {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #9CA3AF;
  background: #F5F5F5;
  padding: 4px 12px;
  border-radius: 9999px;
  border: 1px solid #E5E5EA;
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
  background: #E5E5EA;
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
    background: #E5E5EA;
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
  background: #1A1A1A;
}
.section-icon.user {
  background: #007AFF;
}
.section-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-section);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.section-desc {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
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
  border-radius: 16px;
  background: #F9F9F9;
  border: 1.5px dashed #D1D1D6;
}
.section-empty-inner p {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  color: #9CA3AF;
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
  font-family: 'Inter', sans-serif;
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
  background: #1A1A1A;
  color: #fff;
  box-shadow: none;
}
.persona-add-btn.system:hover {
  background: #333;
}
.persona-add-btn.user {
  background: #007AFF;
  color: #fff;
  box-shadow: none;
}
.persona-add-btn.user:hover {
  background: #0056CC;
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
