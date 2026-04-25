<template>
  <div class="h-full flex flex-col overflow-hidden" style="background-color: #F2F2F7;">

    <!-- ── NO VAULT SELECTED: Welcome screen ── -->
    <div v-if="!store.vaultPath" class="flex-1 flex items-center justify-center">
      <div class="text-center" style="max-width: 420px;">
        <!-- Vault icon -->
        <div
          class="mx-auto mb-5 w-20 h-20 rounded-2xl flex items-center justify-center"
          style="background: #1A1A1A;"
        >
          <svg style="width:40px;height:40px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/>
            <path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/>
          </svg>
        </div>
        <h2 style="font-family:'Inter',sans-serif; font-size:var(--fs-page-title); font-weight:700; color:#1A1A1A; margin:0 0 8px;">
          {{ t('notes.documents') }}
        </h2>
        <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF; margin:0 0 24px; line-height:1.6;">
          {{ t('notes.vaultDesc') }}
        </p>
        <AppButton size="compact" style="margin: 0 auto; width: fit-content;" @click="store.pickVault()">
          <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
          </svg>
          {{ t('notes.browseFolder') }}
        </AppButton>
      </div>
    </div>

    <!-- ── VAULT LOADED: File tree + Editor ── -->
    <template v-else>
      <!-- Header bar -->
      <div class="docs-catalog-header">
        <div style="display:flex; align-items:center; justify-content:space-between;">
          <div>
            <h1 class="docs-catalog-title">{{ t('notes.title') }}</h1>
            <p class="docs-catalog-subtitle">{{ t('notes.filesFromVault') }}</p>
          </div>
          <div class="flex items-center gap-2">
            <AppButton size="icon" @click="refreshAll" v-tooltip="t('common.refresh')">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
            </AppButton>
            <AppButton
              v-if="store.vaultPath"
              size="icon"
              @click="openVaultInExplorer"
              v-tooltip="`${t('notes.openInExplorer')} — ${store.vaultPath}`"
              :aria-label="t('notes.openInExplorer')"
            >
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>
              </svg>
            </AppButton>
            <!-- Info icon: tells user to go to Config → AI → AiDoc to change path -->
            <div class="docs-path-info-btn" v-tooltip="t('notes.changePathHint')">
              <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            </div>
          </div>
        </div>
      </div>

      <!-- Main content: file tree + editor -->
      <div class="flex-1 flex overflow-hidden">

        <!-- ── LEFT: File Tree Panel (resizable) ── -->
        <div
          class="doc-tree-panel"
          :style="docTreeCollapsed ? { width: '0', minWidth: '0', overflow: 'hidden' } : { width: notesSidebarWidth + 'px', minWidth: '180px', maxWidth: '600px' }"
        >
          <!-- Resize handle -->
          <div
            v-if="!docTreeCollapsed"
            class="notes-resize-handle"
            @mousedown="startNotesResize"
          ></div>
          <!-- Tree toolbar -->
          <div class="px-3 py-2 flex items-center gap-1 shrink-0" style="border-bottom:1px solid #E5E5EA;">
            <span style="font-family:'Inter',sans-serif;font-size:var(--fs-caption);color:#9CA3AF;">{{ t('notes.dragDropHint') }}</span>
          </div>

          <!-- File tree (root drop zone) -->
          <div
            class="flex-1 overflow-y-auto py-1"
            style=""
            tabindex="0"
            @dragover.prevent="onRootDragOver"
            @dragleave="onRootDragLeave"
            @drop.prevent="handleRootDrop"
            @paste="handleTreePaste"
            @contextmenu.prevent="openContextMenu($event, store.vaultPath, '')"
            :class="{ 'root-drag-over': rootDragOver }"
          >
            <div v-if="store.fileTree.length === 0" class="px-4 py-8 text-center">
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#9CA3AF;">{{ t('notes.noFilesFound') }}</p>
            </div>
            <TreeNode
              v-for="(node, nodeIdx) in visibleFileTree"
              :key="node.path"
              :node="node"
              :index="nodeIdx"
              :depth="0"
              :active-path="store.activeFile?.path"
              :expanded-folders="store.expandedFolders"
              @select-file="(p, n) => store.openFile(p, n)"
              @toggle-folder="(p) => store.toggleFolder(p)"
              @delete-item="handleDeleteItem"
              @move-item="handleMoveItem"
              @copy-files="(paths, dest) => copySystemFilesToDir(paths, dest)"
              @context-menu="(e, node) => openContextMenu(e, node.path, node.type)"
            />
          </div>
        </div>

        <!-- ── RIGHT: Editor / Preview Panel ── -->
        <div class="flex-1 flex flex-col overflow-hidden" style="background:#fff;position:relative;" @mouseup="onEditorMouseUp" @mousedown="onEditorMouseDown">
          <!-- Hamburger toggle tab -->
          <button
            @click="docTreeCollapsed = !docTreeCollapsed"
            class="doc-tree-expand-tab"
            v-tooltip="docTreeCollapsed ? t('notes.expandTree') : t('notes.collapseTree')"
            :aria-label="docTreeCollapsed ? t('notes.expandTree') : t('notes.collapseTree')"
          >
            <svg style="width:14px;height:14px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
              <line x1="4" y1="6" x2="20" y2="6"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="18" x2="20" y2="18"/>
            </svg>
          </button>
          <!-- Resize blocker: covers the panel during sidebar drag so the webview doesn't swallow mousemove events -->
          <div v-if="isResizing" style="position:absolute;inset:0;z-index:50;cursor:col-resize;"></div>

          <!-- Loading file -->
          <div v-if="store.fileLoading" class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <svg class="mx-auto mb-3 animate-spin" style="width:32px;height:32px;color:#9CA3AF;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                <path d="M21 12a9 9 0 1 1-6.2-8.6"/>
              </svg>
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF;">{{ t('notes.openingFile') }}</p>
            </div>
          </div>

          <!-- File open error -->
          <div v-else-if="store.fileError" class="flex-1 flex items-center justify-center">
            <div class="text-center" style="max-width:400px;">
              <div
                class="mx-auto mb-4 flex items-center justify-center"
                style="width:56px;height:56px;border-radius:14px;background:#FEF2F2;"
              >
                <svg style="width:28px;height:28px;color:#EF4444;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                  <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                </svg>
              </div>
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-subtitle); font-weight:600; color:#1A1A1A; margin:0 0 6px;">
                {{ t('notes.unableToOpen') }}
              </p>
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-secondary); color:#6B7280; margin:0 0 16px; line-height:1.5;">
                {{ store.fileError }}
              </p>
              <button
                @click="store.fileError = ''"
                class="px-4 py-2 rounded-lg text-sm font-medium cursor-pointer transition-colors"
                style="background:#F5F5F5; border:1px solid #E5E5EA; color:#6B7280; font-family:'Inter',sans-serif;"
                @mouseenter="e => { e.currentTarget.style.background='#E5E5EA'; e.currentTarget.style.color='#1A1A1A' }"
                @mouseleave="e => { e.currentTarget.style.background='#F5F5F5'; e.currentTarget.style.color='#6B7280' }"
              >{{ t('notes.dismiss') }}</button>
            </div>
          </div>

          <!-- No file selected -->
          <div v-else-if="!store.activeFile" class="flex-1 flex items-center justify-center">
            <div class="text-center">
              <svg class="mx-auto mb-3" style="width:48px;height:48px;color:#D1D1D6;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/>
              </svg>
              <p style="font-family:'Inter',sans-serif; font-size:var(--fs-body); color:#9CA3AF;">{{ t('notes.selectFileToView') }}</p>
            </div>
          </div>

          <!-- File open -->
          <template v-else>
            <!-- File header bar -->
            <div
              class="px-4 py-2.5 shrink-0 flex items-center gap-3"
              style="border-bottom:1px solid #E5E5EA; background:#F9F9F9;"
            >
              <!-- File type icon (dynamic per extension) -->
              <component :is="fileTypeIcon(store.activeFile.name, '#9CA3AF')" />
              <span style="font-family:'Inter',sans-serif; font-size:var(--fs-body); font-weight:600; color:#1A1A1A;">
                {{ store.activeFile.name }}
              </span>

              <!-- AI Doc toggle button (in header) -->
              <button
                v-if="!isDrawio && !isImage"
                class="ai-doc-toggle-btn"
                :class="{ active: aiDocEnabled }"
                @click="toggleAiDoc"
                v-tooltip="t('notes.aiAssistant')"
                style="margin-left:0.75rem;"
              >
                <svg style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                  <path d="M12 2L9.5 9.5 2 12l7.5 2.5L12 22l2.5-7.5L22 12l-7.5-2.5z"/>
                </svg>
                {{ t('notes.aiAssistant') }}
              </button>

              <!-- Speak button (plays current document via TTS) -->
              <button
                v-if="!isDrawio && !isImage && !isPptx && !isDocx && !isXlsx"
                class="docs-speak-btn"
                :class="{ active: docSpeakingActive, loading: docSpeakLoading }"
                @click="handleDocSpeak"
                v-tooltip="docSpeakingActive || docSpeakLoading ? t('chats.stopSpeaking') : t('chats.speakMessage')"
              >
                <!-- Loading: spinner -->
                <svg v-if="docSpeakLoading" class="animate-spin" style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                  <path d="M21 12a9 9 0 1 1-6.2-8.6"/>
                </svg>
                <!-- Playing: waveform animation -->
                <svg v-else-if="docSpeakingActive" style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="4" y="8" width="3" height="8" rx="1"><animate attributeName="height" values="8;16;8" dur="0.8s" repeatCount="indefinite"/><animate attributeName="y" values="8;4;8" dur="0.8s" repeatCount="indefinite"/></rect>
                  <rect x="10.5" y="6" width="3" height="12" rx="1"><animate attributeName="height" values="12;6;12" dur="0.8s" begin="0.2s" repeatCount="indefinite"/><animate attributeName="y" values="6;9;6" dur="0.8s" begin="0.2s" repeatCount="indefinite"/></rect>
                  <rect x="17" y="8" width="3" height="8" rx="1"><animate attributeName="height" values="8;14;8" dur="0.8s" begin="0.4s" repeatCount="indefinite"/><animate attributeName="y" values="8;5;8" dur="0.4s" begin="0.4s" repeatCount="indefinite"/></rect>
                </svg>
                <!-- Idle: speaker icon -->
                <svg v-else style="width:12px;height:12px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                  <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
                  <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
                </svg>
                {{ docSpeakingActive || docSpeakLoading ? t('chats.stopSpeaking') : t('chats.speakMessage') }}
              </button>

              <div class="ml-auto flex items-center gap-2">
                <!-- Mode toggle (markdown and HTML) — iOS-style switch with state label -->
                <div v-if="isMarkdown || isHtml" class="docs-mode-switch" @click="editMode = !editMode" v-tooltip="editMode ? t('notes.switchToFormatted') : t('notes.switchToSource')">
                  <span class="docs-mode-state-label">{{ editMode ? t('notes.source') : t('notes.formatted') }}</span>
                  <div class="docs-mode-track" :class="{ on: editMode }">
                    <span class="docs-mode-thumb"></span>
                  </div>
                </div>

                <!-- Open with external app -->
                <button
                  v-if="store.activeFile?.path"
                  @click="openWithExternalApp"
                  class="docs-hdr-btn"
                  v-tooltip="t('notes.openWithDefaultApp')"
                >
                  <svg style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/></svg>
                </button>

                <!-- Copy source (all text-based files) -->
                <button
                  v-if="!isDrawio && !isImage && !isPptx && !isDocx && !isXlsx"
                  @click="copySource"
                  class="docs-hdr-btn"
                  v-tooltip="t('notes.copyFileContents')"
                >
                  <svg v-if="copied" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <svg v-else style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
                </button>

                <!-- Save button -->
                <button
                  v-if="!isDrawio && !isImage"
                  class="docs-hdr-btn"
                  :class="{ 'docs-hdr-btn--ok': saveStatus === 'ok', 'docs-hdr-btn--err': saveStatus === 'error' }"
                  @click="saveFile"
                  v-tooltip="t('notes.saveFile')"
                >
                  <!-- saving spinner -->
                  <svg v-if="saveStatus === 'saving'" class="animate-spin" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M21 12a9 9 0 1 1-6.2-8.6"/></svg>
                  <!-- ok check -->
                  <svg v-else-if="saveStatus === 'ok'" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  <!-- error x -->
                  <svg v-else-if="saveStatus === 'error'" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                  <!-- default floppy -->
                  <svg v-else style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>
                </button>
              </div>
            </div>

            <!-- Editor + AI Magic Panel flex row -->
            <div class="flex-1 flex overflow-hidden">
              <!-- Editor content area -->
              <div class="flex-1 flex flex-col overflow-hidden" style="position:relative;" @contextmenu="onEditorContextMenu">
                <!-- Search / Replace bar -->
                <div
                  v-if="searchBarOpen && store.activeFile && !isDrawio && !isImage"
                  style="position:absolute;top:0.625rem;right:0.75rem;z-index:60;"
                >
                  <SearchReplaceBar
                    ref="searchBarRef"
                    :text-content="isTextFile ? editorContent : null"
                    :textarea-el="activeTextarea"
                    :file-type="searchFileType"
                    @close="searchBarOpen = false"
                    @count-request="onSearchCountRequest"
                    @find-next="onSearchFindNext"
                    @find-prev="onSearchFindPrev"
                    @replace-text="onSearchReplaceOne"
                    @replace-all-text="onSearchReplaceAll"
                  />
                </div>
                <!-- Draw.io editor panel -->
                <DrawioEditor
                  v-if="isDrawio"
                  :xml="store.activeFile.content"
                  :file-path="store.activeFile.path"
                  @save="onDrawioSave"
                  style="flex:1;overflow:hidden;"
                />

                <!-- PPTX editor -->
                <PptxEditor
                  v-else-if="isPptx && store.activeFile.binary"
                  ref="pptxEditorRef"
                  :base64="store.activeFile.base64"
                  :file-path="store.activeFile.path"
                  @save="onPptxSave"
                  @ai-edit="handleEditorAiEdit"
                  @slide-selected="handleSlideSelected"
                  style="flex:1;overflow:hidden;"
                />

                <!-- DOCX editor -->
                <DocxEditor
                  v-else-if="isDocx && store.activeFile.binary"
                  ref="docxEditorRef"
                  :base64="store.activeFile.base64"
                  :file-path="store.activeFile.path"
                  @save="onDocxSave"
                  @ai-edit="handleEditorAiEdit"
                  style="flex:1;overflow:hidden;"
                />

                <!-- XLSX editor -->
                <XlsxEditor
                  v-else-if="isXlsx && store.activeFile.binary"
                  ref="xlsxEditorRef"
                  :base64="store.activeFile.base64"
                  :file-path="store.activeFile.path"
                  @save="onXlsxSave"
                  @ai-edit="handleEditorAiEdit"
                  @sheet-changed="handleSheetChanged"
                  style="flex:1;overflow:hidden;"
                />

                <!-- Markdown: Formatted mode (editable rich preview) -->
                <div
                  v-else-if="isMarkdown && !editMode"
                  class="flex-1 overflow-y-auto py-6"
                  style=" display:flex; justify-content:center;"
                  @click="handlePreviewClick"
                >
                  <div
                    ref="formattedEl"
                    class="prose-obsidian"
                    contenteditable="true"
                    spellcheck="false"
                    v-html="formattedHtml"
                    @input="onFormattedInput"
                    @paste="onFormattedPaste"
                    @contextmenu="onEditorContextMenu"
                  />
                  <!-- Link error toast -->
                  <div
                    v-if="linkError"
                    class="fixed bottom-6 right-6 z-50 flex items-center gap-2 px-4 py-3 rounded-xl shadow-lg animate-fade-in"
                    style="background:#FEF2F2; border:1px solid #FECACA; color:#991B1B; font-size:var(--fs-secondary); max-width:480px;"
                  >
                    <svg style="width:18px;height:18px;flex-shrink:0;color:#EF4444;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                      <circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/>
                    </svg>
                    <span class="flex-1" style="word-break:break-all;">{{ linkError }}</span>
                    <button
                      @click="linkError = ''"
                      class="shrink-0 cursor-pointer"
                      style="background:none;border:none;color:#991B1B;font-size:var(--fs-body);padding:0 0 0 8px;"
                    >&times;</button>
                  </div>
                </div>

                <!-- Markdown: Source mode (raw markdown editor) -->
                <div
                  v-else-if="isMarkdown && editMode"
                  class="flex-1 overflow-y-auto"
                  style=" display:flex; justify-content:center;"
                >
                  <textarea
                    ref="sourceTextareaRef"
                    v-model="editorContent"
                    class="notes-source-editor"
                    spellcheck="false"
                    @contextmenu="onEditorContextMenu"
                  />
                </div>

                <!-- HTML: Rendered mode (embedded webview with browser toolbar) -->
                <div v-else-if="isHtml && !editMode" style="flex:1; min-height:0; display:flex; flex-direction:column; overflow:hidden; padding:0.5rem;">
                  <!-- Browser toolbar -->
                  <div class="html-wv-toolbar">
                    <button class="html-wv-btn" @click="htmlWvGoBack" :disabled="!htmlWvCanGoBack" v-tooltip="t('common.back')">
                      <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
                    </button>
                    <button class="html-wv-btn" @click="htmlWvGoForward" :disabled="!htmlWvCanGoForward" v-tooltip="t('common.forward')">
                      <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                    <button v-if="htmlWvIsLoading" class="html-wv-btn" @click="htmlWvStop" v-tooltip="t('common.stop')">
                      <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                    </button>
                    <button v-else class="html-wv-btn" @click="htmlWvReload" v-tooltip="t('common.reload')">
                      <svg style="width:15px;height:15px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10"/></svg>
                    </button>
                    <div class="html-wv-urlbar">
                      <svg class="html-wv-url-icon" style="width:13px;height:13px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
                      <input class="html-wv-url-input" :value="htmlWvCurrentUrl" @keydown.enter="htmlWvNavigate($event.target.value)" spellcheck="false" />
                      <div v-if="htmlWvIsLoading" class="html-wv-url-loader"></div>
                    </div>
                  </div>
                  <webview
                    ref="htmlWebviewRef"
                    class="docs-html-preview"
                    :src="htmlFileUrl"
                    @dom-ready="onHtmlWvDomReady"
                    @did-finish-load="onHtmlWvFinishLoad"
                  ></webview>
                </div>

                <!-- HTML: Source mode (code editor) -->
                <CodeViewer
                  v-else-if="isHtml && editMode"
                  ref="codeViewerRef"
                  :content="store.activeFile.content"
                  :file-name="store.activeFile.name"
                  :theme="codeViewerTheme"
                  @update:theme="codeViewerTheme = $event"
                  @ai-edit="handleEditorAiEdit"
                  @content-change="onCodeContentChange"
                />

                <!-- Image preview -->
                <div
                  v-else-if="isImage"
                  class="flex-1 overflow-y-auto flex items-center justify-center"
                  style=" background:#F2F2F7; padding:2rem;"
                >
                  <img
                    :src="imageDataUri"
                    :alt="store.activeFile.name"
                    style="max-width:100%; max-height:100%; object-fit:contain; border-radius:var(--radius-md); box-shadow:0 2px 8px rgba(0,0,0,0.08);"
                  />
                </div>

                <!-- Code / text files -->
                <CodeViewer
                  v-else-if="isTextLike"
                  ref="codeViewerRef"
                  :content="store.activeFile.content"
                  :file-name="store.activeFile.name"
                  :theme="codeViewerTheme"
                  @update:theme="codeViewerTheme = $event"
                  @ai-edit="handleEditorAiEdit"
                  @content-change="onCodeContentChange"
                />
              </div>

            </div>
          </template>
        </div>
      </div>
    </template>

    <!-- ── Floating AI Doc Panel (only rendered by the owning instance) ── -->
    <Teleport to="body">
      <div
        v-if="isAiPanelOwner && aiDocEnabled && aiDocOpen"
        class="ai-doc-float"
        :style="{ left: aiPanel.x + 'px', top: aiPanel.y + 'px', width: aiPanel.w + 'px', height: aiPanel.h + 'px' }"
      >
        <!-- Top bar: fully draggable — buttons use @mousedown.stop individually -->
        <div class="ai-doc-float-topbar" @mousedown="startPanelDrag">
          <!-- Left: agent pill -->
          <div class="ai-doc-float-topbar-left">
            <button
              v-if="availableAgents.length > 0"
              class="aidoc-agent-pill"
              @mousedown.stop
              @click.stop="openDocAgentModal"
              @mouseenter="showAgentPillTooltip"
              @mouseleave="hideAgentPillTooltip"
            >
              <div class="aidoc-agent-pill-avatar">
                <img v-if="activeDocAgentAvatar" :src="activeDocAgentAvatar" alt="" class="aidoc-agent-pill-img" />
                <span v-else class="aidoc-agent-pill-initial">{{ (activeDocAgentName || '?').charAt(0) }}</span>
              </div>
            </button>
          </div>
          <!-- Center: grip icon -->
          <div class="ai-doc-float-drag-icon">
            <svg style="width:16px;height:16px;color:rgba(255,255,255,0.25);" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="9" cy="6"  r="1.5"/><circle cx="15" cy="6"  r="1.5"/>
              <circle cx="9" cy="12" r="1.5"/><circle cx="15" cy="12" r="1.5"/>
              <circle cx="9" cy="18" r="1.5"/><circle cx="15" cy="18" r="1.5"/>
            </svg>
          </div>
          <!-- Right: perm + close -->
          <div class="ai-doc-float-topbar-right">
            <button class="aidoc-topbar-btn" :class="{ 'aidoc-topbar-btn--warn': aiDocPermissionMode !== 'allow_all' }" @mousedown.stop @click.stop="showDocPermModal = true" v-tooltip="t('notes.permissionSettings')">
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </button>
            <button class="aidoc-topbar-btn aidoc-topbar-btn--close" @mousedown.stop @click="closeAiDoc" v-tooltip="t('notes.closeEsc')">
              <svg style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
              </svg>
            </button>
          </div>
        </div>
        <AiMagicPanel
          ref="aiMagicPanelRef"
          :panel-open="aiDocOpen"
          :streaming="aiDocStreaming"
          :selection-context="aiDocSelection"
          :messages="aiDocMessages"
          :permission-mode="aiDocPermissionMode"
          @close="closeAiDoc"
          @send="sendAiDoc"
          @stop="stopAiDoc"
          @apply="onAiDocApply"
          @revert="onAiDocRevert"
          @tool-revert="onAiDocToolRevert"
          @tool-reapply="onAiDocToolReapply"
          @permission-respond="onDocPermissionRespond"
          @clear-selection="onAiDocClearSelection"
        />
        <!-- Resize handles — all 8 edges/corners -->
        <div class="ai-doc-float-resize-r"  @mousedown="startPanelResize('r',  $event)"></div>
        <div class="ai-doc-float-resize-l"  @mousedown="startPanelResize('l',  $event)"></div>
        <div class="ai-doc-float-resize-b"  @mousedown="startPanelResize('b',  $event)"></div>
        <div class="ai-doc-float-resize-t"  @mousedown="startPanelResize('t',  $event)"></div>
        <div class="ai-doc-float-resize-br" @mousedown="startPanelResize('br', $event)"></div>
        <div class="ai-doc-float-resize-bl" @mousedown="startPanelResize('bl', $event)"></div>
        <div class="ai-doc-float-resize-tr" @mousedown="startPanelResize('tr', $event)"></div>
        <div class="ai-doc-float-resize-tl" @mousedown="startPanelResize('tl', $event)"></div>
      </div>
    </Teleport>

    <!-- ── Agent pill tooltip (fixed, escapes overflow:hidden) ── -->
    <Teleport to="body">
      <div
        v-if="isAiPanelOwner && agentPillTooltip.visible"
        class="aidoc-agent-tooltip-fixed"
        :style="{ top: agentPillTooltip.y + 'px', left: agentPillTooltip.x + 'px' }"
      >
        <span class="aidoc-agent-tooltip-name">{{ activeDocAgentName }}</span>
        <span v-if="activeDocAgent?.description" class="aidoc-agent-tooltip-desc">{{ activeDocAgent.description }}</span>
      </div>
    </Teleport>

    <!-- ── AI Doc Permission Settings Modal ── -->
    <Teleport to="body">
      <div v-if="isAiPanelOwner && showDocPermModal" class="aidoc-modal-backdrop">
        <div class="aidoc-modal aidoc-perm-modal" role="dialog" aria-modal="true">
          <div class="aidoc-modal-header">
            <div class="aidoc-modal-header-icon">
              <svg style="width:15px;height:15px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
            </div>
            <span class="aidoc-modal-title">{{ t('notes.permissionMode') }}</span>
            <button class="aidoc-modal-close" @click="showDocPermModal = false">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <div class="aidoc-perm-body">
            <button
              v-for="m in [
                { id: 'inherit', label: t('notes.permInherit'), desc: t('notes.permInheritDesc') },
                { id: 'chat_only', label: t('notes.permAskPermission'), desc: t('notes.permAskPermissionDesc') },
                { id: 'allow_all', label: t('notes.permAllowAll'), desc: t('notes.permAllowAllDesc') },
              ]"
              :key="m.id"
              class="aidoc-perm-option"
              :class="{ active: aiDocPermissionMode === m.id }"
              @click="aiDocPermissionMode = m.id; showDocPermModal = false"
            >
              <span class="aidoc-perm-option-label">{{ m.label }}</span>
              <span class="aidoc-perm-option-desc">{{ m.desc }}</span>
              <svg v-if="aiDocPermissionMode === m.id" style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
            </button>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── AI Doc Agent Selection Modal ── -->
    <Teleport to="body">
      <div v-if="isAiPanelOwner && showDocAgentModal" class="aidoc-modal-backdrop">
        <div class="aidoc-modal" role="dialog" aria-modal="true">
          <div class="aidoc-modal-header">
            <div class="aidoc-modal-header-icon">
              <svg style="width:15px;height:15px;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            </div>
            <span class="aidoc-modal-title">{{ t('notes.selectAgent') }}</span>
            <button class="aidoc-modal-close" @click="showDocAgentModal = false">
              <svg style="width:16px;height:16px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
            </button>
          </div>
          <!-- Search -->
          <div class="ch-modal-search">
            <svg style="width:14px;height:14px;flex-shrink:0;color:#6B7280;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
            <input ref="docAgentSearchEl" v-model="docAgentSearchQuery" type="text" :placeholder="t('notes.searchAgents')" class="ch-modal-search-input" />
          </div>
          <div class="aidoc-modal-body">
            <!-- Flat search results -->
            <template v-if="docAgentSearchQuery.trim()">
              <button
                v-for="p in filteredDocAgents" :key="p.id"
                class="ch-modal-item" :class="{ selected: p.id === selectedAgentId }"
                @click="selectDocAgent(p.id)"
              >
                <div class="ch-modal-item-avatar">
                  <img v-if="getDocAgentAvatar(p)" :src="getDocAgentAvatar(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                  <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                </div>
                <div class="ch-modal-item-text">
                  <span class="ch-modal-item-name">{{ p.name }}</span>
                  <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                </div>
                <svg v-if="p.id === selectedAgentId" style="width:16px;height:16px;flex-shrink:0;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
              </button>
              <div v-if="filteredDocAgents.length === 0" class="ch-modal-empty">{{ t('notes.noAgentsMatch') }}</div>
            </template>
            <!-- Category tree -->
            <template v-else>
              <div v-for="cat in agentsStore.systemCategories" :key="cat.id" class="ch-cat-section">
                <button class="ch-cat-header" @click="toggleDocCat(cat.id)">
                  <svg class="ch-cat-chevron" :class="{ expanded: expandedDocCatIds.has(cat.id) }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                  <span v-if="cat.emoji" class="ch-cat-emoji">{{ cat.emoji }}</span>
                  <span class="ch-cat-name">{{ cat.name }}</span>
                  <span class="ch-cat-count">{{ agentsStore.agentsInCategory(cat.id).length }}</span>
                </button>
                <div v-if="expandedDocCatIds.has(cat.id)" class="ch-cat-items">
                  <button
                    v-for="p in agentsStore.agentsInCategory(cat.id)" :key="p.id"
                    class="ch-modal-item" :class="{ selected: p.id === selectedAgentId }"
                    @click="selectDocAgent(p.id)"
                  >
                    <div class="ch-modal-item-avatar">
                      <img v-if="getDocAgentAvatar(p)" :src="getDocAgentAvatar(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                      <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                    </div>
                    <div class="ch-modal-item-text">
                      <span class="ch-modal-item-name">{{ p.name }}</span>
                      <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                    </div>
                    <svg v-if="p.id === selectedAgentId" style="width:16px;height:16px;flex-shrink:0;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                  <div v-if="agentsStore.agentsInCategory(cat.id).length === 0" class="ch-cat-empty">{{ t('notes.noAgents') }}</div>
                </div>
              </div>
              <!-- All section -->
              <div class="ch-cat-section">
                <button class="ch-cat-header" @click="toggleDocCat('__all__')">
                  <svg class="ch-cat-chevron" :class="{ expanded: expandedDocCatIds.has('__all__') }" style="width:12px;height:12px;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
                  <span class="ch-cat-name">{{ t('notes.all') }}</span>
                  <span class="ch-cat-count">{{ sortedDocAgents.length }}</span>
                </button>
                <div v-if="expandedDocCatIds.has('__all__')" class="ch-cat-items">
                  <button
                    v-for="p in sortedDocAgents" :key="p.id"
                    class="ch-modal-item" :class="{ selected: p.id === selectedAgentId }"
                    @click="selectDocAgent(p.id)"
                  >
                    <div class="ch-modal-item-avatar">
                      <img v-if="getDocAgentAvatar(p)" :src="getDocAgentAvatar(p)" alt="" style="width:40px;height:40px;border-radius:50%;object-fit:cover;" />
                      <span v-else class="ch-modal-avatar-fallback">{{ p.name.charAt(0) }}</span>
                    </div>
                    <div class="ch-modal-item-text">
                      <span class="ch-modal-item-name">{{ p.name }}</span>
                      <span v-if="p.description" class="ch-modal-item-desc">{{ p.description }}</span>
                    </div>
                    <svg v-if="p.id === selectedAgentId" style="width:16px;height:16px;flex-shrink:0;color:#fff;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>
                  </button>
                </div>
              </div>
            </template>
          </div>
        </div>
      </div>
    </Teleport>

    <!-- ── Context Menu ── -->
    <Teleport to="body">
      <!-- Overlay to capture outside clicks -->
      <div v-if="ctxMenu.visible" class="notes-ctx-overlay" @click="closeContextMenu" @contextmenu.prevent="closeContextMenu" />

      <!-- Context menu -->
      <div
        v-if="ctxMenu.visible"
        class="notes-ctx-menu"
        :style="{ top: ctxMenu.y + 'px', left: ctxMenu.x + 'px' }"
        @click.stop
      >
        <!-- Create options: shown for dirs and background (no target) -->
        <template v-if="ctxMenu.targetType !== 'file'">
          <button class="ctx-item" @click="startCtxAction('newFile', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="12" y1="18" x2="12" y2="12"/><line x1="9" y1="15" x2="15" y2="15"/></svg>
            {{ t('notes.newMarkdown') }}
          </button>
          <button class="ctx-item" @click="startCtxAction('newDocx', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="#2B5797" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13l1.5 5 2-4 2 4L15 13"/></svg>
            {{ t('notes.newDocument') }}
          </button>
          <button class="ctx-item" @click="startCtxAction('newXlsx', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="#217346" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><path d="M8 13h8M8 17h8M8 13v4M12 13v4M16 13v4"/></svg>
            {{ t('notes.newSpreadsheet') }}
          </button>
          <button class="ctx-item" @click="startCtxAction('newDiagram', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>
            {{ t('notes.newDiagram') }}
          </button>
          <button class="ctx-item" @click="startCtxAction('newFolder', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            {{ t('notes.newFolder') }}
          </button>
          <div v-if="ctxMenu.targetType === 'dir'" class="ctx-divider" />
        </template>

        <!-- Item actions: shown when a specific file or folder is right-clicked -->
        <template v-if="ctxMenu.targetType">
          <button class="ctx-item" @click="copyPathFromCtx(ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
            {{ ctxPathCopied ? t('notes.copied') : t('notes.copyPath') }}
          </button>
          <button class="ctx-item" @click="revealInExplorer(ctxMenu.targetPath); closeContextMenu()">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
            {{ t('notes.openInExplorer') }}
          </button>
          <button class="ctx-item" @click="startCtxAction('rename', ctxMenu.targetPath)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
            {{ t('notes.rename') }}
          </button>
          <div class="ctx-divider" />
          <button class="ctx-item ctx-danger" @click="startCtxDelete(ctxMenu.targetPath, ctxMenu.targetType)">
            <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>
            {{ t('notes.delete') }}
          </button>
        </template>
      </div>

      <!-- New item / Rename dialog -->
      <div
        v-if="ctxAction.visible"
        class="notes-ctx-dialog"
        :style="{ top: ctxAction.y + 'px', left: ctxAction.x + 'px', width: ctxDialogWidth + 'px' }"
        @click.stop
        @keydown.escape="cancelCtxAction"
      >
        <div class="ctx-dialog-title">{{ ctxActionLabel }}</div>
        <input
          ref="ctxInputRef"
          v-model="ctxInputValue"
          class="ctx-dialog-input"
          :placeholder="ctxActionPlaceholder"
          @keydown.enter="commitCtxAction"
          @keydown.escape="cancelCtxAction"
        />
        <div class="ctx-dialog-footer">
          <button class="ctx-dialog-cancel" @click="cancelCtxAction">{{ t('notes.cancel') }}</button>
          <button class="ctx-dialog-confirm" @click="commitCtxAction">
            {{ ctxAction.type === 'rename' ? t('notes.rename') : t('notes.create') }}
          </button>
        </div>
      </div>
    </Teleport>

    <!-- ── Editor right-click context menu ── -->
    <Teleport to="body">
      <div v-if="editorCtxMenu.visible" class="notes-ctx-overlay" @click="closeEditorCtxMenu" @contextmenu.prevent="closeEditorCtxMenu" />
      <div
        v-if="editorCtxMenu.visible"
        class="notes-ctx-menu"
        :style="{ top: editorCtxMenu.y + 'px', left: editorCtxMenu.x + 'px' }"
        @click.stop
      >
        <!-- AI Edit — always first -->
        <button
          class="ctx-item ctx-item-ai"
          @click="onEditorCtxAskAi"
        >
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a5 5 0 0 1 5 5c0 5.25-5 13-5 13S7 12.25 7 7a5 5 0 0 1 5-5z"/>
            <circle cx="12" cy="7" r="1.5" fill="currentColor" stroke="none"/>
          </svg>
          Ask AI Assistant
        </button>
        <div class="ctx-divider" />
        <button class="ctx-item" @click="onEditorCtxCopy">
          <svg style="width:14px;height:14px;flex-shrink:0;" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>
          Copy
        </button>
      </div>
    </Teleport>

    <!-- Confirm Delete Modal (blocked: folder not empty) -->
    <ConfirmModal
      v-if="confirmDeleteTarget?.blocked"
      :visible="!!confirmDeleteTarget?.blocked"
      :title="t('notes.cannotDeleteFolder')"
      :message="confirmDeleteTarget.blocked"
      :confirm-text="t('notes.ok')"
      confirm-class="primary"
      cancel-text=""
      @confirm="closeDeleteDialog"
      @close="closeDeleteDialog"
    />
    <!-- Confirm Delete Modal (normal) -->
    <ConfirmModal
      v-else-if="confirmDeleteTarget"
      :visible="!!confirmDeleteTarget"
      :title="confirmDeleteTarget.isDir ? t('notes.deleteFolder') : t('notes.deleteFile')"
      :message="confirmDeleteTarget.isDir
        ? t('notes.deleteFolderConfirm', { name: confirmDeleteTarget.name })
        : t('notes.deleteFileConfirm', { name: confirmDeleteTarget.name })"
      :confirm-text="t('notes.delete')"
      confirm-class="danger"
      :loading="deleting"
      :loading-text="t('notes.deleting')"
      :error="deleteError"
      @confirm="executeDelete"
      @close="closeDeleteDialog"
    />
  </div>

  <!-- Preview limit modal -->
  <PreviewLimitModal
    :visible="showPreviewLimitModal"
    :message="previewLimitMessage"
    @close="showPreviewLimitModal = false"
  />
