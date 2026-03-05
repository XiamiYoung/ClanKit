<template>
  <div class="combo-box">
    <!-- ── Single-select mode ──────────────────────────────────────────── -->
    <template v-if="!multiple">
      <div v-if="modelValue" class="combo-chip">
        <span class="combo-chip-label">{{ chipLabelOverride || chipLabel }}</span>
        <button class="combo-chip-remove" @mousedown.prevent="clear" title="Remove">
          <svg class="icon-xs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
          </svg>
        </button>
      </div>
      <input
        v-else
        ref="inputRef"
        v-model="search"
        type="text"
        :placeholder="placeholder"
        :disabled="disabled"
        class="combo-input font-mono"
        @focus="showDropdown = true"
        @input="showDropdown = true"
        @blur="showDropdown = false"
      />
    </template>

    <!-- ── Multi-select mode ───────────────────────────────────────────── -->
    <template v-else>
      <div class="combo-multi-bar">
        <div v-if="selectedItems.length > 0" class="combo-multi-chips">
          <span
            v-for="item in selectedItems"
            :key="item.id"
            class="combo-multi-chip"
          >
            <span class="combo-multi-chip-label">{{ item.name || item.id }}</span>
            <button class="combo-multi-chip-x" @mousedown.prevent="toggleItem(item.id)" title="Remove">
              <svg class="icon-xxs" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3">
                <path d="M18 6 6 18"/><path d="m6 6 12 12"/>
              </svg>
            </button>
          </span>
        </div>
        <input
          ref="inputRef"
          v-model="search"
          type="text"
          :placeholder="selectedItems.length > 0 ? '' : placeholder"
          :disabled="disabled"
          class="combo-multi-input"
          @focus="showDropdown = true"
          @input="showDropdown = true"
          @blur="showDropdown = false"
        />
      </div>
    </template>

    <!-- ── Shared dropdown ─────────────────────────────────────────────── -->
    <div v-if="showDropdown && filtered.length > 0" class="combo-dropdown">
      <div
        v-for="opt in filtered"
        :key="opt.id"
        class="combo-option"
        :class="{ selected: isSelected(opt.id) }"
        @mousedown.prevent="onOptionClick(opt)"
      >
        <span class="combo-option-name">{{ opt.name || opt.id }}</span>
        <span class="combo-option-id">{{ opt.detail || opt.id }}</span>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  modelValue: { type: [String, Array], default: '' },
  options: { type: Array, default: () => [] },
  placeholder: { type: String, default: 'Search...' },
  disabled: { type: Boolean, default: false },
  displayKey: { type: String, default: 'id' },
  chipLabelOverride: { type: String, default: '' },
  multiple: { type: Boolean, default: false },
})

const emit = defineEmits(['update:modelValue'])

const search = ref('')
const showDropdown = ref(false)
const inputRef = ref(null)

// ── Single-select helpers ─────────────────────────────────────────────────
const chipLabel = computed(() => {
  const match = props.options.find(o => o.id === props.modelValue)
  if (match && props.displayKey !== 'id' && match[props.displayKey]) {
    return match[props.displayKey]
  }
  if (match && match.name) return match.name
  return props.modelValue
})

// ── Multi-select helpers ──────────────────────────────────────────────────
const selectedItems = computed(() => {
  if (!props.multiple || !Array.isArray(props.modelValue)) return []
  return props.modelValue
    .map(id => props.options.find(o => o.id === id) || { id, name: id })
})

function isSelected(id) {
  if (props.multiple) {
    return Array.isArray(props.modelValue) && props.modelValue.includes(id)
  }
  return props.modelValue === id
}

// ── Filtering ─────────────────────────────────────────────────────────────
const filtered = computed(() => {
  let list = props.options
  if (search.value) {
    const q = search.value.toLowerCase()
    list = list.filter(o =>
      o.id.toLowerCase().includes(q) ||
      (o.name || '').toLowerCase().includes(q) ||
      (o.detail || '').toLowerCase().includes(q)
    )
  }
  return list.slice(0, 50)
})

// ── Actions ───────────────────────────────────────────────────────────────
function onOptionClick(opt) {
  if (props.multiple) {
    toggleItem(opt.id)
  } else {
    emit('update:modelValue', opt.id)
    search.value = ''
    showDropdown.value = false
  }
}

function toggleItem(id) {
  const arr = Array.isArray(props.modelValue) ? [...props.modelValue] : []
  const idx = arr.indexOf(id)
  if (idx >= 0) arr.splice(idx, 1)
  else arr.push(id)
  emit('update:modelValue', arr)
}

function clear() {
  emit('update:modelValue', props.multiple ? [] : '')
  search.value = ''
}
</script>

