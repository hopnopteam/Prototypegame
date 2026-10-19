# START HERE: building this game with Claude Code

## What's in this folder

```
SPEC.md              ← the full prompt. Don't paste it into the chat; Claude reads it from this file.
art/
  references/        ← your style images (ref-01.jpg … ref-05.jpg). Claude looks at these.
  incoming/          ← empty for now. You'll drop the game art you generate here (step 15).
START-HERE.md        ← this guide
```

Keep this structure exactly as it is. The prompt refers to these folder names.

---

## One-time setup

**1. Install Node.js and Git**
- Node.js: download the LTS version (22 or newer) from nodejs.org and install it.
- Git: download from git-scm.com and install it (on Windows it's called "Git for Windows").

**2. Install Claude Code**
- Mac or Linux: open Terminal and run
  `curl -fsSL https://claude.ai/install.sh | bash`
- Windows: open PowerShell and run
  `irm https://claude.ai/install.ps1 | iex`

Then close the terminal, open a new one, and run `claude --version`. If it prints a version number, it worked. Claude Code needs a paid Claude plan (Pro, Max, Team or Enterprise) or a Console account.

---

## Start the project

**3. Put the folder somewhere simple.** Unzip it to something like `Documents/games/` and don't rename the folders inside.

**4. (Optional) Add more references.** Drop any extra style images into `art/references/` named `ref-06.jpg`, `ref-07.jpg` and so on. Good ones to add: in-game screenshots of flight, flames and explosions you love. Claude looks at every image in that folder.

**5. Open a terminal inside the folder.**
- **Mac:** open Terminal, type `cd ` (with a space after it), drag the folder from Finder into the Terminal window, press Enter.
- **Windows:** open the folder in File Explorer, click the address bar, type `powershell`, press Enter.

**6. Start Claude Code.** Type `claude` and press Enter. The first time, it opens your browser to log in.

**7. Choose the model.** Type `/model opus` and press Enter. Then type `/effort high` and press Enter.

**8. Turn on plan mode.** Press **Shift+Tab** until the bottom of the screen says **plan mode on**. In plan mode Claude only reads and plans; it doesn't change anything yet.

**9. Paste this first message:**

```
Read @SPEC.md completely, then open and look at every image in art/references/. Plan Milestone 1 only: project setup, architecture and the physics feel in greybox. Show me the plan.
```

**10. Approve the plan.** Read it. If something looks wrong, say so in plain words. When it looks good, approve it. Claude then builds Milestone 1, tests it and stops. If it asks permission to run commands, say yes.

**11. Play it on your phone.** Type:

```
Start the dev server so I can open it on my phone.
```

Claude shows a "Network" address like `http://192.168.1.23:5173`. Open that on your phone (same Wi-Fi as the computer). Play it and give feedback in plain words, for example "the bottle feels too floaty" or "steering is too sensitive". Repeat until it feels good. **Feel matters more than anything else at this stage.**

**12. Save and reset.** Type `Commit Milestone 1.` When it's done, type `/clear`. This wipes the chat but not the files; starting each milestone fresh keeps Claude sharp.

---

## Every milestone after that

**13. Paste this message (the same one every time):**

```
Read @SPEC.md and @PROGRESS.md. Continue with the next unfinished milestone. Follow its verification steps and the Visual QA, then stop and show me the results.
```

**14.** Test on your phone, give feedback, then `Commit this milestone.`, then `/clear`, then paste the same message again.

---

## The art step (happens in Milestone 2)

This is where the visuals come from. Claude Code can't paint, so you make the images and Claude does everything else.

**15.** Claude writes `art/PROMPTS.md`: a list of images to make, each with an **exact file name** and a ready-to-use **image prompt**. It then stops and waits for you.

**16.** Open `art/PROMPTS.md`. For each item, paste its prompt into your image tool, generate it, pick the best result, and save it **into `art/incoming/` with the exact file name** from the list. Don't worry about backgrounds; Claude removes them.

**17.** When all style-frame images are in, tell Claude:

```
The style-frame art is in art/incoming. Process it and continue Milestone 2.
```

**18.** Claude processes the images, puts them in the game, scores the screens against your references and shows you screenshots. Look at them on your phone. Say what's off ("the bottle should be glossier", "the panel gold is too yellow"). Only approve when it truly looks right. **Everything after this copies this look, so don't rush it.**

Later milestones ask for more art the same way: Claude adds the new images to `art/PROMPTS.md`, you generate them into `art/incoming/`, and you tell Claude they're there.

---

## Handy keys and tips

- **Esc** stops Claude mid-action. **Esc twice** (or `/rewind`) goes back to an earlier point.
- If Claude gets the same thing wrong twice, type `/clear` and ask again with a clearer instruction.
- To continue another day: open a terminal in the folder, type `claude`, then paste the step 13 message.
- One game per folder. Never build both games in the same folder.
- Opus for everything. For the last milestone (more worlds), you can save usage with `/model sonnet`.
- Prefer no terminal? The Claude desktop app can also run Claude Code. If you use it, open this folder as the project and paste the same messages.
