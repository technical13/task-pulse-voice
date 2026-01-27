import i18n from 'i18next'
import { initReactI18next } from 'react-i18next'
import ru from './ru.json'
import en from './en.json'
import es from './es.json'

const STORAGE_KEY = 'todo-state:lang'
const SUPPORTED_LANGUAGES = ['ru', 'en', 'es'] as const

type SupportedLanguage = (typeof SUPPORTED_LANGUAGES)[number]

const normalizeLanguage = (value: string | null | undefined): SupportedLanguage => {
  if (!value) return 'en'
  const lowered = value.toLowerCase()
  if (lowered.startsWith('ru')) return 'ru'
  if (lowered.startsWith('es')) return 'es'
  if (lowered.startsWith('en')) return 'en'
  return 'en'
}

const detectLanguage = (): SupportedLanguage => {
  if (typeof window === 'undefined') return 'en'
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY)
    if (stored) return normalizeLanguage(stored)
  } catch {
    // ignore storage errors
  }
  return normalizeLanguage(window.navigator?.language)
}

const initialLanguage = detectLanguage()

i18n.use(initReactI18next).init({
  resources: {
    ru: { translation: ru },
    en: { translation: en },
    es: { translation: es }
  },
  lng: initialLanguage,
  fallbackLng: 'en',
  interpolation: { escapeValue: false }
})

if (typeof window !== 'undefined') {
  i18n.on('languageChanged', (lng) => {
    try {
      window.localStorage.setItem(STORAGE_KEY, lng)
    } catch {
      // ignore storage errors
    }
  })
}

export type { SupportedLanguage }
export { i18n, SUPPORTED_LANGUAGES, STORAGE_KEY }
