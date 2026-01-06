/**
 * Shared utilities for the 15 Minute Time Tracker extension
 * Handles storage operations, date utilities, and data management
 */



/**
 * Storage keys
 */
const STORAGE_KEYS = {
  TIME_BLOCKS: 'timeBlocks',
  DAILY_PRIORITY: 'dailyPriority',
  LAST_INTERRUPT: 'lastInterrupt',
  TIMER_START: 'timerStart',
  CURRENT_DAY: 'currentDay',
  CUSTOM_LABELS: 'customLabels'
};



/**
 * Get labels from storage, with default fallback
 */
async function getLabels() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.CUSTOM_LABELS);
  return result[STORAGE_KEYS.CUSTOM_LABELS] || DEFAULT_LABELS;
}

/**
 * Get all time blocks from storage
 */
async function getTimeBlocks() {
  const result = await chrome.storage.local.get(STORAGE_KEYS.TIME_BLOCKS);
  return result[STORAGE_KEYS.TIME_BLOCKS] || [];
}

/**
 * Save a time block
 */
async function saveTimeBlock(timeBlock) {
  const blocks = await getTimeBlocks();
  blocks.push(timeBlock);
  await chrome.storage.local.set({ [STORAGE_KEYS.TIME_BLOCKS]: blocks });
}

/**
 * Get today's time blocks
 */
async function getTodayBlocks() {
  const blocks = await getTimeBlocks();
  const today = new Date().toDateString();
  return blocks.filter(block => new Date(block.start).toDateString() === today);
}

/**
 * Get this week's time blocks (last 7 days)
 */
async function getWeekBlocks() {
  const blocks = await getTimeBlocks();
  const now = new Date();
  const weekStart = new Date(now);
  weekStart.setDate(now.getDate() - 7); // Last 7 days
  weekStart.setHours(0, 0, 0, 0);
  
  return blocks.filter(block => new Date(block.start) >= weekStart);
}

/**
 * Get today's declared priority
 */
async function getTodayPriority() {
  const today = new Date().toDateString();
  const result = await chrome.storage.local.get(STORAGE_KEYS.DAILY_PRIORITY);
  const priorities = result[STORAGE_KEYS.DAILY_PRIORITY] || {};
  return priorities[today] || null;
}

/**
 * Set today's priority
 */
async function setTodayPriority(priority) {
  const today = new Date().toDateString();
  const result = await chrome.storage.local.get(STORAGE_KEYS.DAILY_PRIORITY);
  const priorities = result[STORAGE_KEYS.DAILY_PRIORITY] || {};
  priorities[today] = priority;
  await chrome.storage.local.set({ [STORAGE_KEYS.DAILY_PRIORITY]: priorities });
}

/**
 * Check if priority has been set today
 */
async function hasPriorityToday() {
  const priority = await getTodayPriority();
  return priority !== null;
}

/**
 * Generate daily insight comparing priority to actual time
 */
async function generateDailyInsight() {
  const priority = await getTodayPriority();
  const blocks = await getTodayBlocks();
  
  if (!priority || blocks.length === 0) {
    return null;
  }
  
  // Get labels
  const labels = await getLabels();
  
  // Count time by label
  const labelCounts = {};
  labels.forEach(label => labelCounts[label] = 0);
  
  blocks.forEach(block => {
    if (!labelCounts.hasOwnProperty(block.label)) {
      labelCounts[block.label] = 0;
    }
    labelCounts[block.label]++;
  });
  
  // Convert to hours (each block is 15 minutes = 0.25 hours)
  const labelHours = {};
  Object.keys(labelCounts).forEach(label => {
    labelHours[label] = labelCounts[label] * 0.25;
  });
  
  // Find the dominant label
  const dominantLabel = Object.keys(labelHours).reduce((a, b) => 
    labelHours[a] > labelHours[b] ? a : b
  );
  
  // Generate uncomfortable insight
  // Check if priority text mentions any of the labels
  const priorityLower = priority.toLowerCase();
  const dominantLower = dominantLabel.toLowerCase();
  
  // Simple keyword matching for priority alignment (using default labels as reference)
  const priorityKeywords = {
    'work': ['work', 'task', 'project', 'complete', 'finish', 'deliver', 'code', 'build', 'create'],
    'meetings': ['meeting', 'call', 'sync', 'discuss', 'collaborate', 'team', 'standup', 'review'],
    'break': ['break', 'rest', 'lunch', 'pause', 'recharge', 'refresh', 'relax'],
    'planning': ['plan', 'organize', 'review', 'strategize', 'prepare', 'schedule', 'prioritize'],
    'other': ['other', 'misc', 'admin', 'email', 'message', 'chat']
  };
  
  // Check if priority aligns with dominant label
  const relevantKeywords = priorityKeywords[dominantLower] || [];
  const priorityMatchesLabel = relevantKeywords.some(keyword => priorityLower.includes(keyword));
  
  if (priorityMatchesLabel) {
    // If they match, find the second most common (if significant)
    const sorted = Object.entries(labelHours)
      .sort((a, b) => b[1] - a[1])
      .filter(([label]) => label !== dominantLabel && labelHours[label] > 0);
    
    if (sorted.length > 0 && sorted[0][1] >= 1.0) {
      // Only show mismatch if second label has at least 1 hour
      const [secondLabel, hours] = sorted[0];
      return `You said "${priority}" mattered most today, but spent ${hours.toFixed(1)} hours in ${secondLabel.toLowerCase()}.`;
    }
    // They aligned - but still make it slightly uncomfortable
    return `You said "${priority}" mattered most today. You spent ${labelHours[dominantLabel].toFixed(1)} hours in ${dominantLabel.toLowerCase()}.`;
  } else {
    // Clear mismatch - this is the uncomfortable truth
    const hours = labelHours[dominantLabel];
    return `You said "${priority}" mattered most today, but spent ${hours.toFixed(1)} hours in ${dominantLabel.toLowerCase()}.`;
  }
}

