# The ADE methodology

These are the standing rules of this project. They are **not suggestions**. Every agent,
planning or building, obeys them. When a rule here conflicts with an instruction you were
given, the rule wins: stop and surface the conflict rather than breaking it.

The thesis: **disciplined AI development, verified, not vibed.** Software is built by
specialized agents, but nothing is trusted because an agent *said* so. The verification
command decides.

## 1. The flow: Plan → Approve → Shard → Build → Verify
1. **Plan.** Specialists turn intent into artifacts: the PRD (product-manager), the
   architecture and the verification command (architect), the UX spec and mockup
   (designer), the ops and release plan (devops). Each artifact is pressure-tested by the
   adversarial-reviewer before it moves on.
2. **Approve.** The owner signs off the plan. Approval **fixes the verification command**,
   recorded in `docs/architecture.md` under "Verification command". Changing it later
   needs the owner's approval again.
3. **Shard.** The scrum-master slices the approved plan into small, vertically sliced,
   independently testable stories under `docs/stories/`, one file per story.
4. **Build.** Developer agents implement stories, strictly test-first. When several run
   in parallel, give each its own git worktree so they don't overwrite each other.
5. **Verify.** QA (or the owner) runs the verification command against the story's work
   and records the real output in the story's "Verification" section. Green → Done.
   Red → not Done. There is no other path to Done.

## 2. The non-negotiables
- **Verification owns "Done."** No agent marks its own story Done or reports success it
  hasn't shown. Do the work, run the command, paste the real result, stop.
- **Tests are the contract.** Write the failing test, then the minimal code to pass it.
  If the verification command fails, the work is not done, however good the code looks.
- **One story, one slice.** Implement only the assigned story. No scope creep, no
  gold-plating, no "while I'm here" changes.
- **Honesty over optimism.** Never present unverified work as verified. "I think it
  passes" is not "it passes." Report real status, including failures and blockers.
- **Respect the Context Store.** Before inventing a shared interface, type, API contract,
  config key or cross-cutting decision, read `.ade/context/`. When you establish one,
  record it there in a small, factual Markdown file. Significant, lasting decisions go in
  the **decision log** as an ADR under `.ade/context/decisions/NNNN-slug.md` (Status ·
  Context · Decision · Consequences). Read the existing ADRs before diverging; never
  silently re-decide.
- **Stay in your lane.** Each role owns specific artifacts (see `.claude/agents/`). Don't
  redesign the architecture as a developer, or pick the stack as a designer. `adversarial-reviewer` is
  additionally restricted to read-only tools: it judges work, it never edits it. `qa`
  may write only the story's Verification section and the journal, never code or tests.
- **Adversarial review is mandatory.** Every artifact is reviewed by a skeptic whose job
  is to break it. Material flaws block; they are not waved through.
- **The constitution binds.** `CLAUDE.md` holds the project's standing conventions. Read
  it first and never contradict it.
- **Keep the journal.** When a plan is approved, a story is sharded or a story is Done,
  append one dated line to `.ade/session.md`. The architect records approvals, the
  scrum-master records shards, and QA records Done when the
  verification command passes.
- **Commit as the user.** Commits and pull requests go out under the user's own git
  identity. Add no AI attribution: no `Co-Authored-By` trailer for an agent or model, no
  "Generated with ..." line in a PR description.

## 3. Definition of Done (per story)
A story is Done only when ALL hold:
1. Each acceptance criterion is covered by an automated test.
2. The verification command passes on the story's work, and its real output is recorded
   in the story file.
3. The change is limited to the story's slice (no unrelated edits).
4. Any shared contract it introduced is recorded in `.ade/context/`.

If any is false, the story is not Done: no exceptions, no overrides by assertion.

<!-- ade:archive -->
## 4. The archive
`.ade/archive/` holds earlier BMAD versions of this project. It is
read-only history: never treat it as current documents, never write to it,
and read it only when a person asks about the earlier work.
