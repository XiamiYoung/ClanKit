<template>
  <Teleport to="body">
    <div class="emojipicker-backdrop">
      <div class="emojipicker-dialog" role="dialog" aria-modal="true" aria-label="Choose an emoji">

        <!-- Header -->
        <div class="emojipicker-header">
          <h2 class="emojipicker-title">Choose an Emoji</h2>
          <button class="emojipicker-close" @click="$emit('close')" aria-label="Close">
            <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Search -->
        <div class="emojipicker-search-wrap">
          <svg class="emojipicker-search-icon" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input
            v-model="query"
            class="emojipicker-search"
            type="text"
            placeholder="Search emoji…"
            autocomplete="off"
            @keydown.escape="$emit('close')"
          />
          <button v-if="query" class="emojipicker-search-clear" @click="query = ''">
            <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>

        <!-- Category tabs (hidden during search) -->
        <div v-if="!query" class="emojipicker-tabs">
          <button
            v-for="tab in TABS"
            :key="tab.id"
            class="emojipicker-tab"
            :class="{ active: activeTab === tab.id }"
            :title="tab.label"
            @click="switchTab(tab.id)"
          >{{ tab.icon }}</button>
        </div>

        <!-- Grid -->
        <div class="emojipicker-grid-wrap">
          <div v-if="currentPageEmojis.length" class="emojipicker-grid">
            <button
              v-for="emoji in currentPageEmojis"
              :key="emoji"
              class="emojipicker-item"
              :class="{ selected: selectedEmoji === emoji }"
              :title="emoji"
              @click="select(emoji)"
              @dblclick="confirm"
            >{{ emoji }}</button>
          </div>
          <div v-else class="emojipicker-empty">No results for "{{ query }}"</div>
        </div>

        <!-- Footer: pagination + preview + actions -->
        <div class="emojipicker-footer">
          <!-- Pagination -->
          <div class="emojipicker-pagination">
            <button
              class="emojipicker-page-btn"
              :disabled="currentPage === 0"
              @click="goPage(currentPage - 1)"
              aria-label="Previous page"
            >
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
            </button>
            <span class="emojipicker-page-info">{{ currentPage + 1 }} / {{ totalPages }}</span>
            <button
              class="emojipicker-page-btn"
              :disabled="currentPage >= totalPages - 1"
              @click="goPage(currentPage + 1)"
              aria-label="Next page"
            >
              <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="9 18 15 12 9 6"/></svg>
            </button>
          </div>

          <!-- Preview -->
          <div class="emojipicker-preview">
            <span v-if="selectedEmoji" class="emojipicker-preview-em">{{ selectedEmoji }}</span>
            <span v-else class="emojipicker-preview-hint">Select an emoji</span>
          </div>

          <!-- Actions -->
          <button class="emojipicker-btn secondary" @click="$emit('close')">Cancel</button>
          <button class="emojipicker-btn primary" :disabled="!selectedEmoji" @click="confirm">Select</button>
        </div>

      </div>
    </div>
  </Teleport>
</template>

<script setup>
import { ref, computed, watch } from 'vue'

const props = defineProps({
  current: { type: String, default: '' },
})
const emit = defineEmits(['select', 'close'])

const query         = ref('')
const activeTab     = ref('common')
const currentPage   = ref(0)
const selectedEmoji = ref(props.current || '')

const PAGE_SIZE = 64 // 8 cols × 8 rows

// ── Emoji data ─────────────────────────────────────────────────────────────
const TABS = [
  { id: 'common',  icon: '⭐', label: 'Common' },
  { id: 'people',  icon: '😀', label: 'People' },
  { id: 'nature',  icon: '🌿', label: 'Nature' },
  { id: 'objects', icon: '💡', label: 'Objects' },
  { id: 'places',  icon: '🌍', label: 'Places' },
  { id: 'symbols', icon: '🔣', label: 'Symbols' },
  { id: 'flags',   icon: '🚩', label: 'Flags' },
]

