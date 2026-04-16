const MAX_LOGS = 1000;

let cachedUserEmail = null;

const getChromeUser = async () => {
  if (cachedUserEmail) return cachedUserEmail;
  try {
    const userInfo = await chrome.identity.getProfileUserInfo();
    if (userInfo && userInfo.email) {
      cachedUserEmail = userInfo.email;
    } else {
      cachedUserEmail = 'Anonymous Chrome User';
    }
  } catch (e) {
    cachedUserEmail = 'Anonymous Chrome User';
  }
  return cachedUserEmail;
};

// Helper to save logs
const saveLog = async (logEntry) => {
  // Prevent infinite tracking loop of our own GraphQL backend endpoints
  if (logEntry.url && (logEntry.url.includes('127.0.0.1:8000') || logEntry.url.includes('localhost:8000'))) {
    return;
  }
  
  // Optional: Ignore extremely noisy automated assets if we only want actual URLs
  if (logEntry.type === 'request' && !['main_frame', 'xmlhttprequest'].includes(logEntry.resourceType)) {
    return;
  }

  const result = await chrome.storage.local.get(['activityLogs']);
  let logs = result.activityLogs || [];
  
  const enrichedLog = {
    id: Date.now() + Math.random().toString(36).substr(2, 9),
    timestamp: new Date().toISOString(),
    ...logEntry
  };

  logs.unshift(enrichedLog);

  // Maintain limit
  if (logs.length > MAX_LOGS) {
    logs = logs.slice(0, MAX_LOGS);
  }

  await chrome.storage.local.set({ activityLogs: logs });
  
  // Dispatch to Django Backend directly
  syncToDjango(logEntry);

  // Optional: Notify popup if open (via runtime message)
  chrome.runtime.sendMessage({ type: 'NEW_LOG', log: logs[0] }).catch(() => {
    // Popup might be closed, ignore error
  });
};

const syncToDjango = async (logEntry) => {
  const account = await getChromeUser();
  const query = `
    mutation RecordActivity($input: URLLogInput!) {
      recordActivity(input: $input) {
        success
      }
    }
  `;

  // Extract domain fallback securely if title is missing
  let extractedTitle = logEntry.title || "Unknown Title";
  if (extractedTitle === "Unknown Title" || extractedTitle === "Page Navigation") {
    try {
      const urlObj = new URL(logEntry.url);
      // E.g. "github.com" from "https://github.com/path"
      extractedTitle = urlObj.hostname.replace(/^www\./, '');
      // Capitalize first letter
      extractedTitle = extractedTitle.charAt(0).toUpperCase() + extractedTitle.slice(1);
    } catch(e) {
      // Ignore URL parsing errors
    }
  }

  // We group everything into URLLog for now
  const variables = {
    input: {
      url: logEntry.url || "unknown",
      title: extractedTitle,
      chromeAccount: account,
      deviceMac: "Ext-Client-MAC-Hidden", // Browsers cannot native access MAC
      activities: [
        {
          activityType: logEntry.type || "browser_event",
          details: JSON.stringify(logEntry)
        }
      ]
    }
  };

  try {
    await fetch("http://127.0.0.1:8000/graphql/", {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ query, variables })
    });
  } catch (err) {
    console.error("Backend Sync Failed:", err);
  }
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
