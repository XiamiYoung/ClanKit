import { createRouter, createWebHashHistory } from 'vue-router'
import NewsView from '../views/NewsView.vue'
import ChatsView from '../views/ChatsView.vue'
import SkillsView from '../views/SkillsView.vue'
import PersonasView from '../views/PersonasView.vue'
import ConfigView from '../views/ConfigView.vue'
import DocsView from '../views/DocsView.vue'
import McpView from '../views/McpView.vue'
import ToolsView from '../views/ToolsView.vue'
import KnowledgeView from '../views/KnowledgeView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/',          redirect: '/chats' },
    { path: '/news',      component: NewsView },
    { path: '/chats',     component: ChatsView },
    { path: '/personas',  component: PersonasView },
    { path: '/skills',    component: SkillsView },
    { path: '/knowledge', component: KnowledgeView },
    { path: '/mcp',       component: McpView },
    { path: '/tools',     component: ToolsView },
    { path: '/notes',     component: DocsView },
    { path: '/config',    component: ConfigView }
  ]
})
