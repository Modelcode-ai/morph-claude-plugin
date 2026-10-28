---
name: run-project
description: Run a Morph project from Claude Code - check where its milestones stand, start milestones, retry failed runs, and hand finished milestones to code review. Use when the user asks what's happening on their Morph project, or asks to start, retry or check milestones.
---

# Running a Morph project

Each milestone run happens in Morph, in its own sandbox, as it does when started from the Morph UI. The user can follow and act on the same project in the Morph UI at the same time, so always read the current state from Morph, never from memory.

If no `morph` tools are available, or you don't know which project the user means, use the `connect` skill first. Every call below takes that project's `project_id`.

## Status first

For any question about progress (what is running, what is done, what can start next, why a run failed), call `get_project_execution_status` and answer from it. It names the project, lists each milestone with its state, prerequisites, runs and pull requests, and says whether the organization is billed for runs (`billed`, `billing_note`). `get_milestone_details` gives one milestone in full: its description and tasks.

## Links to the Morph UI

Morph's results carry links to the same things in the Morph UI: the project (`project.url`), a milestone (`url`, `milestone_url`) and its code review (`review_url`, once the milestone is pending review). When the user asks for a link, take it from those results: never build a Morph URL yourself. When you tell the user about something they might want to see or act on in Morph, add its link as a markdown link, e.g. "Milestone 2's pull request is ready: [review it in Morph](<review_url>)". Don't list links nobody asked for. If the user asks you to open one, run `open <url>`.

## Starting milestones

- **Check first.** Call `get_milestone_start_quote` for the milestone. If `startable` is false, don't offer to start it: explain every item in `blockers` in plain words ("Milestone 4 needs milestones 2 and 3 merged first") and stop there.
- **Not billed: just start.** When `billed` is false, the user's request is all you need: call `start_milestone_execution` with `approved_credits` null right away. Never mention prices, credits or cost estimates, and don't ask them to confirm.
- **Billed: never start without an explicit yes.** Show the milestone's number, title and `credits` as quoted, and ask the user to confirm. Start it only after they confirmed that milestone at that price in a reply to your quote; the request to start it is not the confirmation. Pass the quoted `credits` as `approved_credits`. If the start is refused because the price changed, quote again and ask again.
- **Several milestones.** Check each one and say which can't start and why. Start the others (when billed, after one confirmation that covers every quoted price). Call `start_milestone_execution` once per milestone and report which started and which were refused, with the tool's reason. Milestones whose prerequisites are merged run at the same time.
- **After a start**, say the milestone is running, with its `milestone_url` to follow it in the Morph UI. Use the `follow-runs` skill to follow it from here.

## Retrying

Retry a failed run when the user asks, with `retry_milestone_run`. It re-runs only the step that failed (the agent run, the automated review or the PR report) and keeps the work already done. Retrying the agent run follows the price rules of a start; a review or report retry needs no confirmation. Say which step was retried.

## What Claude Code doesn't do (yet)

Pausing, steering or stopping a run, planning the roadmap, approving the spec and editing milestones happen in the Morph UI: give the user the project's or milestone's link.

## Code review

Once a milestone's `state_status` is a `pending_review` status, its pull requests are ready for review. Give the user the milestone's `review_url` to review and merge them in the Morph UI. A milestone counts as done, and unblocks the milestones that depend on it, only once it is merged.