</template>

<script setup>
defineOptions({ inheritAttrs: false })
import { ref, reactive, computed, watch, nextTick, onMounted, onActivated, onBeforeUnmount, defineComponent, h } from 'vue'
import ConfirmModal from '../components/common/ConfirmModal.vue'
import AppButton from '../components/common/AppButton.vue'
import DrawioEditor from '../components/notes/DrawioEditor.vue'
import CodeViewer from '../components/notes/CodeViewer.vue'
import PptxEditor from '../components/notes/PptxEditor.vue'
import DocxEditor from '../components/notes/DocxEditor.vue'
import XlsxEditor from '../components/notes/XlsxEditor.vue'
import AiMagicPanel from '../components/notes/AiMagicPanel.vue'
import SearchReplaceBar from '../components/notes/SearchReplaceBar.vue'
import { marked } from 'marked'
import hljs from 'highlight.js'
import DOMPurify from 'dompurify'
import TurndownService from 'turndown'
import { gfm } from 'turndown-plugin-gfm'
import { useObsidianStore } from '../stores/obsidian'
import { useAgentsStore, BUILTIN_DOC_EDITOR_ID } from '../stores/agents'
import { useConfigStore } from '../stores/config'
import { useSkillsStore } from '../stores/skills'
import { useMcpStore } from '../stores/mcp'
import { useToolsStore } from '../stores/tools'
import { useKnowledgeStore } from '../stores/knowledge'
import { useAiMagic } from '../composables/useAiMagic'
import { getAvatarDataUri } from '../components/agents/agentAvatars'
import { useFocusModeStore } from '../stores/focusMode'
import { useVoiceStore } from '../stores/voice'
import { useI18n } from '../i18n/useI18n'
import PreviewLimitModal from '../components/common/PreviewLimitModal.vue'
import { isLimitEnforced } from '../utils/guestLimits'

