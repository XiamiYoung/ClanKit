import { createRouter, createWebHashHistory } from 'vue-router'
import ChatsView from '../views/ChatsView.vue'
import SkillsView from '../views/SkillsView.vue'
import PersonasView from '../views/PersonasView.vue'
import ConfigView from '../views/ConfigView.vue'
import ObsidianView from '../views/ObsidianView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/',          redirect: '/chats' },
    { path: '/chats',     component: ChatsView },
    { path: '/personas',  component: PersonasView },
    { path: '/skills',    component: SkillsView },
    { path: '/obsidian',  component: ObsidianView },
    { path: '/config',    component: ConfigView }
  ]
})
