<template>
  <div class="xlsx-editor">

    <!-- ══════════════ MENUBAR ══════════════ -->
    <div class="xlsx-menubar">
      <div class="menu-tabs">
        <button
          v-for="tab in menuTabs"
          :key="tab.id"
          class="menu-tab"
          :class="{ active: activeTab === tab.id }"
          @click="activeTab = activeTab === tab.id ? '' : tab.id"
        >{{ tab.label }}</button>
      </div>
      <div class="menu-right">
        <span v-if="saving" class="save-indicator">
          <svg class="animate-spin" style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
          Saving
        </span>
      </div>
    </div>

    <!-- ── Ribbon ── -->
    <div v-if="activeTab" class="xlsx-ribbon">

      <!-- FILE -->
      <template v-if="activeTab === 'file'">
        <div class="ribbon-group">
          <span class="ribbon-label">File</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="saveSpreadsheet" :disabled="saving">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <span>Save</span>
            </button>
          </div>
        </div>
      </template>

      <!-- FORMAT -->
      <template v-if="activeTab === 'format'">
        <div class="ribbon-group">
          <span class="ribbon-label">Text</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" :class="{ toggled: currentCellStyle.bold }" @click="toggleCellBold" title="Bold">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M6 4h8a4 4 0 0 1 0 8H6z"/><path d="M6 12h9a4 4 0 0 1 0 8H6z"/></svg>
            </button>
            <button class="ribbon-btn" :class="{ toggled: currentCellStyle.italic }" @click="toggleCellItalic" title="Italic">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Alignment</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" :class="{ toggled: currentCellStyle.halign === 'left' }" @click="setCellAlign('left')" title="Left">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="17" y1="10" x2="3" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="17" y1="14" x2="3" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
            </button>
            <button class="ribbon-btn" :class="{ toggled: currentCellStyle.halign === 'center' }" @click="setCellAlign('center')" title="Center">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="10" x2="6" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="18" y1="14" x2="6" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
            </button>
            <button class="ribbon-btn" :class="{ toggled: currentCellStyle.halign === 'right' }" @click="setCellAlign('right')" title="Right">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="21" y1="10" x2="7" y2="10"/><line x1="21" y1="6" x2="3" y2="6"/><line x1="21" y1="14" x2="7" y2="14"/><line x1="21" y1="18" x2="3" y2="18"/></svg>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Fill</span>
          <div class="ribbon-row">
            <label class="ribbon-btn color-picker-btn" title="Fill Color">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z"/></svg>
              <input type="color" class="color-input" @input="e => setCellFill(e.target.value)" />
            </label>
            <button class="ribbon-btn" @click="setCellFill('')" title="Clear Fill">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="4.93" y1="4.93" x2="19.07" y2="19.07"/></svg>
            </button>
          </div>
        </div>
      </template>

      <!-- INSERT -->
      <template v-if="activeTab === 'insert'">
        <div class="ribbon-group">
          <span class="ribbon-label">Rows</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="insertRow('above')">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Above</span>
            </button>
            <button class="ribbon-btn" @click="insertRow('below')">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Below</span>
            </button>
            <button class="ribbon-btn" @click="deleteRow" :disabled="rows.length <= 1">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Columns</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="insertCol('left')">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Left</span>
            </button>
            <button class="ribbon-btn" @click="insertCol('right')">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Right</span>
            </button>
            <button class="ribbon-btn" @click="deleteCol" :disabled="cols.length <= 1">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </template>

      <!-- SHEET -->
      <template v-if="activeTab === 'sheet'">
        <div class="ribbon-group">
          <span class="ribbon-label">Sheets</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="addSheet">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
              <span>Add Sheet</span>
            </button>
            <button class="ribbon-btn" @click="renameSheet" :disabled="sheets.length === 0">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              <span>Rename</span>
            </button>
            <button class="ribbon-btn" @click="deleteSheet" :disabled="sheets.length <= 1">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/></svg>
              <span>Delete</span>
            </button>
          </div>
        </div>
      </template>
    </div>

    <!-- ══════════════ FORMULA BAR ══════════════ -->
    <div class="xlsx-formula-bar">
      <span class="cell-address">{{ cellAddress }}</span>
      <div class="formula-sep"></div>
      <input
        ref="formulaInput"
        class="formula-input"
        :value="editingCell ? editValue : currentCellValue"
        @focus="startEditFromFormula"
        @input="e => { if (editingCell) editValue = e.target.value }"
        @keydown.enter="commitEdit"
        @keydown.escape="cancelEdit"
        @keydown.tab.prevent="commitAndMove('right')"
        placeholder="Enter value..."
      />
    </div>

    <!-- ══════════════ GRID ══════════════ -->
    <div class="xlsx-grid-wrapper" ref="gridWrapper" @keydown="onGridKeydown" tabindex="0">
      <DocsLoadingOverlay v-if="loading" :loading="true" variant="inline" label="Loading spreadsheet..." />
      <table v-else class="xlsx-table" @mousedown="onMouseDown" @contextmenu.prevent="onTableContextMenu">
        <!-- Column headers -->
        <thead>
          <tr>
            <th class="row-header corner-cell" @mousedown.stop="selectAll"></th>
            <th
              v-for="(col, ci) in cols"
              :key="ci"
              class="col-header"
              :class="{ selected: isColSelected(ci) }"
              :style="{ width: colWidths[ci] + 'px', minWidth: colWidths[ci] + 'px' }"
              @mousedown.stop="selectColumn(ci)"
            >
              {{ col }}
              <div class="col-resize-handle" @mousedown.stop.prevent="startColResize($event, ci)"></div>
            </th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="(row, ri) in rows" :key="ri">
            <th
              class="row-header"
              :class="{ selected: isRowSelected(ri) }"
              @mousedown.stop="selectRow(ri)"
            >{{ ri + 1 }}</th>
            <td
              v-for="(col, ci) in cols"
              :key="ci"
              class="cell"
              :class="{
                active: sel.row === ri && sel.col === ci,
                'in-range': isInRange(ri, ci),
                editing: editingCell && editRow === ri && editCol === ci,
              }"
              :style="getCellStyle(ri, ci)"
              @mousedown="onCellMouseDown(ri, ci, $event)"
              @dblclick="startEdit(ri, ci)"
            >
              <template v-if="editingCell && editRow === ri && editCol === ci">
                <input
                  ref="cellInput"
                  class="cell-edit-input"
                  v-model="editValue"
                  @keydown.enter="commitEdit"
                  @keydown.escape="cancelEdit"
                  @keydown.tab.prevent="commitAndMove('right')"
                  @blur="commitEdit"
                />
              </template>
              <template v-else>
                <span class="cell-text">{{ getCellDisplay(ri, ci) }}</span>
              </template>
            </td>
          </tr>
        </tbody>
      </table>
    </div>

    <!-- ══════════════ CONTEXT MENU ══════════════ -->
    <Teleport to="body">
      <div
        v-if="ctxMenu.visible"
        class="xlsx-ctx-menu"
        :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
        @mousedown.stop
      >
        <button class="xlsx-ctx-item" @click="ctxCopy">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
          <span class="xlsx-ctx-shortcut">Ctrl+C</span>
        </button>
        <button class="xlsx-ctx-item" @click="ctxCut">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
          Cut
          <span class="xlsx-ctx-shortcut">Ctrl+X</span>
        </button>
        <button class="xlsx-ctx-item" @click="ctxPaste">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1" ry="1"/></svg>
          Paste
          <span class="xlsx-ctx-shortcut">Ctrl+V</span>
        </button>
        <div class="xlsx-ctx-sep"></div>
        <button class="xlsx-ctx-item" @click="ctxClearCells">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M10 11v6"/><path d="M14 11v6"/></svg>
          Clear cells
          <span class="xlsx-ctx-shortcut">Del</span>
        </button>
        <div class="xlsx-ctx-sep"></div>
        <button class="xlsx-ctx-item" @click="ctxInsertRowAbove">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Insert row above
        </button>
        <button class="xlsx-ctx-item" @click="ctxInsertRowBelow">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Insert row below
        </button>
        <button class="xlsx-ctx-item xlsx-ctx-item-danger" @click="ctxDeleteRow">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Delete row
        </button>
        <div class="xlsx-ctx-sep"></div>
        <button class="xlsx-ctx-item" @click="ctxInsertColLeft">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Insert column left
        </button>
        <button class="xlsx-ctx-item" @click="ctxInsertColRight">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
          Insert column right
        </button>
        <button class="xlsx-ctx-item xlsx-ctx-item-danger" @click="ctxDeleteCol">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Delete column
        </button>
        <div class="xlsx-ctx-sep"></div>
        <button class="xlsx-ctx-item xlsx-ctx-item-ai" @click="ctxAskAi">
          <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="currentColor" stroke="none"><path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/></svg>
          Ask AI Assistant
          <span class="xlsx-ctx-shortcut">Ctrl+K</span>
        </button>
      </div>
    </Teleport>

    <!-- ══════════════ SHEET TABS ══════════════ -->
    <div class="xlsx-sheet-bar">
      <button
        v-for="(sh, si) in sheets"
        :key="si"
        class="sheet-tab"
        :class="{ active: activeSheetIdx === si }"
        @click="switchSheet(si)"
        @dblclick="renameSheetByIdx(si)"
      >{{ sh.name }}</button>
      <button class="sheet-add-btn" @click="addSheet" title="Add sheet">
        <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 5v14M5 12h14"/></svg>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, reactive, onMounted, onBeforeUnmount, watch, nextTick } from 'vue'
