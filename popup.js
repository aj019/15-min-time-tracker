/**
 * Popup script for 15 Minute Time Tracker
 * Handles all UI interactions and screen management
 */

const DEFAULT_LABELS = ['Work', 'Meetings', 'Break', 'Planning', 'Other'];
const NOTE_CHAR_LIMIT = 100;
const STORAGE_KEY_LABELS = 'customLabels';

// DOM elements
let selectedLabel = null;
let pendingBlock = null;

/**
 * Get labels from storage, with default fallback
 */
async function getLabels() {
  const result = await chrome.storage.local.get(STORAGE_KEY_LABELS);
  return result[STORAGE_KEY_LABELS] || DEFAULT_LABELS;
}

/**
 * Save labels to storage
 */
async function saveLabels(labels) {
  await chrome.storage.local.set({ [STORAGE_KEY_LABELS]: labels });
}

/**
 * Initialize popup - determine which screen to show
 */
async function initializePopup() {
  // Check if there's a pending block that needs to be labeled
  const result = await chrome.storage.local.get(['pendingBlock', 'needsPriority']);
  pendingBlock = result.pendingBlock;
  const needsPriority = result.needsPriority;
  
  // Update badge based on pending block
  if (pendingBlock) {
    chrome.action.setBadgeText({ text: '!' });
    chrome.action.setBadgeBackgroundColor({ color: '#22c55e' });
  } else {
    chrome.action.setBadgeText({ text: '' });
  }
  
  // Hide all screens first
  hideAllScreens();
  
  if (needsPriority) {
    // Show priority prompt first
    showPriorityPrompt();
  } else if (pendingBlock) {
    // Show tagging screen for pending block
    await showTaggingScreen();
  } else {
    // Show main menu
    showMainMenu();
  }
}

/**
 * Hide all screens
 */
function hideAllScreens() {
  document.getElementById('priorityPrompt').style.display = 'none';
  document.getElementById('taggingScreen').style.display = 'none';
  document.getElementById('dailyReview').style.display = 'none';
  document.getElementById('weeklyReview').style.display = 'none';
  document.getElementById('dataView').style.display = 'none';
  document.getElementById('settingsScreen').style.display = 'none';
  document.getElementById('mainMenu').style.display = 'none';
}

/**
 * Show priority prompt screen
 */
function showPriorityPrompt() {
  hideAllScreens();
  const screen = document.getElementById('priorityPrompt');
  screen.style.display = 'block';
  
  const input = document.getElementById('priorityInput');
  const submitBtn = document.getElementById('prioritySubmit');
  
  input.value = '';
  input.focus();
  
  submitBtn.onclick = async () => {
    const priority = input.value.trim();
    if (priority.length === 0) {
      alert('Please enter your priority for today.');
      return;
    }
    
    await setTodayPriority(priority);
    await chrome.storage.local.set({ needsPriority: false });
    
    // If there's a pending block, show tagging screen, otherwise show main menu
    if (pendingBlock) {
      await showTaggingScreen();
    } else {
      showMainMenu();
    }
  };
}

/**
 * Show tagging screen for interrupt
 */
