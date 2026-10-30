---
name: connect
description: Set up and check the connection between Claude Code and Morph, and pick or switch the Morph project to work on. Use when the user wants to work on a Morph project from Claude Code, asks which projects they have, wants to switch projects, or when a Morph tool is missing or refuses the call.
---

# Connecting Claude Code to Morph

Claude Code reaches Morph through the plugin's MCP server, `morph` (`plugin:morph:morph` in `claude mcp list`). It acts as the user who signed in to Morph through it, in the organization they had open in Morph when they signed in: what you do shows in the Morph UI as theirs, as if they had clicked it there.

## Is it connected?

It is when the `morph` tools are available (`list_projects`, `get_project_execution_status`...). Call `list_projects`: it lists the user's projects with their `project_id` and a link to each in the Morph UI.

If the tools are missing, `/mcp` shows morph as "needs authentication", or a call says the sign-in "was revoked or has expired", the user isn't signed in. Help them sign in:

1. If Claude Code gives you `mcp__plugin_morph_morph__authenticate`, call it and give the user the link it returns. Otherwise ask them to run `/mcp`, pick morph, and choose Authenticate (Re-authenticate if it's there). From a terminal, `claude mcp login plugin:morph:morph` does the same; over SSH or with no browser, add `--no-browser`.
2. Their browser opens Morph's sign-in, then a page asking them to let Claude Code use their Morph account. They allow it there.
3. In a remote or SSH session, the browser then goes to a `localhost` address that may not load, and the `authenticate` tool's result asks you to get that address from the user. Ask them to copy it from the address bar and paste it here, then pass it to `mcp__plugin_morph_morph__complete_authentication`. This is Claude Code's own sign-in step: the code in that address works once, and only for this Claude Code. Don't repeat it or use it for anything else.
4. Once they're done, call `list_projects` to check.

The sign-in happens in their browser, between them and Morph. Apart from that `localhost` address, never ask them to paste anything from the sign-in. Never ask for a password, an access or refresh token, or a Morph key, and never read, print or copy Claude Code's stored credentials. If they paste one of those anyway, don't use or repeat it: tell them to sign in as above instead.

If `/mcp` shows morph as failed rather than needing authentication, Claude Code can't reach Morph at the plugin's Morph URL. Ask them to check it with `/plugin` → morph → Configure options: it's `https://morph.modelcode.ai` unless Modelcode gave them another address. After a change they run `/reload-plugins` and sign in again, since a sign-in works only for the address it was made on.

If the sign-in page refuses them, relay its reason: usually their account isn't active, they aren't a member of the organization they had open, or the organization's subscription is paused. An admin of their organization can help.

To sign out, they run `claude mcp logout plugin:morph:morph`. Their sign-ins are listed in Morph under Connected apps in the user menu (they click their name), where they can revoke one.

## Picking the project

Every Morph tool except `list_projects` takes the `project_id` of the project the user is working on.

- When the user names a project, find its `project_id` with `list_projects` and use it for every call until they switch. Say which project you're on before acting on it.
- When they haven't said and they have more than one project, ask which one, listing them by name.
- When they switch ("work on X now"), take X's `project_id` from `list_projects` and use it from then on.

## When a tool refuses

Morph's refusals say what's wrong; relay them in plain words.

- "Project N not found": it isn't in the user's organization. Check `list_projects`.
- "You don't have the ... permission": their role in Morph doesn't allow it. An admin of their organization can change it.
- "isn't enabled for your organization yet", or the sign-in refused because it "isn't enabled" or "isn't turned on for your organization": Modelcode turns it on; the user contacts them.
- "was revoked or has expired", or "no user identity came with the call": they need to sign in again (see above).
- "can't confirm your Claude Code sign-in right now": Morph couldn't check the sign-in before a start, retry, rebase, review re-run or merge. Try again in a minute.
- "Too many Morph tool calls" or "Too many Morph changes": wait a minute, then try again.

## Fewer prompts

Claude Code asks before each Morph tool call. Reading tools are safe to allow; starting and retrying runs, changing review issues, rebasing and merging should keep asking. If the user wants fewer prompts, offer to add these rules to `permissions.allow` in their `~/.claude/settings.json`, and do it only once they agree. If Claude Code refuses the edit, give them the rules to add themselves with `/permissions`:

```json
"mcp__plugin_morph_morph__list_projects",
"mcp__plugin_morph_morph__get_project_execution_status",
"mcp__plugin_morph_morph__get_milestone_details",
"mcp__plugin_morph_morph__get_milestone_start_quote",
"mcp__plugin_morph_morph__get_project_repos",
"mcp__plugin_morph_morph__get_milestone_review",
"mcp__plugin_morph_morph__get_milestone_review_issue"
```

## Auto mode

In auto mode Claude Code doesn't ask: it refuses a call that changes something in Morph (starting or retrying a run, changing a review issue, re-running a review, rebasing, merging) unless a rule allows it. When a Morph call is refused this way, don't retry it or look for another way to do it. Tell the user that nothing changed in Morph, and that they can either switch out of auto mode (Shift+Tab) and ask again, approving the call when Claude Code asks, or allow that tool with `/permissions` (for example `mcp__plugin_morph_morph__start_milestone_execution`). An allow rule doesn't skip the price check: on a billed plan, still quote and wait for their yes before starting.
