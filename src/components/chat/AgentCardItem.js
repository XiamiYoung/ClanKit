import { defineComponent, h } from 'vue'
import { getAvatarDataUri } from '../agents/agentAvatars'
import { useI18n } from '../../i18n/useI18n'

export default defineComponent({
  name: 'AgentCardItem',
  props: {
    agent: { type: Object, required: true },
    selected: { type: Boolean, default: false },
    showDefault: { type: Boolean, default: false },
    kind: { type: String, default: 'system' }, // 'user' | 'system'
  },
  emits: ['click'],
  setup(itemProps, { emit: itemEmit }) {
    const { t } = useI18n()
    return () => {
      const a = itemProps.agent
      const avatarUri = a?.avatar ? getAvatarDataUri(a.avatar) : null
      const indicator = itemProps.kind === 'user'
        ? h('span', {
            class: ['np-agent-radio', { 'np-agent-radio--selected': itemProps.selected }],
          }, itemProps.selected ? [
            h('svg', { style: 'width:9px;height:9px;', viewBox: '0 0 24 24', fill: 'currentColor' }, [
              h('circle', { cx: '12', cy: '12', r: '6' }),
            ]),
          ] : [])
        : h('span', {
            class: ['np-agent-check', { 'np-agent-check--selected': itemProps.selected }],
          }, itemProps.selected ? [
            h('svg', {
              style: 'width:11px;height:11px;',
              viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', 'stroke-width': '3',
            }, [h('polyline', { points: '20 6 9 17 4 12' })]),
          ] : [])

      const avatar = h('div', { class: 'np-agent-avatar' }, avatarUri
        ? [h('img', { src: avatarUri, alt: '' })]
        : [h('span', { class: 'np-agent-avatar-fb' }, (a?.name || '?').charAt(0))]
      )

      const meta = h('div', { class: 'np-agent-meta' }, [
        h('span', { class: 'np-agent-name' }, a?.name || ''),
        a?.description
          ? h('span', { class: 'np-agent-desc' }, a.description)
          : null,
      ].filter(Boolean))

      const badge = itemProps.showDefault
        ? h('span', { class: 'np-agent-badge' }, t('agents.default'))
        : null

      return h('button', {
        type: 'button',
        class: ['np-agent-card', { selected: itemProps.selected }],
        title: a?.description || a?.name || '',
        onClick: () => itemEmit('click'),
      }, [indicator, avatar, meta, badge].filter(Boolean))
    }
  },
})
