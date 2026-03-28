<template>
  <div class="pptx-editor">

    <!-- ══════════════ MENUBAR ══════════════ -->
    <div class="pptx-menubar">
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
        <span class="slide-counter">Slide {{ activeSlideIdx + 1 }} / {{ slides.length }}</span>
      </div>
    </div>

    <!-- ── Ribbon: contextual toolbar per tab ── -->
    <div v-if="activeTab" class="pptx-ribbon">

      <!-- FILE -->
      <template v-if="activeTab === 'file'">
        <div class="ribbon-group">
          <span class="ribbon-label">File</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="savePresentation" :disabled="saving">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
              <span>Save</span>
            </button>
          </div>
        </div>
      </template>

      <!-- EDIT -->
      <template v-if="activeTab === 'edit'">
        <div class="ribbon-group">
          <span class="ribbon-label">Clipboard</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" :disabled="!selectedElement" @click="cutElement">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
              <span>Cut</span>
            </button>
            <button class="ribbon-btn" :disabled="!selectedElement" @click="copyElement">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Copy</span>
            </button>
            <button class="ribbon-btn" :disabled="!clipboard" @click="pasteElement">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
              <span>Paste</span>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Element</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" :disabled="!selectedElement" @click="deleteSelected">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span>Delete</span>
            </button>
            <button class="ribbon-btn" :disabled="!selectedElement" @click="duplicateElement">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Duplicate</span>
            </button>
            <button class="ribbon-btn" :disabled="!selectedElement || !canSelectAll" @click="selectAll">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
              <span>Select All</span>
            </button>
          </div>
        </div>
      </template>

      <!-- INSERT -->
      <template v-if="activeTab === 'insert'">
        <div class="ribbon-group">
          <span class="ribbon-label">Elements</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="addTextElement">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
              <span>Text Box</span>
            </button>
            <button class="ribbon-btn" @click="pickImage">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
              <span>Image</span>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Shapes</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="addShape('rect')">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
              <span>Rectangle</span>
            </button>
            <button class="ribbon-btn" @click="addShape('roundRect')">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="6"/></svg>
              <span>Rounded</span>
            </button>
            <button class="ribbon-btn" @click="addShape('ellipse')">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><ellipse cx="12" cy="12" rx="10" ry="8"/></svg>
              <span>Ellipse</span>
            </button>
            <button class="ribbon-btn" @click="addShape('triangle')">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polygon points="12 2 22 22 2 22"/></svg>
              <span>Triangle</span>
            </button>
            <button class="ribbon-btn" @click="addShape('line')">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/></svg>
              <span>Line</span>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Slide</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="addSlide">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>
              <span>New Slide</span>
            </button>
          </div>
        </div>
      </template>

      <!-- FORMAT -->
      <template v-if="activeTab === 'format'">
        <div class="ribbon-group">
          <span class="ribbon-label">Arrange</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" :disabled="!selectedElement" @click="bringToFront">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="2" width="8" height="8" rx="1"/><rect x="14" y="14" width="8" height="8" rx="1" fill="currentColor" opacity="0.15"/><path d="M10 2h4v4h4v4h-4v4h-4v-4H6V6h4V2z" fill="currentColor" opacity="0.08"/></svg>
              <span>To Front</span>
            </button>
            <button class="ribbon-btn" :disabled="!selectedElement" @click="sendToBack">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="14" y="14" width="8" height="8" rx="1"/><rect x="2" y="2" width="8" height="8" rx="1" fill="currentColor" opacity="0.15"/></svg>
              <span>To Back</span>
            </button>
            <button class="ribbon-btn" :disabled="!selectedElement" @click="bringForward">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><line x1="12" y1="6" x2="12" y2="18"/></svg>
              <span>Forward</span>
            </button>
            <button class="ribbon-btn" :disabled="!selectedElement" @click="sendBackward">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="18" x2="12" y2="6"/></svg>
              <span>Backward</span>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Fill</span>
          <div class="ribbon-row">
            <label class="ribbon-btn color-swatch-wrap" :class="{ disabled: !selectedShapeOrText }">
              <span class="color-swatch" :style="{ background: selFillColor }"></span>
              <input type="color" class="hidden-color" :value="selFillColor" @input="setFillColor($event.target.value)" :disabled="!selectedShapeOrText" />
              <span>Fill</span>
            </label>
            <label class="ribbon-btn color-swatch-wrap" :class="{ disabled: !selectedShapeOrText }">
              <span class="color-swatch" :style="{ background: selBorderColor || '#1A1A1A' }"></span>
              <input type="color" class="hidden-color" :value="selBorderColor || '#1A1A1A'" @input="setBorderColor($event.target.value)" :disabled="!selectedShapeOrText" />
              <span>Border</span>
            </label>
          </div>
        </div>
      </template>

      <!-- SLIDE -->
      <template v-if="activeTab === 'slide'">
        <div class="ribbon-group">
          <span class="ribbon-label">Slides</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="addSlide">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="12" y1="7" x2="12" y2="13"/><line x1="9" y1="10" x2="15" y2="10"/></svg>
              <span>New Slide</span>
            </button>
            <button class="ribbon-btn" @click="duplicateSlide(activeSlideIdx)">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
              <span>Duplicate</span>
            </button>
            <button class="ribbon-btn danger-text" :disabled="slides.length <= 1" @click="deleteSlide(activeSlideIdx)">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
              <span>Delete Slide</span>
            </button>
          </div>
        </div>
        <div class="ribbon-sep"></div>
        <div class="ribbon-group">
          <span class="ribbon-label">Background</span>
          <div class="ribbon-row">
            <label class="ribbon-btn color-swatch-wrap">
              <span class="color-swatch" :style="{ background: slideBgValue }"></span>
              <input type="color" class="hidden-color" :value="slideBgValue" @input="setSlideBg($event.target.value)" />
              <span>Color</span>
            </label>
          </div>
        </div>
      </template>

      <!-- VIEW -->
      <template v-if="activeTab === 'view'">
        <div class="ribbon-group">
          <span class="ribbon-label">Zoom</span>
          <div class="ribbon-row">
            <button class="ribbon-btn" @click="zoomIn">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              <span>Zoom In</span>
            </button>
            <button class="ribbon-btn" @click="zoomOut">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/></svg>
              <span>Zoom Out</span>
            </button>
            <button class="ribbon-btn" @click="zoomFit">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/></svg>
              <span>Fit</span>
            </button>
            <span class="zoom-label">{{ Math.round(canvasScale * 100) }}%</span>
          </div>
        </div>
      </template>
    </div>

    <!-- Hidden file input for image insertion -->
    <input
      ref="imageInputRef"
      type="file"
      accept="image/png,image/jpeg,image/gif,image/webp,image/svg+xml,image/bmp"
      style="display:none;"
      @change="onImagePicked"
    />

    <!-- ══════════════ BODY ══════════════ -->
    <div class="pptx-body">
      <!-- Slide thumbnails sidebar -->
      <div class="slide-sidebar">
        <div class="slide-list">
          <div
            v-for="(slide, idx) in slides"
            :key="idx"
            class="slide-thumb-wrap"
            :class="{ active: idx === activeSlideIdx }"
            @click="selectSlide(idx)"
            @contextmenu.prevent="onSlideContextMenu($event, idx)"
          >
            <span class="slide-num">{{ idx + 1 }}</span>
            <div class="slide-thumb" :style="thumbStyle">
              <div class="slide-thumb-inner" :style="thumbInnerStyle(slide)">
                <div
                  v-for="(el, eIdx) in allSlideElements(slide)"
                  :key="eIdx"
                  :style="elementStyle(el, 1)"
                  class="thumb-element"
                >
                  <template v-if="el.type === 'text' || el.type === 'shape'">
                    <div v-html="el.content" class="thumb-text"></div>
                  </template>
                  <template v-else-if="el.type === 'image'">
                    <img :src="el.src" class="thumb-img" />
                  </template>
                </div>
              </div>
            </div>
          </div>
        </div>
        <button class="add-slide-btn" @click="addSlide" title="Add slide">
          <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
          Add Slide
        </button>
      </div>

      <!-- Slide canvas -->
      <div class="canvas-area" ref="canvasAreaRef" @contextmenu.prevent="onCanvasContextMenu">
        <!-- Legacy .ppt warning -->
        <div v-if="isLegacyPpt" class="pptx-empty">
          <div class="pptx-empty-icon">
            <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
              <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
            </svg>
          </div>
          <h3>Legacy Format</h3>
          <p>The <code>.ppt</code> format is not supported. Please convert your file to <code>.pptx</code> and try again.</p>
        </div>

        <!-- Loading -->
        <div v-else-if="loading" class="pptx-empty">
          <svg class="animate-spin" style="width:32px;height:32px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
            <path d="M21 12a9 9 0 1 1-6.2-8.6"/>
          </svg>
          <p style="margin-top:0.75rem;">Parsing presentation...</p>
        </div>

        <!-- Parse error -->
        <div v-else-if="parseError" class="pptx-empty">
          <div class="pptx-empty-icon" style="background:#EF4444;">
            <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
              <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
            </svg>
          </div>
          <h3>Failed to parse</h3>
          <p>{{ parseError }}</p>
        </div>

        <!-- Active slide canvas -->
        <div
          v-else-if="activeSlide"
          class="canvas-wrapper"
          @mousedown="onCanvasMouseDown"
        >
          <div
            class="slide-canvas"
            ref="slideCanvasRef"
            :style="canvasStyle"
            @contextmenu.stop.prevent="onElementContextMenu($event, null)"
          >
            <!-- Slide background -->
            <div class="slide-bg" :style="slideBgStyle(activeSlide)"></div>

            <!-- Elements -->
            <div
              v-for="(el, idx) in allSlideElements(activeSlide)"
              :key="idx"
              :style="elementStyle(el, canvasScale)"
              class="slide-element"
              :class="{
                selected: selectedElement === el,
                editing: editingElement === el,
              }"
              @mousedown.stop="onElementMouseDown($event, el)"
              @dblclick.stop="onElementDblClick(el)"
              @contextmenu.stop.prevent="onElementContextMenu($event, el)"
            >
              <!-- Text element -->
              <template v-if="el.type === 'text' || el.type === 'shape'">
                <div
                  :contenteditable="editingElement === el"
                  :class="['el-content', { 'el-editing': editingElement === el }]"
                  :style="elementContentStyle(el)"
                  v-html="el.content"
                  @input="onContentInput($event, el)"
                  @blur="onContentBlur(el)"
                  @keydown.escape="exitEditing"
                  spellcheck="false"
                ></div>
              </template>

              <!-- Image element -->
              <template v-else-if="el.type === 'image'">
                <img :src="el.src" class="el-image" draggable="false" />
              </template>

              <!-- Table element -->
              <template v-else-if="el.type === 'table'">
                <table class="el-table" :style="{ width: '100%', height: '100%' }">
                  <tr v-for="(row, rIdx) in el.data" :key="rIdx">
                    <td
                      v-for="(cell, cIdx) in row"
                      :key="cIdx"
                      :rowspan="cell.rowSpan || 1"
                      :colspan="cell.colSpan || 1"
                      :style="{
                        background: cell.fillColor || 'transparent',
                        color: cell.fontColor || '#1A1A1A',
                        fontWeight: cell.fontBold ? '700' : '400',
                        fontSize: (10 * canvasScale) + 'px',
                        padding: (3 * canvasScale) + 'px',
                        border: '1px solid #ccc',
                      }"
                      v-html="cell.text"
                    ></td>
                  </tr>
                </table>
              </template>

              <!-- Chart / Video / Audio / Diagram / Math — placeholder -->
              <template v-else>
                <div class="el-placeholder">
                  <svg style="width:24px;height:24px;opacity:0.4;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 3v18"/>
                  </svg>
                  <span>{{ el.type }}</span>
                </div>
              </template>

              <!-- Resize handles (when selected, not editing text) -->
              <template v-if="selectedElement === el && editingElement !== el">
                <div
                  v-for="handle in resizeHandles"
                  :key="handle"
                  class="resize-handle"
                  :class="'handle-' + handle"
                  @mousedown.stop.prevent="onResizeStart($event, el, handle)"
                ></div>
              </template>
            </div>
          </div>

          <!-- Slide info bar -->
          <div class="canvas-info">
            Slide {{ activeSlideIdx + 1 }} of {{ slides.length }}
            <template v-if="activeSlide.note">
              &middot; Has speaker notes
            </template>
          </div>
        </div>
      </div>
    </div>

    <!-- ══════════════ CONTEXT MENUS (Teleported) ══════════════ -->
    <Teleport to="body">
      <!-- Slide thumbnail ctx -->
      <div v-if="slideCtx.visible" class="pptx-ctx-overlay" @click="closeAllCtx" @contextmenu.prevent="closeAllCtx"></div>
      <div v-if="slideCtx.visible" class="pptx-ctx-menu" :style="{ top: slideCtx.y + 'px', left: slideCtx.x + 'px' }">
        <button class="ctx-item" @click="addSlide(); slideCtx.visible = false">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          New Slide
        </button>
        <button class="ctx-item" @click="duplicateSlide(slideCtx.idx)">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Duplicate Slide
        </button>
        <div class="ctx-divider"></div>
        <button class="ctx-item danger" @click="deleteSlide(slideCtx.idx)" :disabled="slides.length <= 1">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
          Delete Slide
        </button>
      </div>

      <!-- Element / canvas right-click ctx -->
      <div v-if="elCtx.visible" class="pptx-ctx-overlay" @click="closeAllCtx" @contextmenu.prevent="closeAllCtx"></div>
      <div v-if="elCtx.visible" class="pptx-ctx-menu" :style="{ top: elCtx.y + 'px', left: elCtx.x + 'px' }">
        <!-- On element -->
        <template v-if="elCtx.el">
          <button class="ctx-item" @click="ctxCut">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="6" cy="6" r="3"/><circle cx="6" cy="18" r="3"/><line x1="20" y1="4" x2="8.12" y2="15.88"/><line x1="14.47" y1="14.48" x2="20" y2="20"/><line x1="8.12" y1="8.12" x2="12" y2="12"/></svg>
            Cut
            <span class="ctx-shortcut">Ctrl+X</span>
          </button>
          <button class="ctx-item" @click="ctxCopy">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Copy
            <span class="ctx-shortcut">Ctrl+C</span>
          </button>
          <button class="ctx-item" :disabled="!clipboard" @click="ctxPaste">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
            Paste
            <span class="ctx-shortcut">Ctrl+V</span>
          </button>
          <button class="ctx-item" @click="ctxDuplicate">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            Duplicate
            <span class="ctx-shortcut">Ctrl+D</span>
          </button>
          <div class="ctx-divider"></div>
          <button class="ctx-item" @click="ctxBringToFront">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="17 11 12 6 7 11"/><line x1="12" y1="6" x2="12" y2="18"/></svg>
            Bring to Front
          </button>
          <button class="ctx-item" @click="ctxSendToBack">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="7 13 12 18 17 13"/><line x1="12" y1="18" x2="12" y2="6"/></svg>
            Send to Back
          </button>
          <template v-if="elCtx.el.type === 'text' || elCtx.el.type === 'shape'">
            <div class="ctx-divider"></div>
            <button class="ctx-item" @click="ctxEditText">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
              Edit Text
            </button>
          </template>
          <div class="ctx-divider"></div>
          <button class="ctx-item danger" @click="ctxDelete">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            Delete
            <span class="ctx-shortcut">Del</span>
          </button>
        </template>

        <!-- On canvas (no element) -->
        <template v-else>
          <button class="ctx-item" :disabled="!clipboard" @click="ctxPaste">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><rect x="8" y="2" width="8" height="4" rx="1"/></svg>
            Paste
            <span class="ctx-shortcut">Ctrl+V</span>
          </button>
          <div class="ctx-divider"></div>
          <button class="ctx-item" @click="ctxInsertText">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="4 7 4 4 20 4 20 7"/><line x1="9" y1="20" x2="15" y2="20"/><line x1="12" y1="4" x2="12" y2="20"/></svg>
            Insert Text Box
          </button>
          <button class="ctx-item" @click="ctxInsertImage">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><polyline points="21 15 16 10 5 21"/></svg>
            Insert Image
          </button>
          <button class="ctx-item" @click="ctxInsertShape">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/></svg>
            Insert Shape
          </button>
          <div class="ctx-divider"></div>
          <button class="ctx-item" @click="ctxSelectAll">
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
            Select All
            <span class="ctx-shortcut">Ctrl+A</span>
          </button>
        </template>
      </div>
    </Teleport>
  </div>