import DocsLoadingOverlay from './DocsLoadingOverlay.vue'

const props = defineProps({
  base64: { type: String, required: true },
  filePath: { type: String, default: '' },
})
const emit = defineEmits(['save', 'ai-edit', 'sheet-changed'])

const menuTabs = [
  { id: 'file', label: 'File' },
  { id: 'format', label: 'Format' },
  { id: 'insert', label: 'Insert' },
  { id: 'sheet', label: 'Sheet' },
]
const activeTab = ref('')
const saving = ref(false)
const loading = ref(true)

// Sheet data model
const sheets = ref([]) // [{ name, data: [{row, col, value, style}...] }]
const activeSheetIdx = ref(0)

// Grid dimensions
const rows = ref([])     // array of row indexes (0..N)
const cols = ref([])     // array of column letters
const colWidths = ref([]) // per-col width in px
const DEFAULT_COL_WIDTH = 100
const DEFAULT_ROWS = 50
const DEFAULT_COLS = 26

// Cell data for active sheet: { 'r,c': { value, style: { bold, italic, halign, fill } } }
const cellData = reactive({})

// Selection
const sel = reactive({ row: 0, col: 0 })
const rangeEnd = reactive({ row: -1, col: -1 })

// Drag selection state
const isDragging = ref(false)

// Clipboard (internal — tab-separated text)
let clipboard = null  // { text: string, cells: [{r,c,value,style}] }

// Context menu
const ctxMenu = reactive({ visible: false, x: 0, y: 0 })

// Editing
const editingCell = ref(false)
const editRow = ref(-1)
const editCol = ref(-1)
const editValue = ref('')
const cellInput = ref(null)
const formulaInput = ref(null)
const gridWrapper = ref(null)

// Internal workbook ref for save
let workbook = null

const cellAddress = computed(() => {
  const letter = cols.value[sel.col] || 'A'
  return `${letter}${sel.row + 1}`
})

const currentCellValue = computed(() => {
  const key = `${sel.row},${sel.col}`
  return cellData[key]?.value ?? ''
})

const currentCellStyle = computed(() => {
  const key = `${sel.row},${sel.col}`
  return cellData[key]?.style || {}
})

function colLetter(idx) {
  let result = ''
  let n = idx
  while (n >= 0) {
    result = String.fromCharCode(65 + (n % 26)) + result
    n = Math.floor(n / 26) - 1
  }
  return result
}

