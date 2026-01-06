# 15 Minute Time Tracker

<img width="2752" height="1537" alt="screenshot_1_timer" src="https://github.com/user-attachments/assets/6e6b7b26-5173-4117-8d3a-8f81a362d6e4" />
<img width="2761" height="1545" alt="screenshot_2_timeblocks" src="https://github.com/user-attachments/assets/0138720d-ff17-46e0-84a7-069e4d8cd82b" />
<img width="2761" height="1545" alt="screenshot_3_labels" src="https://github.com/user-attachments/assets/b0b2ae41-19f5-43c8-98c0-be962ed25e7a" />
<img width="1280" height="716" alt="screenshot_4_review" src="https://github.com/user-attachments/assets/10429c06-4f3e-4213-8556-b015d2cffa76" />


A Chrome extension that forces honest time tracking through intentional friction. Every 15 minutes, you must label your time block - no skipping, no excuses.

## Philosophy

This tool is not about productivity metrics. It is about behavior change through friction. If a user feels uncomfortable using it and uninstalls it within a week, that is considered success.

## Features

- **Hard Interrupts**: Every 15 minutes, you must label your time block. Cannot be dismissed without action.
- **Fixed Labels**: Five labels only - Revenue, Leverage, Maintenance, Recovery, Avoidance. No customization.
- **Daily Priority**: Declare your top priority once per day.
- **Uncomfortable Insights**: Daily and weekly reviews that show the gap between intentions and reality.
- **Fully Offline**: All data stored locally using Chrome storage APIs.

## Installation

1. Clone or download this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" (toggle in top right)
4. Click "Load unpacked" and select this directory
5. The extension will start tracking immediately

## Usage

1. **First Use**: Set your daily priority when prompted
2. **Every 15 Minutes**: A notification will appear. Click it or the extension icon to label your time block
3. **Daily Review**: View today's priority and one uncomfortable insight
4. **Weekly Review**: See your biggest mismatch, longest avoidance streak, and a suggested behavior change

## Technical Details

- **Manifest V3**: Uses the latest Chrome extension API
- **Vanilla JavaScript**: No frameworks, pure JS
- **Chrome Storage**: All data persisted locally
- **Service Worker**: Background timer using Chrome alarms API

## Files

- `manifest.json` - Extension configuration
- `background.js` - Service worker handling timer and interrupts
- `popup.html` - Main UI for all screens
- `popup.js` - UI logic and interactions
- `popup.css` - Popup-specific styles
- `styles.css` - Shared styles (green/white/black only)
- `utils.js` - Storage and data management utilities

## Icons

The extension requires three icon files:
- `icon16.png` (16x16 pixels)
- `icon48.png` (48x48 pixels)
- `icon128.png` (128x128 pixels)

Create simple icons using only green, white, and black colors to match the design system.

## Design Principles

- **Minimal**: No clutter, no charts, no unnecessary controls
- **Calm**: Plenty of white space, deliberate spacing
- **Uncomfortable**: Friction is intentional, not a bug
- **Honest**: No gamification, no rewards, no streaks

## License

This is a production-ready extension built for behavior change, not retention.

