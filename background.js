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
  const settings = await chrome.storage.local.get(['trackingEnabled']);
  const trackingEnabled = settings.trackingEnabled !== false; // Default to true

  if (!trackingEnabled) return;

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
    // PULSE INTERCEPTION: Real-time sync trigger from Dashboard
    if (details.url.includes('aegis-pulse.local')) {
      console.log("AegisBrowse: Real-time pulse received! Syncing...");
      syncBlockedDomains();
      return; 
    }

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

// --- NEW BLOCKING MECHANISM ---

const updateBlockingRules = async (blockedData) => {
  try {
    const settings = await chrome.storage.local.get(['trackingEnabled']);
    if (settings.trackingEnabled === false) {
       // Surveillance is deactivated, remove all rules
       const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
       await chrome.declarativeNetRequest.updateDynamicRules({
         removeRuleIds: oldRules.map(r => r.id)
       });
       console.log("AegisBrowse: Surveillance OFF - Rules Cleared");
       return;
    }

    const rules = blockedData.map((item, index) => ({
      id: index + 100,
      priority: 1,
      action: { 
        type: 'redirect', 
        redirect: { 
          url: chrome.runtime.getURL('blocked.html') + 
               '?url=' + encodeURIComponent(item.domain) + 
               '&reason=' + encodeURIComponent(item.reason || "Security Policy")
        } 
      },
      condition: { 
        urlFilter: `*://${item.domain}/*`, 
        resourceTypes: ['main_frame'] 
      }
    }));

    // Add www variants
    const expandedRules = [...rules];
    blockedData.forEach((item, index) => {
      if (!item.domain.startsWith('www.')) {
        expandedRules.push({
          id: index + 1000,
          priority: 1,
          action: { 
            type: 'redirect', 
            redirect: { 
              url: chrome.runtime.getURL('blocked.html') + 
                   '?url=' + encodeURIComponent('www.' + item.domain) + 
                   '&reason=' + encodeURIComponent(item.reason || "Security Policy")
            } 
          },
          condition: { 
            urlFilter: `*://www.${item.domain}/*`, 
            resourceTypes: ['main_frame'] 
          }
        });
      }
    });

    const oldRules = await chrome.declarativeNetRequest.getDynamicRules();
    const oldIds = oldRules.map(r => r.id);

    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: oldIds,
      addRules: expandedRules
    });
    console.log("AegisBrowse: Enhanced Rules Updated", expandedRules.length);
  } catch (err) {
    console.error("AegisBrowse: Failed to update declarative rules:", err);
  }
};

const syncBlockedDomains = async () => {
  const query = `
    query GetBlockedDomains {
      allBlockedDomains {
        domain
        reason
      }
    }
  `;
  
  const attemptSync = async (host) => {
    const response = await fetch(`${host}/graphql/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query })
    });
    if (!response.ok) throw new Error(`HTTP Error: ${response.status}`);
    return await response.json();
  };

  try {
    let result;
    try {
      result = await attemptSync("http://127.0.0.1:8000");
    } catch (e) {
      result = await attemptSync("http://localhost:8000");
    }

    if (result.data && result.data.allBlockedDomains) {
      const blockedData = result.data.allBlockedDomains.map(d => ({
        domain: d.domain.toLowerCase().trim(),
        reason: d.reason
      }));
      await chrome.storage.local.set({ 
        blockedData, 
        blockedDomains: blockedData.map(d => d.domain) // For the backup navigation listener
      });
      console.log("AegisBrowse: Policy data updated", blockedData.length);
      await updateBlockingRules(blockedData);
    }
  } catch (err) {
    console.error("AegisBrowse: Fatal sync error:", err.message);
  }
};

// Listen for alarms
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'syncBlockedDomains') {
    syncBlockedDomains();
  }
});

// Create alarm for periodic sync
chrome.alarms.create('syncBlockedDomains', { periodInMinutes: 5 });

// Initial sync
syncBlockedDomains();

// Domain blocking listener (Backup for declarativeNetRequest)
chrome.webNavigation.onBeforeNavigate.addListener(async (details) => {
  if (details.frameId !== 0) return; 

  const { trackingEnabled, blockedDomains } = await chrome.storage.local.get(['trackingEnabled', 'blockedDomains']);
  if (trackingEnabled === false) return; // Surveillance is deactivated
  if (!blockedDomains || blockedDomains.length === 0) return;

  try {
    const url = new URL(details.url);
    const hostname = url.hostname.toLowerCase();

    const isBlocked = blockedDomains.some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );

    if (isBlocked && !details.url.includes('blocked.html')) {
      console.warn("AegisBrowse: Redirection active for:", details.url);
      chrome.tabs.update(details.tabId, { 
        url: chrome.runtime.getURL('blocked.html') + '?url=' + encodeURIComponent(details.url) 
      });
    }
  } catch (e) {}
});

// Listen for messages from popup
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === 'STATUS_UPDATE') {
    console.log("AegisBrowse: Status Changed to", msg.enabled);
    chrome.storage.local.get(['blockedData'], ({ blockedData }) => {
      updateBlockingRules(blockedData || []);
    });
  }
});

console.log('Premium Tracker Background Service Worker Active');