function initGrid(numRows, numCols) {
  rows.value = Array.from({ length: numRows }, (_, i) => i)
  cols.value = Array.from({ length: numCols }, (_, i) => colLetter(i))
  colWidths.value = Array.from({ length: numCols }, () => DEFAULT_COL_WIDTH)
}

// Load workbook from base64
async function loadXlsx(b64) {
  loading.value = true
  try {
    const ExcelJS = await import('exceljs')
    workbook = new ExcelJS.Workbook()
    const binary = Uint8Array.from(atob(b64), c => c.charCodeAt(0))
    await workbook.xlsx.load(binary.buffer)

    // Build sheets array
    const sheetList = []
    workbook.eachSheet((ws) => {
      const data = []
      ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
        row.eachCell({ includeEmpty: false }, (cell, colNum) => {
          const style = {}
          if (cell.font?.bold) style.bold = true
          if (cell.font?.italic) style.italic = true
          if (cell.alignment?.horizontal) style.halign = cell.alignment.horizontal
          if (cell.fill?.fgColor?.argb) style.fill = '#' + cell.fill.fgColor.argb.slice(2)
          data.push({
            row: rowNum - 1,
            col: colNum - 1,
            value: cell.text ?? (cell.value != null ? String(cell.value) : ''),
            style,
          })
        })
      })
      sheetList.push({ name: ws.name, data })
    })

    if (sheetList.length === 0) {
      sheetList.push({ name: 'Sheet1', data: [] })
    }
    sheets.value = sheetList
    activeSheetIdx.value = 0
    loadSheetData(0)
  } catch (err) {
    console.error('XlsxEditor: failed to parse xlsx', err)
    sheets.value = [{ name: 'Sheet1', data: [] }]
    initGrid(DEFAULT_ROWS, DEFAULT_COLS)
  } finally {
    loading.value = false
  }
}

function loadSheetData(idx) {
  // Clear cellData
  Object.keys(cellData).forEach(k => delete cellData[k])

  const sheet = sheets.value[idx]
  if (!sheet) return

  // Determine grid size from data
  let maxRow = DEFAULT_ROWS - 1
  let maxCol = DEFAULT_COLS - 1
  for (const d of sheet.data) {
    if (d.row > maxRow) maxRow = d.row
    if (d.col > maxCol) maxCol = d.col
  }
  // Ensure some buffer
  maxRow = Math.max(maxRow + 10, DEFAULT_ROWS - 1)
  maxCol = Math.max(maxCol + 5, DEFAULT_COLS - 1)

  initGrid(maxRow + 1, maxCol + 1)

  // Populate cellData
  for (const d of sheet.data) {
    cellData[`${d.row},${d.col}`] = { value: d.value, style: { ...d.style } }
  }

  sel.row = 0
  sel.col = 0
  rangeEnd.row = -1
  rangeEnd.col = -1
}

function saveSheetData() {
  const sheet = sheets.value[activeSheetIdx.value]
  if (!sheet) return
  const data = []
  for (const [key, cell] of Object.entries(cellData)) {
    if (cell.value === '' && (!cell.style || Object.keys(cell.style).length === 0)) continue
    const [r, c] = key.split(',').map(Number)
    data.push({ row: r, col: c, value: cell.value, style: { ...cell.style } })
  }
  sheet.data = data
}

function getAllSheetsText() {
  saveSheetData()
  return sheets.value.map((sheet, idx) => {
    const text = getSheetTextContent(idx)
    return `--- Sheet: ${sheet.name} ---\n${text || '(empty)'}`
  }).join('\n\n')
}

function getSheetTextContent(idx) {
  const sheetIdx = idx ?? activeSheetIdx.value
  const sheet = sheets.value[sheetIdx]
  if (!sheet) return ''
  // For current sheet use live cellData; for others use stored data
  const data = sheetIdx === activeSheetIdx.value
    ? Object.entries(cellData).map(([key, cell]) => {
        const [r, c] = key.split(',').map(Number)
        return { row: r, col: c, value: cell.value }
      })
    : (sheet.data || [])
  if (data.length === 0) return ''
  // Build a 2D grid
  let maxRow = 0, maxCol = 0
  for (const d of data) {
    if (d.row > maxRow) maxRow = d.row
    if (d.col > maxCol) maxCol = d.col
  }
  const grid = Array.from({ length: maxRow + 1 }, () => Array(maxCol + 1).fill(''))
  for (const d of data) {
    if (d.value !== '' && d.value !== null && d.value !== undefined) {
      grid[d.row][d.col] = String(d.value)
    }
  }
  // Remove fully empty trailing rows
  while (grid.length > 0 && grid[grid.length - 1].every(v => v === '')) grid.pop()
  return grid.map(row => row.join('\t')).join('\n')
}

function switchSheet(idx) {
  if (idx === activeSheetIdx.value) return
  commitEdit()
  saveSheetData()
  activeSheetIdx.value = idx
  loadSheetData(idx)
  // Emit new sheet context for AI
  const text = getSheetTextContent(idx)
  const sheet = sheets.value[idx]
  emit('sheet-changed', {
    sheetIndex: idx,
    sheetName: sheet?.name || `Sheet${idx + 1}`,
    totalSheets: sheets.value.length,
    text,
    fileName: props.filePath?.split(/[/\\]/).pop() || 'spreadsheet.xlsx',
    filePath: props.filePath || '',
  })
}

function addSheet() {
  saveSheetData()
  const name = `Sheet${sheets.value.length + 1}`
  sheets.value.push({ name, data: [] })
  switchSheet(sheets.value.length - 1)
}

function renameSheet() {
  renameSheetByIdx(activeSheetIdx.value)
}

function renameSheetByIdx(idx) {
  const sheet = sheets.value[idx]
  if (!sheet) return
  const newName = prompt('Sheet name:', sheet.name)
  if (newName && newName.trim()) sheet.name = newName.trim()
}

function deleteSheet() {
  if (sheets.value.length <= 1) return
  sheets.value.splice(activeSheetIdx.value, 1)
  const newIdx = Math.min(activeSheetIdx.value, sheets.value.length - 1)
  activeSheetIdx.value = -1 // force reload
  switchSheet(newIdx)
}