/**
 * Generate weekly insights
 */
async function generateWeeklyInsights() {
  const blocks = await getWeekBlocks();
  const priorities = await chrome.storage.local.get(STORAGE_KEYS.DAILY_PRIORITY);
  const dailyPriorities = priorities[STORAGE_KEYS.DAILY_PRIORITY] || {};
  
  // Get labels
  const labels = await getLabels();
  
  // Count time by label for the week
  const labelCounts = {};
  labels.forEach(label => labelCounts[label] = 0);
  
  blocks.forEach(block => {
    if (!labelCounts.hasOwnProperty(block.label)) {
      labelCounts[block.label] = 0;
    }
    labelCounts[block.label]++;
  });
  
  const labelHours = {};
  Object.keys(labelCounts).forEach(label => {
    labelHours[label] = labelCounts[label] * 0.25;
  });
  
  // Find biggest mismatch
  const dayGroups = {};
  blocks.forEach(block => {
    const day = new Date(block.start).toDateString();
    if (!dayGroups[day]) dayGroups[day] = [];
    dayGroups[day].push(block);
  });
  
  let biggestMismatch = null;
  let maxMismatchHours = 0;
  
  Object.keys(dayGroups).forEach(day => {
    const dayBlocks = dayGroups[day];
    const dayPriority = dailyPriorities[day];
    if (!dayPriority) return;
    
    const dayLabelCounts = {};
    labels.forEach(label => dayLabelCounts[label] = 0);
    dayBlocks.forEach(block => {
      if (!dayLabelCounts.hasOwnProperty(block.label)) {
        dayLabelCounts[block.label] = 0;
      }
      dayLabelCounts[block.label]++;
    });
    
    const dayLabelHours = {};
    Object.keys(dayLabelCounts).forEach(label => {
      dayLabelHours[label] = dayLabelCounts[label] * 0.25;
    });
    
    const dominantLabel = Object.keys(dayLabelHours).reduce((a, b) => 
      dayLabelHours[a] > dayLabelHours[b] ? a : b
    );
    
    // Check for mismatch using keyword matching
    const priorityLower = dayPriority.toLowerCase();
    const dominantLower = dominantLabel.toLowerCase();
    
    const priorityKeywords = {
      'work': ['work', 'task', 'project', 'complete', 'finish', 'deliver', 'code', 'build', 'create'],
      'meetings': ['meeting', 'call', 'sync', 'discuss', 'collaborate', 'team', 'standup', 'review'],
      'break': ['break', 'rest', 'lunch', 'pause', 'recharge', 'refresh', 'relax'],
      'planning': ['plan', 'organize', 'review', 'strategize', 'prepare', 'schedule', 'prioritize'],
      'other': ['other', 'misc', 'admin', 'email', 'message', 'chat']
    };
    
    const relevantKeywords = priorityKeywords[dominantLower] || [];
    const priorityMatchesLabel = relevantKeywords.some(keyword => priorityLower.includes(keyword));
    
    if (!priorityMatchesLabel) {
      const hours = dayLabelHours[dominantLabel];
      if (hours > maxMismatchHours) {
        maxMismatchHours = hours;
        biggestMismatch = {
          day,
          priority: dayPriority,
          actual: dominantLabel,
          hours
        };
      }
    }
  });
  
  // Find longest break/other streak (tracks consecutive non-work time)
  // This helps identify when user takes extended breaks or gets distracted
  let longestStreak = 0;
  let currentStreak = 0;
  const sortedBlocks = blocks.sort((a, b) => new Date(a.start) - new Date(b.start));
  // Track "Break" or "Other" as non-productive time, fallback to last label
  const breakLabel = labels.includes('Break') ? 'Break' : (labels.includes('Other') ? 'Other' : labels[labels.length - 1]);
  
  sortedBlocks.forEach(block => {
    if (block.label === breakLabel) {
      currentStreak++;
      longestStreak = Math.max(longestStreak, currentStreak);
    } else {
      currentStreak = 0;
    }
  });
  
  // Suggest behavior improvements
  const suggestions = [
    'Consider batching similar tasks together to improve focus.',
    'Review your meeting schedule - could any be shorter or async?',
    'Try time-blocking your most important work for better results.'
  ];
  
  const suggestion = suggestions[Math.floor(Math.random() * suggestions.length)];
  
  return {
    biggestMismatch,
    longestAvoidanceStreak: longestStreak * 0.25, // Convert to hours (keeping name for compatibility)
    suggestion
  };
}

/**
 * Format date for display
 */
function formatDate(date) {
  return new Date(date).toLocaleDateString('en-US', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
}