</template>

<script setup>
import { ref, computed, watch, onMounted, onBeforeUnmount, nextTick } from 'vue'

const props = defineProps({
  base64: { type: String, required: true },
  filePath: { type: String, required: true },
})
const emit = defineEmits(['save', 'ai-edit', 'slide-selected'])

// ── Menubar ──
const menuTabs = [
  { id: 'file',   label: 'File' },
  { id: 'edit',   label: 'Edit' },
  { id: 'insert', label: 'Insert' },
  { id: 'format', label: 'Format' },
  { id: 'slide',  label: 'Slide' },
  { id: 'view',   label: 'View' },
]
const activeTab = ref('insert')

// ── State ──
const slides = ref([])
const slideSize = ref({ width: 960, height: 540 })
const activeSlideIdx = ref(0)
const selectedElement = ref(null)
const editingElement = ref(null)
const loading = ref(true)
const parseError = ref('')
const saving = ref(false)
const canvasAreaRef = ref(null)
const slideCanvasRef = ref(null)
const clipboard = ref(null)
const imageInputRef = ref(null)

const resizeHandles = ['nw', 'ne', 'sw', 'se', 'n', 's', 'e', 'w']

const isLegacyPpt = computed(() => props.filePath?.toLowerCase().endsWith('.ppt'))
const activeSlide = computed(() => slides.value[activeSlideIdx.value] || null)
const canSelectAll = computed(() => activeSlide.value && (activeSlide.value.elements?.length || 0) > 0)

