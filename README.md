# Salad Tower

A personal web app for running a 50-pod hydroponic tower by succession planting. It plans what to sow and when, follows each batch from rockwool to harvest, and keeps the shared reservoir on target. A batch only moves when you say it's ready.

## Run it

```bash
python3 -m http.server 4174 --bind 127.0.0.1
```

Run this from the project folder, then open http://localhost:4174.

## Your data

Everything saves on the device straight away. Once Firebase is set up (see [SYNC-SETUP.md](SYNC-SETUP.md)), it also syncs between phones, including after time offline. Without Firebase, a different browser, device or web address starts empty. Backup and Restore are in Settings.

To try syncing without Firebase, serve the folder locally and open `?fake&phone=a` and `?fake&phone=b` in two tabs. The test password is `correct-test-password`.

## Tests

```bash
node --test
```

## Files

- `crops.js`: the crop library
- `seeds.js`: the tower-compatible packets from Pips_Seed_Box.xlsx
- `logic.js`: the grow, reservoir and planning rules, with no browser code
- `guide.js`: the how-to guide, with each point tagged by source
- `app.js`: screens and buttons
- `sync-core.js`: what to send between phones, with no browser code
- `sync.js`: the connection to Firebase
- `sync-config.js`: your Firebase web app settings
- `sw.js`: lets the app open offline
- `test/logic.test.js`: tests for the rules

Crop ranges come from Nutraponics. Other guidance comes from Living Towers, Spacetree and the VEVOR listing, as tagged in the Guide. Time-in-tower, regrowth and days-to-transplant figures are estimates to adjust from experience.