async function showTaggingScreen() {
  hideAllScreens();
  const screen = document.getElementById('taggingScreen');
  screen.style.display = 'block';
  
  // Reset state
  selectedLabel = null;
  const noteInput = document.getElementById('noteInput');
  const charCount = document.getElementById('charCount');
  const submitBtn = document.getElementById('submitButton');
  
  noteInput.value = '';
  charCount.textContent = `0 / ${NOTE_CHAR_LIMIT}`;
  submitBtn.disabled = true;
  
  // Create label buttons
  const labelButtonsContainer = document.getElementById('labelButtons');
  labelButtonsContainer.innerHTML = '';
  
  const labels = await getLabels();
  labels.forEach(label => {
    const button = document.createElement('button');
    button.className = 'label-button';
    button.textContent = label;
    button.onclick = () => {
      // Remove selected class from all buttons
      document.querySelectorAll('.label-button').forEach(btn => {
        btn.classList.remove('selected');
      });
      
      // Add selected class to clicked button
      button.classList.add('selected');
      selectedLabel = label;
      submitBtn.disabled = false;
    };
    labelButtonsContainer.appendChild(button);
  });
  
  // Handle note input character count
  noteInput.oninput = () => {
    const count = noteInput.value.length;
    charCount.textContent = `${count} / ${NOTE_CHAR_LIMIT}`;
    if (count > NOTE_CHAR_LIMIT) {
      charCount.classList.add('warning');
    } else {
      charCount.classList.remove('warning');
    }
  };
  
  // Handle submit
  submitBtn.onclick = async () => {
    if (!selectedLabel) {
      alert('Please select a label.');
      return;
    }
    
    if (noteInput.value.length > NOTE_CHAR_LIMIT) {
      alert(`Note must be ${NOTE_CHAR_LIMIT} characters or less.`);
      return;
    }
    
    // Get today's priority
    const todayPriority = await getTodayPriority();
    
    // Save the time block
    const timeBlock = {
      start: pendingBlock.start,
      end: pendingBlock.end,
      label: selectedLabel,
      note: noteInput.value.trim() || null,
      dailyPriority: todayPriority
    };
    
    await saveTimeBlock(timeBlock);
    
    // Clear pending block
    await chrome.storage.local.set({ 
      pendingBlock: null
    });
    
    // Clear badge and notification
    chrome.action.setBadgeText({ text: '' });
    chrome.notifications.clear('timeBlockInterrupt');
    
    // Schedule next interrupt (only if timer is still running)
    // The background script will handle restarting the timer if it's running
    chrome.runtime.sendMessage({ action: 'scheduleNextInterrupt' });
    
    // Show main menu
    await showMainMenu();
  };
}

// Timer status update interval
let timerUpdateInterval = null;

/**
 * Show main menu
 */
async function showMainMenu() {
  hideAllScreens();
  const mainMenu = document.getElementById('mainMenu');
  if (!mainMenu) {
    console.error('Main menu element not found');
    return;
  }
  mainMenu.style.display = 'block';
  
  // Update timer status and controls
  await updateTimerUI();
  
  // Set up periodic timer status updates
  if (timerUpdateInterval) {
    clearInterval(timerUpdateInterval);
  }
  timerUpdateInterval = setInterval(async () => {
    const mainMenuEl = document.getElementById('mainMenu');
    if (mainMenuEl && mainMenuEl.style.display !== 'none') {
      await updateTimerUI();
    }
  }, 1000); // Update every second
  
  // Set up menu button handlers
  const viewDataBtn = document.getElementById('viewData');
  const viewDailyBtn = document.getElementById('viewDailyReview');
  const viewWeeklyBtn = document.getElementById('viewWeeklyReview');
  const viewSettingsBtn = document.getElementById('viewSettings');
  
  if (viewDataBtn) viewDataBtn.onclick = showDataView;
  if (viewDailyBtn) viewDailyBtn.onclick = showDailyReview;
  if (viewWeeklyBtn) viewWeeklyBtn.onclick = showWeeklyReview;
  if (viewSettingsBtn) viewSettingsBtn.onclick = showSettingsScreen;
  
  // Set up timer control handlers
  const startBtn = document.getElementById('startTimer');
  const stopBtn = document.getElementById('stopTimer');
  
  console.log('Setting up timer controls...');
  console.log('Start button:', startBtn);
  console.log('Stop button:', stopBtn);
  
  if (startBtn) {
    // Remove old handler if any
    const newStartBtn = startBtn.cloneNode(true);
    startBtn.parentNode.replaceChild(newStartBtn, startBtn);
    
    // Add click handler to the new button
    newStartBtn.addEventListener('click', async function(e) {
      console.log('=== START BUTTON CLICKED ===');
      console.log('Button element:', this);
      console.log('Event:', e);
      e.preventDefault();
      e.stopPropagation();
      await startTimer();
    }, false);
    
    console.log('Start button handler attached');
  } else {
    console.error('=== ERROR: Start button not found! ===');
  }
  
  if (stopBtn) {
    stopBtn.onclick = stopTimer;
    console.log('Stop button handler attached');
  } else {
    console.error('Stop button not found');
  }
}