// Cell operations
function selectCell(r, c, e) {
  if (editingCell.value) commitEdit()
  sel.row = r
  sel.col = c
  if (e?.shiftKey) {
    rangeEnd.row = r
    rangeEnd.col = c
  } else {
    rangeEnd.row = -1
    rangeEnd.col = -1
  }
}

function onCellMouseDown(r, c, e) {
  if (e.button === 2) {
    // Right-click: if cell is outside current selection, move selection to it
    if (!isInRange(r, c) && !(sel.row === r && sel.col === c)) {
      selectCell(r, c, e)
    }
    return
  }
  selectCell(r, c, e)
  if (e.shiftKey) return  // shift-click already set rangeEnd

  // Start drag
  isDragging.value = true
  document.body.style.userSelect = 'none'

  function onMove(ev) {
    if (!isDragging.value) return
    // Find which cell is under cursor via elementFromPoint
    const el = document.elementFromPoint(ev.clientX, ev.clientY)
    const td = el?.closest('td.cell')
    if (!td) return
    const table = gridWrapper.value?.querySelector('.xlsx-table')
    if (!table) return
    // Find row/col by iterating tbody rows and cells
    const tbody = table.querySelector('tbody')
    const trs = tbody?.querySelectorAll('tr')
    if (!trs) return
    for (let ri = 0; ri < trs.length; ri++) {
      const tds = trs[ri].querySelectorAll('td.cell')
      for (let ci = 0; ci < tds.length; ci++) {
        if (tds[ci] === td) {
          rangeEnd.row = ri
          rangeEnd.col = ci
          return
        }
      }
    }
  }

  function onUp() {
    isDragging.value = false
    document.body.style.userSelect = ''
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
  }

  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function selectRow(r) {
  sel.row = r
  sel.col = 0
  rangeEnd.row = r
  rangeEnd.col = cols.value.length - 1
}

function selectColumn(c) {
  sel.row = 0
  sel.col = c
  rangeEnd.row = rows.value.length - 1
  rangeEnd.col = c
}

function isInRange(r, c) {
  if (rangeEnd.row < 0) return false
  const r1 = Math.min(sel.row, rangeEnd.row)
  const r2 = Math.max(sel.row, rangeEnd.row)
  const c1 = Math.min(sel.col, rangeEnd.col)
  const c2 = Math.max(sel.col, rangeEnd.col)
  return r >= r1 && r <= r2 && c >= c1 && c <= c2
}

function isRowSelected(r) {
  if (rangeEnd.row < 0) return sel.row === r
  return r >= Math.min(sel.row, rangeEnd.row) && r <= Math.max(sel.row, rangeEnd.row)
}

function isColSelected(c) {
  if (rangeEnd.col < 0) return sel.col === c
  return c >= Math.min(sel.col, rangeEnd.col) && c <= Math.max(sel.col, rangeEnd.col)
}

function getCellDisplay(r, c) {
  const key = `${r},${c}`
  return cellData[key]?.value ?? ''
}

function getCellStyle(r, c) {
  const key = `${r},${c}`
  const st = cellData[key]?.style || {}
  const styles = {}
  if (st.bold) styles.fontWeight = '600'
  if (st.italic) styles.fontStyle = 'italic'
  if (st.halign) styles.textAlign = st.halign
  if (st.fill) styles.backgroundColor = st.fill
  return styles
}

function ensureCellData(r, c) {
  const key = `${r},${c}`
  if (!cellData[key]) cellData[key] = { value: '', style: {} }
  return cellData[key]
}

// Editing
function startEdit(r, c) {
  editingCell.value = true
  editRow.value = r
  editCol.value = c
  editValue.value = getCellDisplay(r, c)
  nextTick(() => {
    const inputs = document.querySelectorAll('.cell-edit-input')
    if (inputs.length > 0) inputs[inputs.length - 1].focus()
  })
}

function startEditFromFormula() {
  if (!editingCell.value) {
    editingCell.value = true
    editRow.value = sel.row
    editCol.value = sel.col
    editValue.value = getCellDisplay(sel.row, sel.col)
  }
}

function commitEdit() {
  if (!editingCell.value) return
  const cell = ensureCellData(editRow.value, editCol.value)
  cell.value = editValue.value
  editingCell.value = false
  editRow.value = -1
  editCol.value = -1
}

function cancelEdit() {
  editingCell.value = false
  editRow.value = -1
  editCol.value = -1
  gridWrapper.value?.focus()
}

function commitAndMove(dir) {
  commitEdit()
  if (dir === 'right' && sel.col < cols.value.length - 1) sel.col++
  else if (dir === 'down' && sel.row < rows.value.length - 1) sel.row++
}

// Formatting actions
function toggleCellBold() {
  forEachSelectedCell((r, c) => {
    const cell = ensureCellData(r, c)
    cell.style.bold = !cell.style.bold
  })
}

function toggleCellItalic() {
  forEachSelectedCell((r, c) => {
    const cell = ensureCellData(r, c)
    cell.style.italic = !cell.style.italic
  })
}

function setCellAlign(align) {
  forEachSelectedCell((r, c) => {
    const cell = ensureCellData(r, c)
    cell.style.halign = align
  })
}

function setCellFill(color) {
  forEachSelectedCell((r, c) => {
    const cell = ensureCellData(r, c)
    cell.style.fill = color || undefined
  })
}

function forEachSelectedCell(fn) {
  if (rangeEnd.row >= 0) {
    const r1 = Math.min(sel.row, rangeEnd.row)
    const r2 = Math.max(sel.row, rangeEnd.row)
    const c1 = Math.min(sel.col, rangeEnd.col)
    const c2 = Math.max(sel.col, rangeEnd.col)
    for (let r = r1; r <= r2; r++)
      for (let c = c1; c <= c2; c++)
        fn(r, c)
  } else {
    fn(sel.row, sel.col)
  }
}

// Insert/delete rows and cols
function insertRow(pos) {
  const idx = pos === 'above' ? sel.row : sel.row + 1
  // Shift all cellData rows >= idx down by 1
  const entries = Object.entries(cellData)
  const toRemove = []
  const toAdd = []
  for (const [key, val] of entries) {
    const [r, c] = key.split(',').map(Number)
    if (r >= idx) {
      toRemove.push(key)
      toAdd.push({ key: `${r + 1},${c}`, val })
    }
  }
  toRemove.forEach(k => delete cellData[k])
  toAdd.forEach(({ key, val }) => { cellData[key] = val })
  rows.value.push(rows.value.length)
}

function deleteRow() {
  if (rows.value.length <= 1) return
  const idx = sel.row
  // Remove cells at this row, shift rows above down
  const entries = Object.entries(cellData)
  const toRemove = []
  const toAdd = []
  for (const [key, val] of entries) {
    const [r, c] = key.split(',').map(Number)
    if (r === idx) {
      toRemove.push(key)
    } else if (r > idx) {
      toRemove.push(key)
      toAdd.push({ key: `${r - 1},${c}`, val })
    }
  }
  toRemove.forEach(k => delete cellData[k])
  toAdd.forEach(({ key, val }) => { cellData[key] = val })
  rows.value.pop()
  if (sel.row >= rows.value.length) sel.row = rows.value.length - 1
}

function insertCol(pos) {
  const idx = pos === 'left' ? sel.col : sel.col + 1
  const entries = Object.entries(cellData)
  const toRemove = []
  const toAdd = []
  for (const [key, val] of entries) {
    const [r, c] = key.split(',').map(Number)
    if (c >= idx) {
      toRemove.push(key)
      toAdd.push({ key: `${r},${c + 1}`, val })
    }
  }
  toRemove.forEach(k => delete cellData[k])
  toAdd.forEach(({ key, val }) => { cellData[key] = val })
  const newLen = cols.value.length + 1
  cols.value = Array.from({ length: newLen }, (_, i) => colLetter(i))
  colWidths.value.splice(idx, 0, DEFAULT_COL_WIDTH)
}

function deleteCol() {
  if (cols.value.length <= 1) return
  const idx = sel.col
  const entries = Object.entries(cellData)
  const toRemove = []
  const toAdd = []
  for (const [key, val] of entries) {
    const [r, c] = key.split(',').map(Number)
    if (c === idx) {
      toRemove.push(key)
    } else if (c > idx) {
      toRemove.push(key)
      toAdd.push({ key: `${r},${c - 1}`, val })
    }
  }
  toRemove.forEach(k => delete cellData[k])
  toAdd.forEach(({ key, val }) => { cellData[key] = val })
  const newLen = cols.value.length - 1
  cols.value = Array.from({ length: newLen }, (_, i) => colLetter(i))
  colWidths.value.splice(idx, 1)
  if (sel.col >= cols.value.length) sel.col = cols.value.length - 1
}

// Column resize
function startColResize(e, ci) {
  const startX = e.clientX
  const startW = colWidths.value[ci]
  function onMove(ev) {
    const delta = ev.clientX - startX
    colWidths.value[ci] = Math.max(40, startW + delta)
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.cursor = ''
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
  document.body.style.cursor = 'col-resize'
  document.body.style.userSelect = 'none'
}

// Keyboard navigation
function onGridKeydown(e) {
  if (editingCell.value) return

  if (e.key === 'F2' || (e.key === 'Enter' && !e.shiftKey)) {
    e.preventDefault()
    startEdit(sel.row, sel.col)
    return
  }
  if (e.key === 'Delete' || e.key === 'Backspace') {
    e.preventDefault()
    forEachSelectedCell((r, c) => {
      const key = `${r},${c}`
      if (cellData[key]) cellData[key].value = ''
    })
    return
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault()
    if (e.shiftKey) {
      if (rangeEnd.row < 0) { rangeEnd.row = sel.row; rangeEnd.col = sel.col }
      if (rangeEnd.row > 0) rangeEnd.row--
    } else {
      if (sel.row > 0) sel.row--
      rangeEnd.row = -1
    }
  }
  if (e.key === 'ArrowDown') {
    e.preventDefault()
    if (e.shiftKey) {
      if (rangeEnd.row < 0) { rangeEnd.row = sel.row; rangeEnd.col = sel.col }
      if (rangeEnd.row < rows.value.length - 1) rangeEnd.row++
    } else {
      if (sel.row < rows.value.length - 1) sel.row++
      rangeEnd.row = -1
    }
  }
  if (e.key === 'ArrowLeft') {
    e.preventDefault()
    if (e.shiftKey) {
      if (rangeEnd.col < 0) { rangeEnd.row = sel.row; rangeEnd.col = sel.col }
      if (rangeEnd.col > 0) rangeEnd.col--
    } else {
      if (sel.col > 0) sel.col--
      rangeEnd.col = -1
    }
  }
  if (e.key === 'ArrowRight') {
    e.preventDefault()
    if (e.shiftKey) {
      if (rangeEnd.col < 0) { rangeEnd.row = sel.row; rangeEnd.col = sel.col }
      if (rangeEnd.col < cols.value.length - 1) rangeEnd.col++
    } else {
      if (sel.col < cols.value.length - 1) sel.col++
      rangeEnd.col = -1
    }
  }
  if (e.key === 'Tab') {
    e.preventDefault()
    if (e.shiftKey) { if (sel.col > 0) sel.col-- }
    else { if (sel.col < cols.value.length - 1) sel.col++ }
    rangeEnd.row = -1; rangeEnd.col = -1
  }

  // Ctrl+S
  if ((e.ctrlKey || e.metaKey) && e.key === 's') {
    e.preventDefault()
    saveSpreadsheet()
    return
  }

  // Ctrl+C
  if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
    e.preventDefault()
    ctxCopy()
    return
  }

  // Ctrl+X
  if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
    e.preventDefault()
    ctxCut()
    return
  }

  // Ctrl+V
  if ((e.ctrlKey || e.metaKey) && e.key === 'v') {
    e.preventDefault()
    ctxPaste()
    return
  }

  // Ctrl+A
  if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
    e.preventDefault()
    selectAll()
    return
  }

  // Ctrl+K: AI edit on selected cell(s)
  if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
    e.preventDefault()
    triggerXlsxAiEdit()
    return
  }

  // Type to start editing
  if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
    startEdit(sel.row, sel.col)
    editValue.value = e.key
  }
}

