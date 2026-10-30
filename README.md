# Morph for Claude Code

Run your [Morph](https://modelcode.ai) projects from Claude Code. Ask where your milestones stand, start and retry milestone runs, follow them, and do a milestone's code review, without leaving your terminal. Everything you do also shows in the Morph UI, as if you had done it there.

## Install

The plugin is tested with Claude Code 2.1.312. Check your version with `claude --version`, and update with `claude update`.

In Claude Code:

```text
/plugin marketplace add Modelcode-ai/morph-claude-plugin
/plugin install morph@modelcode-morph
```

If Claude Code asks for a **Morph URL**, leave it as it is unless Modelcode gave you another address. Then run `/reload-plugins`, or restart Claude Code.

## Sign in

Run `/mcp`, pick **morph**, and choose **Authenticate**. Or, from a terminal:

```text
claude mcp login plugin:morph:morph
```

Your browser opens Morph's sign-in, then a page asking you to let Claude Code use your Morph account. Allow it, and you're connected. With a browser on this machine, there's nothing to copy or paste. Claude Code keeps you signed in until you sign out, the sign-in is revoked, you don't use it for 30 days, or 90 days pass. It also ends if your Morph account or your organization stops being active, or if Claude Code access is switched off for your organization.

Claude Code acts for you, in your Morph organization.

**Over SSH, or with no browser:** run `claude mcp login plugin:morph:morph --no-browser`. Claude Code prints a link. Open it in a browser on any machine and sign in. After you allow Claude Code, the browser goes to a `localhost` address, which may not load: copy that address from the address bar and paste it into the terminal when Claude Code asks. If you sign in from the chat instead, Claude Code gives you the link there and asks you to paste the `localhost` address back into the chat. That's fine: the code in it works once, and only for this Claude Code.

**Signing out:** `claude mcp logout plugin:morph:morph`, or `/mcp` → morph → **Clear authentication**.

**Seeing and revoking sign-ins:** each sign-in shows in Morph under **Connected apps** in the user menu (click your name), where you can revoke it. Morph also emails you when Claude Code is connected to your account.

## Use it

Talk to Claude Code as you would to a teammate:

- "What are my Morph projects?"
- "What's the status of the calculator project?"
- "Start milestone 1." On a billed plan, Claude Code shows the price first and starts only after you say yes.
- "How is milestone 1 doing? Tell me when it's done."
- "Milestone 2 failed. Why? Retry it."
- "Clone the project's repos." then "Review milestone 1." Claude Code checks out its branch and summarizes the review issues.
- "Fix issues 1 and 3.", "Commit and push.", "Re-run the review.", "Merge all PRs."

Claude Code asks before each call to Morph. You can allow the read-only ones for good: ask it to "allow Morph's read tools".

In auto mode, Claude Code doesn't ask: it refuses the calls that change something in Morph, such as starting or retrying a run, resolving a review issue, rebasing or merging. To let one through, switch out of auto mode (Shift+Tab) and ask again, then approve it when Claude Code asks. Or allow it for good with `/permissions`, for example `mcp__plugin_morph_morph__start_milestone_execution` to start runs. On a billed plan, Claude Code still shows the price and waits for your yes before starting a run.

## What it can't do yet

Pausing or steering a running agent, planning a roadmap and approving a project spec still happen in the Morph UI. Claude Code gives you the link.

## Troubleshooting

- **`/mcp` says morph "needs authentication", Morph's tools are missing, or a call says your sign-in "was revoked or has expired".** You aren't signed in, or your sign-in ended: you signed out, it was revoked in Connected apps, it expired, or Claude Code access was switched off for your organization. Sign in again: `/mcp` → morph → **Authenticate** (or **Re-authenticate**).
- **`/mcp` says morph failed to connect.** Check the Morph URL: `/plugin` → morph → **Configure options**. It's `https://morph.modelcode.ai` unless Modelcode gave you another address. After changing it, run `/reload-plugins` and sign in again: a sign-in works only for the address it was made on.
- **Morph refused the sign-in.** The page says why. Usually your Morph account isn't active, or your organization's subscription is paused. Ask an admin of your organization.
- **"Using Morph's tools from Claude Code isn't enabled for your organization yet", "isn't enabled for your organization", or "Connecting apps such as Claude Code isn't turned on for your organization".** Contact Modelcode to turn it on.
- **"Morph can't confirm your Claude Code sign-in right now".** Morph couldn't check your sign-in before starting, retrying, rebasing, re-running a review or merging. Try again in a minute.
- **"Project N not found".** The project isn't in your organization. Ask "What are my Morph projects?" to see the ones you can open.
- **"You don't have the … permission".** Your role in Morph doesn't allow that action. Ask an admin of your organization.