/**
 * Update timer UI based on current state
 */
async function updateTimerUI() {
  console.log('=== UPDATE TIMER UI ===');
  try {
    console.log('Sending getTimerState message...');
    const response = await chrome.runtime.sendMessage({ action: 'getTimerState' });
    console.log('getTimerState response:', response);
    
    if (!response) {
      console.error('No response from getTimerState');
      return;
    }
    
    const isRunning = response.isRunning || false;
    const timerStart = response.timerStart || null;
    const pendingBlock = response.pendingBlock || null;
    console.log('Timer state - isRunning:', isRunning, 'timerStart:', timerStart, 'pendingBlock:', pendingBlock);
    
    const startBtn = document.getElementById('startTimer');
    const stopBtn = document.getElementById('stopTimer');
    const statusDiv = document.getElementById('timerStatus');
    
    if (!startBtn || !stopBtn || !statusDiv) {
      console.error('Timer UI elements not found');
      return;
    }
    
    if (isRunning) {
      startBtn.style.display = 'none';
      stopBtn.style.display = 'block';
      
      if (pendingBlock) {
        statusDiv.textContent = '⏸ Timer paused - label pending block';
        statusDiv.className = 'timer-status paused';
      } else if (timerStart) {
        const elapsed = Date.now() - timerStart;
        const minutes = Math.floor(elapsed / 60000);
        const seconds = Math.floor((elapsed % 60000) / 1000);
        statusDiv.textContent = `▶ Running - ${minutes}:${seconds.toString().padStart(2, '0')} elapsed`;
        statusDiv.className = 'timer-status running';
      } else {
        statusDiv.textContent = '▶ Timer running';
        statusDiv.className = 'timer-status running';
      }
    } else {
      startBtn.style.display = 'block';
      stopBtn.style.display = 'none';
      statusDiv.textContent = '⏹ Timer stopped';
      statusDiv.className = 'timer-status stopped';
    }
  } catch (error) {
    console.error('Error updating timer UI:', error);
  }
}

/**
 * Start the timer
 */
async function startTimer() {
  console.log('=== START TIMER FUNCTION CALLED ===');
  console.log('chrome.runtime available:', typeof chrome !== 'undefined' && typeof chrome.runtime !== 'undefined');
  console.log('chrome.runtime.sendMessage available:', typeof chrome.runtime.sendMessage !== 'undefined');
  
  try {
    console.log('Sending startTimer message to background...');
    console.log('Message payload:', { action: 'startTimer' });
    
    const response = await chrome.runtime.sendMessage({ action: 'startTimer' });
    console.log('Response received:', response);
    
    if (response && response.success) {
      console.log('Timer start successful, updating UI...');
      await updateTimerUI();
      console.log('=== TIMER STARTED SUCCESSFULLY IN POPUP ===');
    } else {
      console.error('=== FAILED TO START TIMER ===');
      console.error('Response:', response);
      alert('Failed to start timer. Please try again. Check console for details.');
    }
  } catch (error) {
    console.error('=== ERROR IN START TIMER ===');
    console.error('Error:', error);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    alert('Error starting timer: ' + error.message);
  }
}

/**
 * Stop the timer
 */
async function stopTimer() {
  try {
    const response = await chrome.runtime.sendMessage({ action: 'stopTimer' });
    if (response && response.success) {
      await updateTimerUI();
      console.log('Timer stopped successfully');
    } else {
      console.error('Failed to stop timer:', response);
      alert('Failed to stop timer. Please try again.');
    }
  } catch (error) {
    console.error('Error stopping timer:', error);
    alert('Error stopping timer: ' + error.message);
  }
}

// Current view state
let currentDataView = 'list';

/**
 * Show data view screen
 */
