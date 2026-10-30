# Morph for Claude Code

Run your [Morph](https://modelcode.ai) projects from Claude Code. Ask where your milestones stand, start and retry milestone runs, follow them, and do a milestone's code review, without leaving your terminal. Everything you do also shows in the Morph UI, as if you had done it there.

## Install

In Claude Code:

```text
/plugin marketplace add Modelcode-ai/morph-claude-plugin
/plugin install morph@modelcode-morph
```

When asked, enter your **Morph key**. Create one in your Morph settings. Claude Code keeps it in your system keychain. Leave **Morph URL** as it is unless Modelcode gave you another address.

Then run `/reload-plugins`, or restart Claude Code.

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

- **Morph's tools are missing, or every call is unauthorized.** Your key is missing, expired or revoked. Create a new one in your Morph settings, set it with `/plugin` (morph → configure), then run `/reload-plugins`.
- **"Project N not found".** The project isn't in your organization. Ask "What are my Morph projects?" to see the ones you can open.
- **"You don't have the … permission".** Your role in Morph doesn't allow that action. Ask an admin of your organization.