const selectedShapeOrText = computed(() =>
  selectedElement.value && (selectedElement.value.type === 'text' || selectedElement.value.type === 'shape') ? selectedElement.value : null
)
const selFillColor = computed(() => {
  const el = selectedShapeOrText.value
  return (el?.fill?.type === 'color' && el.fill.value) ? el.fill.value : '#ffffff'
})
const selBorderColor = computed(() => selectedShapeOrText.value?.borderColor || '')
const slideBgValue = computed(() => {
  const s = activeSlide.value
  if (!s?.fill) return '#ffffff'
  return s.fill.type === 'color' ? (s.fill.value || '#ffffff') : '#ffffff'
})

// ── Context menus ──
const slideCtx = ref({ visible: false, x: 0, y: 0, idx: 0 })
const elCtx = ref({ visible: false, x: 0, y: 0, el: null })

function closeAllCtx() {
  slideCtx.value.visible = false
  elCtx.value.visible = false
}

function onSlideContextMenu(e, idx) {
  closeAllCtx()
  slideCtx.value = { visible: true, x: e.clientX, y: e.clientY, idx }
}

function onElementContextMenu(e, el) {
  closeAllCtx()
  if (el) selectedElement.value = el
  elCtx.value = { visible: true, x: e.clientX, y: e.clientY, el }
}

function onCanvasContextMenu(e) {
  // Only if not over slide canvas (that one handles its own)
}

// Context-menu actions
function ctxCut() { cutElement(); closeAllCtx() }
function ctxCopy() { copyElement(); closeAllCtx() }
function ctxPaste() { pasteElement(); closeAllCtx() }
function ctxDuplicate() { duplicateElement(); closeAllCtx() }
function ctxDelete() { deleteSelected(); closeAllCtx() }
function ctxBringToFront() { bringToFront(); closeAllCtx() }
function ctxSendToBack() { sendToBack(); closeAllCtx() }
function ctxEditText() {
  if (elCtx.value.el) { selectedElement.value = elCtx.value.el; editingElement.value = elCtx.value.el }
  closeAllCtx()
}
function ctxInsertText() { addTextElement(); closeAllCtx() }
function ctxInsertImage() { closeAllCtx(); pickImage() }
function ctxInsertShape() { addShape('rect'); closeAllCtx() }
function ctxSelectAll() { selectAll(); closeAllCtx() }

