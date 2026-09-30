export const APP_NAVIGATION_EVENT = 'app:navigate';

export function navigateTo(path: string) {
  if (!path.startsWith('/')) throw new Error('La ruta de la aplicación debe ser absoluta.');
  window.dispatchEvent(new CustomEvent<string>(APP_NAVIGATION_EVENT, { detail: path }));
}
