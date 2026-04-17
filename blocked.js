const urlParams = new URLSearchParams(window.location.search);
const blockedUrl = urlParams.get('url');
const blockedReason = urlParams.get('reason');

if (blockedUrl) {
  document.getElementById('blocked-url').textContent = blockedUrl;
}

if (blockedReason && document.getElementById('blocked-reason')) {
  document.getElementById('blocked-reason').textContent = blockedReason;
}

// --- AUTO-RESTORE LOGIC ---
// If the admin removes the restriction, this page should automatically 
// redirect the user back to their original destination.

const checkReleaseStatus = async () => {
  if (!blockedUrl) return;

  try {
    const { blockedDomains } = await chrome.storage.local.get(['blockedDomains']);
    const urlObj = new URL(blockedUrl);
    const hostname = urlObj.hostname.toLowerCase();

    // Check if the domain is still in the blacklist
    const isStillBlocked = (blockedDomains || []).some(domain => 
      hostname === domain || hostname.endsWith('.' + domain)
    );

    if (!isStillBlocked) {
      console.log("AegisBrowse: Restriction lifted. Restoring session...");
      window.location.href = blockedUrl;
    }
  } catch (e) {
    console.error("AegisBrowse: Restore check failed", e);
  }
};

// Check every 3 seconds for policy changes
setInterval(checkReleaseStatus, 3000);

// Initial check on load
checkReleaseStatus();