// ── Canvas scaling ──
const canvasScale = ref(1)
const thumbScale = computed(() => 140 / slideSize.value.width)

const thumbStyle = computed(() => {
  const w = slideSize.value.width * thumbScale.value
  const h = slideSize.value.height * thumbScale.value
  return {
    width: w + 'px',
    height: h + 'px',
    position: 'relative',
    overflow: 'hidden',
    borderRadius: '4px',
    background: '#fff',
    border: '1px solid #E5E5EA',
    flexShrink: '0',
  }
})

const canvasStyle = computed(() => {
  const w = slideSize.value.width * canvasScale.value
  const h = slideSize.value.height * canvasScale.value
  return {
    width: w + 'px',
    height: h + 'px',
    position: 'relative',
    background: '#fff',
    boxShadow: '0 4px 20px rgba(0,0,0,0.1)',
    borderRadius: '4px',
    overflow: 'hidden',
  }
})

let fitScale = 1 // remember the auto-fit scale
function updateCanvasScale() {
  if (!canvasAreaRef.value) return
  const area = canvasAreaRef.value.getBoundingClientRect()
  const maxW = area.width * 0.9
  const maxH = (area.height - 32) * 0.9
  const scaleX = maxW / slideSize.value.width
  const scaleY = maxH / slideSize.value.height
  fitScale = Math.min(scaleX, scaleY)
  canvasScale.value = fitScale
}

function zoomIn() { canvasScale.value = Math.min(canvasScale.value * 1.2, 3) }
function zoomOut() { canvasScale.value = Math.max(canvasScale.value / 1.2, 0.1) }
function zoomFit() { canvasScale.value = fitScale }

// ── Parse PPTX ──
async function parsePptx() {
  if (isLegacyPpt.value) { loading.value = false; return }
  loading.value = true
  parseError.value = ''
  try {
    const { parse } = await import('pptxtojson')
    const binaryStr = atob(props.base64)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) bytes[i] = binaryStr.charCodeAt(i)
    const result = await parse(bytes.buffer)
    slides.value = result.slides
    slideSize.value = result.size || { width: 960, height: 540 }
    activeSlideIdx.value = 0
    selectedElement.value = null
    editingElement.value = null
    await nextTick()
    updateCanvasScale()
  } catch (err) {
    console.error('PPTX parse error:', err)
    parseError.value = err.message || 'Unknown parsing error'
  } finally {
    loading.value = false
  }
}

function allSlideElements(slide) {
  if (!slide) return []
  return [...(slide.layoutElements || []), ...(slide.elements || [])]
}

// ── Slide navigation ──
function getAllSlidesText() {
  return slides.value.map((_, idx) => {
    const text = getSlideTextContent(idx)
    return `--- Slide ${idx + 1} ---\n${text || '(empty)'}`
  }).join('\n\n')
}

function getSlideTextContent(idx) {
  const slide = slides.value[idx]
  if (!slide) return ''
  const parts = []
  for (const el of allSlideElements(slide)) {
    if (el.type === 'text' || el.type === 'shape') {
      const text = stripHtml(el.content || '')
      if (text.trim()) parts.push(text.trim())
    } else if (el.type === 'table' && el.data) {
      for (const row of el.data) {
        const rowText = row.map(cell => (cell.text || '').trim()).filter(Boolean).join('\t')
        if (rowText) parts.push(rowText)
      }
    }
  }
  return parts.join('\n')
}

function selectSlide(idx) {
  exitEditing()
  selectedElement.value = null
  activeSlideIdx.value = idx
  // Emit slide content for AI context (always, even same slide)
  const text = getSlideTextContent(idx)
  emit('slide-selected', {
    slideIndex: idx,
    slideNumber: idx + 1,
    totalSlides: slides.value.length,
    text,
    fileName: props.filePath?.split(/[/\\]/).pop() || 'presentation.pptx',
    filePath: props.filePath || '',
  })
}

function addSlide() {
  slides.value.push({
    fill: { type: 'color', value: '#ffffff' },
    elements: [],
    layoutElements: [],
    note: '',
  })
  activeSlideIdx.value = slides.value.length - 1
}

function duplicateSlide(idx) {
  slideCtx.value.visible = false
  const copy = JSON.parse(JSON.stringify(slides.value[idx]))
  slides.value.splice(idx + 1, 0, copy)
  activeSlideIdx.value = idx + 1
}

function deleteSlide(idx) {
  slideCtx.value.visible = false
  if (slides.value.length <= 1) return
  slides.value.splice(idx, 1)
  if (activeSlideIdx.value >= slides.value.length) {
    activeSlideIdx.value = slides.value.length - 1
  }
}

// ── Element styling ──
function elementStyle(el, scale) {
  const s = {
    position: 'absolute',
    left: (el.left * scale) + 'px',
    top: (el.top * scale) + 'px',
    width: (el.width * scale) + 'px',
    height: (el.height * scale) + 'px',
    overflow: 'hidden',
  }
  if (el.rotate) s.transform = `rotate(${el.rotate}deg)`
  if (el.isFlipH) s.transform = (s.transform || '') + ' scaleX(-1)'
  if (el.isFlipV) s.transform = (s.transform || '') + ' scaleY(-1)'

  if (el.type === 'shape' && el.fill) {
    if (el.fill.type === 'color' && el.fill.value) s.background = el.fill.value
    else if (el.fill.type === 'gradient' && el.fill.value) {
      const g = el.fill.value
      s.background = `linear-gradient(${g.rot || 0}deg, ${g.colors.map(c => `${c.color} ${c.pos}`).join(', ')})`
    }
  }
  if (el.borderWidth && el.borderColor) {
    s.border = `${el.borderWidth * scale}px ${el.borderType || 'solid'} ${el.borderColor}`
  }
  return s
}

function elementContentStyle(el) {
  const s = { width: '100%', height: '100%', overflow: 'hidden', outline: 'none' }
  if (el.vAlign === 'center' || el.vAlign === 'mid') {
    s.display = 'flex'; s.alignItems = 'center'; s.flexDirection = 'column'; s.justifyContent = 'center'
  } else if (el.vAlign === 'bottom') {
    s.display = 'flex'; s.alignItems = 'flex-end'; s.flexDirection = 'column'; s.justifyContent = 'flex-end'
  }
  return s
}

