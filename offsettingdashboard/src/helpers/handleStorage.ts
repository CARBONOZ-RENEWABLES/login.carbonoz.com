export const getFromLocal = <T>(name: string): T | null => {
  const value = localStorage.getItem(name)

  if (value) {
    return JSON.parse(value) as T
  }

  return null
}

export const setToLocal = (name: string, value: unknown): void => {
  localStorage.setItem(name, JSON.stringify(value))
}

export const removeFromLocal = (name: string): void => {
  localStorage.removeItem(name)
}
