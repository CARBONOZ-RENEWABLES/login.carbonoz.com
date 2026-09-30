import { ConfigProvider } from 'antd'
import deDE from 'antd/locale/de_DE'
import enGB from 'antd/locale/en_GB'
import esES from 'antd/locale/es_ES'
import frFR from 'antd/locale/fr_FR'
import React, { useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { Provider, useDispatch, useSelector } from 'react-redux'
import { BrowserRouter as Router } from 'react-router-dom'
import App from './App.tsx'
import { antdThemeFor } from './design/theme'
import { I18nProvider, useI18n } from './i18n'
import './index.css'
import { RootState, store } from './lib/redux/store'
import { setDarkMode } from './lib/redux/themeSlice'

function ThemeWrapper() {
  const dispatch = useDispatch()
  const darkMode = useSelector((state: RootState) => state.theme.darkMode)

  // Restore the saved preference before the first protected page mounts.
  useEffect(() => {
    try {
      if (localStorage.getItem('darkMode') === 'true') dispatch(setDarkMode(true))
    } catch {
      /* storage unavailable */
    }
  }, [dispatch])

  useEffect(() => {
    const root = document.documentElement
    if (darkMode) {
      root.classList.add('dark')
      root.setAttribute('data-theme', 'dark')
    } else {
      root.classList.remove('dark')
      root.setAttribute('data-theme', 'light')
    }
  }, [darkMode])

  const antdTheme = useMemo(() => antdThemeFor(darkMode), [darkMode])
  const { lang } = useI18n()

  return (
    <ConfigProvider theme={antdTheme} locale={ANTD_LOCALE[lang]}>
      <App />
    </ConfigProvider>
  )
}

/** antd's own texts (table empty state, pagination…) follow the app language. */
const ANTD_LOCALE = { en: enGB, de: deDE, fr: frFR, es: esES }

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <Router>
        <I18nProvider>
          <ThemeWrapper />
        </I18nProvider>
      </Router>
    </Provider>
  </React.StrictMode>
)