function thumbInnerStyle(slide) {
  const s = {
    width: slideSize.value.width + 'px',
    height: slideSize.value.height + 'px',
    transform: `scale(${thumbScale.value})`,
    transformOrigin: 'top left',
    position: 'absolute',
    top: '0', left: '0',
    overflow: 'hidden',
  }
  const bg = slideBgColor(slide)
  if (bg) s.background = bg
  return s
}

function slideBgColor(slide) {
  if (!slide?.fill) return '#ffffff'
  if (slide.fill.type === 'color') return slide.fill.value || '#ffffff'
  if (slide.fill.type === 'gradient' && slide.fill.value) {
    const g = slide.fill.value
    return `linear-gradient(${g.rot || 0}deg, ${g.colors.map(c => `${c.color} ${c.pos}`).join(', ')})`
  }
  if (slide.fill.type === 'image' && slide.fill.value?.picBase64) {
    return `url(data:image/png;base64,${slide.fill.value.picBase64}) center/cover`
  }
  return '#ffffff'
}

function slideBgStyle(slide) {
  return { position: 'absolute', inset: 0, background: slideBgColor(slide), zIndex: 0 }
}

// ── Selection & Editing ──
function onCanvasMouseDown(e) {
  if (e.target === slideCanvasRef.value || e.target.classList.contains('slide-bg')) {
    exitEditing()
    selectedElement.value = null
  }
}

function onElementMouseDown(e, el) {
  if (editingElement.value === el) return
  if (editingElement.value && editingElement.value !== el) exitEditing()
  selectedElement.value = el
  startDrag(e, el)
}

function onElementDblClick(el) {
  if (el.type === 'text' || el.type === 'shape') editingElement.value = el
}

function exitEditing() { editingElement.value = null }

function triggerPptxAiEdit(e) {
  const sel = window.getSelection()
  if (!sel || sel.isCollapsed) return
  const text = sel.toString().trim()
  if (!text) return

  e.preventDefault()
  e.stopPropagation()

  const range = sel.getRangeAt(0)
  const rect = range.getBoundingClientRect()
  const top = Math.min(rect.bottom + 8, window.innerHeight - 320)
  const left = Math.max(16, Math.min(rect.left, window.innerWidth - 520))

  const el = editingElement.value

  emit('ai-edit', {
    selectedText: text,
    position: { top, left },
    fileContext: {
      fileName: props.filePath.split(/[/\\]/).pop() || 'presentation.pptx',
      filePath: props.filePath,
      language: 'rich-text',
    },
    replaceCallback: (newText) => {
      // Replace the selected text within the contenteditable
      try {
        sel.removeAllRanges()
        sel.addRange(range)
        document.execCommand('insertText', false, newText)
      } catch {
        range.deleteContents()
        range.insertNode(document.createTextNode(newText))
      }
      // Sync back: the contenteditable's innerHTML → el.content
      const ceDiv = range.startContainer?.closest?.('.el-content') || range.startContainer?.parentElement?.closest?.('.el-content')
      if (ceDiv) el.content = ceDiv.innerHTML
    },
  })
}

function onContentInput(e, el) { el.content = e.target.innerHTML }
function onContentBlur(el) { if (editingElement.value === el) exitEditing() }

// ── Clipboard ──
function copyElement() {
  if (!selectedElement.value) return
  clipboard.value = JSON.parse(JSON.stringify(selectedElement.value))
}
function cutElement() {
  copyElement()
  deleteSelected()
}
function pasteElement() {
  if (!clipboard.value || !activeSlide.value) return
  const el = JSON.parse(JSON.stringify(clipboard.value))
  el.left += 20
  el.top += 20
  el.name = (el.name || el.type) + '_' + Date.now()
  activeSlide.value.elements.push(el)
  selectedElement.value = el
}
function duplicateElement() {
  if (!selectedElement.value || !activeSlide.value) return
  const el = JSON.parse(JSON.stringify(selectedElement.value))
  el.left += 20
  el.top += 20
  el.name = (el.name || el.type) + '_' + Date.now()
  activeSlide.value.elements.push(el)
  selectedElement.value = el
}

// ── Z-order ──
function _elArray() {
  return activeSlide.value?.elements || []
}
function _elIdx(el) {
  return _elArray().indexOf(el)
}
function bringToFront() {
  const arr = _elArray(); const i = _elIdx(selectedElement.value)
  if (i < 0 || i === arr.length - 1) return
  arr.splice(i, 1); arr.push(selectedElement.value)
}
function sendToBack() {
  const arr = _elArray(); const i = _elIdx(selectedElement.value)
  if (i <= 0) return
  arr.splice(i, 1); arr.unshift(selectedElement.value)
}
function bringForward() {
  const arr = _elArray(); const i = _elIdx(selectedElement.value)
  if (i < 0 || i === arr.length - 1) return
  arr.splice(i, 1); arr.splice(i + 1, 0, selectedElement.value)
}
function sendBackward() {
  const arr = _elArray(); const i = _elIdx(selectedElement.value)
  if (i <= 0) return
  arr.splice(i, 1); arr.splice(i - 1, 0, selectedElement.value)
}

// ── Select all ──
function selectAll() {
  // Select last element (multi-select not supported yet, but this clears focus to the slide)
  if (!activeSlide.value) return
  const els = activeSlide.value.elements
  if (els.length) selectedElement.value = els[els.length - 1]
}

// ── Format helpers ──
function setFillColor(color) {
  const el = selectedShapeOrText.value
  if (!el) return
  if (!el.fill) el.fill = { type: 'color', value: color }
  else { el.fill.type = 'color'; el.fill.value = color }
}
function setBorderColor(color) {
  const el = selectedShapeOrText.value
  if (!el) return
  el.borderColor = color
  if (!el.borderWidth) el.borderWidth = 2
}
function setSlideBg(color) {
  if (!activeSlide.value) return
  activeSlide.value.fill = { type: 'color', value: color }
}

// ── Drag to move ──
let dragState = null
function startDrag(e, el) {
  if (editingElement.value === el) return
  dragState = { el, startX: e.clientX, startY: e.clientY, origLeft: el.left, origTop: el.top }
  document.addEventListener('mousemove', onDragMove)
  document.addEventListener('mouseup', onDragEnd)
}
function onDragMove(e) {
  if (!dragState) return
  dragState.el.left = Math.round(dragState.origLeft + (e.clientX - dragState.startX) / canvasScale.value)
  dragState.el.top = Math.round(dragState.origTop + (e.clientY - dragState.startY) / canvasScale.value)
}
function onDragEnd() {
  dragState = null
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
}

