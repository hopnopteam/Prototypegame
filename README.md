# Night Express

Hybrid-casual arcade idle game: run a luxury sleeper train that grows carriage by carriage as it crosses the world.
Unity 6 LTS · URP · C# · Android first · portrait. Design and working rules live in [`CLAUDE.md`](CLAUDE.md).

## First-time setup (M0)

The repo holds our code and tools; Unity's own project files come from the official URP template so the
render pipeline and package versions always match your Unity version exactly.

1. **Install** Unity Hub and the latest **Unity 6 LTS**, with the **Android Build Support** module
   (tick **OpenJDK** and **Android SDK & NDK Tools**).
2. **Clone** the repo and switch to the working branch:
   ```bash
   git clone https://github.com/hopnopteam/Prototypegame.git NightExpress
   cd NightExpress
   git checkout claude/new-session-zlmzpt
   ```
3. **Make a template project.** Unity Hub → **New project** → Unity 6 LTS → **Universal 3D** template →
   save it somewhere temporary (e.g. `Desktop/NightExpressTemplate`) → **Create**. When the Editor has finished
   opening, **close it**.
4. **Copy** the template's `Assets`, `Packages` and `ProjectSettings` folders into the cloned `NightExpress`
   folder, merging `Assets` (nothing in `Assets/_Project` gets replaced). Then, inside `NightExpress/Assets`,
   delete `TutorialInfo/`, `Readme.asset` and `Scenes/` (with their `.meta` files) if present.
   **Keep `Assets/Settings/`**: it holds the URP pipeline assets. Delete the temporary template project.
5. **Open** it: Unity Hub → **Add** → **Add project from disk** → select the `NightExpress` folder → open.
   The Console must show no red errors after the first import.
6. **Run setup:** menu **Night Express → Setup → Run All Setup Steps**. The validation dialog should list
   every check as `OK` (the "Active platform is not Android" warning is fine until step 9).
7. **Run the tests:** **Window → General → Test Runner → EditMode → Run All**. All tests should be green.
8. **Play in the Editor:** open `Assets/_Project/Scenes/Game.unity` and press **Play**. Switch the Game view
   to **Simulator** and pick a phone to see portrait framing and the safe area.
9. **Build to your phone:** **Night Express → Setup → Switch Platform to Android**. Then
   **File → Build Profiles → Android**, tick **Development Build**, connect the phone (USB debugging on) and
   **Build And Run**.
10. **Commit** everything Unity generated (`Assets` including every `.meta` file, `Packages`, `ProjectSettings`):
    ```bash
    git add -A
    git commit -m "M0: Unity project files from the Universal 3D template"
    git push
    ```

## Developer panel

In the Editor and Development Builds, a **fps** button sits top-left. Tap it for session and save state,
**Save now / Reset progress**, mock **Rewarded / Interstitial** ads (with *No fill* and *Skip* switches), a mock
**First Class Ticket** purchase, and the latest analytics events. It never appears in release builds.

## Where to tune things

| What | Asset |
|---|---|
| Frame rate, screen-on, session timeout, save timing, dev panel | `Assets/_Project/Resources/GameConfig.asset` |
| Mock ad/IAP timings and failure switches, analytics logging, remote-config overrides | `Assets/_Project/Data/Config/MockServicesConfig.asset` |
| In-app products | `Assets/_Project/Data/Config/IAPCatalog.asset` |

## Layout

```
Assets/_Project/
  Scripts/        NightExpress.Runtime: Core (bootstrap, events, save, session), Services (ads, IAP,
                  analytics, remote config), UI, and Gameplay/AI/Economy from M1 onwards
  Editor/         NightExpress.EditorTools: the "Night Express" menu (setup, validation, save tools)
  Tests/EditMode/ NightExpress.Tests.EditMode
  Data/ Resources/ Prefabs/ Art/ Audio/ Scenes/
```
