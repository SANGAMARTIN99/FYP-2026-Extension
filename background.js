const MAX_LOGS = 1000;

// Helper to save logs
const saveLog = async (logEntry) => {
  const result = await chrome.storage.local.get(['activityLogs']);
  let logs = result.activityLogs || [];
  
  logs.unshift({
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    ...logEntry
  });

  // Maintain limit
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(0, MAX_LOGS);
  }

  await chrome.storage.local.set({ activityLogs: logs });
  
  // Optional: Notify popup if open (via runtime message)
  chrome.runtime.sendMessage({ type: 'NEW_LOG', log: logs[0] }).catch(() => {
    // Popup might be closed, ignore error
  });
};

// Track Navigations
chrome.webNavigation.onCommitted.addListener((details) => {
  if (details.frameId === 0) { // Only main frame
    saveLog({
      type: 'navigation',
      url: details.url,
      transitionType: details.transitionType,
      title: 'Page Navigation' // Titles are harder to get here, content scripts or tabs API needed
    });
  }
});

// Capture URL Requests
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Ignore internal extension requests
    if (details.url.startsWith('chrome-extension://')) return;

    saveLog({
      type: 'request',
      url: details.url,
      method: details.method,
      resourceType: details.type
    });
  },
  { urls: ["<all_urls>"] }
);

// Get Tab updates for titles
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'complete' && tab.url) {
     saveLog({
       type: 'page_load',
       url: tab.url,
       title: tab.title || 'Unknown Title'
     });
  }
});

console.log('Premium Tracker Background Service Worker Active');