// ── Resize ──
let resizeState = null
function onResizeStart(e, el, handle) {
  resizeState = { el, handle, startX: e.clientX, startY: e.clientY, origLeft: el.left, origTop: el.top, origWidth: el.width, origHeight: el.height }
  document.addEventListener('mousemove', onResizeMove)
  document.addEventListener('mouseup', onResizeEnd)
}
function onResizeMove(e) {
  if (!resizeState) return
  const s = resizeState
  const dx = (e.clientX - s.startX) / canvasScale.value
  const dy = (e.clientY - s.startY) / canvasScale.value
  const h = s.handle
  if (h.includes('e')) s.el.width = Math.max(20, s.origWidth + dx)
  if (h.includes('w')) { const nw = Math.max(20, s.origWidth - dx); s.el.left = s.origLeft + (s.origWidth - nw); s.el.width = nw }
  if (h.includes('s')) s.el.height = Math.max(20, s.origHeight + dy)
  if (h.includes('n')) { const nh = Math.max(20, s.origHeight - dy); s.el.top = s.origTop + (s.origHeight - nh); s.el.height = nh }
}
function onResizeEnd() {
  resizeState = null
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
}

// ── Add elements ──
function addTextElement() {
  if (!activeSlide.value) return
  activeSlide.value.elements.push({
    type: 'text', left: slideSize.value.width / 4, top: slideSize.value.height / 3,
    width: slideSize.value.width / 2, height: 60,
    content: '<p style="text-align:center;">New text</p>',
    borderColor: '', borderWidth: 0, borderType: 'solid', borderStrokeDasharray: '',
    fill: { type: 'color', value: '' },
    isFlipV: false, isFlipH: false, isVertical: false, rotate: 0,
    vAlign: 'center', name: 'Text ' + Date.now(), order: activeSlide.value.elements.length,
  })
}
function addShape(shapType) {
  if (!activeSlide.value) return
  const borderRadius = shapType === 'roundRect' ? '12px' : shapType === 'ellipse' ? '50%' : '0'
  activeSlide.value.elements.push({
    type: 'shape', left: slideSize.value.width / 4, top: slideSize.value.height / 4,
    width: slideSize.value.width / 4, height: shapType === 'line' ? 4 : slideSize.value.height / 4,
    content: '', borderColor: '#1A1A1A', borderWidth: 2, borderType: 'solid', borderStrokeDasharray: '',
    fill: { type: 'color', value: shapType === 'line' ? '#1A1A1A' : '#E5E5EA' },
    isFlipV: false, isFlipH: false, rotate: 0, vAlign: 'center',
    shapType, name: shapType + ' ' + Date.now(), order: activeSlide.value.elements.length,
  })
}
// Legacy compat
function addShapeElement() { addShape('rect') }

function pickImage() {
  imageInputRef.value?.click()
}

function onImagePicked(e) {
  const file = e.target.files?.[0]
  if (!file || !activeSlide.value) return
  const reader = new FileReader()
  reader.onload = () => {
    const dataUri = reader.result
    // Create an Image to get natural dimensions
    const img = new Image()
    img.onload = () => {
      let w = img.naturalWidth
      let h = img.naturalHeight
      // Scale down to fit within 60% of slide
      const maxW = slideSize.value.width * 0.6
      const maxH = slideSize.value.height * 0.6
      if (w > maxW || h > maxH) {
        const ratio = Math.min(maxW / w, maxH / h)
        w = Math.round(w * ratio)
        h = Math.round(h * ratio)
      }
      activeSlide.value.elements.push({
        type: 'image',
        left: Math.round((slideSize.value.width - w) / 2),
        top: Math.round((slideSize.value.height - h) / 2),
        width: w,
        height: h,
        src: dataUri,
        rotate: 0,
        isFlipH: false,
        isFlipV: false,
        order: activeSlide.value.elements.length,
        geom: 'rect',
        borderColor: '',
        borderWidth: 0,
        borderType: 'solid',
        borderStrokeDasharray: '',
      })
    }
    img.src = dataUri
  }
  reader.readAsDataURL(file)
  // Reset input so the same file can be picked again
  e.target.value = ''
}

function deleteSelected() {
  if (!selectedElement.value || !activeSlide.value) return
  const el = selectedElement.value
  let idx = activeSlide.value.elements.indexOf(el)
  if (idx !== -1) activeSlide.value.elements.splice(idx, 1)
  else { idx = (activeSlide.value.layoutElements || []).indexOf(el); if (idx !== -1) activeSlide.value.layoutElements.splice(idx, 1) }
  selectedElement.value = null
  editingElement.value = null
}

// ── Save / Export ──
async function savePresentation() {
  saving.value = true
  try {
    const PptxGenJS = (await import('pptxgenjs')).default
    const pptx = new PptxGenJS()
    const wInch = slideSize.value.width / 96
    const hInch = slideSize.value.height / 96
    pptx.defineLayout({ name: 'CUSTOM', width: wInch, height: hInch })
    pptx.layout = 'CUSTOM'

    for (const slide of slides.value) {
      const s = pptx.addSlide()
      if (slide.fill?.type === 'color' && slide.fill.value) s.background = { color: slide.fill.value.replace('#', '') }

      const allEls = [...(slide.layoutElements || []), ...(slide.elements || [])]
      for (const el of allEls) {
        const pos = { x: el.left / 96, y: el.top / 96, w: el.width / 96, h: el.height / 96 }
        if (el.rotate) pos.rotate = el.rotate

        if (el.type === 'text') {
          const t = stripHtml(el.content) || ' '
          const opts = { ...pos, fontSize: 14, wrap: true }
          if (el.fill?.type === 'color' && el.fill.value) opts.fill = { color: el.fill.value.replace('#', '') }
          if (el.borderWidth && el.borderColor) opts.line = { color: el.borderColor.replace('#', ''), width: el.borderWidth }
          s.addText(t, opts)
        } else if (el.type === 'shape') {
          const t = stripHtml(el.content) || ''
          const opts = { ...pos, fontSize: 14 }
          if (el.fill?.type === 'color' && el.fill.value) opts.fill = { color: el.fill.value.replace('#', '') }
          if (el.borderWidth && el.borderColor) opts.line = { color: el.borderColor.replace('#', ''), width: el.borderWidth }
          if (t) s.addText(t, { ...opts, shape: pptx.ShapeType.rect })
          else s.addShape(pptx.ShapeType.rect, opts)
        } else if (el.type === 'image' && el.src) {
          try { s.addImage({ data: el.src, ...pos }) } catch { /* skip */ }
        } else if (el.type === 'table' && el.data) {
          const rows = el.data.map(row => row.map(cell => ({
            text: stripHtml(cell.text) || '',
            options: {
              fill: cell.fillColor ? { color: cell.fillColor.replace('#', '') } : undefined,
              color: cell.fontColor ? cell.fontColor.replace('#', '') : undefined,
              bold: cell.fontBold || false,
            }
          })))
          s.addTable(rows, { ...pos, border: { pt: 1, color: 'CCCCCC' } })
        }
      }
      if (slide.note) s.addNotes(slide.note)
    }

    const out = await pptx.write({ outputType: 'base64' })
    emit('save', out)
  } catch (err) {
    console.error('PPTX save error:', err)
  } finally {
    saving.value = false
  }
}

