export const APP_NAVIGATION_EVENT = 'app:navigate';

/** Devuelve false para retener la navegación (p. ej. hay cambios sin guardar y se pidió confirmación). */
type NavigationGuard = (path: string) => boolean;
let guard: NavigationGuard | null = null;

export function setNavigationGuard(next: NavigationGuard | null) {
  guard = next;
  return () => { if (guard === next) guard = null; };
}

export function navigateTo(path: string, options: { force?: boolean } = {}) {
  if (!path.startsWith('/')) throw new Error('La ruta de la aplicación debe ser absoluta.');
  if (!options.force && guard && !guard(path)) return;
  window.dispatchEvent(new CustomEvent<string>(APP_NAVIGATION_EVENT, { detail: path }));
}
