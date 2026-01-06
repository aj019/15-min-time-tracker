/**
 * Background service worker for 15 Minute Time Tracker
 * Handles 15-minute timer and interrupt logic
 * 
 * Architecture:
 * - Uses Chrome alarms API for reliable 15-minute intervals
 * - Creates notifications to interrupt user (cannot be dismissed without action)
 * - Manages timer state across browser sessions
 * - Handles daily priority checks
 */

console.log('=== BACKGROUND SERVICE WORKER LOADING ===');
const INTERRUPT_INTERVAL = 15 * 60 * 1000; // 15 minutes in milliseconds
const ALARM_NAME = 'timeTrackerInterrupt';
console.log('Constants set - INTERRUPT_INTERVAL:', INTERRUPT_INTERVAL, 'ALARM_NAME:', ALARM_NAME);

/**
 * Initialize the extension
 * Checks timer state but doesn't auto-start (user must click Start)
 */
async function initialize() {
  console.log('=== INITIALIZE CALLED ===');
  try {
    // Check if we need to show daily priority prompt
    console.log('Checking daily priority...');
    await checkDailyPriority();
    
    // Check if timer is running and needs interrupt
    console.log('Checking timer state...');
    await checkTimerState();
    console.log('=== INITIALIZE COMPLETE ===');
  } catch (error) {
    console.error('Error in initialize:', error);
  }
}

/**
 * Check timer state and trigger interrupt if needed
 */
async function checkTimerState() {
  const result = await chrome.storage.local.get(['pendingBlock', 'timerStart', 'isRunning']);
  const pendingBlock = result.pendingBlock;
  const timerStart = result.timerStart;
  const isRunning = result.isRunning;
  
  // If timer is not running, don't do anything
  if (!isRunning) {
    return;
  }
  
  // If there's a pending block, don't start a new timer
  // User must complete the labeling first
  if (pendingBlock) {
    // Timer is paused until user labels the pending block
    return;
  }
  
  if (timerStart) {
    // Check if 15 minutes have passed since timer start
    const elapsed = Date.now() - timerStart;
    if (elapsed >= INTERRUPT_INTERVAL) {
      // Time to interrupt
      await triggerInterrupt();
    } else {
      // Schedule interrupt for remaining time
      const remaining = INTERRUPT_INTERVAL - elapsed;
      scheduleNextInterrupt(Date.now() + remaining);
    }
  }
}

/**
 * Schedule the next interrupt using Chrome alarms
 * @param {number} targetTime - Timestamp when interrupt should fire
 */
function scheduleNextInterrupt(targetTime) {
  console.log('=== SCHEDULE NEXT INTERRUPT ===');
  console.log('Target time:', new Date(targetTime).toISOString());
  console.log('Current time:', new Date().toISOString());
  console.log('Time until interrupt:', Math.round((targetTime - Date.now()) / 1000 / 60), 'minutes');
  
  // Clear any existing alarm
  chrome.alarms.clear(ALARM_NAME, (wasCleared) => {
    console.log('Alarm cleared:', wasCleared);
    
    // Create new alarm
    chrome.alarms.create(ALARM_NAME, {
      when: targetTime
    }, () => {
      if (chrome.runtime.lastError) {
        console.error('Error creating alarm:', chrome.runtime.lastError);
      } else {
        console.log('Alarm created successfully');
        // Verify alarm was created
        chrome.alarms.get(ALARM_NAME, (alarm) => {
          if (alarm) {
            console.log('Alarm verified:', alarm);
          } else {
            console.error('Alarm not found after creation!');
          }
        });
      }
    });
  });
}

/**
 * Trigger the interrupt - creates notification and stores pending block
 * This is the core "uncomfortable" behavior - user cannot proceed without labeling
 */