function stripHtml(html) {
  if (!html) return ''
  const div = document.createElement('div')
  div.innerHTML = html
  return div.textContent || div.innerText || ''
}

// ── Keyboard shortcuts ──
function onKeyDown(e) {
  // When editing text, allow Ctrl+K for AI edit + Escape to exit
  if (editingElement.value) {
    if (e.key === 'Escape') exitEditing()
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      triggerPptxAiEdit(e)
    }
    return
  }

  const ctrl = e.ctrlKey || e.metaKey

  if ((e.key === 'Delete' || e.key === 'Backspace') && selectedElement.value) {
    e.preventDefault(); deleteSelected()
  }
  if (e.key === 'Escape') { selectedElement.value = null; activeTab.value = '' }

  // Ctrl shortcuts
  if (ctrl && e.key === 'c') { e.preventDefault(); copyElement() }
  if (ctrl && e.key === 'x') { e.preventDefault(); cutElement() }
  if (ctrl && e.key === 'v') { e.preventDefault(); pasteElement() }
  if (ctrl && e.key === 'd') { e.preventDefault(); duplicateElement() }
  if (ctrl && e.key === 'a') { e.preventDefault(); selectAll() }
  if (ctrl && e.key === 's') { e.preventDefault(); savePresentation() }
  if (ctrl && e.key === '=') { e.preventDefault(); zoomIn() }
  if (ctrl && e.key === '-') { e.preventDefault(); zoomOut() }
  if (ctrl && e.key === '0') { e.preventDefault(); zoomFit() }
}

// ── Lifecycle ──
let resizeObserver = null

onMounted(async () => {
  document.addEventListener('keydown', onKeyDown)
  resizeObserver = new ResizeObserver(updateCanvasScale)
  if (canvasAreaRef.value) resizeObserver.observe(canvasAreaRef.value)
  await parsePptx()
})

onBeforeUnmount(() => {
  document.removeEventListener('keydown', onKeyDown)
  if (resizeObserver) resizeObserver.disconnect()
  document.removeEventListener('mousemove', onDragMove)
  document.removeEventListener('mouseup', onDragEnd)
  document.removeEventListener('mousemove', onResizeMove)
  document.removeEventListener('mouseup', onResizeEnd)
})

watch(() => props.base64, () => { parsePptx() })

// ── Search / Replace ──
function performSearchReplace(query, replacement, { matchCase = false, wholeWord = false, replaceAll = false } = {}) {
  if (!query) return { matchCount: 0, replaced: 0 }
  const flags = matchCase ? 'g' : 'gi'
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped
  let matchCount = 0
  let replaced = 0
  for (const slide of slides.value) {
    for (const el of (slide.elements || [])) {
      if (el.type !== 'text' && el.type !== 'shape') continue
      const plain = stripHtml(el.content || '')
      const re = new RegExp(pattern, flags)
      const countMatches = plain.match(re)
      if (countMatches) matchCount += countMatches.length
      if (replacement !== null && (replaceAll || countMatches)) {
        // Replace in the raw HTML content (replace visible text only)
        const htmlRe = new RegExp(pattern, flags)
        el.content = el.content.replace(htmlRe, replacement)
        replaced += countMatches?.length || 0
      }
    }
  }
  return { matchCount, replaced }
}

function countMatches(query, { matchCase = false, wholeWord = false } = {}) {
  if (!query) return 0
  const flags = matchCase ? 'g' : 'gi'
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = wholeWord ? `\\b${escaped}\\b` : escaped
  const re = new RegExp(pattern, flags)
  let count = 0
  for (const slide of slides.value) {
    for (const el of allSlideElements(slide)) {
      if (el.type !== 'text' && el.type !== 'shape') continue
      const plain = stripHtml(el.content || '')
      const m = plain.match(re)
      if (m) count += m.length
    }
  }
  return count
}

defineExpose({ getSlideTextContent, getAllSlidesText, performSearchReplace, countMatches })
</script>

<style scoped>
.pptx-editor {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
  background: #F2F2F7;
}

/* ══════════ MENUBAR ══════════ */
.pptx-menubar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  background: #fff;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
  padding: 0 0.5rem;
  height: 2rem;
}
.menu-tabs {
  display: flex;
  gap: 0;
}
.menu-tab {
  padding: 0.25rem 0.75rem;
  border: none;
  background: none;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  border-bottom: 2px solid transparent;
  transition: all 0.12s;
}
.menu-tab:hover {
  color: #1A1A1A;
  background: #F5F5F5;
}
.menu-tab.active {
  color: #1A1A1A;
  font-weight: 600;
  border-bottom-color: #1A1A1A;
}
.menu-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}
.save-indicator {
  display: flex;
  align-items: center;
  gap: 0.25rem;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #007AFF;
}
.slide-counter {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #9CA3AF;
}

/* ══════════ RIBBON ══════════ */
.pptx-ribbon {
  display: flex;
  align-items: flex-end;
  gap: 0;
  padding: 0.375rem 0.75rem;
  background: #FAFAFA;
  border-bottom: 1px solid #E5E5EA;
  flex-shrink: 0;
  min-height: 3rem;
  overflow-x: auto;
  
}
.pptx-ribbon::-webkit-scrollbar { display: none; }
.ribbon-group {
  display: flex;
  flex-direction: column;
  gap: 0.125rem;
  padding: 0 0.5rem;
}
.ribbon-label {
  font-family: 'Inter', sans-serif;
  font-size: 9px;
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: #9CA3AF;
  padding-left: 0.125rem;
}
.ribbon-row {
  display: flex;
  align-items: center;
  gap: 0.125rem;
}
.ribbon-sep {
  width: 1px;
  height: 2.25rem;
  background: #E5E5EA;
  margin: 0 0.25rem;
  flex-shrink: 0;
}
.ribbon-btn {
  display: flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.3rem 0.5rem;
  border: 1px solid transparent;
  border-radius: 0.375rem;
  background: none;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 500;
  color: #4B5563;
  cursor: pointer;
  transition: all 0.12s;
  white-space: nowrap;
}
.ribbon-btn:hover:not(:disabled) {
  background: #fff;
  border-color: #E5E5EA;
  color: #1A1A1A;
  box-shadow: 0 1px 3px rgba(0,0,0,0.06);
}
.ribbon-btn:disabled, .ribbon-btn.disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
.ribbon-btn.danger-text:hover:not(:disabled) {
  color: #EF4444;
  background: rgba(239,68,68,0.06);
  border-color: rgba(239,68,68,0.2);
}
.zoom-label {
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-small);
  color: #6B7280;
  min-width: 3rem;
  text-align: center;
}
.color-swatch-wrap {
  position: relative;
  cursor: pointer;
}
.color-swatch {
  display: inline-block;
  width: 14px;
  height: 14px;
  border-radius: 3px;
  border: 1px solid rgba(0,0,0,0.15);
  flex-shrink: 0;
}
.hidden-color {
  position: absolute;
  opacity: 0;
  width: 0;
  height: 0;
  pointer-events: none;
}
/* Make the label clickable to open color picker */
.color-swatch-wrap input[type="color"] {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
  width: 100%;
  height: 100%;
  pointer-events: auto;
}

