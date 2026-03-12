import { createRouter, createWebHashHistory } from 'vue-router'
import NewsView from '../views/NewsView.vue'
import ChatsView from '../views/ChatsView.vue'
import SkillsView from '../views/SkillsView.vue'
import AgentsView from '../views/AgentsView.vue'
import ConfigView from '../views/ConfigView.vue'
import DocsView from '../views/DocsView.vue'
import McpView from '../views/McpView.vue'
import ToolsView from '../views/ToolsView.vue'
import KnowledgeView from '../views/KnowledgeView.vue'
import TaskEngineView from '../views/TaskEngineView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/',          redirect: '/chats' },
    { path: '/news',      component: NewsView },
    { path: '/chats',     component: ChatsView },
    { path: '/agents',    component: AgentsView },
    { path: '/skills',    component: SkillsView },
    { path: '/knowledge', component: KnowledgeView },
    { path: '/mcp',       component: McpView },
    { path: '/tools',     component: ToolsView },
    { path: '/tasks',     component: TaskEngineView },
    { path: '/notes',     component: DocsView },
    { path: '/config',    component: ConfigView }
  ]
})