function triggerXlsxAiEdit() {
  // Get cell value(s) from selected range (or single cell)
  const hasRange = rangeEnd.row >= 0 && rangeEnd.col >= 0
  const r1 = hasRange ? Math.min(sel.row, rangeEnd.row) : sel.row
  const r2 = hasRange ? Math.max(sel.row, rangeEnd.row) : sel.row
  const c1 = hasRange ? Math.min(sel.col, rangeEnd.col) : sel.col
  const c2 = hasRange ? Math.max(sel.col, rangeEnd.col) : sel.col

  // Collect text from selected cells
  const lines = []
  for (let r = r1; r <= r2; r++) {
    const row = []
    for (let c = c1; c <= c2; c++) {
      const key = `${r},${c}`
      row.push(cellData[key]?.value ?? '')
    }
    lines.push(row.join('\t'))
  }
  const text = lines.join('\n')
  if (!text.trim()) return

  // Position near the grid
  const wrapRect = gridWrapper.value?.getBoundingClientRect() || { top: 200, left: 200 }
  const top = Math.min(wrapRect.top + 80, window.innerHeight - 320)
  const left = Math.max(16, wrapRect.left + 40)

  const sheetName = sheets.value[activeSheetIdx.value]?.name || `Sheet${activeSheetIdx.value + 1}`
  const fullSheetContent = `Sheet: ${sheetName}\n\n${getSheetTextContent()}`
  emit('ai-edit', {
    selectedText: text,
    fullFileContent: fullSheetContent,
    position: { top, left },
    fileContext: {
      fileName: props.filePath?.split(/[/\\]/).pop() || 'spreadsheet.xlsx',
      filePath: props.filePath || '',
      language: 'spreadsheet-tsv',
    },
    replaceCallback: (newText) => {
      // Parse the result back into cells (tab-separated rows)
      const newRows = newText.split('\n')
      for (let ri = 0; ri < newRows.length && (r1 + ri) <= r2; ri++) {
        const vals = newRows[ri].split('\t')
        for (let ci = 0; ci < vals.length && (c1 + ci) <= c2; ci++) {
          const key = `${r1 + ri},${c1 + ci}`
          if (!cellData[key]) cellData[key] = { value: '', style: {} }
          cellData[key].value = vals[ci]
        }
      }
    },
  })
}

