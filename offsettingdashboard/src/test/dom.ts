/** Browser APIs jsdom lacks but antd, Recharts and the theme hooks use. Import first in jsdom tests. */
if (typeof window !== 'undefined') {
  if (!window.matchMedia)
    window.matchMedia = (query: string) =>
      ({
        matches: false,
        media: query,
        onchange: null,
        addListener: () => undefined,
        removeListener: () => undefined,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        dispatchEvent: () => false,
      }) as MediaQueryList
  if (!('ResizeObserver' in window))
    (window as unknown as { ResizeObserver: unknown }).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
}
export {}
