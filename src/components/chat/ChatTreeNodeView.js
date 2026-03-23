import { defineComponent, ref, h } from 'vue'

/**
 * Recursive tree node component for the chat sidebar.
 * Renders folder rows and chat rows with drag-drop support.
 * Uses render functions (h()) because it's recursive and heavily dynamic.
 */
const ChatTreeNodeView = defineComponent({
  name: 'ChatTreeNodeView',
  props: {
    node: { type: Object, required: true },
    depth: { type: Number, default: 0 },
    activeChatId: { type: String, default: null },
    unreadChatIds: { type: Object, default: () => new Set() },
    completedChatIds: { type: Object, default: () => new Set() },
    pendingPermissionChatIds: { type: Object, default: () => new Set() },
    draggingId: { type: String, default: null },
    selectedFolderId: { type: String, default: null },
    contextMenuNodeId: { type: String, default: null },
    onShowTooltip: { type: Function, default: null },
    onHideTooltip: { type: Function, default: null },
  },
  emits: [
    'select-chat', 'toggle-folder',
    'rename-chat', 'delete-chat',
    'context-menu',
    'drag-start', 'drag-end',
    'drop-into', 'drop-before', 'drop-after',
  ],
  setup(props, { emit }) {
    const dragOver = ref(null) // 'top' | 'middle' | 'bottom' | null
    const hovered = ref(false)

    function onDragStart(e) {
      e.stopPropagation()
      e.dataTransfer.effectAllowed = 'move'
      e.dataTransfer.setData('text/plain', props.node.id)
      emit('drag-start', props.node.id)
      e.currentTarget.classList.add('chat-tree-dragging')
    }

    function onDragEnd(e) {
      e.currentTarget.classList.remove('chat-tree-dragging')
      dragOver.value = null
      emit('drag-end')
    }

    function onDragOver(e) {
      if (!props.draggingId || props.draggingId === props.node.id) return
      e.preventDefault()
      e.stopPropagation()
      const rect = e.currentTarget.getBoundingClientRect()
      const y = e.clientY - rect.top
      const rowH = rect.height
      if (props.node.type === 'folder') {
        if (y < rowH * 0.25) dragOver.value = 'top'
        else if (y > rowH * 0.75) dragOver.value = 'bottom'
        else dragOver.value = 'middle'
      } else {
        dragOver.value = y < rowH / 2 ? 'top' : 'bottom'
      }
    }

    function onDragLeave(e) {
      if (!e.currentTarget.contains(e.relatedTarget)) dragOver.value = null
    }

    function onDrop(e) {
      e.preventDefault()
      e.stopPropagation()
      const nodeId = props.draggingId || e.dataTransfer.getData('text/plain')
      if (!nodeId || nodeId === props.node.id) { dragOver.value = null; return }
      const zone = dragOver.value
      dragOver.value = null
      if (zone === 'middle' && props.node.type === 'folder') emit('drop-into', nodeId, props.node.id)
      else if (zone === 'top') emit('drop-before', nodeId, props.node.id)
      else emit('drop-after', nodeId, props.node.id)
    }

    function showTooltip(text, el) {
      if (props.onShowTooltip) {
        const rect = el.getBoundingClientRect()
        props.onShowTooltip({ text, right: (globalThis.innerWidth ?? document.documentElement.clientWidth) - rect.right, top: rect.top })
      }
    }

    function hideTooltip() {
      if (props.onHideTooltip) props.onHideTooltip()
    }

    // Shared child props passthrough
    function childProps(child) {
      return {
        key: child.id,
        node: child,
        depth: props.depth + 1,
        activeChatId: props.activeChatId,
        unreadChatIds: props.unreadChatIds,
        completedChatIds: props.completedChatIds,
        pendingPermissionChatIds: props.pendingPermissionChatIds,
        draggingId: props.draggingId,
        selectedFolderId: props.selectedFolderId,
        contextMenuNodeId: props.contextMenuNodeId,
        onShowTooltip: props.onShowTooltip,
        onHideTooltip: props.onHideTooltip,
        onSelectChat: (id) => emit('select-chat', id),
        onToggleFolder: (id) => emit('toggle-folder', id),
        onRenameChat: (chat) => emit('rename-chat', chat),
        onDeleteChat: (id) => emit('delete-chat', id),
        onContextMenu: (e, node, action) => emit('context-menu', e, node, action),
        onDragStart: (id) => emit('drag-start', id),
        onDragEnd: () => emit('drag-end'),
        onDropInto: (nId, tId) => emit('drop-into', nId, tId),
        onDropBefore: (nId, tId) => emit('drop-before', nId, tId),
        onDropAfter: (nId, tId) => emit('drop-after', nId, tId),
      }
    }

    return () => {
      const { node, depth, activeChatId, unreadChatIds, completedChatIds, pendingPermissionChatIds } = props
      const indent = 4 + depth * 8

      const dragAttrs = {
        draggable: true,
        onDragstart: onDragStart,
        onDragend: onDragEnd,
        onDragover: onDragOver,
        onDragleave: onDragLeave,
        onDrop: onDrop,
      }

      // Helper: recursively check if any chat in subtree is running
      function subtreeHasRunning(n) {
        if (n.type === 'chat') return !!n.isRunning
        for (const child of (n.children || [])) {
          if (subtreeHasRunning(child)) return true
        }
        return false
      }

      if (node.type === 'folder') {
        const isExpanded = node.expanded
        const dragOverFolder = dragOver.value === 'middle'
        const hasCtxMenu = props.contextMenuNodeId === node.id
        let rowBg = (hovered.value || hasCtxMenu)
          ? '#F5F5F5'
          : 'transparent'
        if (dragOverFolder) rowBg = 'rgba(0, 122, 255, 0.08)'
        const textColor = '#1A1A1A'

        const folderRow = h('div', {
          class: 'flex items-center gap-0.5 pr-1 cursor-pointer group relative chat-tree-row',
          style: {
            paddingLeft: indent + 'px',
            paddingTop: '0px',
            paddingBottom: '0px',
            background: rowBg,
            color: textColor,
            borderRadius: '4px',
            margin: '0px 2px',
            fontFamily: "'Inter',sans-serif",
            fontSize: 'var(--fs-caption)',
            fontWeight: '600',
            letterSpacing: '0.01em',
            transition: 'background 0.15s',
            borderTop: dragOver.value === 'top' ? '2px solid #1A1A1A' : '2px solid transparent',
            borderRight: '0px solid transparent',
            borderBottom: dragOver.value === 'bottom' ? '2px solid #1A1A1A' : '2px solid transparent',
            borderLeft: '0px solid transparent',
            outline: dragOverFolder ? '1px dashed #007AFF' : 'none',
          },
          onClick: () => emit('toggle-folder', node.id),
          onContextmenu: (e) => { e.preventDefault(); e.stopPropagation(); emit('context-menu', e, node) },
          onMouseenter: (e) => {
            hovered.value = true
            const nameEl = e.currentTarget.querySelector('.truncate')
            if (nameEl && nameEl.scrollWidth > nameEl.clientWidth) {
              showTooltip(node.name, e.currentTarget)
            }
          },
          onMouseleave: () => { hovered.value = false; hideTooltip() },
          ...dragAttrs,
        }, [
          // Chevron
          h('svg', {
            style: { width: '14px', height: '14px', flexShrink: 0, color: '#9CA3AF', transform: isExpanded ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform 0.15s' },
            viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
          }, [h('polyline', { points: '9 18 15 12 9 6' })]),
          // Folder emoji
          h('span', {
            style: { fontSize: '13px', lineHeight: '1', flexShrink: 0, userSelect: 'none' },
          }, node.emoji || '📁'),
          // Spinner: show when folder is collapsed and has a running chat inside
          (!isExpanded && subtreeHasRunning(node))
            ? h('span', { class: 'chat-unread-spinner' })
            : null,
          // Name
          h('span', {
            class: 'truncate flex-1',
            style: { color: '#1A1A1A', userSelect: 'none', textTransform: 'uppercase', letterSpacing: '0.03em' },
          }, node.name),
        ])

        const childNodes = (isExpanded && node.children?.length)
          ? node.children.map(child => h(ChatTreeNodeView, childProps(child)))
          : []

        return h('div', { style: { marginTop: depth === 0 ? '2px' : '0' } }, [folderRow, ...childNodes])

      } else {
        // Chat row — DocsView style (active = black gradient)
        const isActive = node.id === activeChatId
        const isUnread = unreadChatIds.has(node.id)
        const isCompleted = completedChatIds.has(node.id)
        const isPendingPermission = pendingPermissionChatIds.has(node.id)
        const showSpinner = (isUnread || (node.isRunning && !isActive)) && !isCompleted && !isPendingPermission

        const isDark = isActive || hovered.value
        const rowBg = isActive
          ? 'linear-gradient(135deg, #0F0F0F 0%, #1A1A1A 40%, #374151 100%)'
          : hovered.value
            ? 'linear-gradient(135deg, #1A1A1A 0%, #2D2D2D 40%, #4B5563 100%)'
            : 'transparent'

        return h('div', {
          class: 'flex items-center gap-0.5 pr-1 cursor-pointer group relative chat-tree-row',
          style: {
            paddingLeft: indent + 'px',
            paddingTop: '0px',
            paddingBottom: '0px',
            background: 'transparent',
            color: isDark ? '#fff' : '#1A1A1A',
            isolation: 'isolate',
            borderRadius: '0.625rem',
            margin: '0px 2px',
            fontFamily: "'Inter',sans-serif",
            fontSize: 'var(--fs-caption)',
            transition: 'color 0.15s',
            borderTop: dragOver.value === 'top' ? '2px solid #fff' : '2px solid transparent',
            borderRight: '0px solid transparent',
            borderBottom: dragOver.value === 'bottom' ? '2px solid #fff' : '2px solid transparent',
            borderLeft: '0px solid transparent',
          },
          onClick: () => emit('select-chat', node.id),
          onContextmenu: (e) => { e.preventDefault(); e.stopPropagation(); emit('context-menu', e, node) },
          onMouseenter: (e) => {
            hovered.value = true
            const nameEl = e.currentTarget.querySelector('.truncate')
            if (nameEl && nameEl.scrollWidth > nameEl.clientWidth) {
              showTooltip(node.title, e.currentTarget)
            }
          },
          onMouseleave: () => { hovered.value = false; hideTooltip() },
          ...dragAttrs,
        }, [
          // Background layer — vertically inset so adjacent items don't visually overlap
          h('div', { 'aria-hidden': 'true', style: { position: 'absolute', top: '1px', bottom: '0', left: '0', right: '0', background: rowBg, boxShadow: isActive ? '0 2px 8px rgba(0,0,0,0.12), 0 1px 3px rgba(0,0,0,0.08)' : 'none', borderRadius: '0.5rem', transition: 'background 0.15s', pointerEvents: 'none', zIndex: '-1' } }),
          // Spacer matching folder chevron width for vertical alignment
          h('span', { style: 'width:14px;display:inline-block;flex-shrink:0;' }),
          // Chat icon (custom icon fallback to bubble)
          node.icon
            ? h('span', {
              style: {
                width: '14px',
                height: '14px',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                lineHeight: '1',
                fontSize: '12px',
                flexShrink: 0,
              },
            }, node.icon)
            : h('svg', {
              style: { width: '14px', height: '14px', flexShrink: 0, color: isDark ? 'rgba(255,255,255,0.5)' : '#9CA3AF', transition: 'color 0.15s' },
              viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2',
            }, [h('path', { d: 'M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z' }), h('circle', { cx: '8', cy: '10', r: '1', fill: 'currentColor', stroke: 'none' }), h('circle', { cx: '12', cy: '10', r: '1', fill: 'currentColor', stroke: 'none' }), h('circle', { cx: '16', cy: '10', r: '1', fill: 'currentColor', stroke: 'none' })]),
          showSpinner ? h('span', { class: isDark ? 'chat-unread-spinner chat-unread-spinner--light' : 'chat-unread-spinner' }) : null,
          h('span', { class: 'truncate flex-1', style: { fontWeight: isActive ? '600' : '500', color: isDark ? '#fff' : '#1A1A1A', transition: 'color 0.15s' } }, node.title),
          // Status chips
          isPendingPermission && !isActive ? h('span', { class: 'chat-approval-chip' }, 'Approval') : null,
          (!isPendingPermission && isCompleted && !isActive) ? h('span', { class: 'chat-completed-chip' }, 'Done') : null,
          // Action buttons — always rendered, shown only on row hover via CSS
          h('div', { class: 'chat-sidebar-item-actions' }, [
            h('button', {
              class: 'chat-sidebar-action-btn',
              'aria-label': 'Rename chat',
              onClick: (e) => { e.stopPropagation(); emit('rename-chat', node) },
            }, [
              h('svg', { style: { width: '13px', height: '13px' }, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                h('path', { d: 'M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7' }),
                h('path', { d: 'M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z' }),
              ]),
            ]),
            h('button', {
              class: 'chat-sidebar-action-btn danger',
              'aria-label': 'Delete chat',
              onClick: (e) => { e.stopPropagation(); emit('delete-chat', node.id) },
            }, [
              h('svg', { style: { width: '13px', height: '13px' }, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '2' }, [
                h('polyline', { points: '3 6 5 6 21 6' }),
                h('path', { d: 'M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6' }),
                h('path', { d: 'M10 11v6M14 11v6' }),
                h('path', { d: 'M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2' }),
              ]),
            ]),
          ]),
        ])
      }
    }
  }
})

export default ChatTreeNodeView
