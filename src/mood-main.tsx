import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { MoodApp } from './ui/mood/MoodApp.tsx'
import './ui/styles.css'
import './ui/mood/mood.css'

const root = document.getElementById('root')
if (root) createRoot(root).render(<StrictMode><MoodApp /></StrictMode>)
