# My Scheduler

A lightweight installable Progressive Web App (PWA) for personal schedules and to-do items.

## Features

- Day, week, month, and to-do views
- Create, edit, and delete events and tasks
- Daily, weekly, and monthly repeating events
- Local persistence with IndexedDB
- JSON backup and restore
- Export timed events to an iCalendar (.ics) file
- iPhone Calendar import with three display alarms: at event time, 10 minutes before, and 30 minutes before
- Basic offline asset caching with a service worker

## iPhone alarm workflow

1. Open the app in Safari on iPhone and choose **Share → Add to Home Screen**.
2. Open My Scheduler and go to **Settings**.
3. Tap **캘린더 일정 내보내기 (.ics)**.
4. Open the downloaded `my-scheduler-calendar.ics` file and add its events to the iPhone Calendar.
5. Check that Calendar notifications are allowed in iOS Settings → Notifications → Calendar.

The iPhone Calendar app, not the PWA, owns and delivers the alarms. Once imported, alarms can fire while My Scheduler is closed and without an internet connection.

**Important:** This is a one-way export, not live synchronization. If you add, edit, or delete events in My Scheduler, export and import the calendar again. Importing the same file repeatedly may create duplicate events; remove the previous imported events/calendar before re-importing. All-day events are exported without the three timed alarms.

## Data and device limitations

- Schedule data is stored locally in each browser using IndexedDB.
- There is no Supabase account, cloud backend, or automatic PC/iPhone synchronization in this version.
- To move data between devices, use the JSON backup/restore feature. Calendar export is for iPhone-native alarms.
- This version has not yet been verified on a physical iPhone. Confirm the imported event alarms in Calendar before relying on them.

## Run locally

Serve this directory over HTTP (a secure context such as HTTPS is required for full PWA functionality):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Deploy

Publish the contents of this directory to a static HTTPS host. On iPhone, open the deployed URL in Safari, choose **Share → Add to Home Screen**.

## Files

- `index.html` — application UI
- `app.js` — application logic, IndexedDB storage, and calendar export
- `manifest.webmanifest` — PWA metadata
- `sw.js` — service worker and offline asset cache
- `icon.svg` — app icon