const { t } = useI18n()
const showPreviewLimitModal = ref(false)
const previewLimitMessage = ref('')

// When true, this instance is embedded inside FocusModeView and owns the AI panel.
// The router-level instance suppresses its panel to avoid duplicates.
const props = defineProps({ isEmbedded: { type: Boolean, default: false } })

const store = useObsidianStore()
const agentsStore = useAgentsStore()
const configStore = useConfigStore()
const focusModeStore = useFocusModeStore()
const voiceStore = useVoiceStore()

// Tree visibility filter. A file node is hidden ONLY when the session probe has
// confirmed it's not openable (binary content / too large / IO failure). Dirs
// are always shown, and unprobed files stay visible — the filter tightens as
// the background batch probe reports results.
function _isNodeVisible(node) {
  if (!node) return false
  if (node.type === 'dir') return true
  return store.probeCache[node.path] !== false
}
const visibleFileTree = computed(() => (store.fileTree || []).filter(_isNodeVisible))

// This instance should render the floating AI panel only when:
// - it IS the embedded focus-mode instance, OR
// - focus mode is not active (normal standalone use)
const isAiPanelOwner = computed(() => props.isEmbedded || !focusModeStore.isFocusMode)
const skillsStore = useSkillsStore()
const mcpStore = useMcpStore()
const toolsStore = useToolsStore()
const knowledgeStore = useKnowledgeStore()
const {
  panelOpen: aiDocOpen, streaming: aiDocStreaming, requestId: aiDocRequestId,
  selectionContext: aiDocSelection, messages: aiDocMessages,
  selectedAgentId,
  open: openAiDoc, close: _closeAiDocRaw, send: _sendAiDocRaw, stop: stopAiDoc,
  updateSelection: updateAiDocSelection, updateFileContent: updateAiDocFileContent,
  getReplacementInfo, markApplied: markAiDocApplied, markReverted: markAiDocReverted,
  markApplyFailed: markAiDocApplyFailed,
  markToolEdit: markAiDocToolEdit,
  markToolEditReverted: markAiDocToolEditReverted,
  markToolEditReapplied: markAiDocToolEditReapplied,
} = useAiMagic()

// ── Document speak (TTS playback) ────────────────────────────────────────
const docSpeakingActive = ref(false)
const docSpeakLoading = ref(false)
let _docSpeakAudioEl = null

function stopDocSpeak() {
  docSpeakLoading.value = false
  docSpeakingActive.value = false
  if (_docSpeakAudioEl) { _docSpeakAudioEl.pause(); _docSpeakAudioEl = null }
  if (window.speechSynthesis) window.speechSynthesis.cancel()
}

async function handleDocSpeak() {
  if (docSpeakingActive.value || docSpeakLoading.value) { stopDocSpeak(); return }

  const rawContent = editorContent.value || store.activeFile?.content || ''
  if (!rawContent.trim()) return

  // Strip markdown syntax for cleaner TTS
  let text = rawContent
    .replace(/```[\s\S]*?```/g, '')
    .replace(/[#*`_~\[\]()>]/g, '')
    .replace(/\n{2,}/g, '\n')
    .trim()
    .slice(0, 3000)
  if (!text) return

  docSpeakLoading.value = true
  try {
    const vc = configStore.config.voiceCall || {}

    const playAudio = async (result) => {
      if (!result?.success || !result.audio) return false
      _docSpeakAudioEl = new Audio(`data:audio/${result.format || 'mp3'};base64,${result.audio}`)
      const speakerId = voiceStore.selectedSpeakerId
      if (speakerId && typeof _docSpeakAudioEl.setSinkId === 'function') {
        _docSpeakAudioEl.setSinkId(speakerId).catch(() => {})
      }
      _docSpeakAudioEl.onended = () => stopDocSpeak()
      _docSpeakAudioEl.onerror = () => stopDocSpeak()
      docSpeakLoading.value = false
      docSpeakingActive.value = true
      await _docSpeakAudioEl.play()
      return true
    }

    if (vc.mode === 'local' && window.electronAPI?.voice?.localTts) {
      const voice = vc.ttsVoice || vc.local?.ttsVoice || 'zh-CN-XiaoxiaoNeural'
      const result = await window.electronAPI.voice.localTts({ text, voice, language: vc.language || 'auto' })
      if (docSpeakLoading.value && await playAudio(result)) return
      // Local server not running or failed — do not fall through
      stopDocSpeak(); return
    }

    const useOpenAITts = (vc.mode === 'openai' || vc.ttsMode === 'openai' || vc.ttsMode === 'openai-hd')
      && vc.whisperApiKey && vc.whisperBaseURL && window.electronAPI?.voice?.tts
    if (useOpenAITts && docSpeakLoading.value) {
      const result = await window.electronAPI.voice.tts({
        text, apiKey: vc.whisperApiKey, baseURL: vc.whisperBaseURL,
        model: vc.ttsMode === 'openai-hd' ? 'tts-1-hd' : 'tts-1', voice: 'alloy',
      })
      if (docSpeakLoading.value && await playAudio(result)) return
      stopDocSpeak(); return
    }

    // No mode configured — browser TTS as last resort
    if (window.speechSynthesis && docSpeakLoading.value) {
      docSpeakLoading.value = false
      docSpeakingActive.value = true
      const utterance = new SpeechSynthesisUtterance(text.slice(0, 500))
      utterance.onend = () => stopDocSpeak()
      utterance.onerror = () => stopDocSpeak()
      window.speechSynthesis.speak(utterance)
    } else if (docSpeakLoading.value) {
      stopDocSpeak()
    }
  } catch { stopDocSpeak() }
}
// ──────────────────────────────────────────────────────────────────────────

/** Close the panel and turn off the AI Doc switch. */
function closeAiDoc() {
  _closeAiDocRaw()
  aiDocEnabled.value = false
}

// Available agents for the AI Doc agent selector (system type only)
const availableAgents = computed(() => agentsStore.systemAgents || [])
const sortedDocAgents = computed(() =>
  [...availableAgents.value].sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0))
)

// Agent toolbar computeds
const activeDocAgent = computed(() => agentsStore.getAgentById(selectedAgentId.value))
const activeDocAgentName = computed(() => activeDocAgent.value?.name || t('notes.selectAgent'))
const activeDocAgentAvatar = computed(() => {
  if (!activeDocAgent.value?.avatar) return null
  return getAvatarDataUri(activeDocAgent.value.avatar)
})
function getDocAgentAvatar(agent) {
  if (!agent?.avatar) return null
  return getAvatarDataUri(agent.avatar)
}

// Agent modal — search + category state
const docAgentSearchEl = ref(null)
const docAgentSearchQuery = ref('')
const expandedDocCatIds = ref(new Set())
const filteredDocAgents = computed(() => {
  const q = docAgentSearchQuery.value.toLowerCase().trim()
  if (!q) return sortedDocAgents.value
  return sortedDocAgents.value.filter(a =>
    a.name.toLowerCase().includes(q) || (a.description || '').toLowerCase().includes(q)
  )
})
function toggleDocCat(id) {
  const s = new Set(expandedDocCatIds.value)
  if (s.has(id)) s.delete(id); else s.add(id)
  expandedDocCatIds.value = s
}
function openDocAgentModal() {
  showDocAgentModal.value = true
  docAgentSearchQuery.value = ''
  expandedDocCatIds.value = new Set()
  nextTick(() => docAgentSearchEl.value?.focus())
}
function selectDocAgent(id) {
  selectedAgentId.value = id
  showDocAgentModal.value = false
}

// Agent + permission modals
const showDocAgentModal = ref(false)
const showDocPermModal = ref(false)

// Agent pill tooltip — position: fixed to escape overflow:hidden on the panel
const agentPillTooltip = reactive({ visible: false, x: 0, y: 0 })
function showAgentPillTooltip(e) {
  const rect = e.currentTarget.getBoundingClientRect()
  agentPillTooltip.x = rect.left
  agentPillTooltip.y = rect.bottom + 6
  agentPillTooltip.visible = true
}
function hideAgentPillTooltip() {
  agentPillTooltip.visible = false
}

// Permission mode for AI Doc (default: allow_all for backwards compat)
const aiDocPermissionMode = ref('allow_all')