const EMOJI_BY_TAB = {
  common: [
    '📁','📂','🗂️','📋','📌','📍','🏷️','🔖','📎','🗃️','🗄️','🗑️',
    '🚀','⚡','🔥','💡','🌟','✨','🎯','🎨','🎭','🎪','🎬','🎤',
    '🔧','⚙️','🛠️','🔩','🔑','🗝️','🔐','🔒','🔓','🛡️','⚔️','🪖',
    '💼','🧳','📦','📬','📮','🗳️','📊','📈','📉','📝','📃','📄',
    '👤','👥','🤝','🏆','🥇','🎖️','🏅','🎗️','🌈','💎','💍','👑',
    '🧪','🔬','🧬','🌐','🗺️','💻','🖥️','📱','⌨️','🖱️','🖨️','💾',
    '☁️','🌊','🌙','☀️','⭐','🌸','🍀','🌱','🌲','🍃','🍂','🍁',
    '🐾','🦋','🐝','🦊','🐉','🦄','🤖','👾','🎲','🧩','🎰','🃏',
    '🏠','🏢','🏥','🏦','🏪','🏫','🏭','🏰','🗼','🗽','⛪','🛕',
    '🚗','✈️','🚂','🚢','🚁','🛸','🏎️','🚀','🛶','⛵','🚲','🛴',
    '🍕','🍔','🍣','🍜','🍩','🍰','☕','🍵','🍺','🥂','🍷','🎂',
    '💰','💳','💵','🏧','📊','🔑','🎁','🛒','📦','🏷️','🧾','💹',
  ],
  people: [
    '😀','😃','😄','😁','😆','😅','😂','🤣','😊','😇','🙂','🙃',
    '😉','😌','😍','🥰','😘','😗','😙','😚','😋','😛','😝','😜',
    '🤪','🤨','🧐','🤓','😎','🥸','🤩','🥳','😏','😒','😞','😔',
    '😟','😕','🙁','☹️','😣','😖','😫','😩','🥺','😢','😭','😤',
    '😠','😡','🤬','🤯','😳','🥵','🥶','😱','😨','😰','😥','😓',
    '🤗','🤔','🤭','🤫','🤥','😶','😐','😑','😬','🙄','😯','😦',
    '😧','😮','😲','🥱','😴','🤤','😪','😵','🤐','🥴','🤢','🤮',
    '🤧','😷','🤒','🤕','🤑','🤠','😈','👿','👹','👺','💀','☠️',
    '👋','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘',
    '🤙','👈','👉','👆','🖕','👇','☝️','👍','👎','✊','👊','🤛',
    '🤜','👏','🙌','🤲','🤝','🙏','💪','🦵','🦶','👂','🦻','👃',
    '🫀','🫁','🧠','🦷','🦴','👀','👁️','👅','👄','💋','🩸','💉',
  ],
  nature: [
    '🌸','🌺','🌻','🌹','🌷','💐','🌼','🪷','🌿','🍀','🍁','🍂',
    '🍃','☘️','🌱','🌾','🪴','🌵','🎋','🎍','🍄','🪸','🌊','🌋',
    '🏔️','⛰️','🗻','🏕️','🌅','🌄','🌠','🌌','🌃','🌆','🌇','🌉',
    '🌁','🌫️','🌀','🌈','⛅','🌤️','🌥️','🌦️','🌧️','🌨️','🌩️','⛈️',
    '❄️','💧','💦','☀️','🌙','⭐','🌟','💫','✨','☄️','🪐','🌍',
    '🌏','🌎','🐶','🐱','🐭','🐹','🐰','🦊','🐻','🐼','🐨','🐯',
    '🦁','🐮','🐷','🐸','🐙','🐵','🐔','🐧','🐦','🐤','🦆','🦅',
    '🦉','🦚','🦜','🦢','🕊️','🐺','🦄','🐗','🐴','🦋','🐝','🪲',
    '🐛','🦗','🪳','🕷️','🦂','🐢','🦎','🐍','🦕','🐊','🦈','🐳',
    '🐬','🦭','🐟','🐠','🐡','🦀','🦞','🦐','🦑','🐙','🌴','🌳',
    '🌲','🎄','🌾','🌺','🌸','🌼','🌻','🌹','🌷','💐','🪨','🪵',
    '🍎','🍊','🍋','🍇','🍓','🍒','🥝','🥥','🍍','🥭','🍑','🍌',
  ],
  objects: [
    '💻','🖥️','🖨️','⌨️','🖱️','💾','💿','📀','📱','☎️','📞','📟',
    '📠','📷','📸','📹','🎥','📽️','🎞️','📺','📻','🎙️','🎚️','🎛️',
    '🧭','⏱️','⏰','⏲️','🕰️','⌚','🔋','🔌','💡','🔦','🕯️','🪔',
    '🧯','💰','💴','💵','💶','💷','💳','💎','🔧','🔨','⚒️','🛠️',
    '⛏️','🔩','🪛','🔑','🗝️','🔒','🔓','🔏','🔐','🛡️','⚔️','🪖',
    '🔬','🔭','💉','🩺','🧬','🧪','🧫','🧲','🪄','🔮','🎮','🕹️',
    '🎲','🧩','🎯','🎳','🏹','🎣','🤿','🎽','🎿','🛷','🥊','🥋',
    '📦','📫','📬','📭','📮','📯','📢','📣','📡','🔔','🛎️','📚',
    '📖','📰','📓','📔','📒','📃','📄','📑','📊','📈','📉','📋',
    '📌','📍','📎','🖇️','📏','📐','✂️','🗃️','🗄️','🗑️','🔏','🖊️',
    '🖋️','✒️','🖌️','🖍️','📝','✏️','🔍','🔎','🔏','🔐','🔒','🔓',
    '🛒','🎁','🎀','🎊','🎉','🎈','🎏','🎐','🧧','🎑','🎋','🎍',
  ],
  places: [
    '🏠','🏡','🏢','🏣','🏤','🏥','🏦','🏧','🏨','🏩','🏪','🏫',
    '🏬','🏭','🏯','🏰','🗼','🗽','⛪','🕌','🛕','🕍','⛩️','🗾',
    '🎌','🏔️','⛰️','🌋','🗻','🏕️','🏖️','🏜️','🏝️','🏞️','🏟️','🏛️',
    '🎡','🎢','🎠','⛲','🌐','🗺️','🧭','🌍','🌎','🌏','🚀','✈️',
    '🚁','🛸','🚂','🚃','🚄','🚅','🚆','🚇','🚈','🚉','🚊','🚝',
    '🚞','🚋','🚌','🚍','🚎','🚐','🚑','🚒','🚓','🚔','🚕','🚖',
    '🚗','🚘','🚙','🛻','🚚','🚛','🚜','🏎️','🛵','🏍️','🚲','🛴',
    '🛹','🛼','🚏','🛣️','🛤️','⛽','🚦','🚥','🗺️','🗿','⛺','🌁',
    '🌃','🏙️','🌄','🌅','🌉','🌌','🌠','🎇','🎆','🌇','🌆','🏙️',
    '⛵','🚢','🛳️','🚤','🛥️','🛶','⛴️','🚣','🏄','🤽','🧗','🏊',
    '🎭','🎨','🎬','🎤','🎧','🎼','🎹','🥁','🎷','🎺','🎸','🎻',
    '🎰','🎲','🧩','🎯','🎳','🏆','🥇','🥈','🥉','🏅','🎖️','🎗️',
  ],
  symbols: [
    '❤️','🧡','💛','💚','💙','💜','🖤','🤍','🤎','💔','❣️','💕',
    '💞','💓','💗','💖','💘','💝','💟','☮️','✝️','☪️','🕉️','☸️',
    '✡️','🔯','🕎','☯️','☦️','🛐','♈','♉','♊','♋','♌','♍',
    '♎','♏','♐','♑','♒','♓','⛎','🔀','🔁','🔂','▶️','⏩',
    '⏭️','⏯️','◀️','⏪','⏮️','🔼','⏫','🔽','⏬','⏸️','⏹️','⏺️',
    '⏏️','🎦','🔅','🔆','📶','📳','📴','📵','📡','🔇','🔈','🔉',
    '🔊','📢','📣','🔔','🔕','🎵','🎶','✔️','❌','❎','➕','➖',
    '➗','✖️','🔱','📛','🔰','⭕','🛑','⛔','📵','🚫','🚳','🚭',
    '🚯','🚱','🚷','🔞','☢️','☣️','⬆️','↗️','➡️','↘️','⬇️','↙️',
    '⬅️','↖️','↕️','↔️','↩️','↪️','⤴️','⤵️','🔄','🔃','🔙','🔚',
    '🔛','🔜','🔝','🔰','⚜️','♻️','✅','☑️','🔲','🔳','▪️','▫️',
    '◾','◽','◼️','◻️','⬛','⬜','🔶','🔷','🔸','🔹','🔺','🔻',
  ],
  flags: [
    '🚩','🏴','🏳️','🏁','🎌','🏴‍☠️','🏳️‍🌈','🏳️‍⚧️',
    '🇦🇨','🇦🇩','🇦🇪','🇦🇫','🇦🇬','🇦🇮','🇦🇱','🇦🇲','🇦🇴','🇦🇶','🇦🇷','🇦🇸',
    '🇦🇹','🇦🇺','🇦🇼','🇦🇽','🇦🇿','🇧🇦','🇧🇧','🇧🇩','🇧🇪','🇧🇫','🇧🇬','🇧🇭',
    '🇧🇮','🇧🇯','🇧🇱','🇧🇲','🇧🇳','🇧🇴','🇧🇶','🇧🇷','🇧🇸','🇧🇹','🇧🇻','🇧🇼',
    '🇧🇾','🇧🇿','🇨🇦','🇨🇨','🇨🇩','🇨🇫','🇨🇬','🇨🇭','🇨🇮','🇨🇰','🇨🇱','🇨🇲',
    '🇨🇳','🇨🇴','🇨🇵','🇨🇷','🇨🇺','🇨🇻','🇨🇼','🇨🇽','🇨🇾','🇨🇿','🇩🇪','🇩🇬',
    '🇩🇯','🇩🇰','🇩🇲','🇩🇴','🇩🇿','🇪🇦','🇪🇨','🇪🇪','🇪🇬','🇪🇭','🇪🇷','🇪🇸',
    '🇪🇹','🇪🇺','🇫🇮','🇫🇯','🇫🇰','🇫🇲','🇫🇴','🇫🇷','🇬🇦','🇬🇧','🇬🇩','🇬🇪',
    '🇬🇫','🇬🇬','🇬🇭','🇬🇮','🇬🇱','🇬🇲','🇬🇳','🇬🇵','🇬🇶','🇬🇷','🇬🇸','🇬🇹',
    '🇬🇺','🇬🇼','🇬🇾','🇭🇰','🇭🇲','🇭🇳','🇭🇷','🇭🇹','🇭🇺','🇮🇨','🇮🇩','🇮🇪',
    '🇮🇱','🇮🇲','🇮🇳','🇮🇴','🇮🇶','🇮🇷','🇮🇸','🇮🇹','🇯🇪','🇯🇲','🇯🇴','🇯🇵',
    '🇰🇪','🇰🇬','🇰🇭','🇰🇮','🇰🇲','🇰🇳','🇰🇵','🇰🇷','🇰🇼','🇰🇾','🇰🇿','🇱🇦',
  ],
}

