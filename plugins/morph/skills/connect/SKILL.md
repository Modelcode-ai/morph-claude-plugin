---
name: connect
description: Set up and check the connection between Claude Code and Morph, and pick or switch the Morph project to work on. Use when the user wants to work on a Morph project from Claude Code, asks which projects they have, wants to switch projects, or when a Morph tool is missing or refuses the call.
---

# Connecting Claude Code to Morph

Claude Code reaches Morph through the plugin's MCP server, `morph`. It acts as the user whose Morph key is in the plugin's settings: what you do shows in the Morph UI as theirs, as if they had clicked it there.

## Is it connected?

It is when the `morph` tools are available (`list_projects`, `get_project_execution_status`...). Call `list_projects`: it lists the user's projects with their `project_id` and a link to each in the Morph UI.

If the tools are missing or every call is refused as unauthorized:

1. The key is missing, mistyped, expired or revoked. The user creates a key in their Morph settings, then sets it with `/plugin` (the morph plugin's configuration, "Morph key"). Never ask them to paste the key into the conversation, and never print or repeat it.
2. The "Morph URL" setting must be where they open Morph (default `https://morph.modelcode.ai`).
3. Claude Code reads MCP servers when it starts: after changing a setting, they run `/reload-plugins` or restart Claude Code.

## Picking the project

Every Morph tool except `list_projects` takes the `project_id` of the project the user is working on.

- When the user names a project, find its `project_id` with `list_projects` and use it for every call until they switch. Say which project you're on before acting on it.
- When they haven't said and they have more than one project, ask which one, listing them by name.
- When they switch ("work on X now"), take X's `project_id` from `list_projects` and use it from then on.

## When a tool refuses

Morph's refusals say what's wrong; relay them in plain words.

- "Project N not found": it isn't in the user's organization. Check `list_projects`.
- "You don't have the ... permission": their role in Morph doesn't allow it. An admin of their organization can change it.
- "no user identity came with the call": the key isn't set (see above).

## Fewer prompts

Claude Code asks before each Morph tool call. Reading tools are safe to allow; starting and retrying runs should keep asking. If the user wants fewer prompts, offer to add these rules to `permissions.allow` in their `~/.claude/settings.json`, and do it only once they agree:

```json
"mcp__plugin_morph_morph__list_projects",
"mcp__plugin_morph_morph__get_project_execution_status",
"mcp__plugin_morph_morph__get_milestone_details",
"mcp__plugin_morph_morph__get_milestone_start_quote"
```
