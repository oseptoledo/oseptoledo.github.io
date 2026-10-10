import '@fontsource-variable/bricolage-grotesque'
import './index.css'
import { mountApp } from './hydrateApp'

// Hydrates the prerendered markup (hydrateRoot) instead of rebuilding it; an
// empty #root, which only `npm run dev` serves, gets a plain client render.
// See hydrateApp.tsx.
mountApp(document.getElementById('root')!)