function onMouseDown() {
  // Focus grid for keyboard
  gridWrapper.value?.focus()
  closeCtxMenu()
}

function selectAll() {
  sel.row = 0
  sel.col = 0
  rangeEnd.row = rows.value.length - 1
  rangeEnd.col = cols.value.length - 1
}

// ── Context menu ─────────────────────────────────────────────────────────────

function onTableContextMenu(e) {
  const x = Math.min(e.clientX, window.innerWidth - 220)
  const y = Math.min(e.clientY, window.innerHeight - 360)
  ctxMenu.x = x
  ctxMenu.y = y
  ctxMenu.visible = true
  // Close on next outside click
  nextTick(() => {
    document.addEventListener('mousedown', closeCtxMenu, { once: true })
  })
}

function closeCtxMenu() {
  ctxMenu.visible = false
}

function getSelectionRange() {
  if (rangeEnd.row >= 0) {
    return {
      r1: Math.min(sel.row, rangeEnd.row),
      r2: Math.max(sel.row, rangeEnd.row),
      c1: Math.min(sel.col, rangeEnd.col),
      c2: Math.max(sel.col, rangeEnd.col),
    }
  }
  return { r1: sel.row, r2: sel.row, c1: sel.col, c2: sel.col }
}

function ctxCopy() {
  closeCtxMenu()
  const { r1, r2, c1, c2 } = getSelectionRange()
  const cells = []
  const textRows = []
  for (let r = r1; r <= r2; r++) {
    const row = []
    for (let c = c1; c <= c2; c++) {
      const key = `${r},${c}`
      const cd = cellData[key]
      cells.push({ r: r - r1, c: c - c1, value: cd?.value ?? '', style: cd?.style ? { ...cd.style } : {} })
      row.push(cd?.value ?? '')
    }
    textRows.push(row.join('\t'))
  }
  clipboard = { cells, rows: r2 - r1 + 1, cols: c2 - c1 + 1 }
  const text = textRows.join('\n')
  navigator.clipboard?.writeText(text).catch(() => {})
}

function ctxCut() {
  ctxCopy()
  const { r1, r2, c1, c2 } = getSelectionRange()
  for (let r = r1; r <= r2; r++) {
    for (let c = c1; c <= c2; c++) {
      const key = `${r},${c}`
      if (cellData[key]) cellData[key].value = ''
    }
  }
  closeCtxMenu()
}

async function ctxPaste() {
  closeCtxMenu()
  // Try reading from system clipboard first (TSV text)
  let text = null
  try { text = await navigator.clipboard?.readText() } catch {}

  if (text) {
    // Parse TSV
    const pasteRows = text.split('\n').map(row => row.split('\t'))
    for (let ri = 0; ri < pasteRows.length; ri++) {
      for (let ci = 0; ci < pasteRows[ri].length; ci++) {
        const r = sel.row + ri
        const c = sel.col + ci
        if (r >= rows.value.length || c >= cols.value.length) continue
        const key = `${r},${c}`
        if (!cellData[key]) cellData[key] = { value: '', style: {} }
        cellData[key].value = pasteRows[ri][ci]
      }
    }
  } else if (clipboard) {
    // Fall back to internal clipboard
    for (const { r, c, value, style } of clipboard.cells) {
      const tr = sel.row + r
      const tc = sel.col + c
      if (tr >= rows.value.length || tc >= cols.value.length) continue
      const key = `${tr},${tc}`
      if (!cellData[key]) cellData[key] = { value: '', style: {} }
      cellData[key].value = value
      if (style && Object.keys(style).length) cellData[key].style = { ...style }
    }
  }
}

