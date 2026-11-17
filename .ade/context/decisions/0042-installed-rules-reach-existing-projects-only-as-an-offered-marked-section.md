# 0042: Installed rules reach existing projects only as an offered, marked section

- Status: Proposed (2026-11-17), with the F6 S1 design.
- Context: Setup writes the files a project is missing and never overwrites, so
  projects set up before F6 would never get the lean rules (F6 TG-3). Rewriting their
  rules would destroy owners' edits.
- Decision: ADE changes an existing project's installed rules only by appending one
  section, between its own markers, at the end of the file, after the owner accepts a
  one-time offer. The write is in place (permissions, links and line endings kept)
  and is cut back to the original bytes if it fails. A decline is stored on this
  machine, never in the project. New projects get the same text from the same file.
- Consequences: Owners' edits are never touched, and the section is never added
  twice. An appended project keeps its older wording beside the section, so the
  section must state that it wins. Removing or changing a shipped section later needs
  its own offer. S2's agent-file updates follow the same rule, limited to files whose
  hash ADE shipped.
