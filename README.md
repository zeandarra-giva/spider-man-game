# Spidey Sense

A Spider-Man themed memory + reflex party game in plain HTML, CSS and JavaScript.

Each player is secretly given a **color**, and each color is a **pose**. Memorize yours, wait for the
Spidey Sense to tingle, and when your color flashes, strike the pose before time runs out. The host
judges each pose. Villain twists: **Mysterio** (word lies, trust the color), **Doc Ock** (several
colors at once), **Venom** (nobody moves).

## Add your pose images

`poses/` holds 10 transparent PNG poses cut from `poses/spiderman poses 1.svg`, listed in `poses/poses.js`
(`wall-crawl`, `hero-stance`, `web-reach`, `perch`, `lookout`, `pounce`, `wall-climb`, `web-swing`, `spider-crouch`, `thwip`).
Edit `poses/poses.js` to rename, add or remove poses. You need at least one pose per player (2–6 players).
Missing images show a placeholder naming the expected file.

## Run it (Windows PowerShell)

```powershell
cd path\to\spider-man-game
Start-Process .\index.html
```

No server or install needed. Best on a big screen or projector.

## Controls

| Key | Action |
|---|---|
| `Space` / `Enter` | Continue / score the round |
| `1`–`6` | Flip a player's verdict while judging |
| `M` | Mute |
| `Esc` | Quit to title |