const ALL_EMOJIS = Object.values(EMOJI_BY_TAB).flat()

// ── Computed ───────────────────────────────────────────────────────────────
const filteredEmojis = computed(() => {
  const q = query.value.trim()
  if (q) return ALL_EMOJIS.filter(e => e.includes(q))
  return EMOJI_BY_TAB[activeTab.value] || []
})

const totalPages = computed(() => Math.max(1, Math.ceil(filteredEmojis.value.length / PAGE_SIZE)))

const currentPageEmojis = computed(() => {
  const start = currentPage.value * PAGE_SIZE
  return filteredEmojis.value.slice(start, start + PAGE_SIZE)
})

// Reset page when tab or query changes
watch([activeTab, query], () => { currentPage.value = 0 })

// ── Actions ────────────────────────────────────────────────────────────────
function switchTab(id) {
  activeTab.value = id
  currentPage.value = 0
}

function goPage(n) {
  currentPage.value = Math.max(0, Math.min(n, totalPages.value - 1))
}

function select(emoji) {
  selectedEmoji.value = emoji
}

function confirm() {
  if (selectedEmoji.value) emit('select', selectedEmoji.value)
}
</script>

<style>
/* Unscoped — teleported outside component DOM */
.emojipicker-backdrop {
  position: fixed;
  inset: 0;
  z-index: 10000;
  background: rgba(0, 0, 0, 0.6);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  animation: epBackdropIn 0.15s ease-out;
}
@keyframes epBackdropIn {
  from { opacity: 0; }
  to   { opacity: 1; }
}

