# Morph for Claude Code

Run your [Morph](https://modelcode.ai) projects from Claude Code. Ask where your milestones stand, start and retry milestone runs, and follow them, without leaving your terminal. Everything you do also shows in the Morph UI, as if you had done it there.

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

Claude Code asks before each call to Morph. You can allow the read-only ones for good: ask it to "allow Morph's read tools".

## What it can't do yet

Pausing or steering a running agent, planning a roadmap, approving a project spec and code review still happen in the Morph UI. Claude Code gives you the link.

## Troubleshooting

- **Morph's tools are missing, or every call is unauthorized.** Your key is missing, expired or revoked. Create a new one in your Morph settings, set it with `/plugin` (morph → configure), then run `/reload-plugins`.
- **"Project N not found".** The project isn't in your organization. Ask "What are my Morph projects?" to see the ones you can open.
- **"You don't have the … permission".** Your role in Morph doesn't allow that action. Ask an admin of your organization.