/* ══════════ BODY ══════════ */
.pptx-body {
  display: flex;
  flex: 1;
  overflow: hidden;
}

/* ── Slide sidebar ── */
.slide-sidebar {
  width: 180px;
  min-width: 180px;
  background: #fff;
  border-right: 1px solid #E5E5EA;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.slide-list {
  flex: 1;
  overflow-y: auto;
  padding: 0.5rem;
  
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}
.slide-thumb-wrap {
  display: flex;
  align-items: flex-start;
  gap: 0.375rem;
  padding: 0.25rem;
  border-radius: 0.375rem;
  cursor: pointer;
  transition: background 0.15s;
}
.slide-thumb-wrap:hover { background: #F5F5F5; }
.slide-thumb-wrap.active { background: rgba(0,122,255,0.08); }
.slide-thumb-wrap.active .slide-thumb {
  border-color: #007AFF;
  box-shadow: 0 0 0 2px rgba(0,122,255,0.2);
}
.slide-num {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  color: #9CA3AF;
  min-width: 1rem;
  text-align: right;
  padding-top: 0.125rem;
}
.slide-thumb { flex: 1; }
.slide-thumb-inner { pointer-events: none; }
.thumb-element { pointer-events: none; }
.thumb-text { overflow: hidden; line-height: 1.2; word-break: break-word; }
.thumb-img { width: 100%; height: 100%; object-fit: contain; }
.add-slide-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.375rem;
  padding: 0.625rem;
  background: none;
  border: none;
  border-top: 1px solid #E5E5EA;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  font-weight: 500;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.15s;
}
.add-slide-btn:hover { background: #F5F5F5; color: #1A1A1A; }

/* ── Canvas area ── */
.canvas-area {
  flex: 1;
  display: flex;
  align-items: center;
  justify-content: center;
  overflow: hidden;
  position: relative;
}
.canvas-wrapper {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.5rem;
}
.slide-canvas { user-select: none; }
.slide-bg { pointer-events: none; }
.canvas-info {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #9CA3AF;
  text-align: center;
}

/* ── Empty states ── */
.pptx-empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  text-align: center;
  padding: 2rem;
  gap: 0.5rem;
}
.pptx-empty-icon {
  width: 5rem; height: 5rem; border-radius: 1rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  display: flex; align-items: center; justify-content: center; margin-bottom: 0.5rem;
}
.pptx-empty h3 { font-family: 'Inter', sans-serif; font-size: var(--fs-section); font-weight: 700; color: #1A1A1A; margin: 0; }
.pptx-empty p { font-family: 'Inter', sans-serif; font-size: var(--fs-body); color: #9CA3AF; margin: 0; line-height: 1.6; }
.pptx-empty code { background: var(--accent-light, rgba(0,122,255,0.08)); color: var(--accent, #007AFF); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-family: 'JetBrains Mono', monospace; font-size: var(--fs-caption); }

/* ── Slide elements ── */
.slide-element { cursor: move; z-index: 1; }
.slide-element.selected { outline: 2px solid #007AFF; outline-offset: -1px; z-index: 10; }
.slide-element.editing { cursor: text; outline: 2px solid #007AFF; outline-offset: -1px; z-index: 10; }
.el-content { width: 100%; height: 100%; overflow: hidden; word-break: break-word; }
.el-content.el-editing { cursor: text; background: rgba(255,255,255,0.9); }
.el-image { width: 100%; height: 100%; object-fit: contain; pointer-events: none; }
.el-table { border-collapse: collapse; table-layout: fixed; }
.el-placeholder {
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  width: 100%; height: 100%; background: rgba(0,0,0,0.03); border: 1px dashed #D1D1D6; border-radius: 4px; gap: 0.25rem;
}
.el-placeholder span { font-family: 'Inter', sans-serif; font-size: 10px; color: #9CA3AF; text-transform: capitalize; }

/* ── Resize handles ── */
.resize-handle { position: absolute; width: 8px; height: 8px; background: #fff; border: 2px solid #007AFF; border-radius: 2px; z-index: 20; }
.handle-nw { top: -4px; left: -4px; cursor: nw-resize; }
.handle-ne { top: -4px; right: -4px; cursor: ne-resize; }
.handle-sw { bottom: -4px; left: -4px; cursor: sw-resize; }
.handle-se { bottom: -4px; right: -4px; cursor: se-resize; }
.handle-n  { top: -4px; left: calc(50% - 4px); cursor: n-resize; }
.handle-s  { bottom: -4px; left: calc(50% - 4px); cursor: s-resize; }
.handle-e  { top: calc(50% - 4px); right: -4px; cursor: e-resize; }
.handle-w  { top: calc(50% - 4px); left: -4px; cursor: w-resize; }

.animate-spin { animation: spin 1s linear infinite; }
@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
</style>

<!-- Context menus are teleported outside the scoped component — need unscoped styles -->
<style>
.pptx-ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}
.pptx-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #fff;
  border: 1px solid #E5E5EA;
  border-radius: 0.5rem;
  box-shadow: 0 12px 40px rgba(0,0,0,0.14), 0 4px 12px rgba(0,0,0,0.06);
  padding: 0.25rem;
  min-width: 180px;
  font-family: 'Inter', sans-serif;
}
.pptx-ctx-menu .ctx-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  width: 100%;
  padding: 0.4rem 0.75rem;
  border: none;
  background: none;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-caption);
  color: #1A1A1A;
  cursor: pointer;
  border-radius: 0.375rem;
  transition: background 0.1s;
}
.pptx-ctx-menu .ctx-item:hover { background: #F5F5F5; }
.pptx-ctx-menu .ctx-item.danger { color: #1A1A1A; }
.pptx-ctx-menu .ctx-item.danger:hover { background: rgba(239,68,68,0.08); color: #EF4444; }
.pptx-ctx-menu .ctx-item:disabled { opacity: 0.35; cursor: not-allowed; }
.pptx-ctx-menu .ctx-shortcut {
  margin-left: auto;
  font-size: 10px;
  color: #9CA3AF;
  font-family: 'Inter', sans-serif;
}
.pptx-ctx-menu .ctx-divider {
  height: 1px;
  background: #E5E5EA;
  margin: 0.25rem 0.5rem;
}
</style>
