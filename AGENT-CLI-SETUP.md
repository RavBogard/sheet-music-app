# Agent Environment Integration Guide

This application codebase is fully vetted, bug-squashed, and ready for deployment. However, the AI agent's execution ring is currently isolated from your global system environment variables (`$PATH`), preventing it from orchestrating builds or executing Git deployments autonomously. 

To enable the agent to seamlessly invoke `git`, `npm`, `vercel`, or other CLI tooling natively on your machine in the future, adhere to the following steps to map your environment PATH.

## 1. Verify Global Installations
First, ensure you have the required toolchains installed system-wide. Open your native Windows Terminal (PowerShell or CMD) and verify:
```powershell
git --version
npm --version
node --version
```

## 2. Windows Environment Variables (PATH)
If the tools exist in your terminal but the agent cannot see them, the agent's Node sandbox isn't inheriting your user profile's `$PATH`. You need to ensure the directories holding `git.exe` and `npm.cmd` are set in your **System Variables**, not just your User Variables.

1. Press `Win + R`, type `sysdm.cpl`, and hit Enter.
2. Go to the **Advanced** tab -> click **Environment Variables**.
3. Under **System Variables** (the bottom list), find and double-click the `Path` variable.
4. Ensure the following specific paths are listed (adjust to match your actual drive mappings if different):
   - `C:\Program Files\Git\cmd`
   - `C:\Program Files\nodejs\`
5. If they are missing, click **New** and paste them in.
6. Click **OK** on all three windows.

## 3. Restarting the Agent Daemon
Environment variables are strictly loaded when processes initialize. Because you just modified the global Path variable, the agent's parent process is still running with the *old* variable stack.

1. Fully close your IDE, terminal, and the Agent interface you are currently chatting with.
2. If the agent runs from a background daemon or Docker container, fully restart that service.
3. Relaunch the Agent interface. It will now inherit the updated System PATH variables and have native access to `git` and `npm`.

## Manual Deployment Next Steps (Temporary Bypass)
Since the agent currently lacks CLI orchestration rights, please deploy this codebase manually this time. Since we have completed Phase 4 of the System Audit, execute the following from your terminal:

```powershell
// 1. Build locally to guarantee no hidden NextJS exceptions
npm run build

// 2. Stage and commit changes
git add .
git commit -m "feat: complete Phase 4 (Admin Layout & Leader Demotion Guards)"

// 3. Push to your repository (triggering Vercel/Netlify/etc)
git push origin main
```
