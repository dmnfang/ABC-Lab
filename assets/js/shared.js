/* shared.js
   Helpers every ABC Lab page uses. Import what you need:
     import { initViewport, initFullscreen, hydrateIcons } from '../../assets/js/shared.js';
*/
import { icon } from './icons.js';

/* iOS Safari: 100dvh still jumps with the toolbar, so mirror the real height
   into --app-h (base.css reads it). Deliberately ignores visualViewport so the
   on-screen keyboard doesn't shrink the layout. */
export function initViewport() {
  const root = document.documentElement;
  const set = () => root.style.setProperty('--app-h', `${window.innerHeight}px`);
  set();
  window.addEventListener('resize', set);
  window.addEventListener('orientationchange', () => setTimeout(set, 250));
}

/* Replace every <span data-icon="name"></span> with the inline SVG. */
export function hydrateIcons(root = document) {
  root.querySelectorAll('[data-icon]').forEach(el => {
    el.innerHTML = icon(el.dataset.icon);
  });
}

/* Fullscreen toggle with the Safari prefix, an icon swap, and a
   body.presentation class (ABC Remix's CSS keys off it). The button hides
   itself where fullscreen isn't supported (iPhone). */
export function initFullscreen(button, target = document.documentElement) {
  const root = document.documentElement;
  const supported = Boolean(root.requestFullscreen || root.webkitRequestFullscreen);
  if (!button || !supported) {
    if (button) button.hidden = true;
    return;
  }

  const current = () => document.fullscreenElement || document.webkitFullscreenElement || null;
  const request = el => (el.requestFullscreen || el.webkitRequestFullscreen).call(el);
  const exit = () => (document.exitFullscreen || document.webkitExitFullscreen).call(document);

  const render = () => {
    const on = Boolean(current());
    button.innerHTML = icon(on ? 'arrows-in' : 'arrows-out');
    const label = on ? 'Exit fullscreen' : 'Fullscreen';
    button.setAttribute('aria-label', label);
    button.title = label;
    document.body.classList.toggle('presentation', on);
  };

  button.addEventListener('click', async () => {
    try {
      if (current()) await exit();
      else await request(target);
    } catch (error) {
      console.warn('Fullscreen toggle failed', error);
    }
  });
  document.addEventListener('fullscreenchange', render);
  document.addEventListener('webkitfullscreenchange', render);
  render();
}
