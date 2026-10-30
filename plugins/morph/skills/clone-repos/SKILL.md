---
name: clone-repos
description: Clone a Morph project's repositories into the current folder, skipping the ones already there. Use when the user asks to clone or set up the project's repos, or before reviewing a milestone when its repos aren't cloned yet.
---

# Cloning the project's repositories

If you don't know which Morph project the user means, use the `connect` skill first: every call takes its `project_id`.

1. Call `get_project_repos`. It lists each repository's `name`, plain `clone_url`, `default_branch`, and whether it is `reference_only` (a source Morph reads but milestones never change).
2. For each repository, in the folder Claude Code runs in:
   - If `./<name>` is already a clone of that repository (`git -C <name> remote get-url origin` names the same repository, over HTTPS or in one of the SSH forms below), run `git -C <name> fetch origin` and leave it as it is.
   - If `./<name>` exists but is something else, don't touch it: tell the user and skip it.
   - Otherwise run `git clone <clone_url> <name>`.
3. Say which repositories were cloned, which were already there, and which are reference-only.

The user clones with their own git credentials: Morph doesn't hand out tokens. `clone_url` is the HTTPS address; users whose git is set up for SSH can't authenticate it ("Repository not found", "Authentication failed"). When that happens, clone the same repository over SSH instead, and say so:
- GitHub, GitLab.com or Bitbucket (`https://<host>/<owner>/<repo>`): `git@<host>:<owner>/<repo>.git`, or `gh repo clone <owner>/<repo> <name>` for GitHub;
- Azure DevOps (`https://dev.azure.com/<organization>/<project>/_git/<repo>`, or `https://<organization>.visualstudio.com/<project>/_git/<repo>`): `git@ssh.dev.azure.com:v3/<organization>/<project>/<repo>`;
- any other host: don't guess the address. Tell the user the HTTPS clone failed and ask for the SSH address their git host shows for that repository.

If the SSH clone fails too, tell the user they need access to that repository on its git host (for example `gh auth login` for GitHub) and stop. Never put a token in a URL or a command.
