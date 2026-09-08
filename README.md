# Egg

A tiny, self-contained, mobile-first web recreation of the Egg Game, built as a
birthday gift. No backend, no dependencies, no build step — just static files.

## Run it locally

Open `index.html` in any browser, or serve the folder:

```bash
python3 -m http.server 8123
```

Then visit http://localhost:8123 .

## Where to change the birthday message

Open **`game.js`** and edit the very first block at the top:

```js
const birthdayConfig = {
  sisterName: "KORRI",          // shown in the big birthday reveal
  fromName:   "CAMERON",        // signed at the bottom
  birthdayMessage: "Happy Birthday!"
};
```

That's the only thing you need to touch.

## Reset the first-playthrough (birthday) experience

The game remembers whether the birthday playthrough has been completed, in
`localStorage` under the key **`eggGameBirthdayProgress`**.

To see the birthday playthrough again, open the browser console and run:

```js
localStorage.removeItem('eggGameBirthdayProgress')
```

...then refresh. (Shortcut: `EGG.reset()` does the same thing and reloads.)

## How Play Again / Chaos mode works

- The **first** ever run is always the **canonical** scripted playthrough
  (6 eggs → out of eggs → 80 pack → 40 → 41 → win → nude egg → birthday reveal).
- Finishing it sets `canonicalCompleted = true` and `playCount = 1`.
- Every run after that is **Chaos mode**: same game, same Eggman, same feed
  interaction — but the numbers, messages, egg packs, glitches, win conditions
  and endings are randomized (curated, always completable in ~30–120s). It still
  always ends in a nude egg, with smaller birthday references instead of the full
  reveal.

## Deploy to GitHub Pages

This repo is ready to host as static files. From this folder:

```bash
git remote add origin https://github.com/USERNAME/egg-game.git
git branch -M main
git push -u origin main
```

Then on GitHub: **Settings → Pages → Build and deployment → Source: Deploy from a
branch → Branch: `main` / `root` → Save.** After a minute your URL is:

```
https://USERNAME.github.io/egg-game/
```

Text that link to your sister. She taps it — no login, no install — and plays.

### Redeploy after edits

```bash
git add -A
git commit -m "Update egg"
git push
```

Pages redeploys automatically. If you changed files and want returning visitors
to get them immediately, bump `CACHE = 'egg-v1'` in `service-worker.js` to
`'egg-v2'` (this busts the offline cache).

## Notes

- Works with touch, mouse, and stylus (Pointer Events). Drag an egg to the mouth,
  or just tap an egg to feed it.
- Sound is off until the first tap (mobile autoplay rules) and there's a mute
  button; the game works perfectly muted.
- PWA/offline is optional — it "just works" as a normal web page.
