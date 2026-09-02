import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
// DataTable in the components library is built on Tabulator but the library
// ships none of Tabulator's own stylesheet; without it the table has no layout
// at all (header columns wrap, cells lose their widths). Load the base sheet
// first so the app's dark-theme overrides in views/chat-styles/_tabulator.css
// sit on top of it.
import 'tabulator-tables/dist/css/tabulator.min.css'
import '@trilogy-data/trilogy-studio-components/style.css'
import './style.css'

createApp(App)
    .use(createPinia())
    .use(router)
    .mount('#app')
