/**
 * Centralized list of features hidden in Demo Mode.
 * Each entry has:
 *   - id:   stable key (used in code guards)
 *   - en:   English display label
 *   - zh:   Chinese display label
 */
export const DEMO_HIDDEN_ITEMS = [
  { id: 'aiNews',        en: 'AI News',              zh: 'AI 新闻' },
  { id: 'workspace',     en: 'Workspace section',    zh: '工作区' },
  { id: 'tasksEngine',   en: 'Tasks Engine',         zh: '任务引擎' },
  { id: 'agentTasks',    en: 'Agent Tasks',          zh: 'Agent 任务' },
  { id: 'focusMode',     en: 'Focus Mode',           zh: '专注模式' },
  { id: 'minibarMode',   en: 'Minibar Mode',         zh: '迷你栏模式' },
  { id: 'aiAssistant',   en: 'AI Assistant (Docs)',   zh: 'AI 助手 (文档)' },
]

/**
 * Build an HTML string listing all hidden items, suitable for a tooltip.
 * @param {'en'|'zh'} locale
 * @returns {string}
 */
export function buildDemoTooltipHtml(locale = 'en') {
  const title = locale === 'zh' ? '演示模式隐藏项' : 'Hidden in Demo Mode'
  const items = DEMO_HIDDEN_ITEMS
    .map(i => `<li>${locale === 'zh' ? i.zh : i.en}</li>`)
    .join('')
  return `<strong>${title}</strong><ul style="margin:0.25rem 0 0;padding-left:1.1em;">${items}</ul>`
}