async function showDataView() {
  hideAllScreens();
  const screen = document.getElementById('dataView');
  screen.style.display = 'block';
  
  const content = document.getElementById('dataViewContent');
  const blocks = await getTimeBlocks();
  
  if (blocks.length === 0) {
    content.innerHTML = '<p class="empty-state">No time blocks recorded yet. Start the timer to begin tracking.</p>';
    document.getElementById('closeDataView').onclick = showMainMenu;
    return;
  }
  
  // Set up view toggle buttons
  const listViewBtn = document.getElementById('listViewBtn');
  const tableViewBtn = document.getElementById('tableViewBtn');
  
  listViewBtn.onclick = () => {
    currentDataView = 'list';
    listViewBtn.classList.add('active');
    tableViewBtn.classList.remove('active');
    renderDataView(blocks);
  };
  
  tableViewBtn.onclick = () => {
    currentDataView = 'table';
    tableViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
    renderDataView(blocks);
  };
  
  // Set initial view
  if (currentDataView === 'table') {
    tableViewBtn.classList.add('active');
    listViewBtn.classList.remove('active');
  } else {
    listViewBtn.classList.add('active');
    tableViewBtn.classList.remove('active');
  }
  
  // Set up close button handler
  document.getElementById('closeDataView').onclick = showMainMenu;
  
  // Render the view
  await renderDataView(blocks);
}

// Store the event handler reference so we can remove it
let dateHeaderClickHandler = null;

/**
 * Render data view based on current view mode
 */
async function renderDataView(blocks) {
  const content = document.getElementById('dataViewContent');
  
  // Remove old event listener if it exists
  if (dateHeaderClickHandler) {
    content.removeEventListener('click', dateHeaderClickHandler);
    dateHeaderClickHandler = null;
  }
  
  if (currentDataView === 'table') {
    content.innerHTML = await renderTableView(blocks);
  } else {
    content.innerHTML = await renderListView(blocks);
    
    // Set up event delegation for date header clicks (list view only)
    dateHeaderClickHandler = (e) => {
      const dateHeader = e.target.closest('.date-header');
      if (dateHeader) {
        e.preventDefault();
        e.stopPropagation();
        const dateId = dateHeader.getAttribute('data-date-id');
        if (dateId) {
          toggleDateGroup(dateId);
        }
      }
    };
    
    content.addEventListener('click', dateHeaderClickHandler);
    
    // Ensure all date groups start expanded
    document.querySelectorAll('.date-content').forEach(dateContent => {
      if (!dateContent.classList.contains('expanded')) {
        dateContent.classList.add('expanded');
      }
      dateContent.classList.remove('collapsed');
    });
    
    // Set all expand icons to show expanded state (▼)
    document.querySelectorAll('.expand-icon').forEach(icon => {
      icon.textContent = '▼';
    });
  }
}

/**
 * Render list view
 */
