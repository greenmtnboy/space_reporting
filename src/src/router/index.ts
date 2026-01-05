import { createRouter, createWebHistory } from 'vue-router'
import RocketsView from '../views/RocketsView.vue'
import SatellitesView from '../views/SatellitesView.vue'

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
    }
  ]
})

export default router