function ctxClearCells() {
  closeCtxMenu()
  forEachSelectedCell((r, c) => {
    const key = `${r},${c}`
    if (cellData[key]) cellData[key].value = ''
  })
}

function ctxInsertRowAbove() { closeCtxMenu(); insertRow('above') }
function ctxInsertRowBelow() { closeCtxMenu(); insertRow('below') }
function ctxDeleteRow()      { closeCtxMenu(); deleteRow() }
function ctxInsertColLeft()  { closeCtxMenu(); insertCol('left') }
function ctxInsertColRight() { closeCtxMenu(); insertCol('right') }
function ctxDeleteCol()      { closeCtxMenu(); deleteCol() }

function ctxAskAi() {
  closeCtxMenu()
  triggerXlsxAiEdit()
}

// Save: sync grid → workbook → base64
async function saveSpreadsheet() {
  if (saving.value) return
  saving.value = true
  try {
    commitEdit()
    saveSheetData()

    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()

    for (const sh of sheets.value) {
      const ws = wb.addWorksheet(sh.name)
      for (const d of sh.data) {
        const cell = ws.getCell(d.row + 1, d.col + 1)
        // Try to store numbers as numbers
        const num = Number(d.value)
        cell.value = d.value !== '' && !isNaN(num) && isFinite(num) ? num : d.value
        if (d.style?.bold || d.style?.italic) {
          cell.font = {
            bold: d.style.bold || false,
            italic: d.style.italic || false,
          }
        }
        if (d.style?.halign) {
          cell.alignment = { horizontal: d.style.halign }
        }
        if (d.style?.fill) {
          cell.fill = {
            type: 'pattern',
            pattern: 'solid',
            fgColor: { argb: 'FF' + d.style.fill.replace('#', '') },
          }
        }
      }
    }

    const buffer = await wb.xlsx.writeBuffer()
    const bytes = new Uint8Array(buffer)
    let binary = ''
    for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i])
    const base64 = btoa(binary)
    emit('save', base64)
  } catch (err) {
    console.error('XlsxEditor: save failed', err)
  } finally {
    saving.value = false
  }
}

onMounted(() => {
  loadXlsx(props.base64)
})

onBeforeUnmount(() => {
  document.removeEventListener('mousedown', closeCtxMenu)
})

watch(() => props.base64, (val) => {
  if (val) loadXlsx(val)
})

// ── Search / Replace ──
function _makeSearchRegex(query, { matchCase, wholeWord }) {
  const flags = matchCase ? 'g' : 'gi'
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped
  return new RegExp(pattern, flags)
}

function countMatches(query, opts = {}) {
  if (!query) return 0
  const re = _makeSearchRegex(query, opts)
  let count = 0
  for (const [, cell] of Object.entries(cellData)) {
    if (cell.value === '' || cell.value == null) continue
    const m = String(cell.value).match(re)
    if (m) count += m.length
  }
  return count
}

function performSearchReplace(query, replacement, opts = {}) {
  if (!query) return { matchCount: 0, replaced: 0 }
  saveSheetData()
  let matchCount = 0
  let replaced = 0
  for (const sh of sheets.value) {
    const re = _makeSearchRegex(query, opts)
    for (const d of sh.data) {
      if (d.value === '' || d.value == null) continue
      const str = String(d.value)
      const m = str.match(re)
      if (m) {
        matchCount += m.length
        if (replacement !== null) {
          d.value = str.replace(re, replacement)
          replaced += m.length
        }
      }
    }
  }
  // Reload current sheet to reflect changes
  loadSheetData(activeSheetIdx.value)
  return { matchCount, replaced }
}

defineExpose({ getSheetTextContent, getAllSheetsText, performSearchReplace, countMatches })
</script>

<style scoped>
.xlsx-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  background: #F2F2F7;
  font-family: 'Inter', sans-serif;
}

/* ── Menubar ── */
.xlsx-menubar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 0.75rem;
  height: 2.25rem;
  background: #fff;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
}
.menu-tabs { display: flex; gap: 0; }
.menu-tab {
  padding: 0.25rem 0.75rem;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: #6B7280;
  background: none;
  border: none;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}
.menu-tab:hover { color: #1A1A1A; background: #F5F5F5; }
.menu-tab.active {
  color: #fff;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
}
.menu-right { display: flex; align-items: center; gap: 0.75rem; }
.save-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-size: var(--fs-caption);
  color: #007AFF;
}

