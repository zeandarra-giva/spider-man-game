# Spidey Sense

A Spider-Man themed memory + reflex party game in plain HTML, CSS and JavaScript.

Each player is secretly given a **color**, and each color is a **pose**. Memorize yours, wait for the
Spidey Sense to tingle, and when your color flashes, strike the pose before the timer runs out.
A host judges every pose on screen.

## Flow

1. **Pick a mode**
   - **One team**: 2–6 spiders on the same team. Save New York together and fight for the top score.
   - **Head to head**: two teams of 2–4 on a split screen, facing the same round types at the same time.
2. **How to play**: a short slideshow for the chosen mode (skippable).
3. **Setup**: player names, rounds, difficulty, villain twists.

## Round types

| Round | What happens |
|---|---|
| Color flash | Your color flashes: strike your pose. |
| Mysterio | The word lies. Follow the color of the letters. |
| Doc Ock | Two or three colors at once. |
| Spider-Chain | Colors flash one by one, then pose in that order. |
| Kraven | 🔴 ➜ 🟢: RED strikes GREEN's pose. |
| Who's Who | The meme flashes, then a pose. Its owner strikes it, everyone else does the meme pointing pose at them (within their own team in head to head). |
| Venom | Nobody moves. |
| Hold still | Head to head only: one team is called, the other must not move. |

The timer shrinks every round, the tingle length is unpredictable, and fake flashes start at level 2.
Misses raise the **NYC danger** meter; at 100% the team loses. In one-team mode the last two spiders
go into **sudden death**.

## Poses

`poses/` holds 10 transparent PNG poses cut from `poses/spiderman poses 1.svg`, listed in `poses/poses.js`.
Edit `poses/poses.js` to rename, add or remove poses. You need at least one pose per player.
`assets/whos-who.jpg` is the meme used by the Who's Who round.

## Run it (Windows PowerShell)

```powershell
cd path\to\spider-man-game
Start-Process .\index.html
```

No server or install needed. Best on a big screen or projector.

## Host controls

| Key | Action |
|---|---|
| `Space` / `Enter` | Continue / score the round |
| `1`–`6` | Flip a player's verdict (first team) |
| `Q` `W` `E` `R` | Flip a player's verdict (second team, head to head) |
| `0` / `P` | Flip the pointing crowd's verdict in Who's Who (first / second team) |
| `M` | Mute |
| `Esc` | Quit to title |
