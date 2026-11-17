---
name: verify
description: Verify the current change at its API boundary with witness and report the verdict. Boots the app, runs the repo's own boundary tests, checks that new tests fail on the base commit and pass here, and at high level compares responses with the base app. Use when the user asks to verify, prove, test or check a change in a repo that has .witness/, before you say such a change is done, or when the witness Stop hook asks for a verdict.
---

# Verify a change with witness

`witness` is on your PATH. It works on the git repo in the current directory. The runner decides
pass or fail from the repo's own test reports; your job is to make the claims true, not to judge them.

## Steps

1. `witness lint`. Errors mean a claim points at a test that doesn't exist or a claim is malformed.
   Fix them first. If the change has no claims yet, follow the `claims` skill, then come back.
2. Run the verdict:
   ```bash
   witness verify --why "<the task in one sentence, as the user asked it>"
   ```
   - Add `--level high` when the change must keep existing behavior (refactors, migrations, "don't
     break X"), or when the user asks to compare with the base or origin.
   - Add `--source <file>` for the issue or spec file the user gave you (outside the repo). The
     judge then checks that your claims cover every requirement in it. Never write such a file
     yourself, and never use `--trusted-source`: that flag is for documents a human vouches for.
   - It takes about a minute: it boots the app twice (this change and the base commit).
3. Read the `agent.md` file it prints. For each item:
   - **failed**: the claim doesn't hold. Fix the code. Change the test only if it is clearly wrong, and
     say why in your reply.
   - **doesn't bite** (the test also passes on the base commit): the test doesn't prove the change.
     Make it assert the new behavior so it fails without your change.
   - **origin differs** at high level: either fix the regression, or, if the difference is intended,
     tag the claim `changed` with an `expect-diff:` line and tell the user. Never add a `changed` tag
     just to get a pass without saying so.
   - **can't tell**: the judge couldn't decide from the evidence. Sharpen the claim (the judge's
     suggested claim is a good start) or ask the user.
   - **mistrial**: the app or the claims couldn't be put on trial. Follow the remedy, run
     `witness doctor`, then retry.
   - **regression**: an existing boundary test now fails. Treat it as a bug in your change.
   - **E-claims** ("... gets the same responses as on main", high level): an existing test no claim
     mentions now sees different responses. Fix the regression, or add a claim tagged `changed`.
   - **U-claims** (not covered by a claim): the request asks for something no claim covers. Add a
     claim and a test, or tell the user why it's out of scope.
   - **can't tell, "matches only under the equivalence rules this PR changes"**: you loosened a rule
     in `.witness/equivalence.toml`. That's allowed, but only a human can approve it. Say so.
   - **Nothing proven**: there are no claims. Follow the `claims` skill.
   - **Proven, pending approval**: everything holds, but the PR adds or edits claims. That's normal
     for a feature; the reviewer approves them in the PR. Report it as is.
   - **harness changed** warning: you edited `.witness/witness.toml`, `.witness/bin/` or
     `.witness/origin/`. Only do that when the boot or test setup really needs it, and tell the user.
4. Re-run `witness verify` after fixes. Stop after three rounds and report what's left; don't loop.
5. Report to the user in a few lines:
   - the verdict line and the counts, exactly as printed;
   - the bite line ("N new tests fail on main and pass here");
   - one line per failed, can't tell, overturned or not tested claim;
   - everything listed under "Changed in this PR" (new or edited claims, rule changes, declared
     differences): the reviewer has to approve these, so never leave them out;
   - the record path. They can open it with `witness open`.
   If they want a PR comment, print `witness report --format pr`.

## Rules

- Never delete or weaken a claim or a test to turn a verdict green without the user's agreement.
- An overturned result is the judge accepting a difference because a source document allows it.
  Mention it; don't hide it.
- Don't edit files under `.witness/records/` or `.witness/cache/`.
