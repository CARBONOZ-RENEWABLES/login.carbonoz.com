import { configureStore } from '@reduxjs/toolkit'
import { baseAPI } from '../api/api'
import themeSlice from './themeSlice'

export const store = configureStore({
  reducer: {
    [baseAPI.reducerPath]: baseAPI.reducer,
    theme: themeSlice,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware().concat(baseAPI.middleware),
})

export type RootState = ReturnType<typeof store.getState>
