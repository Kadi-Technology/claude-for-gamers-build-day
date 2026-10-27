// Ayudas SOLO para celular/tableta táctil (pointer: coarse). En escritorio no hace nada.
// isTouchPhone(): dispositivo táctil primario y lado corto < 1024 px.
// initMobile(): marca <html class="is-touch">, evita zoom por gestos, pide pantalla completa en el primer toque
// (Android/Chrome; iOS no lo permite) y devuelve { fullscreen() } para un botón opcional.

export function isTouchPhone() {
  try {
    const coarse = matchMedia('(pointer: coarse)').matches ||
      (navigator.maxTouchPoints > 0 && !matchMedia('(any-pointer: fine)').matches);
    return coarse && Math.min(window.innerWidth, window.innerHeight) < 1024;
  } catch {
    return false;
  }
}

export function canFullscreen() {
  const d = document;
  return !!(d.fullscreenEnabled || d.webkitFullscreenEnabled);
}

export function toggleFullscreen() {
  const d = document;
  const el = d.documentElement;
  try {
    if (d.fullscreenElement || d.webkitFullscreenElement) {
      (d.exitFullscreen || d.webkitExitFullscreen).call(d);
    } else {
      const p = (el.requestFullscreen || el.webkitRequestFullscreen).call(el, { navigationUI: 'hide' });
      if (p && p.catch) p.catch(() => {});
      try {
        const o = screen.orientation;
        if (o && o.lock) o.lock('landscape').catch(() => {});
      } catch {
        // sin bloqueo de orientación
      }
    }
  } catch {
    // el navegador no permite pantalla completa
  }
}

export function initMobile() {
  if (!isTouchPhone()) return { touch: false, fullscreen: toggleFullscreen, can: false };
  document.documentElement.classList.add('is-touch');
  const stop = (e) => e.preventDefault();
  document.addEventListener('gesturestart', stop);
  document.addEventListener('gesturechange', stop);
  document.addEventListener('contextmenu', stop);
  const can = canFullscreen();
  if (can) {
    const first = () => {
      window.removeEventListener('pointerup', first, true);
      if (!document.fullscreenElement) toggleFullscreen();
    };
    window.addEventListener('pointerup', first, true);
  }
  return { touch: true, fullscreen: toggleFullscreen, can };
}
