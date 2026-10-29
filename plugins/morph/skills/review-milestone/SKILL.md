---
name: review-milestone
description: Do a Morph milestone's code review from here - check out its branch, go through its review issues, fix them, commit and push to its pull requests, re-run Morph's review, rebase, and merge all its pull requests. Use when the user asks to review milestone N, or to fix, ignore or discuss its review issues, rebase it, re-run its review or merge it.
argument-hint: <milestone number>
---

# Reviewing a milestone

The user reviews milestone $ARGUMENTS on this machine, as they would in the review drawer of the Morph UI. Morph keeps the review: its issues, its pull requests, whether it needs a rebase. The code changes happen here, in a worktree of each repository, and reach Morph through pushes to the milestone's pull requests. Teammates can work on the same review from the Morph UI at the same time, so always read the current state from Morph.

If you don't know which Morph project the user means, use the `connect` skill first: every call below takes its `project_id`.

## Setting up

1. Call `get_milestone_review` with the milestone's number (a sub-milestone like 3.1 is `number` 3, `sub_number` 1). Its `branch` is the milestone's branch, the same in every repository that has one of its `pull_requests`; `base_branch` is where they merge.
2. If a repository with a pull request isn't cloned in this folder, use the `clone-repos` skill first.
3. Give each of those repositories a worktree on the milestone's branch, at `reviews/m<number>/<repo>`, so several milestones can be reviewed side by side without switching branches:
   - not there yet: `git -C <repo> fetch origin <branch>` then `git -C <repo> worktree add ../reviews/m<number>/<repo> <branch>`;
   - already there: `git -C reviews/m<number>/<repo> pull --rebase origin <branch>` (if it has uncommitted changes, ask first).
4. Work in `reviews/m<number>` from now on: make every change in its repositories.

## The summary

Show the user where the review stands, short:
- the milestone's number, title and status, with its pull requests as links;
- whether it needs a rebase, and why (`rebase_reasons`);
- runs in progress on it (`active_runs`): while a review runs, its issues are still changing;
- the open issues, numbered as Morph numbers them: bugs first, then warnings, with their size. If issues come from more than one review, say which review each is in (for example "review 2, issue 1"); otherwise just the issue number;
- how many are already resolved or ignored;
- the review in the Morph UI as a link (`review_url`).

Then ask what they want to do. Read an issue in full with `get_milestone_review_issue` before discussing or fixing it.

## Fixing issues ("fix issues 1 and 3")

1. Read each issue, make the change in the right repository, and check it (run the tests or build when you can tell how). Leave the worktree as you found it apart from the fix: remove files your checks created (a lockfile or cache a test runner wrote, for example) before committing, and never commit them.
2. Tell the user what you changed, issue by issue. Don't commit until they say so.
3. **Commit** when they ask: one commit per issue, for example `Fix review issue 3: <title>`.
4. **Push** to the pull request branch: ask first, unless they already asked for it. Others may push to the branch too, so run `git pull --rebase origin <branch>` first; if that stops on a conflict, resolve it and tell the user what you merged. Then `git push origin <branch>`.
5. Only once pushed, mark each fixed issue with `update_milestone_review_issue` (`number`, `review_number`, `issue_number`): `status` `RESOLVED` and a `note` saying what changed and in which commit.

To set an issue aside ("ignore issue 2"), use `status` `IGNORED` with a `note` giving the user's reason. Use the user's own words for decisions; don't resolve or ignore an issue they didn't ask about.

## Re-running the review

When the fixes are pushed, suggest re-running Morph's review. Call `rerun_milestone_review` when the user agrees: it reviews the branch as pushed, in Morph, and files what it finds as new issues. Use the `force_*` options only when they ask for those checks. Follow the run with the `follow-runs` skill; when it ends, call `get_milestone_review` again and summarize what changed.

## Rebasing

A milestone needs a rebase when its base branch moved since it ran, usually because a milestone that ran in parallel was merged first. Its pull requests can't merge until it's rebased. Offer the user both ways:
- **Here**: in each repository, `git fetch origin <base_branch>` and `git rebase origin/<base_branch>`. Resolve each conflict and explain how. Run the tests, then ask before `git push --force-with-lease origin <branch>`. Then call `record_milestone_rebased`: Morph checks on the git host that the branches contain their base and lets them merge. If it couldn't check a pull request, try again in a moment or offer Morph's rebase; if a milestone merged meanwhile, rebase again. Suggest re-running the review afterwards, since Morph's own validation didn't run on the rebased code.
- **In Morph**: `start_milestone_rebase` runs Morph's rebase (its agent resolves conflicts, re-validates and force-pushes). Follow it with `follow-runs`. When it ends, the branch's history is rewritten: if the worktrees have no unpushed work, `git fetch origin <branch>` and `git reset --hard origin/<branch>`; otherwise ask the user what to keep first.

## Merging ("merge all PRs")

1. Check that every worktree is committed and pushed. If not, say what isn't and ask.
2. If issues are still open, list them and ask whether to merge anyway.
3. Call `merge_milestone_prs`. If it says a rebase is needed, go to Rebasing. If some pull requests didn't merge, say which and why.
4. Once merged, the milestone is done and the milestones that depend on it can start. Offer to remove its worktrees (`git -C <repo> worktree remove ../reviews/m<number>/<repo>`).

Merging can't be undone: never call `merge_milestone_prs` unless the user asked to merge in this conversation.
