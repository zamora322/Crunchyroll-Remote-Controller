// Background Service Worker for Crunchyroll Remote Controller
// Running the WebSocket here bypasses Crunchyroll's page Content Security Policy (CSP).

const WS_URL = 'ws://localhost:8000/ws';
let ws = null;
let reconnectTimer = null;
let heartbeatInterval = null;
const RECONNECT_INTERVAL = 2500;
const HEARTBEAT_INTERVAL = 15000;

console.log('[CR-Background] Service worker initialized.');

function sendHeartbeat() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    try {
      ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
    } catch (e) {
      console.warn('[CR-Background] Error sending heartbeat ping:', e);
    }
  }
}

function startHeartbeat() {
  stopHeartbeat();
  heartbeatInterval = setInterval(sendHeartbeat, HEARTBEAT_INTERVAL);
}

function stopHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

function connectWebSocket() {
  if (ws && (ws.readyState === WebSocket.CONNECTING || ws.readyState === WebSocket.OPEN)) {
    return;
  }

  try {
    ws = new WebSocket(WS_URL);

    ws.onopen = () => {
      console.log('[CR-Background] Connected to Relay WebSocket server.');
      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
      }
      startHeartbeat();
      // Broadcast connection status to all Crunchyroll tabs
      notifyTabs({ type: 'cr_remote_status', connected: true });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data && data.type === 'pong') {
          // Heartbeat response from server
          return;
        }

        console.log('[CR-Background] Message received from WebSocket:', data);

        // Handle fullscreen via Chrome Windows API (bypasses browser user-gesture restrictions)
        if (data.command === 'toggle_fullscreen') {
          chrome.windows.getCurrent((win) => {
            const nextState = win.state === 'fullscreen' ? 'normal' : 'fullscreen';
            chrome.windows.update(win.id, { state: nextState }, () => {
              notifyTabs({ ...data, isFullscreen: nextState === 'fullscreen' });
            });
          });
          return;
        }

        // Forward command to all open Crunchyroll tabs
        notifyTabs(data);
      } catch (e) {
        console.error('[CR-Background] Error parsing message:', e);
      }
    };

    ws.onclose = () => {
      console.warn('[CR-Background] WebSocket disconnected. Scheduling reconnect...');
      stopHeartbeat();
      notifyTabs({ type: 'cr_remote_status', connected: false });
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[CR-Background] WebSocket error:', err);
      stopHeartbeat();
      if (ws) {
        try {
          ws.close();
        } catch (_) {}
      }
    };
  } catch (err) {
    console.error('[CR-Background] Failed to connect WebSocket:', err);
    scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (!reconnectTimer) {
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      connectWebSocket();
    }, RECONNECT_INTERVAL);
  }
}

function notifyTabs(message) {
  chrome.tabs.query({ url: '*://*.crunchyroll.com/*' }, (tabs) => {
    if (!tabs || tabs.length === 0) {
      return;
    }
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab might be loading or frame not ready yet
      });
    }
  });
}

// 1. Maintain service worker activity via Ports from content scripts
chrome.runtime.onConnect.addListener((port) => {
  if (port.name === 'cr_keepalive') {
    port.onMessage.addListener((msg) => {
      if (msg && msg.type === 'ping') {
        // Ensure WebSocket is active whenever content script pings
        if (!ws || ws.readyState !== WebSocket.OPEN) {
          connectWebSocket();
        }
        try {
          port.postMessage({ type: 'pong', connected: ws && ws.readyState === WebSocket.OPEN });
        } catch (_) {}
      }
    });
  }
});

// 2. Listen for messages from content.js (wakes up Service Worker if suspended)
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && (message.type === 'check_connection' || message.type === 'keep_alive')) {
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    if (!isConnected) {
      connectWebSocket();
    }
    sendResponse({ connected: isConnected });
  } else if (message && message.command === 'set_window_state') {
    chrome.windows.getCurrent((win) => {
      chrome.windows.update(win.id, { state: message.state || 'normal' });
    });
  }
  return true;
});

// 3. MV3 Alarm fallback: check connection status periodically
chrome.alarms.create('cr_watchdog', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'cr_watchdog') {
    if (!ws || ws.readyState !== WebSocket.OPEN) {
      console.log('[CR-Background] Watchdog alarm triggered WebSocket reconnect.');
      connectWebSocket();
    }
  }
});

// Start initial connection
connectWebSocket();
