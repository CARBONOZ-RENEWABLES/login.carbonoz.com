import { ConfigProvider } from 'antd'
import React, { useEffect, useMemo } from 'react'
import ReactDOM from 'react-dom/client'
import { Provider, useDispatch, useSelector } from 'react-redux'
import { BrowserRouter as Router } from 'react-router-dom'
import App from './App.tsx'
import { antdThemeFor } from './design/theme'
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

  return (
    <ConfigProvider theme={antdTheme}>
      <App />
    </ConfigProvider>
  )
}

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Provider store={store}>
      <Router>
        <ThemeWrapper />
      </Router>
    </Provider>
  </React.StrictMode>
)
