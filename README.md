# My Scheduler

A lightweight installable Progressive Web App (PWA) for personal schedules and to-do items.

## Current features

- Day, week, month, and to-do views
- Create, edit, and delete events and tasks
- Daily, weekly, and monthly repeat options
- Mark tasks as complete
- Export and import data as JSON
- Local persistence with IndexedDB
- Basic offline asset caching with a service worker

## Important limitations

- Data is stored locally in the browser on each device.
- **PC/iPhone cloud synchronization is not implemented in this version.**
- Scheduled push notifications are not implemented; the notification permission UI alone does not schedule reminders.
- This version has not yet been verified on a physical iPhone.

## Run locally

Serve this directory over HTTP (a secure context such as HTTPS is required for full PWA functionality):

```bash
python3 -m http.server 8000
```

Then open `http://localhost:8000` in a browser.

## Deploy

Publish the contents of this directory to a static HTTPS host. On iPhone, open the deployed URL in Safari, choose **Share**, then **Add to Home Screen**.

## Files

- `index.html` — application UI
- `app.js` — application logic and IndexedDB storage
- `manifest.webmanifest` — PWA metadata
- `sw.js` — service worker and offline asset cache
- `icon-192.png`, `icon-512.png` — app icons
