export function localStore(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
