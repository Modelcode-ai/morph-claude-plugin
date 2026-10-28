---
name: follow-runs
description: Follow running Morph milestone runs from Claude Code - what step each is at, its task progress and the agent's latest progress report, and when it finishes or fails. Use when the user asks how a milestone run is going or wants to be told when it's done.
---

# Following milestone runs

A milestone run goes through three steps, each a Morph execution: the agent run, its automated review, then the PR report. Once all three succeed, the milestone is pending code review.

## How a run is doing

Call `get_project_execution_status` (with the milestone's `number` to see only that one). Each milestone's `runs` lists its latest agent, review and report step:

- `status`: pending, running, completed, failed or cancelled.
- `tasks` and `current_task`: how many of the milestone's tasks are done, and which are in progress.
- `progress_report` (while it runs): the agent's latest report on what it's doing, its `stage` and `step`, and how far through its stages it is.
- `error` (once it failed): why.

Answer in plain words: which step it's at, what the agent is doing, what's done and what's left. Add the milestone's `url` when the user may want to watch it in the Morph UI. Morph's transcripts are not available from Claude Code: never offer or link one.

## Watching a run

When the user asks to be told when a run finishes, check its status every few minutes, and stop when:

- the milestone is pending code review: say so, with its pull requests and `review_url`;
- a step failed: say which and why, and offer to retry it (see the `run-project` skill);
- the user asks you to stop watching.

Don't report every check; speak up only when something changed.

## What Claude Code doesn't do (yet)

Pausing, sending a message to, or stopping a running agent happens in the Morph UI: give the user the milestone's `url`.
