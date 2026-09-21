// Background Service Worker for Crunchyroll Remote Controller
// Running the WebSocket here bypasses Crunchyroll's page Content Security Policy (CSP).

const WS_URL = 'ws://localhost:8000/ws';
let ws = null;
let reconnectTimer = null;
const RECONNECT_INTERVAL = 3000;

console.log('[CR-Background] Service worker initialized.');

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
      // Broadcast connection status to all Crunchyroll tabs
      notifyTabs({ type: 'cr_remote_status', connected: true });
    };

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
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
      notifyTabs({ type: 'cr_remote_status', connected: false });
      scheduleReconnect();
    };

    ws.onerror = (err) => {
      console.error('[CR-Background] WebSocket error:', err);
      ws.close();
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
      console.log('[CR-Background] No Crunchyroll tabs found.');
      return;
    }
    for (const tab of tabs) {
      chrome.tabs.sendMessage(tab.id, message).catch(() => {
        // Tab might be loading or frame not ready yet
      });
    }
  });
}

// Listen for messages from content.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message && message.type === 'check_connection') {
    const isConnected = ws && ws.readyState === WebSocket.OPEN;
    sendResponse({ connected: isConnected });
    if (!isConnected) {
      connectWebSocket();
    }
  } else if (message && message.command === 'set_window_state') {
    chrome.windows.getCurrent((win) => {
      chrome.windows.update(win.id, { state: message.state || 'normal' });
    });
  }
  return true;
});

// Start connection
connectWebSocket();
