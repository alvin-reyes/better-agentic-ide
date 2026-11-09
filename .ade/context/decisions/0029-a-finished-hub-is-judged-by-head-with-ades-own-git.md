# 0029: A finished hub is judged by HEAD, with ADE's own git

- Status: Proposed (2026-11-09). With the F2 design revision 2; not yet reviewed or
  approved.
- Context:
  - F2.5 defines a **finished hub** as a folder whose `hub.conf` is tracked in the
    folder's git `HEAD`; an unfinished one has a `hub.conf` that is not committed.
    OB-2 AC2/AC3 refuse or accept folders by that test, inline as the developer
    types, before any runner or login shell exists; OB-5 AC5 judges folders left by
    a killed run by it.
  - Revision 1 used `git ls-files --error-unmatch hub.conf` in the steps'
    environment. `ls-files` reads the index, which holds `hub.conf` after `git add`
    even when no commit was made (a run killed between c1 and c2), so it called an
    unfinished hub finished; and it needed a runner, which the inline check does not
    have.
  - Reading `.git` directly means resolving `HEAD` through loose refs, packed refs
    or a reftable, and finding the tree in loose objects or packs, possibly with
    SHA-256 object names: reimplementing git.
  - ADE already runs its own `git` (`git.rs`, `sync.rs`, `projectsetup.rs`). The
    Command Line Tools stubs open an install dialog, which is why the preflight runs
    `/usr/bin/xcode-select -p` first.
  - Spec: `docs/superpowers/specs/2026-11-09-onboarding-design.md`, section 6.7.
- Decision:
  - `hub_folder_kind` decides `finished` with ADE's own
    `/usr/bin/git --git-dir=<path>/.git cat-file -e HEAD:hub.conf` (cwd the folder,
    10 s limit, stdin `/dev/null`), with `GIT_DIR`, `GIT_WORK_TREE` and the other
    repository-locating variables removed, `GIT_CONFIG_NOSYSTEM=1` and
    `GIT_CONFIG_GLOBAL=/dev/null`; exit 0 is `finished`, anything else `unfinished`.
  - It runs only after `xcode-select -p` has returned 0 in this launch; before that
    it answers `tools_missing` and starts no `git`.
  - Every "finished" decision uses it: the questionnaire's inline errors, the
    preflight's folder check, Open Hub's re-check, folders met after a restart. The
    only other test of `hub.conf` being tracked is the PRD's own c3
    (`git ls-files --error-unmatch hub.conf`) inside the run, right after the
    commit.
- Consequences:
  - A run killed between `git add -A` and `git commit` leaves an `unfinished` hub,
    as F2.5 intends; O8 tests it.
  - The check does not use the developer's shell environment (no `GIT_CONFIG_GLOBAL`
    from start-up files); it needs no config, since `cat-file` reads only objects.
  - A hub inside an enclosing repository is judged by its own `.git`, never the
    parent's.
  - Without the Command Line Tools the questionnaire cannot tell finished from
    unfinished and says the tools are missing, which the preflight would refuse
    anyway.
