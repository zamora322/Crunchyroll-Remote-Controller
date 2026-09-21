// Mobile Remote App Logic with High-Resilience Connection & Wake Lock
let ws = null;
let isPlaying = true; // default optimistic state
let reconnectInterval = 1500;
let reconnectTimer = null;
let heartbeatTimer = null;
let lastPongTime = Date.now();
const pendingCommands = [];

// Screen Wake Lock Sentinel
let wakeLock = null;
let isWakeLockActive = false;

const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');
const btnWakeLock = document.getElementById('btn-wakelock');
const wakeLockLabel = document.getElementById('wakelock-label');
const wakeLockDot = document.getElementById('wakelock-dot');

function updateStatus(state, message) {
  if (state === 'connected') {
    statusIndicator.className = 'w-2 h-2 rounded-full bg-emerald-500 shadow-sm shadow-emerald-500/50';
    statusText.className = 'text-emerald-400 font-semibold text-xs';
    statusText.textContent = message || 'Conectado';
  } else if (state === 'reconnecting') {
    statusIndicator.className = 'w-2 h-2 rounded-full bg-amber-500 animate-ping';
    statusText.className = 'text-amber-400 font-semibold text-xs';
    statusText.textContent = message || 'Reconectando...';
  } else {
    statusIndicator.className = 'w-2 h-2 rounded-full bg-rose-500 animate-pulse';
    statusText.className = 'text-rose-400 font-semibold text-xs';
    statusText.textContent = message || 'Desconectado';
  }
}

// Flush any commands queued during brief reconnection
function flushPendingCommands() {
  if (ws && ws.readyState === WebSocket.OPEN && pendingCommands.length > 0) {
    console.log(`[Remote] Flushing ${pendingCommands.length} queued commands.`);
    while (pendingCommands.length > 0) {
      const msg = pendingCommands.shift();
      ws.send(msg);
    }
    updateStatus('connected', 'Comando enviado ✔');
    setTimeout(() => {
      if (ws && ws.readyState === WebSocket.OPEN) {
        updateStatus('connected', 'Conectado');
      }
    }, 1200);
  }
}

function sendCommand(commandName, payload = {}) {
  // Haptic feedback for mobile tap
  if (navigator.vibrate) {
    try {
      navigator.vibrate(35);
    } catch (_) {}
  }

  const message = JSON.stringify({
    command: commandName,
    ...payload,
    timestamp: Date.now()
  });

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(message);
    console.log('[Remote] Sent command:', message);
  } else {
    console.warn('[Remote] Socket not open. Queuing command and reconnecting immediately...');
    pendingCommands.push(message);
    updateStatus('reconnecting', 'Reconectando y enviando...');
    connectWebSocket();
  }
}

function startHeartbeat() {
  stopHeartbeat();
  lastPongTime = Date.now();
  heartbeatTimer = setInterval(() => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      try {
        ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
      } catch (e) {
        console.warn('[Remote] Heartbeat ping failed:', e);
      }

      // If no pong response for > 20s, assume stale/dead socket and reconnect
      if (Date.now() - lastPongTime > 20000) {
        console.warn('[Remote] Heartbeat timeout. Resetting connection...');
        try {
          ws.close();
        } catch (_) {}
        connectWebSocket();
      }
    }
  }, 10000);
}

function stopHeartbeat() {
  if (heartbeatTimer) {
    clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }
}

function connectWebSocket() {
  // If already connecting or open, don't duplicate
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  console.log(`[Remote] Connecting to ${wsUrl}...`);
  updateStatus('reconnecting', 'Conectando...');

  try {
    if (ws) {
      try {
        ws.onopen = null;
        ws.onclose = null;
        ws.onerror = null;
        ws.onmessage = null;
        ws.close();
      } catch (_) {}
    }

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Remote] Connected to WebSocket server');
      lastPongTime = Date.now();
      updateStatus('connected', 'Conectado');
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
      startHeartbeat();
      flushPendingCommands();
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'pong') {
          lastPongTime = Date.now();
          return;
        }

        console.log('[Remote] Received message:', data);
        // Sync playback state if broadcasted by extension
        if (data.type === 'state_update' && typeof data.paused === 'boolean') {
          setPlayPauseIcon(!data.paused);
        }
      } catch (e) {
        console.error('[Remote] Error parsing message:', e);
      }
    };

    ws.onclose = () => {
      stopHeartbeat();
      console.warn('[Remote] Connection closed. Scheduling reconnect...');
      updateStatus('disconnected', 'Reconectando...');
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      stopHeartbeat();
      console.error('[Remote] WebSocket error:', err);
      try {
        ws.close();
      } catch (_) {}
    };
  } catch (err) {
    stopHeartbeat();
    console.error('[Remote] Connection error:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (!reconnectTimer) {
    reconnectTimer = setInterval(() => {
      if (!ws || ws.readyState === WebSocket.CLOSED) {
        connectWebSocket();
      }
    }, reconnectInterval);
  }
}

// Instant wake-up reconnection listeners: phone unlocked or tab focused
function handleWakeup() {
  if (document.visibilityState === 'visible') {
    console.log('[Remote] Wakeup event detected: checking WebSocket & WakeLock...');
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      connectWebSocket();
    }
    // Re-request wake lock if previously enabled (system automatically releases on minimize)
    if (isWakeLockActive) {
      requestWakeLock();
    }
  }
}