async function renderListView(blocks) {
  // Get current labels
  const labels = await getLabels();
  
  // Group blocks by date
  const blocksByDate = {};
  blocks.forEach(block => {
    const date = new Date(block.start).toDateString();
    if (!blocksByDate[date]) {
      blocksByDate[date] = [];
    }
    blocksByDate[date].push(block);
  });
  
  // Sort dates (newest first)
  const sortedDates = Object.keys(blocksByDate).sort((a, b) => {
    return new Date(b) - new Date(a);
  });
  
  let html = '';
  
  sortedDates.forEach((date, index) => {
    const dateBlocks = blocksByDate[date];
    const totalMinutes = dateBlocks.length * 15;
    const totalHours = (totalMinutes / 60).toFixed(1);
    
    // Count by label (include all labels from storage and any that exist in blocks)
    const labelCounts = {};
    labels.forEach(label => labelCounts[label] = 0);
    dateBlocks.forEach(block => {
      if (!labelCounts.hasOwnProperty(block.label)) {
        labelCounts[block.label] = 0;
      }
      labelCounts[block.label]++;
    });
    
    // Create a safe dateId using index to avoid special character issues
    const dateId = `date-${index}`;
    html += `
      <div class="date-group">
        <div class="date-header" data-date-id="${dateId}">
          <div class="date-header-content">
            <span class="expand-icon" id="icon-${dateId}">▼</span>
            <h3>${formatDate(date)}</h3>
          </div>
          <span class="date-summary">${dateBlocks.length} blocks • ${totalHours} hours</span>
        </div>
        <div class="date-content expanded" id="${dateId}">
          <div class="label-summary">
            ${Object.entries(labelCounts)
              .filter(([_, count]) => count > 0)
              .map(([label, count]) => {
                const hours = (count * 0.25).toFixed(1);
                const labelClass = label.toLowerCase().replace(/\s+/g, '-');
                return `<span class="label-badge label-${labelClass}">${escapeHtml(label)}: ${hours}h</span>`;
              })
              .join('')}
          </div>
          <div class="blocks-list">
            ${dateBlocks
              .sort((a, b) => new Date(b.start) - new Date(a.start))
              .map(block => {
                const startTime = new Date(block.start).toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit',
                  hour12: true 
                });
                const endTime = new Date(block.end).toLocaleTimeString('en-US', { 
                  hour: 'numeric', 
                  minute: '2-digit',
                  hour12: true 
                });
                const labelClass = block.label.toLowerCase().replace(/\s+/g, '-');
                return `
                  <div class="block-item">
                    <div class="block-time">${startTime} - ${endTime}</div>
                    <div class="block-label label-${labelClass}">${escapeHtml(block.label)}</div>
                    ${block.note ? `<div class="block-note">${escapeHtml(block.note)}</div>` : ''}
                  </div>
                `;
              })
              .join('')}
          </div>
        </div>
      </div>
    `;
  });
  
  return html;
}

/**
 * Render table view (Outlook calendar style)
 */