function _normalizeDocPath(p) {
  return String(p || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .toLowerCase()
}

function _currentFileChangedByToolRun(newMessages) {
  const currentPath = store.activeFile?.path
  if (!currentPath) return false
  const currentNorm = _normalizeDocPath(currentPath)

  for (const msg of newMessages || []) {
    if (msg?.role !== 'ai' || !Array.isArray(msg.toolCalls)) continue
    for (const tc of msg.toolCalls) {
      if (!tc || tc._permBlock) continue
      if (tc.name !== 'file_operation') continue
      const op = tc.input?.operation
      if (!['edit', 'write', 'append'].includes(op)) continue

      // Primary signal: tool targeted the currently open file path.
      const inputPath = tc.input?.path
      if (inputPath && _normalizeDocPath(inputPath) === currentNorm) {
        const resultText = String(tc.result?.text || '')
        // If we have a definitive error, skip reload.
        if (/^Error:/i.test(resultText)) continue
        return true
      }

      const resultPath = tc.result?.path
      const resultText = String(tc.result?.text || '')
      const succeeded = !!resultPath && (
        tc.result?.replaced === true
        || /^Edited:\s/i.test(resultText)
        || /^Written:\s/i.test(resultText)
        || /^Appended:\s/i.test(resultText)
      )
      if (!succeeded) continue

      if (_normalizeDocPath(resultPath) === currentNorm) {
        return true
      }
    }
  }
  return false
}

async function _reloadActiveTextFileFromDisk(opts = {}) {
  if (!store.activeFile?.path || store.activeFile?.binary) return
  // Protect unsaved local edits — a tool-driven disk refresh should not
  // silently overwrite the user's in-progress work. Callers that have
  // already captured a pre-edit snapshot (see sendAiDoc) can pass force=true.
  if (store.activeFile?.dirty && !opts.force) {
    console.warn('[AI Doc] Skipped disk reload: active file has unsaved changes')
    return
  }
  const readRes = await window.electronAPI.obsidian.readFile(store.activeFile.path)
  if (readRes?.error || typeof readRes?.content !== 'string') return

  // Keep store + local editor in sync without re-marking dirty.
  store.activeFile.content = readRes.content
  store.activeFile.dirty = false
  editorContent.value = readRes.content
  updateAiDocFileContent(readRes.content)

  if (isMarkdown.value && !editMode.value) {
    await nextTick()
    await refreshFormattedHtml()
  }
}

/** Wrap sendAiDoc to inject agent config from stores. */
async function sendAiDoc(userText) {
  const beforeMsgCount = aiDocMessages.value.length
  // Capture pre-turn content so we can offer a Revert for tool-based edits
  // (file_operation) that bypass the <replacement> flow.
  const preTurnContent = store.activeFile?.content ?? editorContent.value ?? ''
  const preTurnPath = store.activeFile?.path || ''

  const agent = agentsStore.getAgentById(selectedAgentId.value)
  const reqSkills = agent?.requiredSkillIds ?? []
  const reqMcp    = agent?.requiredMcpServerIds ?? []
  const reqTools  = agent?.requiredToolIds ?? []
  const filterById = (items, required) =>
    items.filter(x => required.includes(x.id))
  const agentConfig = {
    agentPrompt: agent?.prompt || '',
    enabledSkills: JSON.parse(JSON.stringify(filterById(skillsStore.skills || [], reqSkills))),
    mcpServers: JSON.parse(JSON.stringify(filterById(mcpStore.servers || [], reqMcp))),
    httpTools: JSON.parse(JSON.stringify(filterById(toolsStore.tools || [], reqTools))),
    knowledgeConfig: {
      ragEnabled: knowledgeStore.ragEnabled,
      knowledgeBases: JSON.parse(JSON.stringify(knowledgeStore.kbConfigs || {})),
    },
    permissionMode: aiDocPermissionMode.value,
  }
  await _sendAiDocRaw(userText, agentConfig)

  // Auto-apply the latest generated replacement from THIS turn only.
  // Prior turns' edits that the user reverted (applied=false) must not be
  // resurrected here — scope the search to messages produced by this send.
  const runMessages = aiDocMessages.value.slice(beforeMsgCount)
  const latestEdit = [...runMessages]
    .reverse()
    .find(m => m.role === 'ai' && m.type === 'edit' && m.replacement && !m.applied)
  if (latestEdit) onAiDocApply(latestEdit.id)

  // If the agent edited the current file via file_operation, reload it so
  // the latest on-disk content is visible. Also attach a revert snapshot to
  // the most recent AI message so the user has an undo path (both via the
  // pill on the message and via Ctrl+Z).
  if (_currentFileChangedByToolRun(runMessages)) {
    // force-reload even if dirty: the tool just wrote to disk, and we already
    // had the user's pre-turn snapshot captured above.
    await _reloadActiveTextFileFromDisk({ force: true })
    const latestAi = [...runMessages].reverse().find(m => m.role === 'ai')
    if (latestAi && preTurnPath) {
      markAiDocToolEdit(latestAi.id, preTurnContent, preTurnPath)
      const postContent = store.activeFile?.content ?? editorContent.value ?? ''
      _pushAiEditHistory({
        source: 'tool',
        msgId: latestAi.id,
        preContent: preTurnContent,
        postContent,
        filePath: preTurnPath,
      })
    }
  }
}

/** Handle permission response from AiMagicPanel PermissionPrompt buttons. */
function onDocPermissionRespond({ blockId, decision, command }) {
  if (!aiDocRequestId.value) return
  window.electronAPI.docPermissionResponse(aiDocRequestId.value, { blockId, decision, pattern: command })
}

function onAiDocClearSelection() {
  _cachedSel.text = ''
  _cachedSel.range = null
  _cachedSel.rect = null
  _cachedSel.taStart = -1
  _cachedSel.taEnd = -1
  hasSelection.value = false

  // Clear browser selection highlight if present.
  try { window.getSelection()?.removeAllRanges?.() } catch {}

  // Collapse textarea selection (markdown source mode).
  const ta = sourceTextareaRef.value
  if (ta && typeof ta.selectionStart === 'number') {
    ta.selectionEnd = ta.selectionStart
  }

  // Revert AI context to whole-file mode.
  updateAiDocSelection('')
}

// AI Doc switch (golden toggle) — controls panel visibility
const aiDocEnabled = ref(false)
// Track whether text is currently selected (for wand button)
const hasSelection = ref(false)
// Revert snapshots: msgId → previous file content
const _revertSnapshots = new Map()

// ── AI edit history (Ctrl+Z / Ctrl+Y) ─────────────────────────────────────
// Entries: { source: 'replacement'|'tool', msgId, preContent, postContent, filePath? }
// Each AI-initiated write pushes a new entry. Ctrl+Z pops when current content
// matches entry.postContent (otherwise native undo takes over, so manual
// keystrokes the user made AFTER an AI edit are still undoable first).
const _aiUndoStack = []
const _aiRedoStack = []
const AI_UNDO_CAP = 50

function _pushAiEditHistory(entry) {
  _aiUndoStack.push(entry)
  if (_aiUndoStack.length > AI_UNDO_CAP) _aiUndoStack.shift()
  // New edit invalidates any pending redo.
  _aiRedoStack.length = 0
}

function _currentEditorContent() {
  return store.activeFile?.content ?? editorContent.value ?? ''
}

async function _applyHistoryContent(entry, targetContent) {
  // Route to the right editor based on the current file type.
  if (isMarkdown.value && !editMode.value && formattedEl.value) {
    editorContent.value = targetContent
    store.updateContent(targetContent)
    await nextTick()
    await refreshFormattedHtml()
  } else if (isMarkdown.value && editMode.value) {
    editorContent.value = targetContent
    store.updateContent(targetContent)
  } else if (isTextLike.value) {
    store.updateContent(targetContent)
    editorContent.value = targetContent
  } else if (store.activeFile?.content !== undefined) {
    store.updateContent(targetContent)
    editorContent.value = targetContent
  }
  updateAiDocFileContent(_currentEditorContent())

  // If the original edit was a tool-based write, persist back to disk so
  // the undo/redo mirrors the on-disk state.
  if (entry.source === 'tool' && entry.filePath) {
    try {
      await window.electronAPI.obsidian.writeFile(entry.filePath, targetContent)
      if (store.activeFile?.path === entry.filePath) {
        store.activeFile.content = targetContent
        store.activeFile.dirty = false
      }
    } catch (err) {
      console.warn('[AI Doc] Failed to write undo/redo to disk:', err?.message)
    }
  }
}

/** Returns true if our stack owns this undo (and has started consuming it). */
function _tryUndoAiEdit() {
  if (_aiUndoStack.length === 0) return false
  const top = _aiUndoStack[_aiUndoStack.length - 1]
  // Only consume our undo entry when current content matches what we applied.
  // Otherwise the user has made further manual edits — let native undo run first.
  if (_currentEditorContent() !== top.postContent) return false
  _aiUndoStack.pop()
  _aiRedoStack.push(top)
  _applyHistoryContent(top, top.preContent).then(() => {
    if (top.source === 'replacement') markAiDocReverted(top.msgId)
    else if (top.source === 'tool') markAiDocToolEditReverted(top.msgId)
  })
  return true
}

function _tryRedoAiEdit() {
  if (_aiRedoStack.length === 0) return false
  const top = _aiRedoStack[_aiRedoStack.length - 1]
  if (_currentEditorContent() !== top.preContent) return false
  _aiRedoStack.pop()
  _aiUndoStack.push(top)
  _applyHistoryContent(top, top.postContent).then(() => {
    if (top.source === 'replacement') markAiDocApplied(top.msgId)
    else if (top.source === 'tool') markAiDocToolEditReapplied(top.msgId)
  })
  return true
}

function _onDocsKeydown(e) {
  const ctrlLike = e.ctrlKey || e.metaKey
  if (!ctrlLike) return
  const k = (e.key || '').toLowerCase()
  // Ctrl/Cmd+Z → undo; Ctrl/Cmd+Y or Ctrl/Cmd+Shift+Z → redo.
  if (k === 'z' && !e.shiftKey) {
    if (_tryUndoAiEdit()) { e.preventDefault(); e.stopPropagation() }
  } else if (k === 'y' || (k === 'z' && e.shiftKey)) {
    if (_tryRedoAiEdit()) { e.preventDefault(); e.stopPropagation() }
  }
}

// Floating AI Doc panel state (position + size)
const AI_PANEL_STORAGE_KEY = 'clankai-aidoc-panel'
const AI_PANEL_MIN_W = 300
const AI_PANEL_MIN_H = 300

const aiPanel = reactive({
  x: 0, y: 0, w: 350, h: 420,
})

// Load persisted size on startup, then clamp position to fit current window
try {
  const saved = JSON.parse(localStorage.getItem(AI_PANEL_STORAGE_KEY) || '{}')
  if (saved.w) aiPanel.w = Math.max(AI_PANEL_MIN_W, Math.min(saved.w, window.innerWidth))
  if (saved.h) aiPanel.h = Math.max(AI_PANEL_MIN_H, Math.min(saved.h, window.innerHeight))
} catch {}
// Default position: bottom-right corner, fully within window
aiPanel.x = Math.max(0, window.innerWidth  - aiPanel.w - 24)
aiPanel.y = Math.max(0, window.innerHeight - aiPanel.h - 24)

function _persistPanelSize() {
  try { localStorage.setItem(AI_PANEL_STORAGE_KEY, JSON.stringify({ w: aiPanel.w, h: aiPanel.h })) } catch {}
}
let _panelSizeTimer = null
function _debouncePersistPanel() {
  if (_panelSizeTimer) clearTimeout(_panelSizeTimer)
  _panelSizeTimer = setTimeout(_persistPanelSize, 300)
}

function _clampPanel() {
  const maxX = window.innerWidth - aiPanel.w
  const maxY = window.innerHeight - aiPanel.h
  aiPanel.x = Math.max(0, Math.min(aiPanel.x, maxX))
  aiPanel.y = Math.max(0, Math.min(aiPanel.y, maxY))
}

function _positionNearSelection() {
  const W = window.innerWidth
  const H = window.innerHeight
  const pw = aiPanel.w
  const ph = aiPanel.h
  const rect = _cachedSel.rect
  let x, y
  if (!rect) {
    x = W - pw - 24
    y = H - ph - 24
  } else {
    // Prefer right of selection, fall back to left
    x = rect.right + 16
    if (x + pw > W) x = rect.left - pw - 16
    // Prefer aligned to selection top, slide up if needed
    y = rect.top
    if (y + ph > H) y = H - ph - 8
  }
  // Hard clamp — always fully inside window
  aiPanel.x = Math.max(0, Math.min(x, W - pw))
  aiPanel.y = Math.max(0, Math.min(y, H - ph))
}

function startPanelDrag(e) {
  e.preventDefault()
  const startMX = e.clientX
  const startMY = e.clientY
  const startX = aiPanel.x
  const startY = aiPanel.y
  document.body.style.userSelect = 'none'

  function onMove(ev) {
    const dx = ev.clientX - startMX
    const dy = ev.clientY - startMY
    aiPanel.x = Math.max(0, Math.min(startX + dx, window.innerWidth - aiPanel.w))
    aiPanel.y = Math.max(0, Math.min(startY + dy, window.innerHeight - aiPanel.h))
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.userSelect = ''
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

function startPanelResize(edge, e) {
  e.preventDefault()
  const startMX = e.clientX
  const startMY = e.clientY
  const startW = aiPanel.w
  const startH = aiPanel.h
  const startX = aiPanel.x
  const startY = aiPanel.y
  document.body.style.userSelect = 'none'

  function onMove(ev) {
    const dx = ev.clientX - startMX
    const dy = ev.clientY - startMY
    // Right edge
    if (edge === 'r' || edge === 'br' || edge === 'tr') {
      aiPanel.w = Math.max(AI_PANEL_MIN_W, Math.min(startW + dx, window.innerWidth - aiPanel.x))
    }
    // Left edge — also moves x
    if (edge === 'l' || edge === 'bl' || edge === 'tl') {
      const newW = Math.max(AI_PANEL_MIN_W, startW - dx)
      aiPanel.x = Math.max(0, startX + startW - newW)
      aiPanel.w = newW
    }
    // Bottom edge
    if (edge === 'b' || edge === 'br' || edge === 'bl') {
      aiPanel.h = Math.max(AI_PANEL_MIN_H, Math.min(startH + dy, window.innerHeight - aiPanel.y))
    }
    // Top edge — also moves y
    if (edge === 't' || edge === 'tr' || edge === 'tl') {
      const newH = Math.max(AI_PANEL_MIN_H, startH - dy)
      aiPanel.y = Math.max(0, startY + startH - newH)
      aiPanel.h = newH
    }
  }
  function onUp() {
    document.removeEventListener('mousemove', onMove)
    document.removeEventListener('mouseup', onUp)
    document.body.style.userSelect = ''
    _debouncePersistPanel()
  }
  document.addEventListener('mousemove', onMove)
  document.addEventListener('mouseup', onUp)
}

// Refs for editor child components (used for ai-edit integration)
const codeViewerRef = ref(null)
const codeViewerTheme = ref('dark')

// ── HTML preview server port (lazy — only requested when first HTML file is opened) ──
const htmlPreviewPort = ref(0)

// ── HTML webview state ──
const htmlWebviewRef = ref(null)
const htmlWvCanGoBack = ref(false)
const htmlWvCanGoForward = ref(false)
const htmlWvIsLoading = ref(false)
const htmlWvCurrentUrl = ref('')
let _htmlWvCleanup = []

function _attachHtmlWvListeners() {
  _htmlWvCleanup.forEach(fn => fn())
  _htmlWvCleanup = []
  const wv = htmlWebviewRef.value
  if (!wv) return
  const onNavigate = (e) => { htmlWvCurrentUrl.value = e.url; htmlWvCanGoBack.value = wv.canGoBack(); htmlWvCanGoForward.value = wv.canGoForward() }
  const onNavInPage = (e) => { if (e.isMainFrame) { htmlWvCurrentUrl.value = e.url; htmlWvCanGoBack.value = wv.canGoBack(); htmlWvCanGoForward.value = wv.canGoForward() } }
  const onStart = () => { htmlWvIsLoading.value = true }
  const onStop = () => { htmlWvIsLoading.value = false; htmlWvCanGoBack.value = wv.canGoBack(); htmlWvCanGoForward.value = wv.canGoForward() }
  const onDomReady = () => {
    htmlWvIsLoading.value = false; htmlWvCanGoBack.value = wv.canGoBack(); htmlWvCanGoForward.value = wv.canGoForward()
  }
  wv.addEventListener('did-navigate', onNavigate)
  wv.addEventListener('did-navigate-in-page', onNavInPage)
  wv.addEventListener('did-start-loading', onStart)
  wv.addEventListener('did-stop-loading', onStop)
  wv.addEventListener('dom-ready', onDomReady)
  _htmlWvCleanup = [
    () => wv.removeEventListener('did-navigate', onNavigate),
    () => wv.removeEventListener('did-navigate-in-page', onNavInPage),
    () => wv.removeEventListener('did-start-loading', onStart),
    () => wv.removeEventListener('did-stop-loading', onStop),
    () => wv.removeEventListener('dom-ready', onDomReady),
  ]
}

function onHtmlWvDomReady() {
  const wv = htmlWebviewRef.value
  if (!wv) return
  htmlWvIsLoading.value = false
  htmlWvCanGoBack.value = wv.canGoBack()
  htmlWvCanGoForward.value = wv.canGoForward()
}

function onHtmlWvFinishLoad() {
  const wv = htmlWebviewRef.value
  if (!wv) return
  htmlWvIsLoading.value = false
  htmlWvCanGoBack.value = wv.canGoBack()
  htmlWvCanGoForward.value = wv.canGoForward()
  htmlWvCurrentUrl.value = wv.getURL?.() || htmlWvCurrentUrl.value
}

function htmlWvGoBack() { htmlWebviewRef.value?.goBack() }
function htmlWvGoForward() { htmlWebviewRef.value?.goForward() }
function htmlWvReload() { htmlWebviewRef.value?.reloadIgnoringCache() }
function htmlWvStop() { htmlWebviewRef.value?.stop() }
function htmlWvNavigate(url) {
  if (!url) return
  htmlWebviewRef.value?.loadURL(url)
}
function htmlWvReloadFromDisk() {
  // Re-read file from disk; content watch will trigger reloadIgnoringCache
  if (store.activeFile?.path && isHtml.value) {
    store.openFile(store.activeFile.path, store.activeFile.name)
  }
}

const aiMagicPanelRef = ref(null)
const docxEditorRef = ref(null)
const pptxEditorRef = ref(null)
const xlsxEditorRef = ref(null)
const sourceTextareaRef = ref(null)
const searchBarRef = ref(null)

// ── Search / Replace state ──
const searchBarOpen = ref(false)

const isTextFile = computed(() => isMarkdown.value || isHtml.value || isTextLike.value)
const searchFileType = computed(() => {
  if (isPptx.value) return 'pptx'
  if (isXlsx.value) return 'xlsx'
  if (isDocx.value) return 'docx'
  return 'text'
})
const activeTextarea = computed(() => sourceTextareaRef.value || null)

const editMode = ref(false)
const linkError = ref('')
let linkErrorTimer = null
const saving = ref(false)
const saveStatus = ref(null) // null | 'saving' | 'ok' | 'error'
let _saveStatusTimer = null
const copied = ref(false)
let copiedTimer = null
const formattedEl = ref(null)
const formattedHtml = ref('')
let editingFormatted = false  // flag to prevent circular updates

// Turndown: HTML → Markdown converter (with GFM tables, strikethrough, etc.)
const turndown = new TurndownService({
  headingStyle: 'atx',
  codeBlockStyle: 'fenced',
  bulletListMarker: '-',
  emDelimiter: '*',
  strongDelimiter: '**',
  hr: '---',
})
turndown.use(gfm)

// Convert data-URL / data-relpath images back to relative markdown paths
turndown.addRule('local-images', {
  filter: function (node) {
    return node.nodeName === 'IMG' && (node.getAttribute('data-relpath') || node.getAttribute('src')?.startsWith('data:'))
  },
  replacement: function (content, node) {
    const relPath = node.getAttribute('data-relpath')
    const alt = node.getAttribute('alt') || ''
    const title = node.getAttribute('title')
    if (relPath) {
      return `![${alt}](${relPath}${title ? ` "${title}"` : ''})`
    }
    // Fallback: keep the data URL as-is (shouldn't normally happen)
    const src = node.getAttribute('src') || ''
    return `![${alt}](${src}${title ? ` "${title}"` : ''})`
  }
})
const isDrawio = computed(() => store.activeFile?.name?.endsWith('.drawio') ?? false)
const isMarkdown = computed(() => store.activeFile?.name?.endsWith('.md') ?? false)
const isHtml = computed(() => /\.html?$/i.test(store.activeFile?.name || ''))
const htmlFileUrl = computed(() => {
  if (!isHtml.value || !store.activeFile?.path || !htmlPreviewPort.value) return ''
  const p = store.activeFile.path.replace(/\\/g, '/')
  return `http://127.0.0.1:${htmlPreviewPort.value}/${encodeURI(p)}`
})

// Lazy-start the preview server only when an HTML file is first opened
watch(isHtml, async (val) => {
  if (val && !htmlPreviewPort.value) {
    const port = await window.electronAPI?.htmlPreview?.getPort?.()
    if (port) htmlPreviewPort.value = port
  }
}, { immediate: true })

watch(htmlFileUrl, async (url) => {
  if (url) {
    htmlWvCurrentUrl.value = url
    htmlWvCanGoBack.value = false
    htmlWvCanGoForward.value = false
    await nextTick()
    _attachHtmlWvListeners()
  } else {
    _htmlWvCleanup.forEach(fn => fn())
    _htmlWvCleanup = []
    htmlWvIsLoading.value = false
  }
})

// When same HTML file is re-opened (content updated), reload the webview
watch(() => store.activeFile?.content, () => {
  if (isHtml.value && !editMode.value) {
    nextTick(() => htmlWebviewRef.value?.reload())
  }
})

const isPptx = computed(() => /\.pptx?$/i.test(store.activeFile?.name || ''))
const isDocx = computed(() => /\.docx?$/i.test(store.activeFile?.name || ''))
const isXlsx = computed(() => /\.xlsx?$/i.test(store.activeFile?.name || ''))

const CODE_EXTS = new Set([
  'js','ts','py','java','go','rs','c','cpp','h','cs','rb','php','swift','kt',
  'lua','sh','bash','zsh','ps1','sql','r','dart','scala','ex','vue','svelte',
  'jsx','tsx','mjs','cjs','css','scss','less','xml','json','yaml','yml',
  'toml','ini','cfg','conf','pl','svg','dockerfile','makefile','env','gitignore',
])
const IMAGE_EXTS = new Set(['png','jpg','jpeg','gif','svg','webp','ico','bmp','tiff'])

const activeExt = computed(() => {
  const name = store.activeFile?.name || ''
  return (name.split('.').pop() || '').toLowerCase()
})
const isCode = computed(() => CODE_EXTS.has(activeExt.value))
const isImage = computed(() => IMAGE_EXTS.has(activeExt.value))
const isTextLike = computed(() => !isDrawio.value && !isMarkdown.value && !isHtml.value && !isImage.value && !isPptx.value && !isDocx.value && !isXlsx.value)

const IMAGE_MIME = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', bmp: 'image/bmp', ico: 'image/x-icon', tiff: 'image/tiff', svg: 'image/svg+xml' }
const imageDataUri = computed(() => {
  const f = store.activeFile
  if (!f?.binary || !f.base64) return ''
  const mime = IMAGE_MIME[activeExt.value] || 'image/png'
  return `data:${mime};base64,${f.base64}`
})

// ── Context menu state ──
const ctxMenu = ref({ visible: false, x: 0, y: 0, targetPath: '', targetType: '' })
const ctxAction = ref({ visible: false, type: '', parent: '', targetPath: '', x: 0, y: 0 })
const ctxInputValue = ref('')
const ctxInputRef = ref(null)

// Dialog width: grows with the input value, clamped between 280px and 640px.
// ~9.5px per char for JetBrains Mono at --fs-secondary + 64px for padding/borders.
const ctxDialogWidth = computed(() => Math.max(280, Math.min(640, ctxInputValue.value.length * 9.5 + 64)))

const ctxActionLabel = computed(() => {
  const actionType = ctxAction.value.type
  if (actionType === 'newFile')    return t('notes.newMarkdownFile')
  if (actionType === 'newDiagram') return t('notes.newDiagram')
  if (actionType === 'newDocx')    return t('notes.newDocument')
  if (actionType === 'newXlsx')    return t('notes.newSpreadsheet')
  if (actionType === 'newFolder')  return t('notes.newFolder')
  if (actionType === 'rename')     return t('notes.rename')
  return ''
})

const ctxActionPlaceholder = computed(() => {
  const actionType = ctxAction.value.type
  if (actionType === 'newFile')    return t('notes.noteMd')
  if (actionType === 'newDiagram') return t('notes.diagramDrawio')
  if (actionType === 'newDocx')    return t('notes.documentDocx')
  if (actionType === 'newXlsx')    return t('notes.spreadsheetXlsx')
  if (actionType === 'newFolder')  return t('notes.folderName')
  return ''
})

// Vault display name (last folder in path)
const vaultName = computed(() => {
  if (!store.vaultPath) return ''
  const parts = store.vaultPath.split(/[/\\]/)
  return parts[parts.length - 1] || store.vaultPath
})

// Local ref for editor textarea — decoupled from store to avoid reactivity fights during paste
const editorContent = ref('')

// Sync store → local when file changes (open new file, save resets dirty, etc.)
watch(() => store.activeFile?.content, (val) => {
  if (val !== editorContent.value) {
    editorContent.value = val ?? ''
  }
}, { immediate: true })

// Sync local → store on every edit (marks dirty)
watch(editorContent, (val) => {
  if (store.activeFile && val !== store.activeFile.content) {
    store.updateContent(val)
  }
})

onBeforeUnmount(() => {
  stopDocSpeak()
  // Flush any pending save
  if (store.activeFile?.dirty) store.saveFile()
  document.removeEventListener('keydown', onGlobalKeydown, true)
  document.removeEventListener('keydown', _onDocsKeydown, true)
  document.removeEventListener('selectionchange', _snapshotSelection)
  window.removeEventListener('resize', _onWindowResize)
  clearTimeout(_selectionDebounce)
  clearTimeout(_panelSizeTimer)
})

// ── AI Magic (Ctrl+K / wand button) ──

// Cached selection: continuously updated on selectionchange so it survives
// focus-stealing events like button clicks.
const _cachedSel = { text: '', range: null, rect: null, taStart: -1, taEnd: -1 }
let _selectionDebounce = null

/** Snapshot the current browser/textarea/CodeViewer selection into _cachedSel. */
function _snapshotSelection() {
  // 1) Cache textarea selection for markdown source mode
  const ta = sourceTextareaRef.value
  if (ta && document.activeElement === ta && ta.selectionStart !== ta.selectionEnd) {
    _cachedSel.taStart = ta.selectionStart
    _cachedSel.taEnd = ta.selectionEnd
    _cachedSel.text = ta.value.slice(ta.selectionStart, ta.selectionEnd)
    _cachedSel.range = null
    _cachedSel.rect = ta.getBoundingClientRect()
    return
  }
  // 2) Cache CodeViewer's internal line selection (line-number click selection)
  const cv = codeViewerRef.value
  if (cv) {
    const cvData = cv.getSelectedText?.()
    if (cvData && cvData.text.trim()) {
      _cachedSel.text = cvData.text
      _cachedSel.range = null
      _cachedSel.taStart = -1
      _cachedSel.taEnd = -1
      const cvEl = cv.$el || cv
      _cachedSel.rect = cvEl?.getBoundingClientRect?.() || { top: 200, left: 200, bottom: 400, width: 400, height: 200 }
      return
    }
  }
  // 3) Cache browser selection (contenteditable, drag-selected text, etc.)
  const sel = window.getSelection()
  if (sel && !sel.isCollapsed && sel.toString().trim()) {
    const range = sel.getRangeAt(0).cloneRange()
    const rect = range.getBoundingClientRect()
    _cachedSel.text = sel.toString().trim()
    _cachedSel.range = range
    _cachedSel.rect = rect
    _cachedSel.taStart = -1
    _cachedSel.taEnd = -1
    return
  }
}

function onEditorMouseUp() {
  clearTimeout(_selectionDebounce)
  _selectionDebounce = setTimeout(() => {
    _snapshotSelection()
    hasSelection.value = !!_cachedSel.text
    // Keep AI Doc composable in sync with current selection
    updateAiDocSelection(_cachedSel.text || '')

    // Auto-show floating panel on text selection when AI Doc is enabled
    if (aiDocEnabled.value && _cachedSel.text) {
      if (!aiDocOpen.value) {
        _ensureAiDocPanel()
        _positionNearSelection()
      } else {
        // Panel already open — just update selection context, don't reposition
      }
    }
  }, 150)
}

function onEditorMouseDown() {
  _cachedSel.text = ''
  _cachedSel.range = null
  _cachedSel.rect = null
  _cachedSel.taStart = -1
  _cachedSel.taEnd = -1
  hasSelection.value = false
}

function onAiMagicButtonClick() {
  _snapshotSelection()
  _openAiDocFromSelection()
}

/** Toggle the AI Doc switch on/off. When turning on, auto-open panel. */
function toggleAiDoc() {
  if (isLimitEnforced() && !aiDocEnabled.value) {
    previewLimitMessage.value = t('limits.aiDocsAssistant')
    showPreviewLimitModal.value = true
    return
  }
  aiDocEnabled.value = !aiDocEnabled.value
  if (aiDocEnabled.value && store.activeFile) {
    _ensureAiDocPanel()
  } else if (!aiDocEnabled.value) {
    closeAiDoc()
  }
}

/** Top-right refresh — clears session-only probe + failure caches and reloads
 *  the tree. This is the sole user-visible "retry unopenable files" action. */
async function refreshAll() {
  store.resetFailureCache()
  await store.loadTree()
  if (store.activeFile?.path && !store.activeFile.binary) {
    await store.openFile(store.activeFile.path, store.activeFile.name)
    // HTML webview reload is handled by the content watch
  }
}

async function openVaultInExplorer() {
  const p = store.vaultPath
  if (!p) return
  try {
    await window.electronAPI.openFile(p)
  } catch (err) {
    console.warn('[Docs] Failed to open vault in explorer:', err?.message)
  }
}

async function saveFile() {
  if (saveStatus.value === 'saving') return
  if (_saveStatusTimer) clearTimeout(_saveStatusTimer)
  saveStatus.value = 'saving'
  saving.value = true
  try {
    await store.saveFile()
    saveStatus.value = 'ok'
  } catch {
    saveStatus.value = 'error'
  } finally {
    saving.value = false
    _saveStatusTimer = setTimeout(() => { saveStatus.value = null }, 2000)
  }
}

/** Open AI Doc panel for current file, providing full content as context. */
function _ensureAiDocPanel() {
  if (!store.activeFile) return
  if (aiDocOpen.value) return // already open

  const ext = (store.activeFile.name || '').split('.').pop()?.toLowerCase() || ''
  let fullContent = store.activeFile.content || ''

  // For binary office files, always load the COMPLETE file content so AI has full context
  if (isPptx.value && pptxEditorRef.value?.getAllSlidesText) {
    const text = pptxEditorRef.value.getAllSlidesText()
    if (text) fullContent = `[Presentation: ${store.activeFile.name}]\n\n${text}`
  } else if (isXlsx.value && xlsxEditorRef.value?.getAllSheetsText) {
    const text = xlsxEditorRef.value.getAllSheetsText()
    if (text) fullContent = `[Spreadsheet: ${store.activeFile.name}]\n\n${text}`
  } else if (isDocx.value && docxEditorRef.value?.getPlainText) {
    const text = docxEditorRef.value.getPlainText()
    if (text) fullContent = `[Document: ${store.activeFile.name}]\n\n${text}`
  }

  const fileCtx = {
    fileName: store.activeFile.name || '',
    filePath: store.activeFile.path || '',
    language: isMarkdown.value ? 'markdown' : ext,
  }
  openAiDoc(fullContent, fileCtx)
}

function _openAiDocFromSelection() {
  if (!store.activeFile) return
  // Ensure panel is open
  _ensureAiDocPanel()
  // Update selection context
  updateAiDocSelection(_cachedSel.text || '')
}

// ── Editor right-click context menu ──
const editorCtxMenu = ref({ visible: false, x: 0, y: 0, hasSelection: false })

function onEditorContextMenu(e) {
  // Only intercept for files that support AI Doc (text/markdown/code — not drawio/image/office binary)
  if (isDrawio.value || isImage.value || isPptx.value || isDocx.value || isXlsx.value || !store.activeFile) return
  e.preventDefault()
  e.stopPropagation()
  // Snapshot selection first
  _snapshotSelection()
  const hasSelection = !!_cachedSel.text
  editorCtxMenu.value = {
    visible: true,
    x: Math.min(e.clientX, window.innerWidth - 180),
    y: Math.min(e.clientY, window.innerHeight - 120),
    hasSelection,
  }
}

function closeEditorCtxMenu() {
  editorCtxMenu.value.visible = false
}

function onEditorCtxAskAi() {
  closeEditorCtxMenu()
  if (!aiDocEnabled.value) aiDocEnabled.value = true
  if (!aiDocOpen.value) _ensureAiDocPanel()
  updateAiDocSelection(_cachedSel.text || '')
  nextTick(() => aiMagicPanelRef.value?.focusInput())
}

function onEditorCtxCopy() {
  closeEditorCtxMenu()
  if (_cachedSel.text) {
    navigator.clipboard.writeText(_cachedSel.text)
  } else {
    document.execCommand('copy')
  }
}

/** Handle @ai-edit from DOCX/PPTX/XLSX/CodeViewer child components. */
function handleEditorAiEdit({ selectedText, fullFileContent, replaceCallback }) {
  _editorReplaceCallback = replaceCallback
  _ensureAiDocPanel()
  // Always use the complete file content so AI has full context
  if (isXlsx.value && xlsxEditorRef.value?.getAllSheetsText) {
    const all = xlsxEditorRef.value.getAllSheetsText()
    if (all) updateAiDocFileContent(`[Spreadsheet: ${store.activeFile?.name}]\n\n${all}`)
  } else if (isPptx.value && pptxEditorRef.value?.getAllSlidesText) {
    const all = pptxEditorRef.value.getAllSlidesText()
    if (all) updateAiDocFileContent(`[Presentation: ${store.activeFile?.name}]\n\n${all}`)
  } else if (fullFileContent) {
    updateAiDocFileContent(fullFileContent)
  }
  updateAiDocSelection(selectedText || '')
}
let _editorReplaceCallback = null

/** Handle @slide-selected from PptxEditor — fullFileContent = all slides, selectedText = this slide. */
function handleSlideSelected({ slideNumber, totalSlides, text, fileName }) {
  // Always refresh full content so AI knows every slide
  if (pptxEditorRef.value?.getAllSlidesText) {
    const allText = pptxEditorRef.value.getAllSlidesText()
    const full = `[Presentation: ${fileName}]\n\n${allText}`
    if (aiDocOpen.value) {
      updateAiDocFileContent(full)
    }
  }
  // Focused slide goes into selectedText
  const focusedLabel = `Slide ${slideNumber} of ${totalSlides}:\n${text}`
  if (aiDocOpen.value) {
    updateAiDocSelection(focusedLabel)
  }
}

/** Handle @sheet-changed from XlsxEditor — fullFileContent = all sheets, selectedText = this sheet. */
function handleSheetChanged({ sheetName, sheetIndex, totalSheets, text, fileName }) {
  if (xlsxEditorRef.value?.getAllSheetsText) {
    const allText = xlsxEditorRef.value.getAllSheetsText()
    const full = `[Spreadsheet: ${fileName}]\n\n${allText}`
    if (aiDocOpen.value) {
      updateAiDocFileContent(full)
    }
  }
  const focusedLabel = `Sheet "${sheetName}" (${sheetIndex + 1} of ${totalSheets}):\n${text}`
  if (aiDocOpen.value) {
    updateAiDocSelection(focusedLabel)
  }
}

/** Apply AI replacement to the document. Stores a revert snapshot. */
function onAiDocApply(msgId) {
  const info = getReplacementInfo(msgId)
  if (!info) return

  const { replacement, targetText } = info

  // Snapshot full file content for revert BEFORE attempting apply,
  // but roll it back if apply refuses (e.g. stale selection).
  const snapshot = store.activeFile?.content || editorContent.value
  _revertSnapshots.set(msgId, snapshot)

  const ok = _applyReplacement(targetText, replacement)
  if (!ok) {
    // Apply refused — don't keep a bogus revert snapshot and don't mark applied.
    _revertSnapshots.delete(msgId)
    markAiDocApplyFailed(msgId)
    return
  }

  markAiDocApplied(msgId)
  const postContent = _currentEditorContent()
  updateAiDocFileContent(postContent)
  _pushAiEditHistory({
    source: 'replacement',
    msgId,
    preContent: snapshot,
    postContent,
  })
}

/** Revert a previously applied AI edit. */
function onAiDocRevert(msgId) {
  const snapshot = _revertSnapshots.get(msgId)
  if (snapshot === undefined) return

  // Restore content
  store.updateContent(snapshot)
  editorContent.value = snapshot

  // Clear highlight
  _clearHighlights()

  // Mark as reverted in composable
  markAiDocReverted(msgId)

  // Update the composable's file content
  updateAiDocFileContent(snapshot)

  // Remove snapshot
  _revertSnapshots.delete(msgId)
}

/** Revert a file_operation tool-based AI edit. Restores pre-turn disk content. */
async function onAiDocToolRevert(msgId) {
  const msg = aiDocMessages.value.find(m => m.id === msgId)
  const te = msg?.toolEdit
  if (!te || te.reverted) return
  try {
    await window.electronAPI.obsidian.writeFile(te.filePath, te.preContent)
    if (store.activeFile?.path === te.filePath) {
      store.activeFile.content = te.preContent
      store.activeFile.dirty = false
      editorContent.value = te.preContent
      if (isMarkdown.value && !editMode.value) {
        await nextTick()
        await refreshFormattedHtml()
      }
      updateAiDocFileContent(te.preContent)
    }
    markAiDocToolEditReverted(msgId)
  } catch (err) {
    console.warn('[AI Doc] Tool-revert failed:', err?.message)
  }
}

/** Re-apply a previously reverted tool-based AI edit. */
async function onAiDocToolReapply(msgId) {
  const msg = aiDocMessages.value.find(m => m.id === msgId)
  const te = msg?.toolEdit
  if (!te || !te.reverted || !te.filePath) return
  // Find the post-content from our undo/redo stacks — tool entries store it.
  const match =
    [..._aiUndoStack, ..._aiRedoStack].reverse().find(
      e => e.source === 'tool' && e.msgId === msgId
    )
  if (!match) return
  try {
    await window.electronAPI.obsidian.writeFile(te.filePath, match.postContent)
    if (store.activeFile?.path === te.filePath) {
      store.activeFile.content = match.postContent
      store.activeFile.dirty = false
      editorContent.value = match.postContent
      if (isMarkdown.value && !editMode.value) {
        await nextTick()
        await refreshFormattedHtml()
      }
      updateAiDocFileContent(match.postContent)
    }
    markAiDocToolEditReapplied(msgId)
  } catch (err) {
    console.warn('[AI Doc] Tool-reapply failed:', err?.message)
  }
}

/**
 * Apply replacement text into the current editor.
 * Returns true on success, false when refused (e.g. stale selection not found).
 */
function _applyReplacement(targetText, newText) {
  // 1) If there's an editor-provided callback (DOCX/PPTX/XLSX), use it.
  //    Do NOT null it out after use — the editor registers it per file open,
  //    and the user may apply multiple edits in one session.
  if (_editorReplaceCallback) {
    try {
      _editorReplaceCallback(newText)
      return true
    } catch {
      // Callback threw — fall through to text-based apply.
    }
  }

  const currentFullContent =
    (isMarkdown.value || isTextLike.value ? editorContent.value : null) ??
    store.activeFile?.content ?? ''

  // Determine whether this replacement targets the WHOLE file or a SUBSTRING.
  // A whole-file edit is one where targetText equals the current full content
  // (or is empty — e.g. "write a poem about X" into an empty file).
  const isWholeFileEdit = !targetText || targetText === currentFullContent
  const idx = isWholeFileEdit ? -1 : currentFullContent.indexOf(targetText)

  // If it's a substring edit and the substring is not found, the selection
  // went stale (user typed after selecting, or AI returned wrong target).
  // Refuse rather than silently overwriting the whole file.
  if (!isWholeFileEdit && idx < 0) {
    console.warn('[AI Doc] Refused replacement: target text not found in current content')
    return false
  }

  // Markdown formatted mode
  if (isMarkdown.value && !editMode.value && formattedEl.value) {
    const updated = isWholeFileEdit
      ? newText
      : currentFullContent.slice(0, idx) + newText + currentFullContent.slice(idx + targetText.length)
    editorContent.value = updated
    store.updateContent(updated)
    nextTick(() => refreshFormattedHtml())
    _addHighlights()
    return true
  }

  // Markdown source mode
  if (isMarkdown.value && editMode.value) {
    const updated = isWholeFileEdit
      ? newText
      : currentFullContent.slice(0, idx) + newText + currentFullContent.slice(idx + targetText.length)
    editorContent.value = updated
    store.updateContent(updated)
    return true
  }

  // Code viewer (isTextLike)
  if (isTextLike.value) {
    const cv = codeViewerRef.value
    if (isWholeFileEdit) {
      store.updateContent(newText)
      editorContent.value = newText
    } else {
      const startLine = currentFullContent.slice(0, idx).split('\n').length - 1
      const newLineCount = newText.split('\n').length
      const updated = currentFullContent.slice(0, idx) + newText + currentFullContent.slice(idx + targetText.length)
      store.updateContent(updated)
      editorContent.value = updated
      nextTick(() => cv?.setHighlightedLines?.(startLine, startLine + newLineCount - 1))
    }
    return true
  }

  // Whole-file fallback for any other text-bearing file
  if (store.activeFile?.content !== undefined) {
    const content = store.activeFile.content
    if (isWholeFileEdit) {
      store.updateContent(newText)
      editorContent.value = newText
    } else {
      const updated = content.slice(0, idx) + newText + content.slice(idx + targetText.length)
      store.updateContent(updated)
      editorContent.value = updated
    }
    return true
  }
  return false
}

/** Add green highlight spans to formatted view. */
function _addHighlights() {
  // For formatted markdown, we add a highlight class via DOM
  if (formattedEl.value) {
    nextTick(() => {
      // Simple approach: highlight the entire formatted content briefly
      formattedEl.value?.classList.add('ai-edit-highlight')
    })
  }
}

/** Clear all AI edit highlights (called on doc switch / page leave). */
function _clearHighlights() {
  document.querySelectorAll('.ai-edit-highlight').forEach(el => {
    el.classList.remove('ai-edit-highlight')
    el.classList.add('ai-edit-highlight-fade')
    setTimeout(() => {
      el.classList.remove('ai-edit-highlight-fade')
      // For span wrappers, unwrap them
      if (el.tagName === 'SPAN' && el.parentNode) {
        el.parentNode.replaceChild(document.createTextNode(el.textContent), el)
        el.parentNode.normalize()
      }
    }, 600)
  })
  codeViewerRef.value?.clearHighlightedLines?.()
}


function onGlobalKeydown(e) {
  const ctrl = e.ctrlKey || e.metaKey
  // Ctrl+K / Cmd+K triggers AI Doc
  if (ctrl && e.key === 'k') {
    if (!store.activeFile) return
    e.preventDefault()
    _snapshotSelection()
    _openAiDocFromSelection()
  }
  // Ctrl+S / Cmd+S manual save
  if (ctrl && e.key === 's') {
    if (!store.activeFile) return
    e.preventDefault()
    saveFile()
  }
  // Ctrl+F — open search bar
  if (ctrl && e.key === 'f') {
    if (!store.activeFile || isDrawio.value || isImage.value) return
    e.preventDefault()
    openSearchBar()
  }
  // Ctrl+H — open search/replace bar
  if (ctrl && e.key === 'h') {
    if (!store.activeFile || isDrawio.value || isImage.value) return
    e.preventDefault()
    openSearchBar()
  }
  // Escape closes search bar or modals
  if (e.key === 'Escape') {
    if (showDocPermModal.value) { showDocPermModal.value = false; return }
    if (showDocAgentModal.value) { showDocAgentModal.value = false; return }
    if (searchBarOpen.value) { searchBarOpen.value = false }
  }
}

function _onWindowResize() { _clampPanel() }

// Attach Ctrl+K listener + selectionchange cache on mount
onMounted(() => {
  document.addEventListener('keydown', onGlobalKeydown, true)
  document.addEventListener('selectionchange', _snapshotSelection)
  window.addEventListener('resize', _onWindowResize)
  // AI Doc undo/redo (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z). Capture phase so we can
  // steal the keystroke before a focused textarea's native undo runs, but we
  // only preventDefault when our stack actually has a matching entry.
  document.addEventListener('keydown', _onDocsKeydown, true)
})

// Auto-open AI Doc panel when a supported file is opened (if switch is on)
watch(() => store.activeFile?.path, (newPath, oldPath) => {
  if (newPath !== oldPath) {
    // Clear highlights from previous file
    _clearHighlights()
    // Clear revert snapshots from previous file
    _revertSnapshots.clear()
    _aiUndoStack.length = 0
    _aiRedoStack.length = 0
    _editorReplaceCallback = null
    hasSelection.value = false
    searchBarOpen.value = false

    // Default HTML files to rendered view
    if (newPath && /\.html?$/i.test(newPath)) {
      editMode.value = false
    }

    // Fix stale internal TOC anchor links when opening a markdown file
    if (newPath && newPath.endsWith('.md')) {
      nextTick(() => {
        const content = store.activeFile?.content || editorContent.value
        if (!content) return
        const fixed = fixTocLinks(content)
        if (fixed !== content) {
          editorContent.value = fixed
          store.updateContent(fixed)
          store.saveFile()
        }
      })
    }
  }
  if (newPath && aiDocEnabled.value && !isDrawio.value && !isImage.value) {
    // Use nextTick to ensure activeFile.content is loaded
    nextTick(() => _ensureAiDocPanel())
  } else {
    closeAiDoc()
  }
})

// Close AI panel when docs pane is hidden in focus mode (toggle or exit)
watch(() => [focusModeStore.showDocs, focusModeStore.isFocusMode], ([showDocs, isFocusMode]) => {
  if (!showDocs || !isFocusMode) {
    closeAiDoc()
  }
})

// Keep composable's file content in sync when content changes
watch(editorContent, (val) => {
  if (aiDocOpen.value) {
    updateAiDocFileContent(val)
  }
})


// GitHub-style heading slug — lowercase, strip non-word chars, spaces to hyphens.
// Matches the anchor format used in hand-written Markdown TOCs.
function slugify(text) {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{N} \-_]/gu, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
}

/**
 * Scan markdown content for internal anchor links ([text](#anchor)) and fix
 * any anchors that don't match an actual heading ID. External links are untouched.
 * Returns the fixed content (unchanged if no fixes needed).
 */
function fixTocLinks(md) {
  // Extract all heading slugs from the document
  const headingSlugs = new Set()
  const headingLines = []
  const headingRe = /^#{1,6}\s+(.+)$/gm
  let hm
  while ((hm = headingRe.exec(md)) !== null) {
    const raw = hm[1].replace(/<[^>]+>/g, '').trim()
    const slug = slugify(raw)
    headingSlugs.add(slug)
    headingLines.push({ raw, slug })
  }
  if (headingLines.length === 0) return md

  // Replace internal anchor links whose target doesn't exist.
  // Matches [link text](#anchor) but not ![image](#anchor) or external URLs.
  return md.replace(/(?<!!)\[([^\]]*)\]\(#([^)]+)\)/g, (full, linkText, anchor) => {
    const decoded = decodeURIComponent(anchor)
    // Already valid — leave alone
    if (headingSlugs.has(decoded)) return full

    // Try to find the best match by slugifying the link text itself
    const textSlug = slugify(linkText)
    if (headingSlugs.has(textSlug)) {
      return `[${linkText}](#${textSlug})`
    }

    // Fuzzy fallback: heading whose slug or raw text partially matches
    const fuzzy = headingLines.find(h =>
      h.slug.includes(textSlug) || textSlug.includes(h.slug) ||
      h.raw.toLowerCase().includes(linkText.toLowerCase())
    )
    if (fuzzy) {
      return `[${linkText}](#${fuzzy.slug})`
    }

    // No match found — leave link unchanged rather than breaking it further
    return full
  })
}

// Markdown rendering — custom renderers for images and headings
// marked 12.x passes positional args: (href, title, text)
const renderer = new marked.Renderer()
renderer.image = function (href, title, text) {
  // For relative/local paths, store original path in data attributes for async base64 loading
  if (href && !href.startsWith('http://') && !href.startsWith('https://') && !href.startsWith('data:')) {
    const fileDir = store.activeFile?.path?.replace(/[/\\][^/\\]+$/, '') || store.vaultPath
    const absPath = fileDir ? `${fileDir}/${href}` : href
    return `<img src="" data-relpath="${href}" data-abspath="${absPath}" alt="${text || ''}"${title ? ` title="${title}"` : ''} />`
  }
  return `<img src="${href}" alt="${text || ''}"${title ? ` title="${title}"` : ''} />`
}
renderer.heading = function (text, level) {
  const id = slugify(text.replace(/<[^>]+>/g, ''))
  return `<h${level} id="${id}">${text}</h${level}>\n`
}
marked.use({ gfm: true, breaks: true, renderer })

function renderToHtml(md) {
  if (!md) return ''
  try {
    const raw = marked.parse(md)
    return DOMPurify.sanitize(raw, {
      ALLOW_UNKNOWN_PROTOCOLS: true,
      ADD_ATTR: ['data-relpath', 'data-abspath'],
    })
  } catch { return '' }
}

// Refresh the formatted HTML from the current markdown source.
// Renders markdown to HTML, then asynchronously loads local images as data URLs.
async function refreshFormattedHtml() {
  // renderToHtml() already sanitizes via DOMPurify
  const safeHtml = renderToHtml(editorContent.value)
  formattedHtml.value = safeHtml
  await nextTick()
  // v-html may silently skip updates on contenteditable divs that have been
  // modified by user typing. Force-sync the DOM so images are in the tree.
  if (formattedEl.value) {
    formattedEl.value.textContent = ''                    // clear safely
    formattedEl.value.insertAdjacentHTML('afterbegin', safeHtml) // re-insert DOMPurify-sanitized HTML
  }
  await loadLocalImages()
}

// Scan the formatted view for local images and load them as data: URLs via IPC
async function loadLocalImages() {
  if (!formattedEl.value) return
  const imgs = formattedEl.value.querySelectorAll('img[data-abspath]')
  if (imgs.length === 0) return
  const loadPromises = Array.from(imgs).map(async (img) => {
    const absPath = img.getAttribute('data-abspath')
    if (!absPath) return
    try {
      const result = await window.electronAPI.obsidian.readImageBase64(absPath)
      if (result?.base64 && result?.mime) {
        img.src = `data:${result.mime};base64,${result.base64}`
      }
    } catch {}
  })
  await Promise.all(loadPromises)
}

// When the user types in the contenteditable formatted view,
// convert the edited HTML back to markdown via turndown.
function onFormattedInput() {
  if (!formattedEl.value) return
  const html = formattedEl.value.innerHTML
  const md = turndown.turndown(html)
  // Set flag BEFORE updating so the watcher skips re-rendering
  editingFormatted = true
  editorContent.value = md
}

// Read a Blob as base64 (promise-based)
function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(reader.result.split(',')[1])
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

// Save image base64 to vault, insert markdown at cursor position, save file, refresh display
async function saveAndInsertImage(base64, ext, cursorOffset) {
  if (!store.activeFile) return

  const fileName = `img-${Date.now()}.${ext}`
  const fileDir = store.activeFile.path.replace(/[/\\][^/\\]+$/, '') || store.vaultPath

  const result = await window.electronAPI.obsidian.saveImage(fileDir, fileName, base64)

  if (!result || result.error) {
    showLinkError(`Failed to save image: ${result?.error || 'unknown error'}`)
    return
  }

  const imgMarkdown = `\n![${fileName}](${result.relativePath})\n`
  const content = store.activeFile.content || ''

  // Insert at cursor position if provided, otherwise append at end
  let newContent
  if (typeof cursorOffset === 'number' && cursorOffset >= 0 && cursorOffset <= content.length) {
    newContent = content.slice(0, cursorOffset) + imgMarkdown + content.slice(cursorOffset)
  } else {
    newContent = content + imgMarkdown
  }

  // Directly update store content (bypass watcher chain to avoid race conditions)
  store.activeFile.content = newContent
  store.activeFile.dirty = true
  editorContent.value = newContent

  // Save immediately
  await store.saveFile()

  // Refresh display
  editingFormatted = false
  await refreshFormattedHtml()
}

// Get the cursor offset in markdown source corresponding to the current selection in the formatted view
function getCursorMarkdownOffset() {
  if (!formattedEl.value) return -1
  const sel = window.getSelection()
  if (!sel || sel.rangeCount === 0) return -1

  // Clone the DOM up to the cursor, convert to markdown, measure length
  const range = sel.getRangeAt(0)
  const preRange = document.createRange()
  preRange.selectNodeContents(formattedEl.value)
  preRange.setEnd(range.startContainer, range.startOffset)

  const fragment = preRange.cloneContents()
  const tempDiv = document.createElement('div')
  tempDiv.appendChild(fragment)
  const mdBefore = turndown.turndown(tempDiv.innerHTML)
  return mdBefore.length
}

// Handle image paste in formatted view
async function onFormattedPaste(e) {
  const items = e.clipboardData?.items

  // Capture cursor position before any async work
  const cursorOffset = getCursorMarkdownOffset()

  // Check browser clipboard for image data first (native Linux/Mac)
  if (items && items.length > 0) {
    let imageItem = null
    for (let i = 0; i < items.length; i++) {
      if (items[i].type.startsWith('image/')) {
        imageItem = items[i]
        break
      }
    }
    if (imageItem) {
      e.preventDefault()
      const blob = imageItem.getAsFile()
      if (!blob) { showLinkError(t('notes.couldNotReadImage')); return }
      try {
        const base64 = await blobToBase64(blob)
        const ext = (blob.type.split('/')[1] || 'png').replace('jpeg', 'jpg')
        await saveAndInsertImage(base64, ext, cursorOffset)
      } catch (err) {
        showLinkError(`Image paste failed: ${err.message}`)
      }
      return
    }
  }

  // WSL2 fallback: browser clipboard has no image data because WSLg
  // doesn't bridge image binary. Ask PowerShell to read the Windows clipboard.
  if (window.electronAPI?.getClipboardImage) {
    const contentBeforePaste = store.activeFile?.content || ''
    try {
      const clip = await window.electronAPI.getClipboardImage()

      if (clip?.hasImage && clip.base64) {
        // Restore content to pre-paste state (undo the default text paste side-effect)
        store.activeFile.content = contentBeforePaste
        editorContent.value = contentBeforePaste

        const ext = (clip.type?.split('/')[1] || 'png').replace('jpeg', 'jpg')
        await saveAndInsertImage(clip.base64, ext, cursorOffset)
        return
      }
    } catch {}
  }

  // No image found — let default paste proceed (text paste)
}

// Refresh HTML when file changes
watch(() => store.activeFile?.path, async () => {
  editMode.value = false
  editingFormatted = false
  await refreshFormattedHtml()
})

// Refresh HTML when content changes from source mode (not from formatted editing).
// When editing in formatted mode, we skip this to avoid resetting the DOM + cursor.
watch(editorContent, async () => {
  if (editingFormatted) {
    editingFormatted = false
    return
  }
  await refreshFormattedHtml()
})

// Refresh HTML when switching back to formatted mode
watch(editMode, async (val) => {
  if (!val) await refreshFormattedHtml()
})

// Refresh tree + re-render active md file when navigating to this view.
// Also lazy-restore the last opened doc here (NOT in store.loadConfig) so
// file I/O never happens during app launch — only when the user actually
// opens the AI Doc page.
async function onViewEnter() {
  if (!store.vaultPath) return
  await store.loadTree()
  if (!store.activeFile) {
    await store.restoreLastOpenedDoc()
  }
  if (store.activeFile && store.activeFile.name?.endsWith('.md')) {
    await refreshFormattedHtml()
  }
}
onMounted(onViewEnter)
onActivated(onViewEnter)

// Auto-focus context action input when it appears
watch(() => ctxAction.value.visible, async (v) => {
  if (v) { await nextTick(); ctxInputRef.value?.focus() }
})

async function openWithExternalApp() {
  if (!store.activeFile?.path) return
  await window.electronAPI.openFile(store.activeFile.path)
}

// ── Search / Replace handlers ──
function openSearchBar() {
  searchBarOpen.value = true
  nextTick(() => searchBarRef.value?.focus())
}

function _makeOpts({ matchCase, wholeWord }) {
  return { matchCase: !!matchCase, wholeWord: !!wholeWord }
}

function _getBinaryEditorRef() {
  if (isPptx.value) return pptxEditorRef.value
  if (isXlsx.value) return xlsxEditorRef.value
  if (isDocx.value) return docxEditorRef.value
  return null
}

function onSearchCountRequest({ query, matchCase, wholeWord }) {
  const ref = _getBinaryEditorRef()
  if (!ref?.countMatches) return
  const count = ref.countMatches(query, _makeOpts({ matchCase, wholeWord }))
  searchBarRef.value?.updateCount(count)
}

function onSearchFindNext({ query, matchCase, wholeWord }) {
  // For binary editors, no element-level navigation — just re-count to confirm
  onSearchCountRequest({ query, matchCase, wholeWord })
}
function onSearchFindPrev({ query, matchCase, wholeWord }) {
  onSearchCountRequest({ query, matchCase, wholeWord })
}

function onSearchReplaceOne({ search, replacement, matchCase, wholeWord, single, matchStart, matchEnd }) {
  const opts = _makeOpts({ matchCase, wholeWord })
  if (isTextFile.value) {
    // For text: replace the currently highlighted match by position
    if (matchStart != null && matchEnd != null) {
      const content = editorContent.value
      const newContent = content.slice(0, matchStart) + replacement + content.slice(matchEnd)
      editorContent.value = newContent
      searchBarRef.value?.recompute()
      searchBarRef.value?.showFeedback('1 replaced', true)
    }
  } else {
    const ref = _getBinaryEditorRef()
    if (!ref?.performSearchReplace) return
    const { replaced } = ref.performSearchReplace(search, replacement, { ...opts, replaceAll: false })
    onSearchCountRequest({ query: search, ...opts })
    searchBarRef.value?.showFeedback(replaced ? t('notes.replaced', { count: replaced }) : t('notes.notFound'), replaced > 0)
  }
}

function onSearchReplaceAll({ search, replacement, matchCase, wholeWord }) {
  const opts = _makeOpts({ matchCase, wholeWord })
  if (isTextFile.value) {
    const flags = matchCase ? 'g' : 'gi'
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const pattern = wholeWord ? `(?<![\\w])${escaped}(?![\\w])` : escaped
    try {
      const re = new RegExp(pattern, flags)
      const original = editorContent.value
      const replaced = original.match(re)?.length || 0
      editorContent.value = original.replace(re, replacement)
      searchBarRef.value?.recompute()
      searchBarRef.value?.showFeedback(t('notes.replaced', { count: replaced }), replaced > 0)
    } catch {
      searchBarRef.value?.showFeedback(t('notes.invalidPattern'), false)
    }
  } else {
    const ref = _getBinaryEditorRef()
    if (!ref?.performSearchReplace) return
    const { replaced } = ref.performSearchReplace(search, replacement, { ...opts, replaceAll: true })
    onSearchCountRequest({ query: search, ...opts })
    searchBarRef.value?.showFeedback(replaced ? t('notes.replaced', { count: replaced }) : t('notes.notFound'), replaced > 0)
  }
}

async function copySource() {
  if (!store.activeFile?.content) return
  try {
    await navigator.clipboard.writeText(store.activeFile.content)
    copied.value = true
    if (copiedTimer) clearTimeout(copiedTimer)
    copiedTimer = setTimeout(() => { copied.value = false }, 2000)
  } catch {}
}

function showLinkError(msg) {
  linkError.value = msg
  if (linkErrorTimer) clearTimeout(linkErrorTimer)
  linkErrorTimer = setTimeout(() => { linkError.value = '' }, 6000)
}

async function handlePreviewClick(e) {
  // Walk up from click target to find an <a> tag
  let el = e.target
  while (el && el.tagName !== 'A') {
    if (el === e.currentTarget) return // no link found, do nothing
    el = el.parentElement
  }
  if (!el || !el.href) return

  e.preventDefault()
  e.stopPropagation()

  const href = el.getAttribute('href') || ''

  // 1. Same-page anchor (#fragment) — check before external URL because
  //    in dev mode el.href resolves to http://localhost:...#fragment.
  if (href.startsWith('#')) {
    const id = decodeURIComponent(href.slice(1))
    const target = document.getElementById(id)
    if (target) target.scrollIntoView({ behavior: 'smooth' })
    return
  }

  // 2. Internal .md link — must be checked BEFORE external URL check because
  //    the browser resolves relative paths to http://localhost:.../*.md which
  //    would otherwise be caught by the external URL branch.
  if (href.endsWith('.md') || href.includes('.md#')) {
    const decoded = decodeURIComponent(href)
    const [mdPath, anchor] = decoded.split('#')
    const cleanPath = mdPath.replace(/^\.\//, '')
    const currentDir = store.activeFile?.path?.replace(/[/\\][^/\\]+$/, '') || store.vaultPath
    const resolved = cleanPath.startsWith('/')
      ? store.vaultPath + cleanPath
      : currentDir + '/' + cleanPath
    try {
      await store.openFile(resolved, cleanPath.split('/').pop())
      if (anchor) {
        await nextTick()
        const target = document.getElementById(decodeURIComponent(anchor))
        if (target) target.scrollIntoView({ behavior: 'smooth' })
      }
    } catch (err) {
      showLinkError(`Could not open note: ${mdPath}`)
    }
    return
  }

  // 3. True external URL — open in system browser
  if (href.startsWith('http://') || href.startsWith('https://')) {
    try {
      if (window.electronAPI?.openExternal) {
        const res = await window.electronAPI.openExternal(href)
        if (res?.error) showLinkError(`Could not open link: ${res.error}`)
      } else {
        window.open(href, '_blank')
      }
    } catch (err) {
      showLinkError(`Failed to open link: ${err.message}`)
    }
    return
  }

  // Unknown link type
  showLinkError(`Cannot open link: ${href}`)
}

async function onDrawioSave(xml) {
  store.updateContent(xml)
  saving.value = true
  await store.saveFile()
  saving.value = false
}

async function onPptxSave(base64) {
  saving.value = true
  await store.saveBinaryFile(base64)
  saving.value = false
}

async function onDocxSave(base64) {
  saving.value = true
  await store.saveBinaryFile(base64)
  saving.value = false
}

async function onXlsxSave(base64) {
  saving.value = true
  await store.saveBinaryFile(base64)
  saving.value = false
}

function onCodeContentChange(newContent) {
  store.updateContent(newContent)
  editorContent.value = newContent
}

// ── Context menu handlers ──
const ctxPathCopied = ref(false)

function openContextMenu(e, targetPath, targetType) {
  e.preventDefault?.()
  e.stopPropagation?.()
  const x = Math.min(e.clientX, window.innerWidth - 210)
  const y = Math.min(e.clientY, window.innerHeight - 220)
  ctxPathCopied.value = false
  ctxMenu.value = { visible: true, x, y, targetPath, targetType }
}

function closeContextMenu() {
  ctxMenu.value.visible = false
}

function copyPathFromCtx(path) {
  navigator.clipboard.writeText(path)
  ctxPathCopied.value = true
  setTimeout(() => {
    ctxPathCopied.value = false
    closeContextMenu()
  }, 900)
}

function revealInExplorer(path) {
  window.electronAPI.showInFolder(path)
}

function startCtxAction(type, pathArg) {
  const pos = { x: ctxMenu.value.x, y: ctxMenu.value.y }
  closeContextMenu()
  // For rename: parent = folder containing the item, targetPath = item itself
  // For new*:   parent = directory to create in,      targetPath = ''
  const parent = type === 'rename'
    ? pathArg.replace(/[/\\][^/\\]+$/, '') || store.vaultPath
    : pathArg
  const currentName = type === 'rename' ? pathArg.split(/[/\\]/).pop() : ''
  ctxInputValue.value = currentName
  ctxAction.value = { visible: true, type, parent, targetPath: type === 'rename' ? pathArg : '', x: pos.x, y: pos.y }
}

function cancelCtxAction() {
  ctxAction.value.visible = false
  ctxInputValue.value = ''
}

async function commitCtxAction() {
  const { type, parent, targetPath } = ctxAction.value
  const rawName = ctxInputValue.value.trim()
  if (!rawName) return
  cancelCtxAction()

  if (type === 'newFile') {
    await store.createFile(parent, rawName)
  } else if (type === 'newDiagram') {
    const result = await store.createDrawio(parent, rawName)
    if (result?.path) {
      const parts = result.path.split(/[/\\]/)
      await store.openFile(result.path, parts[parts.length - 1])
    }
  } else if (type === 'newDocx') {
    const result = await store.createDocx(parent, rawName)
    if (result?.path) {
      const parts = result.path.split(/[/\\]/)
      await store.openFile(result.path, parts[parts.length - 1])
    }
  } else if (type === 'newXlsx') {
    const result = await store.createXlsx(parent, rawName)
    if (result?.path) {
      const parts = result.path.split(/[/\\]/)
      await store.openFile(result.path, parts[parts.length - 1])
    }
  } else if (type === 'newFolder') {
    await store.createFolder(parent, rawName)
  } else if (type === 'rename') {
    const origExt = targetPath.match(/(\.[^./\\]+)$/)?.[1] || ''
    const newName = rawName.includes('.') ? rawName : rawName + origExt
    await store.renameItem(targetPath, parent + '/' + newName)
  }
}

const confirmDeleteTarget = ref(null)
const deleting = ref(false)
const deleteError = ref('')

// Called from both context menu and TreeNode delete-item events.
// For directories: checks real disk emptiness before showing confirm dialog.
async function startCtxDelete(itemPath, itemType) {
  closeContextMenu()
  const parts = itemPath.split(/[/\\]/)
  const name = parts[parts.length - 1] || itemPath
  deleteError.value = ''

  if (itemType === 'dir') {
    const res = await window.electronAPI.obsidian.isDirEmpty(itemPath)
    if (res?.error) {
      // Can't stat — show error via modal so the user knows
      confirmDeleteTarget.value = { path: itemPath, name, isDir: true, blocked: res.error }
      return
    }
    if (!res?.empty) {
      // Folder has contents on disk — block deletion
      confirmDeleteTarget.value = { path: itemPath, name, isDir: true, blocked: t('notes.folderNotEmpty') }
      return
    }
  }

  confirmDeleteTarget.value = { path: itemPath, name, isDir: itemType === 'dir', blocked: null }
}

// Legacy entry point kept for TreeNode @delete-item events (which only fire for files)
function handleDeleteItem(itemPath) {
  startCtxDelete(itemPath, 'file')
}

function closeDeleteDialog() {
  if (deleting.value) return
  confirmDeleteTarget.value = null
  deleteError.value = ''
}

async function executeDelete() {
  if (!confirmDeleteTarget.value || deleting.value) return
  if (confirmDeleteTarget.value.blocked) return
  deleting.value = true
  deleteError.value = ''
  try {
    const result = await store.deleteItem(confirmDeleteTarget.value.path)
    if (result?.error) throw new Error(result.error)
    confirmDeleteTarget.value = null
  } catch (err) {
    deleteError.value = err.message || t('notes.failedToDelete')
  } finally {
    deleting.value = false
  }
}

// ── Resizable sidebar ──
const notesSidebarWidth = ref(280)
const docTreeCollapsed = ref(false)
const isResizing = ref(false)

function startNotesResize(e) {
  e.preventDefault()
  isResizing.value = true
  const startX = e.clientX
  const startW = notesSidebarWidth.value

  function onMouseMove(ev) {
    const delta = ev.clientX - startX
    const newW = Math.min(600, Math.max(180, startW + delta))
    notesSidebarWidth.value = newW
  }
  function onMouseUp() {
    isResizing.value = false
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

// ── Drag-and-drop: move items between folders ──
const rootDragOver = ref(false)

async function handleMoveItem(sourcePath, destFolderPath) {
  const fileName = sourcePath.split(/[/\\]/).pop()
  const newPath = destFolderPath + '/' + fileName
  // Don't move to the same location
  if (sourcePath === newPath) return
  try {
    await store.renameItem(sourcePath, newPath)
  } catch (err) {
    console.error('Move failed:', err)
  }
}

// Copy system files (from OS drag-drop or paste) into a vault directory.
// Accepts either a FileList/File[] (from drop/paste events) or a plain string[].
async function copySystemFilesToDir(filesOrPaths, destDir) {
  if (!filesOrPaths || filesOrPaths.length === 0) return
  let paths
  if (typeof filesOrPaths[0] === 'string') {
    paths = filesOrPaths.filter(Boolean)
  } else {
    paths = Array.from(filesOrPaths).map(f => f.path).filter(Boolean)
  }
  if (paths.length === 0) return
  try {
    await window.electronAPI.obsidian.copyFilesToDir(paths, destDir)
    await store.loadTree()
  } catch (err) {
    console.error('Copy failed:', err)
  }
}

function onRootDragOver(e) {
  const hasSystemFiles = e.dataTransfer.types.includes('Files')
  e.dataTransfer.dropEffect = hasSystemFiles ? 'copy' : 'move'
  rootDragOver.value = true
}

function onRootDragLeave(e) {
  if (!e.currentTarget.contains(e.relatedTarget)) {
    rootDragOver.value = false
  }
}

async function handleRootDrop(e) {
  rootDragOver.value = false
  if (!store.vaultPath) return
  // System file drop (from OS file manager) — files have a .path property in Electron
  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
    await copySystemFilesToDir(e.dataTransfer.files, store.vaultPath)
    return
  }
  // Internal tree node move
  const sourcePath = e.dataTransfer.getData('text/plain')
  if (!sourcePath) return
  handleMoveItem(sourcePath, store.vaultPath)
}

async function handleTreePaste(e) {
  if (!store.vaultPath) return
  const files = e.clipboardData?.files
  if (files && files.length > 0) {
    e.preventDefault()
    await copySystemFilesToDir(files, store.vaultPath)
  }
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

  // Word document (blue #2B5797)
  if (ext === 'docx' || ext === 'doc') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: active ? '#fff' : '#2B5797', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('path', { d: 'M8 13l1.5 5 2-4 2 4L15 13' }),
    ])
  }

  // Excel spreadsheet (green #217346)
  if (ext === 'xlsx' || ext === 'xls') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: active ? '#fff' : '#217346', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('path', { d: 'M8 13h8M8 17h8M8 13v4M12 13v4M16 13v4' }),
    ])
  }

  // PowerPoint
  if (ext === 'pptx' || ext === 'ppt') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: active ? '#fff' : '#D04423', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('path', { d: 'M9 13h2a2 2 0 1 0 0-4H9v8' }),
    ])
  }

  // JSON
  if (ext === 'json') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1' }),
      h('path', { d: 'M16 3h1a2 2 0 0 1 2 2v5a2 2 0 0 0 2 2 2 2 0 0 0-2 2v5a2 2 0 0 1-2 2h-1' }),
    ])
  }

  // JavaScript / TypeScript
  if (ext === 'js' || ext === 'ts' || ext === 'jsx' || ext === 'tsx' || ext === 'mjs' || ext === 'cjs') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('polyline', { points: '16 18 22 12 16 6' }),
      h('polyline', { points: '8 6 2 12 8 18' }),
    ])
  }

  // Images
  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'ico', 'bmp', 'tiff'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('rect', { x: '3', y: '3', width: '18', height: '18', rx: '2' }),
      h('circle', { cx: '8.5', cy: '8.5', r: '1.5' }),
      h('polyline', { points: '21 15 16 10 5 21' }),
    ])
  }

  // PDF
  if (ext === 'pdf') {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('path', { d: 'M9 15h1a1 1 0 0 0 0-2H9v4' }),
      h('path', { d: 'M14 13h1.5a1.5 1.5 0 0 1 0 3H14v-3z' }),
    ])
  }

  // Plain text / config
  if (['txt', 'log', 'env', 'ini', 'cfg', 'conf', 'toml', 'yaml', 'yml'].includes(ext)) {
    return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
      h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
      h('polyline', { points: '14 2 14 8 20 8' }),
      h('line', { x1: '8', y1: '13', x2: '16', y2: '13' }),
      h('line', { x1: '8', y1: '17', x2: '13', y2: '17' }),
    ])
  }

  // Default: generic document
  return h('svg', { style: s, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
    h('path', { d: 'M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z' }),
    h('polyline', { points: '14 2 14 8 20 8' }),
  ])
}

