import { useDispatch, useSelector } from 'react-redux'
import { useEffect } from 'react'
import { RootState } from '../redux/store'
import { toggleDarkMode, setDarkMode } from '../redux/themeSlice'

export const useTheme = () => {
  const dispatch = useDispatch()
  const isDark = useSelector((state: RootState) => state.theme.darkMode)

  useEffect(() => {
    const savedDarkMode = localStorage.getItem('darkMode') === 'true'
    if (savedDarkMode !== isDark) {
      dispatch(setDarkMode(savedDarkMode))
    }
  }, [])

  useEffect(() => {
    localStorage.setItem('darkMode', isDark.toString())
    document.documentElement.classList.toggle('dark', isDark)
  }, [isDark])

  const toggle = () => {
    dispatch(toggleDarkMode())
  }

  return { isDark, toggle }
}