<style scoped>
.combo-box {
  position: relative;
  border: 1px solid var(--border); border-radius: var(--radius-sm);
  background: var(--bg-card);
  transition: border-color 0.15s, box-shadow 0.15s;
}
.combo-box:focus-within { border-color: var(--text-primary); box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }

.combo-input {
  width: 100%; display: block; padding: 0.5625rem 0.75rem; border: none; border-radius: var(--radius-sm);
  background: transparent; color: var(--text-primary);
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); outline: none;
}
.combo-input::placeholder { color: var(--text-muted); }
.combo-input:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Single chip ───────────────────────────────────────────────────────── */
.combo-chip {
  display: flex; align-items: center; gap: 0.5rem; margin: 0.25rem; padding: 0.3125rem 0.5rem 0.3125rem 0.75rem;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.combo-chip-label {
  font-family: 'JetBrains Mono', 'Inter', monospace; font-size: 0.8125rem; font-weight: 600;
  color: #FFFFFF; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;
}
.combo-chip-remove {
  display: flex; align-items: center; justify-content: center;
  width: 1.25rem; height: 1.25rem; border-radius: 0.375rem; flex-shrink: 0;
  background: rgba(255,255,255,0.15); border: none; color: rgba(255,255,255,0.7);
  cursor: pointer; transition: background 0.12s, color 0.12s;
}
.combo-chip-remove:hover { background: rgba(255,255,255,0.25); color: #FFFFFF; }

.icon-xs { width: 0.875rem; height: 0.875rem; flex-shrink: 0; }

/* ── Multi-select bar ──────────────────────────────────────────────────── */
.combo-multi-bar {
  display: flex; flex-wrap: wrap; align-items: center; gap: 0.25rem;
  padding: 0.25rem 0.25rem 0.25rem 0.5rem; min-height: 2.375rem;
}
.combo-multi-chips { display: flex; flex-wrap: wrap; gap: 0.25rem; }
.combo-multi-chip {
  display: inline-flex; align-items: center; gap: 0.25rem;
  padding: 0.1875rem 0.375rem 0.1875rem 0.625rem; border-radius: 0.375rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  box-shadow: 0 1px 4px rgba(0,0,0,0.10);
}
.combo-multi-chip-label {
  font-family: 'Inter', sans-serif; font-size: 0.75rem; font-weight: 600;
  color: #FFFFFF; white-space: nowrap;
}
.combo-multi-chip-x {
  display: flex; align-items: center; justify-content: center;
  width: 1rem; height: 1rem; border-radius: 0.25rem; flex-shrink: 0;
  background: rgba(255,255,255,0.15); border: none; color: rgba(255,255,255,0.7);
  cursor: pointer; transition: background 0.12s, color 0.12s;
}
.combo-multi-chip-x:hover { background: rgba(255,255,255,0.25); color: #FFFFFF; }
.icon-xxs { width: 0.625rem; height: 0.625rem; flex-shrink: 0; }

.combo-multi-input {
  flex: 1; min-width: 5rem; border: none; background: transparent;
  padding: 0.25rem 0.25rem; outline: none;
  font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: var(--text-primary);
}
.combo-multi-input::placeholder { color: var(--text-muted); }
.combo-multi-input:disabled { opacity: 0.5; cursor: not-allowed; }

/* ── Dropdown ──────────────────────────────────────────────────────────── */
.combo-dropdown {
  position: absolute; left: 0; right: 0; top: 100%;
  max-height: 17.5rem; overflow-y: auto; background: #FFFFFF;
  border: 1px solid #E5E5EA; border-radius: 0.75rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06);
  z-index: 50; margin-top: 0.25rem; padding: 0.375rem; scrollbar-width: thin;
  display: flex; flex-direction: column; gap: 0.125rem;
}
.combo-option {
  display: flex; flex-direction: column; width: 100%; padding: 0.5rem 0.625rem;
  background: transparent; cursor: pointer; text-align: left;
  transition: all 0.12s; font-family: 'Inter', sans-serif; border-radius: 0.625rem;
  border: 1px solid transparent; gap: 0.125rem;
}
.combo-option:hover {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.combo-option:hover .combo-option-name { color: #FFFFFF; }
.combo-option:hover .combo-option-id { color: rgba(255,255,255,0.6); }
.combo-option.selected {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  border-color: transparent;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
}
.combo-option-name { font-size: 0.875rem; color: #1A1A1A; font-weight: 500; }
.combo-option.selected .combo-option-name { color: #FFFFFF; }
.combo-option-id { font-size: 0.6875rem; color: #9CA3AF; font-family: 'JetBrains Mono', monospace; }
.combo-option.selected .combo-option-id { color: rgba(255,255,255,0.6); }
</style>