// Per-file hover palette (matches NewsView / Skills / Tools / MCP / Chat tree).
const DOC_HOVER_GRADIENTS = [
  'linear-gradient(135deg, #1E3A5F 0%, #2563EB 60%, #3B82F6 100%)',
  'linear-gradient(135deg, #4C1D95 0%, #7C3AED 60%, #8B5CF6 100%)',
  'linear-gradient(135deg, #065F46 0%, #059669 60%, #10B981 100%)',
  'linear-gradient(135deg, #92400E 0%, #D97706 60%, #F59E0B 100%)',
  'linear-gradient(135deg, #991B1B 0%, #DC2626 60%, #EF4444 100%)',
  'linear-gradient(135deg, #164E63 0%, #0891B2 60%, #06B6D4 100%)',
  'linear-gradient(135deg, #713F12 0%, #CA8A04 60%, #EAB308 100%)',
  'linear-gradient(135deg, #831843 0%, #BE185D 60%, #EC4899 100%)',
]
function _docHoverGradient(pathOrIdx) {
  // Sequential index → clean color cycle (no birthday-paradox clustering).
  if (typeof pathOrIdx === 'number') {
    return DOC_HOVER_GRADIENTS[((pathOrIdx % DOC_HOVER_GRADIENTS.length) + DOC_HOVER_GRADIENTS.length) % DOC_HOVER_GRADIENTS.length]
  }
  const path = pathOrIdx
  if (!path) return DOC_HOVER_GRADIENTS[0]
  let hash = 0
  for (let i = 0; i < path.length; i++) hash = ((hash << 5) - hash + path.charCodeAt(i)) | 0
  return DOC_HOVER_GRADIENTS[Math.abs(hash) % DOC_HOVER_GRADIENTS.length]
}

