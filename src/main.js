import { createApp } from 'vue'
import { createPinia } from 'pinia'
import tooltip from './directives/tooltip'
import './style.css'

const standaloneWiki = location.hash === '#/wiki-window' && !!window.electronAPI?.wikiWindow?.settings
function mount(root, router) {
  const app = createApp(root)
  app.use(createPinia())
  if (router) app.use(router)
  app.directive('tooltip', tooltip)
  app.mount('#app')
}

async function start() {
  if (standaloneWiki) {
    const { default: WikiWindowView } = await import('./views/WikiWindowView.vue')
    mount(WikiWindowView)
  } else {
    const [{ default: App }, { default: router }] = await Promise.all([
      import('./App.vue'), import('./router'),
    ])
    mount(App, router)
  }
}

void start().catch(error => {
  console.error('ClanKit renderer failed to start:', error)
})