async function renderTableView(blocks) {
  if (blocks.length === 0) {
    return '<p class="empty-state">No time blocks recorded yet.</p>';
  }
  
  // Get date range
  const dates = blocks.map(block => new Date(block.start));
  const minDate = new Date(Math.min(...dates));
  const maxDate = new Date(Math.max(...dates));
  
  // Generate all dates in range
  const allDates = [];
  const currentDate = new Date(minDate);
  currentDate.setHours(0, 0, 0, 0);
  
  while (currentDate <= maxDate) {
    allDates.push(new Date(currentDate));
    currentDate.setDate(currentDate.getDate() + 1);
  }
  
  // Group blocks by date
  const blocksByDate = {};
  blocks.forEach(block => {
    const dateKey = new Date(block.start).toDateString();
    if (!blocksByDate[dateKey]) {
      blocksByDate[dateKey] = [];
    }
    blocksByDate[dateKey].push(block);
  });
  
  // Create time slots (15-minute intervals from 6 AM to 11 PM)
  const timeSlots = [];
  for (let hour = 6; hour <= 23; hour++) {
    for (let minute = 0; minute < 60; minute += 15) {
      timeSlots.push({ hour, minute });
    }
  }
  
  // Limit to last 7 days for better display
  const displayDates = allDates.slice(-7);
  
  let html = '<div class="calendar-table-wrapper">';
  html += '<table class="calendar-table">';
  
  // Header row with dates
  html += '<thead><tr><th class="time-column">Time</th>';
  displayDates.forEach(date => {
    const dayName = date.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = date.getDate();
    const month = date.toLocaleDateString('en-US', { month: 'short' });
    html += `<th class="date-column">
      <div class="date-header-cell">
        <div class="day-name">${dayName}</div>
        <div class="day-number">${dayNum}</div>
        <div class="month-name">${month}</div>
      </div>
    </th>`;
  });
  html += '</tr></thead>';
  
  // Track which cells are occupied by rowspan
  const occupiedCells = new Map(); // Map of "dateIndex-slotIndex" -> remainingRows
  
  // Body with time slots
  html += '<tbody>';
  timeSlots.forEach((slot, slotIndex) => {
    html += '<tr>';
    
    // Time column
    if (slot.minute === 0) {
      const timeStr = slot.hour === 0 ? '12 AM' : 
                     slot.hour < 12 ? `${slot.hour} AM` : 
                     slot.hour === 12 ? '12 PM' : 
                     `${slot.hour - 12} PM`;
      html += `<td class="time-column time-label">${timeStr}</td>`;
    } else {
      html += '<td class="time-column"></td>';
    }
    
    // Date columns
    displayDates.forEach((date, dateIndex) => {
      const cellKey = `${dateIndex}-${slotIndex}`;
      
      // Check if this cell is occupied by a previous rowspan
      if (occupiedCells.has(cellKey)) {
        const remaining = occupiedCells.get(cellKey) - 1;
        if (remaining > 0) {
          occupiedCells.set(cellKey, remaining);
        } else {
          occupiedCells.delete(cellKey);
        }
        // Skip rendering this cell (already part of rowspan)
        return;
      }
      
      const dateKey = date.toDateString();
      const dateBlocks = blocksByDate[dateKey] || [];
      
      // Check if any block overlaps with this time slot
      const slotStart = new Date(date);
      slotStart.setHours(slot.hour, slot.minute, 0, 0);
      const slotEnd = new Date(slotStart);
      slotEnd.setMinutes(slotEnd.getMinutes() + 15);
      
      const overlappingBlocks = dateBlocks.filter(block => {
        const blockStart = new Date(block.start);
        const blockEnd = new Date(block.end);
        return blockStart < slotEnd && blockEnd > slotStart;
      });
      
      if (overlappingBlocks.length > 0) {
        const block = overlappingBlocks[0]; // Show first overlapping block
        const labelClass = block.label.toLowerCase().replace(/\s+/g, '-');
        const startTime = new Date(block.start).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        const endTime = new Date(block.end).toLocaleTimeString('en-US', { 
          hour: 'numeric', 
          minute: '2-digit',
          hour12: true 
        });
        
        // Calculate rowspan (how many 15-min slots this block spans)
        const blockStart = new Date(block.start);
        const blockEnd = new Date(block.end);
        const durationMinutes = (blockEnd - blockStart) / (1000 * 60);
        const rowspan = Math.max(1, Math.round(durationMinutes / 15));
        
        // Only render if this is the first slot of the block
        const blockSlotStart = new Date(blockStart);
        blockSlotStart.setMinutes(Math.floor(blockStart.getMinutes() / 15) * 15, 0, 0);
        blockSlotStart.setHours(blockSlotStart.getHours(), blockSlotStart.getMinutes(), 0, 0);
        
        if (Math.abs(slotStart.getTime() - blockSlotStart.getTime()) < 1000) {
          // Mark subsequent cells as occupied
          for (let i = 1; i < rowspan; i++) {
            const nextSlotIndex = slotIndex + i;
            if (nextSlotIndex < timeSlots.length) {
              occupiedCells.set(`${dateIndex}-${nextSlotIndex}`, rowspan - i);
            }
          }
          
          html += `<td class="calendar-cell has-block" rowspan="${rowspan}">
            <div class="calendar-block label-${labelClass}">
              <div class="block-time-small">${startTime} - ${endTime}</div>
              <div class="block-label-small">${escapeHtml(block.label)}</div>
              ${block.note ? `<div class="block-note-small" title="${escapeHtml(block.note)}">${escapeHtml(block.note.substring(0, 20))}${block.note.length > 20 ? '...' : ''}</div>` : ''}
            </div>
          </td>`;
        } else {
          html += '<td class="calendar-cell"></td>';
        }
      } else {
        html += '<td class="calendar-cell"></td>';
      }
    });
    
    html += '</tr>';
  });
  
  html += '</tbody></table></div>';
  
  return html;
}

/**
 * Escape HTML to prevent XSS
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

/**
 * Show daily review screen
 */
async function showDailyReview() {
  hideAllScreens();
  const screen = document.getElementById('dailyReview');
  screen.style.display = 'block';
  
  const priorityDisplay = document.getElementById('dailyPriorityDisplay');
  const insightBox = document.getElementById('dailyInsight');
  
  const priority = await getTodayPriority();
  const insight = await generateDailyInsight();
  
  if (priority) {
    priorityDisplay.innerHTML = `<strong>Today's Priority:</strong> ${priority}`;
  } else {
    priorityDisplay.innerHTML = `<strong>Today's Priority:</strong> Not set yet.`;
  }
  
  if (insight) {
    insightBox.textContent = insight;
  } else {
    insightBox.textContent = 'Not enough data yet. Complete a few time blocks to see insights.';
  }
  
  document.getElementById('closeDailyReview').onclick = showMainMenu;
}