document.addEventListener('visibilitychange', handleWakeup);
window.addEventListener('focus', handleWakeup);
window.addEventListener('pageshow', handleWakeup);
window.addEventListener('online', () => {
  console.log('[Remote] Device back online.');
  connectWebSocket();
});

// Screen Wake Lock Implementation
async function requestWakeLock() {
  if ('wakeLock' in navigator) {
    try {
      wakeLock = await navigator.wakeLock.request('screen');
      isWakeLockActive = true;
      updateWakeLockUI(true);
      wakeLock.addEventListener('release', () => {
        // Will be re-acquired on visibilitychange if still desired
        if (document.visibilityState !== 'visible') {
          updateWakeLockUI(false);
        }
      });
      console.log('[Remote] Screen WakeLock active.');
    } catch (err) {
      console.warn('[Remote] WakeLock request failed:', err);
      updateWakeLockUI(false);
    }
  } else {
    updateWakeLockUI(false, true);
  }
}

function releaseWakeLock() {
  if (wakeLock) {
    try {
      wakeLock.release();
    } catch (_) {}
    wakeLock = null;
  }
  isWakeLockActive = false;
  updateWakeLockUI(false);
}

function updateWakeLockUI(active, unsupported = false) {
  if (!btnWakeLock) return;
  if (unsupported) {
    wakeLockLabel.textContent = 'Pantalla Normal';
    wakeLockDot.className = 'w-1.5 h-1.5 rounded-full bg-slate-600';
    return;
  }
  if (active) {
    wakeLockLabel.textContent = 'Siempre Activa';
    wakeLockDot.className = 'w-1.5 h-1.5 rounded-full bg-amber-400 shadow-sm shadow-amber-400/50';
    btnWakeLock.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-950/40 border border-amber-500/40 text-xs font-semibold text-amber-300 transition-all';
  } else {
    wakeLockLabel.textContent = 'Auto-Apagado';
    wakeLockDot.className = 'w-1.5 h-1.5 rounded-full bg-slate-500';
    btnWakeLock.className = 'flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-900 border border-slate-800 text-xs font-semibold text-slate-400 transition-all';
  }
}

if (btnWakeLock) {
  btnWakeLock.addEventListener('click', () => {
    if (isWakeLockActive) {
      releaseWakeLock();
    } else {
      requestWakeLock();
    }
  });
}

// Auto-request wake lock by default on mobile load
requestWakeLock();

function setPlayPauseIcon(playing) {
  isPlaying = playing;
  if (isPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }
}

// Button Bindings
document.getElementById('btn-toggle-play').addEventListener('click', () => {
  isPlaying = !isPlaying;
  setPlayPauseIcon(isPlaying);
  sendCommand('toggle_play');
});

document.getElementById('btn-rewind').addEventListener('click', () => {
  sendCommand('seek_backward', { seconds: 10 });
});

document.getElementById('btn-forward').addEventListener('click', () => {
  sendCommand('seek_forward', { seconds: 10 });
});

document.getElementById('btn-skip-intro').addEventListener('click', () => {
  sendCommand('skip_intro');
});

document.getElementById('btn-next-episode').addEventListener('click', () => {
  sendCommand('next_episode');
});

document.getElementById('btn-fullscreen').addEventListener('click', () => {
  sendCommand('toggle_fullscreen');
});

// Volume Controls
const volumeSlider = document.getElementById('volume-slider');
const volumeLabel = document.getElementById('volume-label');
const btnMute = document.getElementById('btn-mute');
const iconVolumeHigh = document.getElementById('icon-volume-high');
const iconVolumeMute = document.getElementById('icon-volume-mute');

let isMuted = false;
let previousVolume = 100;
let volumeThrottleTimer = null;

function updateVolumeUI(val, muted = false) {
  volumeLabel.textContent = muted ? 'MUTE' : `${val}%`;
  if (muted || val === 0) {
    iconVolumeHigh.classList.add('hidden');
    iconVolumeMute.classList.remove('hidden');
  } else {
    iconVolumeHigh.classList.remove('hidden');
    iconVolumeMute.classList.add('hidden');
  }
}

volumeSlider.addEventListener('input', (e) => {
  const val = parseInt(e.target.value, 10);
  isMuted = (val === 0);
  updateVolumeUI(val, isMuted);

  if (!volumeThrottleTimer) {
    volumeThrottleTimer = setTimeout(() => {
      sendCommand('set_volume', { value: val / 100 });
      volumeThrottleTimer = null;
    }, 50);
  }
});

volumeSlider.addEventListener('change', (e) => {
  const val = parseInt(e.target.value, 10);
  sendCommand('set_volume', { value: val / 100 });
});

btnMute.addEventListener('click', () => {
  isMuted = !isMuted;
  if (isMuted) {
    previousVolume = parseInt(volumeSlider.value, 10) || 100;
    volumeSlider.value = 0;
    updateVolumeUI(0, true);
    sendCommand('set_volume', { value: 0 });
  } else {
    const restoreVal = previousVolume > 0 ? previousVolume : 100;
    volumeSlider.value = restoreVal;
    updateVolumeUI(restoreVal, false);
    sendCommand('set_volume', { value: restoreVal / 100 });
  }
});

// Initialize connection immediately
connectWebSocket();
