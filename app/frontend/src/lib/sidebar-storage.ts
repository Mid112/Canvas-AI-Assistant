const SIDEBAR_STORAGE_KEY = "canvas-workflow-sidebar-open";

export function getStoredSidebarOpen(): boolean {
  const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
  if (stored === null) {
    return true;
  }

  return stored === "true";
}

export function setStoredSidebarOpen(open: boolean): void {
  localStorage.setItem(SIDEBAR_STORAGE_KEY, String(open));
}
