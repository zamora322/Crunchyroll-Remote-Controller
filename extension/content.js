// Crunchyroll Remote Controller - Content Script
(function () {
  console.log('%c[CR-Remote] Content script loaded into frame: ' + window.location.href, 'color: #f47521; font-weight: bold;');

  let isCustomFullscreen = false;

  // Inject styles for immersive fullscreen player overlay
  function injectFullscreenStyles() {
    if (document.getElementById('cr-fullscreen-styles')) return;
    const style = document.createElement('style');
    style.id = 'cr-fullscreen-styles';
    style.textContent = `
      .cr-remote-fullscreen {
        position: fixed !important;
        top: 0 !important;
        left: 0 !important;
        width: 100vw !important;
        height: 100vh !important;
        max-width: 100vw !important;
        max-height: 100vh !important;
        z-index: 2147483640 !important;
        background: #000000 !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .cr-remote-fullscreen video {
        width: 100% !important;
        height: 100% !important;
        max-width: 100% !important;
        max-height: 100% !important;
        object-fit: contain !important;
      }
    `;
    (document.head || document.documentElement).appendChild(style);
  }

  injectFullscreenStyles();

  // Visual toast notification on Crunchyroll page (only display in top frame)
  let toastTimer = null;
  function showToast(message, isSuccess = true) {
    if (window.top !== window.self) {
      return;
    }

    let toast = document.getElementById('cr-remote-toast');
    if (!toast) {
      toast = document.createElement('div');
      toast.id = 'cr-remote-toast';
      toast.style.cssText = `
        position: fixed;
        bottom: 30px;
        left: 30px;
        z-index: 2147483647;
        background: rgba(20, 21, 25, 0.95);
        color: #ffffff;
        padding: 12px 18px;
        border-radius: 12px;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        font-size: 14px;
        font-weight: 700;
        box-shadow: 0 10px 30px rgba(0,0,0,0.6);
        border: 1.5px solid ${isSuccess ? '#f47521' : '#ef4444'};
        transition: opacity 0.2s ease, transform 0.2s ease;
        display: flex;
        align-items: center;
        gap: 10px;
        pointer-events: none;
      `;
      document.body.appendChild(toast);
    }
    toast.innerHTML = `${isSuccess ? '🟠' : '🔴'} <span>${message}</span>`;
    toast.style.opacity = '1';
    toast.style.transform = 'translateY(0)';

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      if (toast) {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(10px)';
      }
    }, 2000);
  }

  // Find the active video element
  function getVideoElement() {
    return document.querySelector('video') || 
           document.querySelector('#velocity-player-package video') ||
           document.querySelector('.video-player video');
  }

  // Find the player container to scale to full viewport
  function getPlayerContainer() {
    return document.querySelector('#velocity-player-package') ||
           document.querySelector('#vilos') ||
           document.querySelector('[data-testid="vilos-player"]') ||
           document.querySelector('.video-player') ||
           document.querySelector('video')?.closest('div[class*="player"]') ||
           document.querySelector('video')?.parentElement;
  }

  // Dispatch keyboard shortcut simulation
  function simulateKey(key, code, keyCode, shift = false) {
    const eventParams = {
      key: key,
      code: code,
      keyCode: keyCode,
      which: keyCode,
      shiftKey: shift,
      bubbles: true,
      cancelable: true
    };
    const activeEl = document.activeElement || document.body;
    activeEl.dispatchEvent(new KeyboardEvent('keydown', eventParams));
    activeEl.dispatchEvent(new KeyboardEvent('keyup', eventParams));
  }

  // Find the Next Episode button
  function getNextEpisodeButton() {
    const selectors = [
      '[data-testid="vilos-next_episode_button"]',
      '[data-t="next-episode-btn"]',
      'button[data-testid*="next" i]',
      'button[aria-label*="next" i]',
      'button[aria-label*="siguiente" i]',
      'button[title*="Next" i]',
      'button[title*="Siguiente" i]',
      '.next-episode-btn',
      'a[data-testid="next-episode"]',
      '.up-next-card a'
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null) {
        return btn;
      }
    }

    // Fallback: search buttons by text
    const allButtons = document.querySelectorAll('button, a');
    for (const btn of allButtons) {
      const text = (btn.textContent || '').trim().toLowerCase();
      if (text.includes('next episode') || text.includes('siguiente episodio') || text === 'next') {
        return btn;
      }
    }

    return null;
  }

  // Find Skip Intro / Skip Outro button
  function getSkipButton() {
    const selectors = [
      '[data-testid="skip-button"]',
      '[data-t="skip-intro-btn"]',
      'button[data-testid*="skip" i]',
      'button[aria-label*="skip" i]',
      'button[aria-label*="saltar" i]',
      '.skip-button'
    ];

    for (const selector of selectors) {
      const btn = document.querySelector(selector);
      if (btn && btn.offsetParent !== null) {
        return btn;
      }
    }

    const allButtons = document.querySelectorAll('button');
    for (const btn of allButtons) {
      const text = (btn.textContent || '').trim().toUpperCase();
      if (text.includes('SKIP') || text.includes('SALTAR')) {
        return btn;
      }
    }

    return null;
  }

  // Toggle fullscreen mode
  function toggleFullscreen(forceState) {
    injectFullscreenStyles();
    const player = getPlayerContainer();

    if (typeof forceState === 'boolean') {
      isCustomFullscreen = forceState;
    } else {
      isCustomFullscreen = !isCustomFullscreen;
    }

    if (player) {
      if (isCustomFullscreen) {
        player.classList.add('cr-remote-fullscreen');
        document.documentElement.style.overflow = 'hidden';
        document.body.style.overflow = 'hidden';
        showToast('Pantalla Completa 📺');
      } else {
        player.classList.remove('cr-remote-fullscreen');
        document.documentElement.style.overflow = '';
        document.body.style.overflow = '';
        showToast('Pantalla Normal 🖥️');
      }
    }

    // Attempt native player button as well
    const fullscreenBtn = document.querySelector('[data-testid="vilos-fullscreen_button"]') ||
                          document.querySelector('button[aria-label*="Fullscreen" i]');
    if (fullscreenBtn) {
      fullscreenBtn.click();
    }
  }

  // Allow ESC key to exit custom fullscreen
  window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isCustomFullscreen) {
      toggleFullscreen(false);
      chrome.runtime.sendMessage({ command: 'set_window_state', state: 'normal' });
    }
  });

  // Handle incoming commands
  function handleCommand(data) {
    if (!data || !data.command) return;

    const video = getVideoElement();
    console.log('[CR-Remote] Command received:', data.command, { hasVideo: !!video, inFrame: window.self !== window.top });

    if (!video && window.self !== window.top && data.command !== 'toggle_fullscreen') {
      return;
    }

    switch (data.command) {
      case 'toggle_play':
        if (video) {
          if (video.paused) {
            video.play()
              .then(() => showToast('Reproduciendo ▶️'))
              .catch(e => {
                console.warn('[CR-Remote] Play failed, trying space key fallback:', e);
                simulateKey(' ', 'Space', 32);
                showToast('Reproduciendo ▶️');
              });
          } else {
            video.pause();
            showToast('Pausa ⏸️');
          }
        } else {
          simulateKey(' ', 'Space', 32);
          showToast('Toggle Play/Pause ⏯️');
        }
        break;

      case 'seek_backward':
        if (video) {
          const seconds = data.seconds || 10;
          video.currentTime = Math.max(0, video.currentTime - seconds);
          showToast(`- ${seconds}s ⏪`);
        } else {
          simulateKey('ArrowLeft', 'ArrowLeft', 37);
          showToast('- 5s ⏪');
        }
        break;

      case 'seek_forward':
        if (video) {
          const seconds = data.seconds || 10;
          video.currentTime = Math.min(video.duration || 99999, video.currentTime + seconds);
          showToast(`+ ${seconds}s ⏩`);
        } else {
          simulateKey('ArrowRight', 'ArrowRight', 39);
          showToast('+ 5s ⏩');
        }
        break;

      case 'skip_intro':
        const skipBtn = getSkipButton();
        if (skipBtn) {
          skipBtn.click();
          showToast('Intro saltada ⏩');
        } else if (video) {
          video.currentTime = Math.min(video.duration || 99999, video.currentTime + 85);
          showToast('+85s (Intro estimada) ⏩');
        } else {
          showToast('No se encontró botón de intro', false);
        }
        break;

      case 'next_episode':
        const nextBtn = getNextEpisodeButton();
        if (nextBtn) {
          nextBtn.click();
          showToast('Cargando siguiente episodio ⏭️');
        } else {
          simulateKey('N', 'KeyN', 78, true);
          showToast('Siguiente episodio (Shift+N) ⏭️');
        }
        break;

      case 'toggle_fullscreen':
        toggleFullscreen(data.isFullscreen);
        break;

      case 'set_volume':
        if (video) {
          const vol = Math.max(0, Math.min(1, parseFloat(data.value)));
          video.volume = vol;
          video.muted = (vol === 0);
          const pct = Math.round(vol * 100);
          if (pct === 0) {
            showToast('Silenciado 🔇');
          } else {
            showToast(`Volumen: ${pct}% 🔊`);
          }
        }
        break;

      default:
        console.warn('[CR-Remote] Unknown command:', data.command);
    }
  }

  // Listen for commands forwarded by background.js service worker
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message && message.type === 'cr_remote_status') {
      if (message.connected) {
        showToast('Control Remoto Conectado 🟢');
      }
      return;
    }
    handleCommand(message);
  });

  // Notify background script that content script is ready
  chrome.runtime.sendMessage({ type: 'check_connection' }, (response) => {
    if (chrome.runtime.lastError) {
      // Ignore error during initial worker spin-up
    } else if (response && response.connected) {
      showToast('Control Remoto Conectado 🟢');
    }
  });

})();
