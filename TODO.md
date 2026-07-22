# TODO List for JomOrder Project

## Phase 71: Refactoring & Maintenance

- [x] Correct Telegram links (Attempted, incorrect link not found in checked files)
- [x] Enhance AI Helper round-robin and cooldown logic (Steps 1-5 completed)
- [x] AI Helper configuration validated with updated `redis.ts`
- [x] Initiated Sub-Agent 4 (Loop 4) for GUI Enhancements.
- [x] Processed changes for `src/handlers/start.ts`
- [x] Received refactored description for `src/handlers/help.ts` but code is pending.
- [x] Committed and pushed Phase 71 changes.
- [x] Performed security check and Git operations. (Reviewed .gitignore, confirmed no secrets included. Staged modified/untracked files. Committed changes, including TODO.md. Pushed to remote.)
- [ ] **Implement GUI enhancements and eliminate commands (awaiting `help.ts` code).**
- [x] Refactor large files into modular components:
    - Analyzed `src/handlers/merchant.ts`.
    - Created `src/handlers/merchant_onboarding.ts`.
    - Updated `src/handlers/merchant.ts` imports and delegation.
    - Created `src/handlers/merchant_menu.ts`.
    - Removed old menu functions from `src/handlers/merchant.ts`.
- [x] Execute tasks using Sub-Agents with context window management. (Sub-Agent 4 completed initial files; awaiting `help.ts` code).
- [x] Ping AI Helpers – attempted direct curl to `openrouter/free`.
- [x] Cleanup background processes (killed wrangler processes).
- [x] Verified `src/handlers/merchant.ts` after removing old menu handlers.
- [x] Declared new handler files (`merchant_onboarding.ts`, `merchant_menu.ts`) in `tsconfig.json`.
- [x] Updated TODO.md with current progress and next steps.
- [x] Performed Git commit for refactoring changes.

## Next Steps:
- Await `src/handlers/help.ts` code for GUI enhancements.
- Further modularization of other large handler files as needed.
- Regular cleanup of background processes.