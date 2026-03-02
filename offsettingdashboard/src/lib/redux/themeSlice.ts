import { createSlice, PayloadAction } from '@reduxjs/toolkit'

interface TranslationState {
  darkMode: boolean
}

const initialState: TranslationState = {
  darkMode: false,
}

const themeSlice = createSlice({
  name: 'theme',
  initialState,
  reducers: {
    toggleDarkMode(state) {
      state.darkMode = !state.darkMode
    },
    setDarkMode(state, action: PayloadAction<boolean>) {
      state.darkMode = action.payload
    },
  },
})

export const { toggleDarkMode, setDarkMode } = themeSlice.actions
export default themeSlice.reducer
