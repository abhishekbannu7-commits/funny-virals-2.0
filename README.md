# Funny Virals 2.0

Orin is the on-device aide for Funny Virals 2.0. Open it on a phone or tablet, or link two screens with a code. Core work stays in the browser. A hosted model is never called unless you turn optional cloud on and tap again.

What it does without a paid call:

- Tasks, notes, remembered facts, and search across them
- Timers and reminders while the page is open
- A morning briefing, math, percentages, dates, unit conversions, word counts, and case changes
- Saved places and map handoff
- Calls, texts, WhatsApp, ChatGPT, Claude, YouTube, Instagram, and mail. Nothing sends until you tap
- A list of where each job runs: offline, on device, local link, or optional cloud

Optional cloud uses xAI and may spend quota. It is off by default. Turning the switch on does not send anything. Ask xAI is a second tap, and it names the provider first. Pictures are not made until you tap Make picture.

The reel desk is separate from Orin. Sample playback, locks, and download stay on the device. Plan, stills, 10-second clips, voices, and plan edits are labeled as cloud and stay idle until you tap them. Those calls use `XAI_API_KEY` in the server environment. Do not commit that key.

This page cannot change Wi-Fi, Bluetooth, system alarms, or read other apps' notifications, and it cannot control a phone that does not have Orin open.

`templates/` is the original 1080×1350 slide pack.

## Run

```bash
npm install
npm run dev
```

The dev server listens on port 8080.
