/** Debug tools are available in dev builds, or in production only when the URL contains ?debug. */
export const DEBUG_AVAILABLE: boolean =
  import.meta.env.DEV || (typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug'));
