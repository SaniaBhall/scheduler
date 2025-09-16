# Daily Scheduler

A lightweight, client-side daily scheduler. Add tasks with start/end times, get reminders, mark complete, and review history — all stored locally in your browser.

Live site (after deploy): https://SaniaBhall.github.io/scheduler/

## Features
- Task add/edit/reschedule/delete with filters
- Pre-start reminders and end-time prompts
- Progress ring + day completion celebration
- Overdue pending tasks surface automatically
- LocalStorage persistence (no server)

## Run locally
Just open `index.html` in a browser. Some features (system notifications) require https and will work on the hosted site.

## Deploy
Pushing to `main` triggers GitHub Pages via Actions using `.github/workflows/pages.yml`.