/**
 * Show weekly review screen
 */
async function showWeeklyReview() {
  hideAllScreens();
  const screen = document.getElementById('weeklyReview');
  screen.style.display = 'block';
  
  const content = document.getElementById('weeklyContent');
  const insights = await generateWeeklyInsights();
  
  let html = '';
  
  // Biggest mismatch
  if (insights.biggestMismatch) {
    const { day, priority, actual, hours } = insights.biggestMismatch;
    html += `
      <div class="weekly-item">
        <h3>Biggest Mismatch</h3>
        <p>On ${formatDate(day)}, you said "${priority}" mattered most, but spent ${hours.toFixed(1)} hours in ${actual.toLowerCase()}.</p>
      </div>
    `;
  } else {
    html += `
      <div class="weekly-item">
        <h3>Biggest Mismatch</h3>
        <p>Not enough data to identify mismatches this week.</p>
      </div>
    `;
  }
  
  // Longest avoidance streak
  html += `
    <div class="weekly-item">
      <h3>Longest Continuous Avoidance Streak</h3>
      <p>${insights.longestAvoidanceStreak.toFixed(1)} hours of consecutive avoidance.</p>
    </div>
  `;
  
  // Suggestion
  html += `
    <div class="weekly-item">
      <h3>Suggested Behavior Change</h3>
      <p>${insights.suggestion}</p>
    </div>
  `;
  
  content.innerHTML = html;
  
  document.getElementById('closeWeeklyReview').onclick = showMainMenu;
}

/**
 * Show settings screen
 */
async function showSettingsScreen() {
  hideAllScreens();
  const screen = document.getElementById('settingsScreen');
  screen.style.display = 'block';
  
  await renderLabelsList();
  
  // Set up add label handler
  const addLabelBtn = document.getElementById('addLabelButton');
  const newLabelInput = document.getElementById('newLabelInput');
  
  addLabelBtn.onclick = async () => {
    const labelName = newLabelInput.value.trim();
    if (labelName.length === 0) {
      alert('Please enter a label name.');
      return;
    }
    if (labelName.length > 50) {
      alert('Label name must be 50 characters or less.');
      return;
    }
    
    const labels = await getLabels();
    if (labels.includes(labelName)) {
      alert('This label already exists.');
      return;
    }
    
    labels.push(labelName);
    await saveLabels(labels);
    newLabelInput.value = '';
    await renderLabelsList();
  };
  
  // Allow Enter key to add label
  newLabelInput.onkeypress = async (e) => {
    if (e.key === 'Enter') {
      addLabelBtn.click();
    }
  };
  
  document.getElementById('closeSettings').onclick = showMainMenu;
}

/**
 * Render the labels list in settings
 */
async function renderLabelsList() {
  const labelsList = document.getElementById('labelsList');
  const labels = await getLabels();
  
  if (labels.length === 0) {
    labelsList.innerHTML = '<p class="empty-state">No labels yet. Add your first label below.</p>';
    return;
  }
  
  labelsList.innerHTML = '';
  
  labels.forEach((label, index) => {
    const labelItem = document.createElement('div');
    labelItem.className = 'label-item';
    labelItem.dataset.index = index;
    
    const nameSpan = document.createElement('span');
    nameSpan.className = 'label-item-name';
    nameSpan.textContent = label;
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'label-item-actions';
    
    const editBtn = document.createElement('button');
    editBtn.className = 'label-edit-button';
    editBtn.textContent = 'Edit';
    editBtn.onclick = () => editLabel(index, labelItem, nameSpan, actionsDiv, label);
    
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'label-delete-button';
    deleteBtn.textContent = 'Delete';
    deleteBtn.onclick = () => deleteLabel(index, label);
    
    actionsDiv.appendChild(editBtn);
    actionsDiv.appendChild(deleteBtn);
    
    labelItem.appendChild(nameSpan);
    labelItem.appendChild(actionsDiv);
    labelsList.appendChild(labelItem);
  });
}