async function triggerInterrupt() {
  // Get the timer start time
  const result = await chrome.storage.local.get(['timerStart']);
  const timerStart = result.timerStart || Date.now();
  
  const blockStart = timerStart;
  const blockEnd = Date.now();
  
  // Store the pending block - this prevents new timer from starting
  // User MUST label this block before timer can continue
  await chrome.storage.local.set({ 
    pendingBlock: {
      start: blockStart,
      end: blockEnd
    }
  });
  
  // Add badge to extension icon to indicate pending action
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  
  // Create persistent notification that cannot be easily dismissed
  // This is the "hard interrupt" - user must interact
  const notificationOptions = {
    type: 'basic',
    title: '⏰ Time Block Complete',
    message: 'Label your last 15 minutes. Click this notification or the extension icon to continue.',
    priority: 2,
    requireInteraction: true, // Makes notification harder to dismiss
    silent: false // Make sure it makes a sound
  };
  
  // Try to add icon, but don't fail if it doesn't work
  try {
    notificationOptions.iconUrl = chrome.runtime.getURL('icons/icon48.png');
  } catch (e) {
    console.log('Could not set icon URL:', e);
  }
  
  chrome.notifications.create('timeBlockInterrupt', notificationOptions, (notificationId) => {
    if (chrome.runtime.lastError) {
      console.error('Error creating notification:', chrome.runtime.lastError);
      // Try again without icon if it failed
      chrome.notifications.create('timeBlockInterrupt', {
        type: 'basic',
        title: '⏰ Time Block Complete',
        message: 'Label your last 15 minutes. Click this notification or the extension icon to continue.',
        priority: 2,
        requireInteraction: true,
        silent: false
      });
    } else {
      console.log('Notification created with ID:', notificationId);
    }
  });
  
  // Try to open popup (may not work in all contexts, but notification will)
  try {
    await chrome.action.openPopup();
  } catch (e) {
    // Popup can't be opened programmatically in some contexts
    // User must click extension icon or notification
    console.log('Could not open popup programmatically:', e);
  }
}

/**
 * Handle alarm firing - triggers interrupt
 */
chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name === ALARM_NAME) {
    await triggerInterrupt();
  }
});

/**
 * Check if daily priority needs to be set
 * Runs once per day when extension initializes
 */
async function checkDailyPriority() {
  const today = new Date().toDateString();
  const result = await chrome.storage.local.get(['currentDay', 'dailyPriority']);
  const currentDay = result.currentDay;
  const dailyPriority = result.dailyPriority || {};
  
  if (currentDay !== today) {
    // New day - update current day
    await chrome.storage.local.set({ currentDay: today });
    
    if (!dailyPriority[today]) {
      // Priority not set for today - will be prompted in popup
      await chrome.storage.local.set({ needsPriority: true });
    }
  }
}

/**
 * Handle notification click - open popup
 */
chrome.notifications.onClicked.addListener((notificationId) => {
  if (notificationId === 'timeBlockInterrupt') {
    console.log('Notification clicked, attempting to open popup...');
    chrome.action.openPopup();
    // Clear the notification after opening
    chrome.notifications.clear(notificationId);
  }
});

/**
 * Handle notification button click (if we add buttons in the future)
 */
chrome.notifications.onButtonClicked.addListener((notificationId, buttonIndex) => {
  if (notificationId === 'timeBlockInterrupt') {
    chrome.action.openPopup();
    chrome.notifications.clear(notificationId);
  }
});

/**
 * Update badge based on pending block status
 */
async function updateBadge() {
  const result = await chrome.storage.local.get(['pendingBlock']);
  if (result.pendingBlock) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
}

/**
 * Ensure notification exists if there's a pending block
 * This recreates the notification if it was dismissed
 */
async function ensureNotificationExists() {
  const result = await chrome.storage.local.get(['pendingBlock']);
  if (result.pendingBlock) {
    // Check if notification exists
    chrome.notifications.getAll((notifications) => {
      if (!notifications || !notifications['timeBlockInterrupt']) {
        // Notification doesn't exist, recreate it
        console.log('Recreating notification for pending block...');
        const notificationOptions = {
          type: 'basic',
          title: '⏰ Time Block Complete',
          message: 'Label your last 15 minutes. Click this notification or the extension icon to continue.',
          priority: 2,
          requireInteraction: true,
          silent: false
        };
        
        try {
          notificationOptions.iconUrl = chrome.runtime.getURL('icons/icon48.png');
        } catch (e) {
          console.log('Could not set icon URL:', e);
        }
        
        chrome.notifications.create('timeBlockInterrupt', notificationOptions);
      }
    });
  }
}

