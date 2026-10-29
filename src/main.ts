import { createApp } from 'vue'
import { createRouter, createWebHistory } from 'vue-router'
import ElementPlus from 'element-plus'
import zhCn from 'element-plus/es/locale/lang/zh-cn'
import 'element-plus/dist/index.css'
import './style.css'
import './refinements.css'
import './dark-theme.css'
import App from './App.vue'

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: () => import('./views/Dashboard.vue') },
    { path: '/ranking', component: () => import('./views/Ranking.vue') },
    { path: '/efficiency', component: () => import('./views/Efficiency.vue') },
    { path: '/orders', component: () => import('./views/WorkOrders.vue') },
    { path: '/product-lines', component: () => import('./views/ProductLines.vue') },
  ],
})

createApp(App).use(router).use(ElementPlus, { locale: zhCn }).mount('#app')