/**
 * Edit a label
 */
async function editLabel(index, labelItem, nameSpan, actionsDiv, currentName) {
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'label-edit-input';
  input.value = currentName;
  input.maxLength = 50;
  
  const saveBtn = document.createElement('button');
  saveBtn.className = 'label-save-button';
  saveBtn.textContent = 'Save';
  
  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'label-cancel-button';
  cancelBtn.textContent = 'Cancel';
  
  // Replace name span with input
  nameSpan.replaceWith(input);
  input.focus();
  input.select();
  
  // Replace actions with save/cancel
  actionsDiv.innerHTML = '';
  actionsDiv.appendChild(saveBtn);
  actionsDiv.appendChild(cancelBtn);
  
  const saveHandler = async () => {
    const newName = input.value.trim();
    if (newName.length === 0) {
      alert('Label name cannot be empty.');
      return;
    }
    if (newName.length > 50) {
      alert('Label name must be 50 characters or less.');
      return;
    }
    
    const labels = await getLabels();
    if (labels.includes(newName) && newName !== currentName) {
      alert('This label already exists.');
      return;
    }
    
    labels[index] = newName;
    await saveLabels(labels);
    await renderLabelsList();
  };
  
  const cancelHandler = async () => {
    await renderLabelsList();
  };
  
  saveBtn.onclick = saveHandler;
  cancelBtn.onclick = cancelHandler;
  
  input.onkeypress = async (e) => {
    if (e.key === 'Enter') {
      await saveHandler();
    } else if (e.key === 'Escape') {
      await cancelHandler();
    }
  };
}

/**
 * Delete a label
 */
async function deleteLabel(index, labelName) {
  if (!confirm(`Are you sure you want to delete "${labelName}"? This will not affect existing time blocks, but you won't be able to use this label for new blocks.`)) {
    return;
  }
  
  const labels = await getLabels();
  labels.splice(index, 1);
  
  // Ensure at least one label exists
  if (labels.length === 0) {
    alert('You must have at least one label. Resetting to default labels.');
    await saveLabels([...DEFAULT_LABELS]);
  } else {
    await saveLabels(labels);
  }
  
  await renderLabelsList();
}

/**
 * Toggle date group expand/collapse
 */
function toggleDateGroup(dateId) {
  const content = document.getElementById(dateId);
  const icon = document.getElementById(`icon-${dateId}`);
  
  if (!content || !icon) return;
  
  // Toggle classes for smooth animation
  if (content.classList.contains('collapsed')) {
    content.classList.remove('collapsed');
    content.classList.add('expanded');
    icon.textContent = '▼';
    icon.style.transform = 'rotate(0deg)';
  } else {
    content.classList.remove('expanded');
    content.classList.add('collapsed');
    icon.textContent = '▶';
    icon.style.transform = 'rotate(0deg)';
  }
}

// Make toggleDateGroup available globally for onclick handlers
window.toggleDateGroup = toggleDateGroup;

// Test service worker connection on load
async function testServiceWorker() {
  console.log('=== TESTING SERVICE WORKER CONNECTION ===');
  try {
    console.log('Sending test message...');
    const testResponse = await chrome.runtime.sendMessage({ action: 'test' });
    console.log('Test response received:', testResponse);
    if (testResponse && testResponse.success) {
      console.log('✅ Service worker is active and responding!');
    } else {
      console.error('❌ Service worker test failed - no success response');
    }
  } catch (error) {
    console.error('❌ Service worker test failed:', error);
    console.error('Error details:', error.message, error.stack);
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    console.log('=== DOM LOADED, INITIALIZING POPUP ===');
    testServiceWorker();
    initializePopup();
  });
} else {
  console.log('=== DOM ALREADY READY, INITIALIZING POPUP ===');
  testServiceWorker();
  initializePopup();
}

// This duplicate DOMContentLoaded listener is not needed - already handled above
// Removing to avoid conflicts