/**
 * Handle messages from popup
 * Handles start/stop timer and restart after labeling
 */
console.log('=== SETTING UP MESSAGE LISTENER ===');
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  console.log('=== MESSAGE RECEIVED ===');
  console.log('Request:', JSON.stringify(request));
  console.log('Sender:', sender);
  console.log('Action:', request.action);
  
  if (request.action === 'test') {
    console.log('Test message received - service worker is active!');
    sendResponse({ success: true, message: 'Service worker is active' });
    return true;
  } else if (request.action === 'startTimer') {
    console.log('Processing startTimer action...');
    (async () => {
      try {
        console.log('Step 1: Getting current time...');
        const now = Date.now();
        console.log('Current timestamp:', now, new Date(now).toISOString());
        
        console.log('Step 2: Setting storage...');
        await chrome.storage.local.set({ 
          timerStart: now,
          isRunning: true
        });
        console.log('Storage set successfully');
        
        // Verify storage was set
        const verify = await chrome.storage.local.get(['timerStart', 'isRunning']);
        console.log('Storage verification:', verify);
        
        console.log('Step 3: Scheduling interrupt...');
        scheduleNextInterrupt(now + INTERRUPT_INTERVAL);
        console.log('=== TIMER STARTED SUCCESSFULLY ===');
        sendResponse({ success: true });
      } catch (error) {
        console.error('=== ERROR STARTING TIMER ===');
        console.error('Error details:', error);
        console.error('Error stack:', error.stack);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (request.action === 'stopTimer') {
    (async () => {
      try {
        chrome.alarms.clear(ALARM_NAME);
        await chrome.storage.local.set({ 
          isRunning: false,
          timerStart: null
        });
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error stopping timer:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (request.action === 'scheduleNextInterrupt') {
    (async () => {
      try {
        const now = Date.now();
        const result = await chrome.storage.local.get(['isRunning']);
        if (result.isRunning) {
          await chrome.storage.local.set({ timerStart: now });
          scheduleNextInterrupt(now + INTERRUPT_INTERVAL);
          // Clear badge when timer continues
          chrome.action.setBadgeText({ text: '' });
        }
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error scheduling next interrupt:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (request.action === 'clearPendingBlock') {
    (async () => {
      try {
        await chrome.storage.local.set({ pendingBlock: null });
        chrome.action.setBadgeText({ text: '' });
        chrome.notifications.clear('timeBlockInterrupt');
        updateBadge();
        sendResponse({ success: true });
      } catch (error) {
        console.error('Error clearing pending block:', error);
        sendResponse({ success: false, error: error.message });
      }
    })();
    return true; // Keep message channel open for async response
  } else if (request.action === 'getTimerState') {
    (async () => {
      try {
        const result = await chrome.storage.local.get(['isRunning', 'timerStart', 'pendingBlock']);
        sendResponse({ 
          isRunning: result.isRunning || false,
          timerStart: result.timerStart || null,
          pendingBlock: result.pendingBlock || null
        });
      } catch (error) {
        console.error('Error getting timer state:', error);
        sendResponse({ 
          isRunning: false,
          timerStart: null,
          pendingBlock: null
        });
      }
    })();
    return true; // Keep message channel open for async response
  }
  return false; // Message not handled
});

/**
 * Initialize on extension startup
 */
console.log('=== SETTING UP EVENT LISTENERS ===');
chrome.runtime.onStartup.addListener(() => {
  console.log('onStartup event fired');
  initialize();
});
chrome.runtime.onInstalled.addListener((details) => {
  console.log('onInstalled event fired, reason:', details.reason);
  initialize();
});

// Also initialize immediately when service worker starts
console.log('=== CALLING INITIALIZE IMMEDIATELY ===');
initialize();

// Periodically check timer state (every minute) to handle edge cases
console.log('=== SETTING UP PERIODIC TIMER CHECK ===');
setInterval(() => {
  console.log('Periodic timer check running...');
  checkTimerState();
  updateBadge(); // Update badge status
  ensureNotificationExists(); // Ensure notification exists if needed
}, 60 * 1000);

// Update badge on startup
updateBadge();
ensureNotificationExists();

console.log('=== BACKGROUND SERVICE WORKER SETUP COMPLETE ===');