// ── TreeNode: recursive file tree component ──
const TreeNode = defineComponent({
  name: 'TreeNode',
  props: {
    node: Object,
    depth: Number,
    activePath: String,
    expandedFolders: Object,
    index: { type: Number, default: 0 },
  },
  emits: ['select-file', 'toggle-folder', 'delete-item', 'move-item', 'copy-files', 'context-menu'],
  setup(props, { emit }) {
    const hovered = ref(false)
    const dragOver = ref(false)

    return () => {
      const isDir = props.node.type === 'dir'
      const isExpanded = props.expandedFolders[props.node.path]
      const isActive = props.activePath === props.node.path
      const indent = 12 + props.depth * 18

      const children = []

      // Drag-and-drop event handlers
      const dragEvents = {
        draggable: true,
        onDragstart: (e) => {
          e.dataTransfer.setData('text/plain', props.node.path)
          e.dataTransfer.setData('application/x-node-type', props.node.type)
          e.dataTransfer.effectAllowed = 'move'
          e.currentTarget.classList.add('tree-dragging')
        },
        onDragend: (e) => {
          e.currentTarget.classList.remove('tree-dragging')
        },
      }

      // Drop target events (folders only)
      if (isDir) {
        dragEvents.onDragover = (e) => {
          e.preventDefault()
          const hasSystemFiles = e.dataTransfer.types.includes('Files')
          e.dataTransfer.dropEffect = hasSystemFiles ? 'copy' : 'move'
          dragOver.value = true
        }
        dragEvents.onDragleave = (e) => {
          // Only reset if leaving the element itself (not entering a child)
          if (!e.currentTarget.contains(e.relatedTarget)) {
            dragOver.value = false
          }
        }
        dragEvents.onDrop = (e) => {
          e.preventDefault()
          e.stopPropagation()
          dragOver.value = false
          const destFolder = props.node.path
          // System file drop (from OS file manager)
          if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            emit('copy-files', Array.from(e.dataTransfer.files).map(f => f.path).filter(Boolean), destFolder)
            return
          }
          // Internal tree node move
          const sourcePath = e.dataTransfer.getData('text/plain')
          if (!sourcePath) return
          // Prevent dropping onto self or into own subtree
          if (sourcePath === destFolder || destFolder.startsWith(sourcePath + '/')) return
          emit('move-item', sourcePath, destFolder)
        }
      }

      // Row background: drag-over highlight takes priority
      const isHovered = hovered.value && !isActive
      let rowBg = (isActive || isHovered) ? _docHoverGradient(props.index) : 'transparent'
      if (dragOver.value && isDir) rowBg = 'rgba(0, 122, 255, 0.12)'
      const isDark = isActive || (isHovered && !(dragOver.value && isDir))

      // Main row
      children.push(
        h('div', {
          class: 'flex items-center gap-2 py-1.5 pr-2 cursor-pointer transition-colors duration-100 group relative',
          style: {
            paddingLeft: indent + 'px',
            background: rowBg,
            color: isDark ? '#fff' : '#6B7280',
            boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)' : (isHovered ? '0 2px 8px rgba(0,0,0,0.10)' : 'none'),
            borderRadius: (isActive || isHovered || (dragOver.value && isDir)) ? '8px' : '0',
            margin: (isActive || isHovered || (dragOver.value && isDir)) ? '2px 8px' : '2px 0',
            fontFamily: "'Inter',sans-serif",
            fontSize: 'var(--fs-body)',
            border: dragOver.value && isDir ? '1px dashed #007AFF' : '1px solid transparent',
          },
          onClick: () => {
            if (isDir) emit('toggle-folder', props.node.path)
            else emit('select-file', props.node.path, props.node.name)
          },
          onContextmenu: (e) => { e.preventDefault(); e.stopPropagation(); emit('context-menu', e, props.node) },
          onMouseenter: () => { hovered.value = true },
          onMouseleave: () => { hovered.value = false },
          ...dragEvents,
        }, [
          // Chevron for folders
          isDir ? h('svg', {
            style: {
              width: '14px', height: '14px', flexShrink: 0, color: isDark ? '#fff' : '#9CA3AF',
              transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)',
              transition: 'transform 0.15s'
            },
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2'
          }, [h('polyline', { points: '9 18 15 12 9 6' })]) : h('span', { style: 'width:14px;display:inline-block;' }),

          // Icon
          isDir
            ? h('svg', { style: `width:18px;height:18px;flex-shrink:0;color:${isDark ? '#fff' : '#6B7280'};`, viewBox: '0 0 24 24', fill: 'currentColor' }, [
                h('path', { d: 'M2 6a2 2 0 012-2h5l2 2h9a2 2 0 012 2v10a2 2 0 01-2 2H4a2 2 0 01-2-2V6z' })
              ])
            : fileTypeIcon(props.node.name, isDark ? '#fff' : '#9CA3AF', isDark),

          // Name
          h('span', {
            class: 'truncate flex-1',
            style: { fontWeight: isDir ? '600' : '400' }
          }, props.node.name),
        ])
      )

      // Children (if expanded directory)
      if (isDir && isExpanded && props.node.children) {
        let visibleIdx = 0
        for (const child of props.node.children) {
          if (!_isNodeVisible(child)) continue
          children.push(
            h(TreeNode, {
              node: child,
              index: visibleIdx++,
              depth: props.depth + 1,
              activePath: props.activePath,
              expandedFolders: props.expandedFolders,
              'onSelect-file': (p, n) => emit('select-file', p, n),
              'onToggle-folder': (p) => emit('toggle-folder', p),
              'onDelete-item': (p) => emit('delete-item', p),
              'onMove-item': (src, dest) => emit('move-item', src, dest),
              'onCopy-files': (paths, dest) => emit('copy-files', paths, dest),
              'onContext-menu': (e, node) => emit('context-menu', e, node),
            })
          )
        }
      }

      return h('div', null, children)
    }
  }
})