.emojipicker-dialog {
  width: min(34rem, 94vw);
  max-height: none;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 1.25rem;
  box-shadow: 0 25px 60px rgba(0,0,0,0.5);
  display: flex;
  flex-direction: column;
  overflow: hidden;
  animation: epDialogIn 0.2s ease-out;
}
@keyframes epDialogIn {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}

/* Header */
.emojipicker-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1rem 1.25rem;
  border-bottom: 1px solid #1F1F1F;
  flex-shrink: 0;
}
.emojipicker-title {
  font-family: 'Inter', sans-serif;
  font-size: 1.0625rem;
  font-weight: 700;
  color: #FFFFFF;
  margin: 0;
}
.emojipicker-close {
  width: 1.875rem;
  height: 1.875rem;
  border-radius: 0.5rem;
  display: flex;
  align-items: center;
  justify-content: center;
  border: none;
  background: transparent;
  color: #6B7280;
  cursor: pointer;
  transition: background 0.15s, color 0.15s;
  flex-shrink: 0;
}
.emojipicker-close:hover { background: #1F1F1F; color: #FFFFFF; }

/* Search */
.emojipicker-search-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.75rem 1.25rem 0;
  flex-shrink: 0;
}
.emojipicker-search-icon { color: #4B5563; flex-shrink: 0; }
.emojipicker-search {
  flex: 1;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 0.625rem;
  padding: 0.5rem 0.75rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  color: #FFFFFF;
  outline: none;
  transition: border-color 0.15s;
  width: 100%;
  box-sizing: border-box;
}
.emojipicker-search::placeholder { color: #4B5563; }
.emojipicker-search:focus { border-color: #4B5563; }
.emojipicker-search-clear {
  background: #2A2A2A;
  border: none;
  color: #6B7280;
  width: 1.375rem;
  height: 1.375rem;
  border-radius: 0.375rem;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: background 0.12s, color 0.12s;
  flex-shrink: 0;
}
.emojipicker-search-clear:hover { background: #374151; color: #FFFFFF; }

/* Tabs */
.emojipicker-tabs {
  display: flex;
  gap: 0.125rem;
  padding: 0.625rem 1.25rem 0;
  flex-shrink: 0;
  border-bottom: 1px solid #1F1F1F;
  overflow-x: auto;
  scrollbar-width: none;
}
.emojipicker-tabs::-webkit-scrollbar { display: none; }
.emojipicker-tab {
  font-size: 1.125rem;
  line-height: 1;
  padding: 0.4375rem 0.5625rem;
  border: none;
  border-radius: 0.5rem 0.5rem 0 0;
  background: transparent;
  cursor: pointer;
  transition: background 0.12s;
  flex-shrink: 0;
  border-bottom: 2px solid transparent;
  margin-bottom: -1px;
}
.emojipicker-tab:hover { background: #1A1A1A; }
.emojipicker-tab.active {
  background: #1A1A1A;
  border-bottom-color: #FFFFFF;
}

/* Grid — scrollable, capped height so dialog stays on screen */
.emojipicker-grid-wrap {
  padding: 0.75rem 1.25rem;
  flex-shrink: 0;
  height: 22rem;
  overflow-y: auto;
  scrollbar-width: thin;
  scrollbar-color: #333 transparent;
}
.emojipicker-grid {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 0.125rem;
  width: 100%;
}
.emojipicker-item {
  font-size: 1.375rem;
  line-height: 1;
  padding: 0.4375rem;
  border: 2px solid transparent;
  border-radius: 0.5rem;
  background: transparent;
  cursor: pointer;
  transition: background 0.1s, border-color 0.1s, transform 0.1s;
  display: flex;
  align-items: center;
  justify-content: center;
  aspect-ratio: 1;
}
.emojipicker-item:hover {
  background: #1A1A1A;
  transform: scale(1.15);
}
.emojipicker-item.selected {
  background: #1F2937;
  border-color: #FFFFFF;
  box-shadow: 0 0 0 2px rgba(255,255,255,0.12);
}

.emojipicker-empty {
  padding: 3rem 2rem;
  text-align: center;
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  color: #4B5563;
  width: 100%;
}

/* Footer */
.emojipicker-footer {
  display: flex;
  align-items: center;
  gap: 0.625rem;
  padding: 0.75rem 1.25rem;
  border-top: 1px solid #1F1F1F;
  background: #0A0A0A;
  flex-shrink: 0;
}

/* Pagination */
.emojipicker-pagination {
  display: flex;
  align-items: center;
  gap: 0.375rem;
  flex-shrink: 0;
}
.emojipicker-page-btn {
  width: 1.75rem;
  height: 1.75rem;
  border-radius: 0.4375rem;
  border: 1px solid #2A2A2A;
  background: #1A1A1A;
  color: #9CA3AF;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  transition: all 0.12s;
}
.emojipicker-page-btn:hover:not(:disabled) { background: #2A2A2A; color: #FFFFFF; border-color: #374151; }
.emojipicker-page-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.emojipicker-page-info {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  color: #6B7280;
  min-width: 3rem;
  text-align: center;
}

/* Preview */
.emojipicker-preview {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 0.5rem;
  min-width: 0;
}
.emojipicker-preview-em {
  font-size: 1.875rem;
  line-height: 1;
}
.emojipicker-preview-hint {
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  color: #4B5563;
}

/* Action buttons */
.emojipicker-btn {
  padding: 0.5rem 1.125rem;
  border-radius: 0.5rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.875rem;
  font-weight: 600;
  cursor: pointer;
  border: none;
  transition: all 0.15s;
  flex-shrink: 0;
}
.emojipicker-btn.primary {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(0,0,0,0.2);
}
.emojipicker-btn.primary:hover:not(:disabled) {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.emojipicker-btn.primary:disabled { opacity: 0.35; cursor: not-allowed; }
.emojipicker-btn.secondary {
  background: #1A1A1A;
  color: #9CA3AF;
  border: 1px solid #2A2A2A;
}
.emojipicker-btn.secondary:hover { background: #222222; color: #FFFFFF; border-color: #374151; }

@media (prefers-reduced-motion: reduce) {
  .emojipicker-item { transition: none; }
  .emojipicker-item:hover { transform: none; }
  .emojipicker-dialog { animation: none; }
}
</style>