/* ── Ribbon ── */
.xlsx-ribbon {
  display: flex;
  align-items: flex-end;
  gap: 0.5rem;
  padding: 0.5rem 0.75rem;
  background: #FAFAFA;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
  overflow-x: auto;
}
.ribbon-group { display: flex; flex-direction: column; gap: 0.25rem; }
.ribbon-label {
  font-size: 0.625rem;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9CA3AF;
  font-weight: 600;
}
.ribbon-row { display: flex; gap: 0.125rem; }
.ribbon-btn {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.3rem 0.5rem;
  border: none;
  border-radius: var(--radius-sm);
  background: none;
  color: #374151;
  font-size: var(--fs-caption);
  cursor: pointer;
  transition: all 0.15s ease;
}
.ribbon-btn:hover:not(:disabled) { background: #E5E5EA; }
.ribbon-btn:disabled { opacity: 0.35; cursor: default; }
.ribbon-btn.toggled {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
}
.ribbon-sep {
  width: 1px;
  height: 2rem;
  background: #E5E5EA;
  flex-shrink: 0;
  align-self: center;
}
.color-picker-btn { position: relative; overflow: hidden; }
.color-input {
  position: absolute;
  inset: 0;
  opacity: 0;
  width: 100%;
  height: 100%;
  cursor: pointer;
}

/* ── Formula bar ── */
.xlsx-formula-bar {
  display: flex;
  align-items: center;
  height: 1.75rem;
  background: #fff;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
}
.cell-address {
  width: 4rem;
  text-align: center;
  font-size: var(--fs-caption);
  font-weight: 600;
  color: #1A1A1A;
  font-family: 'JetBrains Mono', monospace;
  flex-shrink: 0;
}
.formula-sep {
  width: 1px;
  height: 100%;
  background: #E5E5EA;
}
.formula-input {
  flex: 1;
  height: 100%;
  border: none;
  outline: none;
  padding: 0 0.5rem;
  font-size: var(--fs-caption);
  font-family: 'JetBrains Mono', monospace;
  color: #1A1A1A;
  background: transparent;
}
.formula-input:focus {
  background: #FFFDE7;
}

/* ── Grid ── */
.xlsx-grid-wrapper {
  flex: 1;
  overflow: auto;
  outline: none;
  
}
.xlsx-table {
  border-collapse: collapse;
  table-layout: fixed;
  user-select: none;
}
.col-header, .row-header {
  background: #F3F4F6;
  border: 1px solid #D1D5DB;
  font-size: 0.6875rem;
  font-weight: 600;
  color: #6B7280;
  text-align: center;
  padding: 0.125rem 0.25rem;
  position: sticky;
  z-index: 2;
}
.col-header {
  top: 0;
  min-width: 100px;
  position: sticky;
  z-index: 3;
  user-select: none;
}
.col-header.selected { background: #DBEAFE; color: #1D4ED8; }
.row-header {
  left: 0;
  width: 3rem;
  min-width: 3rem;
  position: sticky;
  z-index: 2;
}
.row-header.selected { background: #DBEAFE; color: #1D4ED8; }
.corner-cell {
  position: sticky;
  top: 0;
  left: 0;
  z-index: 4;
  width: 3rem;
  min-width: 3rem;
}
.cell {
  border: 1px solid #E5E5EA;
  padding: 0.125rem 0.35rem;
  font-size: 0.75rem;
  font-family: 'Inter', sans-serif;
  color: #1A1A1A;
  background: #fff;
  overflow: hidden;
  white-space: nowrap;
  text-overflow: ellipsis;
  height: 1.5rem;
  cursor: cell;
  position: relative;
}
.cell.active {
  outline: 2px solid #007AFF;
  outline-offset: -1px;
  z-index: 1;
}
.cell.in-range {
  background: rgba(0, 122, 255, 0.06);
}
.cell.editing {
  padding: 0;
  overflow: visible;
}
.cell-text {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
}
.cell-edit-input {
  width: 100%;
  height: 100%;
  border: none;
  outline: none;
  padding: 0.125rem 0.35rem;
  font-size: 0.75rem;
  font-family: 'Inter', sans-serif;
  color: #1A1A1A;
  background: #FFFDE7;
}

/* Column resize handle */
.col-resize-handle {
  position: absolute;
  right: -2px;
  top: 0;
  bottom: 0;
  width: 4px;
  cursor: col-resize;
  z-index: 5;
}
.col-resize-handle:hover {
  background: rgba(0, 122, 255, 0.3);
}

/* ── Sheet tabs ── */
.xlsx-sheet-bar {
  display: flex;
  align-items: center;
  gap: 0;
  height: 1.75rem;
  background: #fff;
  border-top: 1px solid #E5E5EA;
  flex-shrink: 0;
  padding: 0 0.5rem;
  overflow-x: auto;
}
.sheet-tab {
  padding: 0.2rem 0.75rem;
  font-size: var(--fs-small);
  font-weight: 500;
  color: #6B7280;
  background: none;
  border: none;
  border-bottom: 2px solid transparent;
  cursor: pointer;
  white-space: nowrap;
  transition: all 0.15s ease;
}
.sheet-tab:hover { color: #1A1A1A; background: #F5F5F5; }
.sheet-tab.active {
  color: #1A1A1A;
  font-weight: 600;
  border-bottom-color: #1A1A1A;
}
.sheet-add-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 1.5rem;
  border: none;
  background: none;
  color: #9CA3AF;
  cursor: pointer;
  border-radius: var(--radius-sm);
  transition: all 0.15s ease;
}
.sheet-add-btn:hover { background: #F5F5F5; color: #1A1A1A; }
</style>

<style>
/* ── XLSX Context Menu (unscoped — teleported to body) ── */
.xlsx-ctx-menu {
  position: fixed;
  z-index: 9999;
  min-width: 196px;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.28), 0 4px 12px rgba(0,0,0,0.14);
  padding: 0.3rem 0;
  animation: xlsxCtxEnter 0.12s ease-out;
}
@keyframes xlsxCtxEnter {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1) translateY(0); }
}
.xlsx-ctx-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.35rem 0.75rem;
  font-family: 'Inter', sans-serif;
  font-size: 0.8125rem;
  font-weight: 500;
  color: #D1D5DB;
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  transition: background 0.1s, color 0.1s;
}
.xlsx-ctx-item:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
  color: #FFFFFF;
}
.xlsx-ctx-item svg { flex-shrink: 0; color: #6B7280; }
.xlsx-ctx-item:hover svg { color: rgba(255,255,255,0.7); }
.xlsx-ctx-item-danger { color: #FCA5A5; }
.xlsx-ctx-item-danger:hover { background: rgba(239,68,68,0.15) !important; color: #FCA5A5 !important; }
.xlsx-ctx-item-danger:hover svg { color: #FCA5A5 !important; }
.xlsx-ctx-item-ai { color: #FCD34D; }
.xlsx-ctx-item-ai:hover {
  background: linear-gradient(135deg, #78350F 0%, #92400E 40%, #B45309 100%) !important;
  color: #FFFFFF !important;
}
.xlsx-ctx-item-ai:hover svg { color: #FCD34D !important; }
.xlsx-ctx-shortcut {
  margin-left: auto;
  font-size: 0.6875rem;
  color: #4B5563;
  font-family: 'JetBrains Mono', monospace;
}
.xlsx-ctx-item:hover .xlsx-ctx-shortcut { color: rgba(255,255,255,0.35); }
.xlsx-ctx-sep {
  height: 1px;
  background: #1E1E1E;
  margin: 0.2rem 0;
}
</style>