defineExpose({ docTreeCollapsed })
</script>

<style>
.prose-obsidian {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  line-height: 1.75;
  color: #1A1A1A;
  width: 95%;
  max-width: 95%;
  outline: none;
  cursor: text;
}
.prose-obsidian:focus {
  outline: none;
}
.html-wv-toolbar {
  display: flex;
  align-items: center;
  gap: 4px;
  padding: 6px 8px;
  background: #FFFFFF;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md) var(--radius-md) 0 0;
  flex-shrink: 0;
}
.html-wv-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border: none;
  border-radius: var(--radius-sm);
  background: transparent;
  color: var(--color-text-secondary);
  cursor: pointer;
  transition: all 0.15s ease;
  flex-shrink: 0;
}
.html-wv-btn:hover:not(:disabled) { background: #F5F5F5; color: #1A1A1A; }
.html-wv-btn:disabled { opacity: 0.3; cursor: not-allowed; }
.html-wv-urlbar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  background: #F2F2F7;
  border: 1px solid #F0F0F0;
  border-radius: var(--radius-sm);
  position: relative;
  overflow: hidden;
  transition: border-color 0.15s, box-shadow 0.15s;
}
.html-wv-urlbar:focus-within { border-color: #1A1A1A; box-shadow: 0 0 0 3px rgba(0,0,0,0.06); }
.html-wv-url-icon { color: #9CA3AF; flex-shrink: 0; }
.html-wv-url-input {
  flex: 1;
  min-width: 0;
  border: none;
  background: transparent;
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: var(--fs-small);
  color: #1A1A1A;
  outline: none;
}
.html-wv-url-loader {
  position: absolute;
  bottom: 0; left: 0;
  height: 2px; width: 100%;
  background: linear-gradient(90deg, transparent, #374151, transparent);
  animation: urlLoad 1.2s ease-in-out infinite;
}
@keyframes urlLoad {
  0% { transform: translateX(-100%); }
  100% { transform: translateX(100%); }
}
.docs-html-preview {
  flex: 1;
  min-height: 0;
  width: 100%;
  border: 1px solid var(--color-border);
  border-top: none;
  border-radius: 0 0 var(--radius-md) var(--radius-md);
  background: #FFFFFF;
  display: flex;
}
.notes-source-editor {
  width: 95%;
  max-width: 95%;
  height: 100%;
  resize: none;
  outline: none;
  padding: 24px 0;
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
.prose-obsidian h1 { font-family: 'Inter', serif; font-size: var(--fs-page-title); font-weight: 700; margin: 0 0 16px; color: #1A1A1A; border-bottom: 1px solid #E5E5EA; padding-bottom: 8px; }
.prose-obsidian h2 { font-family: 'Inter', serif; font-size: var(--fs-section); font-weight: 600; margin: 28px 0 12px; color: #1A1A1A; }
.prose-obsidian h3 { font-family: 'Inter', serif; font-size: var(--fs-subtitle); font-weight: 600; margin: 24px 0 8px; color: #1A1A1A; }
.prose-obsidian p { margin: 0 0 12px; }
.prose-obsidian ul, .prose-obsidian ol { margin: 0 0 12px; padding-left: 24px; }
.prose-obsidian li { margin: 4px 0; }
.prose-obsidian code {
  font-family: 'JetBrains Mono', 'Fira Code', monospace;
  font-size: 0.875em;
  background: #F5F5F5;
  padding: 2px 6px;
  border-radius: 4px;
  color: #5856D6;
}
.prose-obsidian pre {
  background: #1C1C1E;
  color: #E5E5EA;
  padding: 16px;
  border-radius: 12px;
  overflow-x: auto;
  margin: 0 0 16px;
  font-size: var(--fs-secondary);
  line-height: 1.5;
}
.prose-obsidian pre code {
  background: none;
  padding: 0;
  color: inherit;
  font-size: inherit;
}
.prose-obsidian blockquote {
  border-left: 3px solid #007AFF;
  margin: 0 0 12px;
  padding: 8px 16px;
  color: #6B7280;
  background: #F2F2F7;
  border-radius: 0 8px 8px 0;
}
.prose-obsidian a { color: #007AFF; text-decoration: none; }
.prose-obsidian a:hover { text-decoration: underline; }
.prose-obsidian hr { border: none; border-top: 1px solid #E5E5EA; margin: 24px 0; }
.prose-obsidian table { border-collapse: collapse; margin: 0 0 16px; width: 100%; }
.prose-obsidian th, .prose-obsidian td { border: 1px solid #E5E5EA; padding: 8px 12px; text-align: left; }
.prose-obsidian th { background: #F9F9F9; font-weight: 600; }
.prose-obsidian img { max-width: 100%; border-radius: 8px; }

/* ── Context menu ── */
.notes-ctx-overlay {
  position: fixed;
  inset: 0;
  z-index: 9998;
}
.notes-ctx-menu {
  position: fixed;
  z-index: 9999;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 10px;
  padding: 4px;
  min-width: 180px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 4px 12px rgba(0,0,0,0.3);
  animation: ctxEnter 0.1s ease-out;
}
@keyframes ctxEnter {
  from { opacity: 0; transform: scale(0.95) translateY(-4px); }
  to   { opacity: 1; transform: scale(1)  translateY(0); }
}
.ctx-item {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 7px 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: #E5E5EA;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  cursor: pointer;
  text-align: left;
  transition: background 0.1s;
}
.ctx-item:hover { background: #1F1F1F; color: #FFFFFF; }
.ctx-item.ctx-danger { color: #FF453A; }
.ctx-item.ctx-danger:hover { background: rgba(255,69,58,0.15); }
.ctx-item.ctx-item-ai {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-weight: 600;
}
.ctx-item.ctx-item-ai:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.ctx-divider { height: 1px; background: #2A2A2A; margin: 4px 0; }

/* ── Context action dialog ── */
.notes-ctx-dialog {
  position: fixed;
  z-index: 9999;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  border-radius: 12px;
  padding: 16px;
  box-shadow: 0 12px 40px rgba(0,0,0,0.5);
  animation: ctxEnter 0.15s ease-out;
}
.ctx-dialog-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  color: #FFFFFF;
  margin-bottom: 10px;
}
.ctx-dialog-input {
  width: 100%;
  box-sizing: border-box;
  padding: 7px 10px;
  background: #1A1A1A;
  border: 1px solid #2A2A2A;
  border-radius: 8px;
  color: #FFFFFF;
  font-family: 'JetBrains Mono', monospace;
  font-size: var(--fs-secondary);
  outline: none;
}
.ctx-dialog-input:focus { border-color: #4B5563; }
.ctx-dialog-input::placeholder { color: #4B5563; }
.ctx-dialog-footer {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
.ctx-dialog-cancel {
  padding: 6px 14px;
  border-radius: 6px;
  border: 1px solid #2A2A2A;
  background: transparent;
  color: #9CA3AF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  cursor: pointer;
}
.ctx-dialog-cancel:hover { background: #1A1A1A; color: #FFFFFF; }
.ctx-dialog-confirm {
  padding: 6px 14px;
  border-radius: 6px;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-secondary);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.3);
}
.ctx-dialog-confirm:hover { background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%); }

/* Drag-and-drop states */
.tree-dragging {
  opacity: 0.4;
}
.root-drag-over {
  background: rgba(0, 122, 255, 0.04);
}

/* Resize handle */
.notes-resize-handle {
  position: absolute;
  top: 0;
  right: 0;
  width: 5px;
  height: 100%;
  cursor: col-resize;
  z-index: 10;
  background: #E5E5EA;
  transition: background 0.15s;
}
.notes-resize-handle:hover,
.notes-resize-handle:active {
  background: #007AFF;
}
.doc-tree-panel {
  flex-shrink: 0;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: #FFFFFF;
  position: relative;
  transition: width 0.2s ease, min-width 0.2s ease;
}
.docs-catalog-header {
  flex-shrink: 0;
  padding: 1rem 1.5rem 1rem;
  background: #FFFFFF;
  border-bottom: 1px solid #E5E5EA;
}
.docs-catalog-title {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-page-title);
  font-weight: 700;
  color: #1A1A1A;
  margin: 0;
}
.docs-catalog-subtitle {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-body);
  color: #6B7280;
  margin: 0.25rem 0 0 0;
}
.doc-tree-icon-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.75rem;
  height: 1.75rem;
  border: none;
  border-radius: 0.5rem;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #fff;
  cursor: pointer;
  transition: background 0.15s;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  flex-shrink: 0;
}
.doc-tree-icon-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.doc-tree-expand-tab {
  position: absolute;
  top: 50%;
  left: 0;
  transform: translateY(-50%);
  z-index: 20;
  display: flex;
  align-items: center;
  justify-content: center;
  width: 1.5rem;
  height: 3rem;
  border: none;
  border-radius: 0 0.5rem 0.5rem 0;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  cursor: pointer;
  box-shadow: 2px 0 8px rgba(0,0,0,0.12);
  transition: width 0.15s ease, background 0.15s ease;
}
.doc-tree-expand-tab:hover {
  width: 1.875rem;
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}

/* ── AI Doc toggle button ── */
.ai-doc-toggle-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
  border: 1px solid #F59E0B;
  background: rgba(245, 158, 11, 0.08);
  color: #D97706;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
}
.ai-doc-toggle-btn:hover:not(.active) {
  background: rgba(245, 158, 11, 0.15);
  border-color: #D97706;
  color: #B45309;
}
.ai-doc-toggle-btn.active {
  background: linear-gradient(135deg, #92400E 0%, #B45309 40%, #D97706 100%);
  border-color: transparent;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(180, 83, 9, 0.35), 0 1px 3px rgba(180, 83, 9, 0.2);
}
.ai-doc-save-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.25rem;
  padding: 0.25rem 0.625rem;
  border: none;
  border-radius: var(--radius-sm);
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  color: #FFFFFF;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  cursor: pointer;
  box-shadow: 0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08);
  transition: background 0.15s, opacity 0.15s;
}
.ai-doc-save-btn:hover {
  background: linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%);
}
.ai-doc-save-btn:disabled {
  opacity: 0.4;
  cursor: default;
}

/* Formatted / Source toggle switch */
.docs-mode-switch {
  display: inline-flex;
  align-items: center;
  gap: 0.4375rem;
  cursor: pointer;
  user-select: none;
}
.docs-mode-state-label {
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  color: #6B7280;
  white-space: nowrap;
  min-width: 4rem;
  text-align: right;
  transition: color 0.15s;
}
.docs-mode-switch:hover .docs-mode-state-label { color: #1A1A1A; }
.docs-mode-track {
  position: relative;
  width: 2.25rem;
  height: 1.25rem;
  border-radius: 9999px;
  background: #D1D5DB;
  transition: background 0.2s;
  flex-shrink: 0;
}
.docs-mode-track.on {
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
}
.docs-mode-thumb {
  position: absolute;
  top: 0.1875rem;
  left: 0.1875rem;
  width: 0.875rem;
  height: 0.875rem;
  border-radius: 9999px;
  background: #FFFFFF;
  box-shadow: 0 1px 3px rgba(0,0,0,0.2);
  transition: transform 0.2s cubic-bezier(0.4,0,0.2,1);
}
.docs-mode-track.on .docs-mode-thumb {
  transform: translateX(1rem);
}

/* Icon-only header action buttons */
.docs-hdr-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.875rem;
  height: 1.875rem;
  border: 1px solid #E5E5EA;
  border-radius: var(--radius-sm);
  background: #FFFFFF;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.12s;
  flex-shrink: 0;
}
.docs-hdr-btn:hover {
  background: #1A1A1A;
  border-color: #1A1A1A;
  color: #FFFFFF;
}
.docs-hdr-btn--ok {
  background: #10B981;
  border-color: #10B981;
  color: #FFFFFF;
}
.docs-hdr-btn--ok:hover {
  background: #059669;
  border-color: #059669;
}
.docs-hdr-btn--err {
  background: #EF4444;
  border-color: #EF4444;
  color: #FFFFFF;
}
.docs-hdr-btn--err:hover {
  background: #DC2626;
  border-color: #DC2626;
}

/* ── Path info icon button ── */
.docs-path-info-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 1.875rem;
  height: 1.875rem;
  border-radius: var(--radius-sm);
  color: #9CA3AF;
  cursor: default;
  flex-shrink: 0;
  position: relative;
}
.docs-path-info-btn:hover {
  color: #6B7280;
}

/* ── Speak button (similar to ai-doc-toggle-btn) ── */
.docs-speak-btn {
  display: inline-flex;
  align-items: center;
  gap: 0.3rem;
  padding: 0.25rem 0.625rem;
  border-radius: var(--radius-sm);
  border: 1px solid #F59E0B;
  background: rgba(245, 158, 11, 0.08);
  color: #D97706;
  font-family: 'Inter', sans-serif;
  font-size: var(--fs-small);
  font-weight: 600;
  cursor: pointer;
  transition: all 0.15s ease;
  user-select: none;
  white-space: nowrap;
}
.docs-speak-btn:hover:not(.active) {
  background: rgba(245, 158, 11, 0.15);
  border-color: #D97706;
}
.docs-speak-btn.active {
  background: linear-gradient(135deg, #92400E 0%, #B45309 40%, #D97706 100%);
  border-color: transparent;
  color: #FFFFFF;
  box-shadow: 0 2px 8px rgba(180, 83, 9, 0.35), 0 1px 3px rgba(180, 83, 9, 0.2);
}
.docs-speak-btn.loading {
  background: rgba(245, 158, 11, 0.06);
  border-color: #FCD34D;
  color: #D97706;
}


/* ── Floating AI Doc Panel ── */
.ai-doc-float {
  position: fixed;
  z-index: 200;
  border-radius: 16px;
  overflow: hidden;
  background: #0F0F0F;
  border: 1px solid #2A2A2A;
  box-shadow: 0 25px 60px rgba(0,0,0,0.4);
  display: flex;
  flex-direction: column;
  animation: aiDocFloatEnter 0.2s ease-out;
}
@keyframes aiDocFloatEnter {
  from { opacity: 0; transform: scale(0.95) translateY(8px); }
  to   { opacity: 1; transform: scale(1)  translateY(0); }
}
/* Top bar: agent-group left + centered drag dots + perm+close right */
.ai-doc-float-topbar {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  padding: 0.5rem 0.5rem;
  background: linear-gradient(135deg, #1C1F2E 0%, #1A1D2B 50%, #1E2235 100%);
  border-bottom: 1px solid #2A2F45;
  flex-shrink: 0;
  cursor: move;
  min-height: 3rem;
}
.ai-doc-float-topbar-left {
  display: flex;
  align-items: center;
  justify-content: flex-start;
  min-width: 0;
}
/* Self-contained agent pill — avatar only, tooltip on hover */
.aidoc-agent-pill {
  position: relative;
  display: flex;
  align-items: center;
  padding: 0.2rem;
  border-radius: 9999px;
  border: none;
  background: linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%);
  cursor: pointer;
  transition: opacity 0.12s ease;
}
.aidoc-agent-pill:hover { opacity: 0.85; }
.aidoc-agent-pill-avatar {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 50%;
  overflow: hidden;
  flex-shrink: 0;
  background: rgba(255,255,255,0.1);
  display: flex;
  align-items: center;
  justify-content: center;
}
.aidoc-agent-pill-img {
  width: 1.625rem;
  height: 1.625rem;
  border-radius: 50%;
  object-fit: cover;
}
.aidoc-agent-pill-initial {
  font-size: 0.625rem;
  font-weight: 700;
  color: #fff;
}
/* Tooltip — fixed position, escapes overflow:hidden of the panel */
.aidoc-agent-tooltip-fixed {
  position: fixed;
  z-index: 9999;
  background: #FFFFFF;
  border: 1px solid #E5E5EA;
  border-radius: 8px;
  padding: 0.4rem 0.6rem;
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  pointer-events: none;
  box-shadow: 0 4px 16px rgba(0,0,0,0.12);
  width: max-content;
  max-width: 200px;
  animation: aidocTooltipIn 0.12s ease-out;
}
@keyframes aidocTooltipIn {
  from { opacity: 0; transform: translateY(-3px); }
  to   { opacity: 1; transform: translateY(0); }
}
.aidoc-agent-tooltip-name {
  font-size: 0.6875rem;
  font-weight: 600;
  color: #1A1A1A;
  line-height: 1.2;
  white-space: nowrap;
}
.aidoc-agent-tooltip-desc {
  font-size: 0.5625rem;
  color: #6B7280;
  line-height: 1.3;
  white-space: normal;
  word-break: break-word;
}
.ai-doc-float-drag-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  pointer-events: none;
}
.ai-doc-float-topbar-right {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 0.15rem;
}
/* Top bar icon buttons */
.aidoc-topbar-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  border-radius: 5px;
  border: none;
  background: transparent;
  color: #6B7280;
  cursor: pointer;
  transition: all 0.12s ease;
}
.aidoc-topbar-btn:hover {
  background: rgba(255,255,255,0.08);
  color: #D1D5DB;
}
.aidoc-topbar-btn--warn {
  color: #F59E0B;
}
.aidoc-topbar-btn--warn:hover {
  color: #FBBF24;
}
.aidoc-topbar-btn--close:hover {
  background: rgba(255,59,48,0.15);
  color: #FF6B6B;
}

.ai-doc-float-resize-r  { position:absolute; top:16px; right:0; width:5px; height:calc(100% - 32px); cursor:ew-resize; z-index:11; }
.ai-doc-float-resize-l  { position:absolute; top:16px; left:0; width:5px; height:calc(100% - 32px); cursor:ew-resize; z-index:11; }
.ai-doc-float-resize-b  { position:absolute; bottom:0; left:16px; width:calc(100% - 32px); height:5px; cursor:ns-resize; z-index:11; }
.ai-doc-float-resize-t  { position:absolute; top:0; left:16px; width:calc(100% - 32px); height:5px; cursor:ns-resize; z-index:11; }
.ai-doc-float-resize-br { position:absolute; bottom:0; right:0; width:16px; height:16px; cursor:nwse-resize; z-index:12; border-bottom-right-radius:16px; }
.ai-doc-float-resize-bl { position:absolute; bottom:0; left:0;  width:16px; height:16px; cursor:nesw-resize; z-index:12; border-bottom-left-radius:16px; }
.ai-doc-float-resize-tr { position:absolute; top:0;    right:0; width:16px; height:16px; cursor:nesw-resize; z-index:12; border-top-right-radius:16px; }
.ai-doc-float-resize-tl { position:absolute; top:0;    left:0;  width:16px; height:16px; cursor:nwse-resize; z-index:12; border-top-left-radius:16px; }

/* ── AI Edit highlight for updated text (contenteditable) ── */
.ai-edit-highlight {
  background: rgba(16, 185, 129, 0.15);
  border-bottom: 2px solid rgba(16, 185, 129, 0.5);
  border-radius: 2px;
  transition: background 0.6s ease, border-color 0.6s ease;
}
.ai-edit-highlight-fade {
  background: transparent;
  border-color: transparent;
}
</style>
