// Mobile Remote App Logic
let ws = null;
let isPlaying = true; // default optimistic state
let reconnectInterval = 2000;
let reconnectTimer = null;

const statusIndicator = document.getElementById('status-indicator');
const statusText = document.getElementById('status-text');
const iconPlay = document.getElementById('icon-play');
const iconPause = document.getElementById('icon-pause');

function updateStatus(connected, message) {
  if (connected) {
    statusIndicator.className = 'w-2 h-2 rounded-full bg-emerald-500';
    statusText.className = 'text-emerald-400 font-semibold text-xs';
    statusText.textContent = message || 'Conectado';
  } else {
    statusIndicator.className = 'w-2 h-2 rounded-full bg-rose-500 animate-pulse';
    statusText.className = 'text-rose-400 font-semibold text-xs';
    statusText.textContent = message || 'Desconectado';
  }
}

function sendCommand(commandName, payload = {}) {
  // Haptic feedback for mobile tap
  if (navigator.vibrate) {
    navigator.vibrate(40);
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
    console.warn('[Remote] WebSocket is not connected.');
  }
}

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/ws`;

  console.log(`[Remote] Connecting to ${wsUrl}...`);
  updateStatus(false, 'Conectando...');

  try {
    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
      console.log('[Remote] Connected to WebSocket server');
      updateStatus(true, 'Conectado');
      if (reconnectTimer) {
        clearInterval(reconnectTimer);
        reconnectTimer = null;
      }
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
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
      console.warn('[Remote] Connection closed. Reconnecting...');
      updateStatus(false, 'Reconectando...');
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[Remote] WebSocket error:', err);
      ws.close();
    };
  } catch (err) {
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

// Initialize connection
connectWebSocket();

