import { createRouter, createWebHistory } from 'vue-router'
import RocketsView from '../views/RocketsView.vue'
import SatellitesView from '../views/SatellitesView.vue'
import EnginesView from '../views/EnginesView.vue'
import ChatView from '../views/ChatView.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'rockets',
      component: RocketsView
    },
    {
      path: '/satellites',
      name: 'satellites',
      component: SatellitesView
    },
    {
      path: '/engines',
      name: 'engines',
      component: EnginesView
    },
    {
      path: '/chat',
      name: 'chat',
      component: ChatView
    }
  ]
})

export default router