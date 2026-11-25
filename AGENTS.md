# Sleep Truth: agent notes

## Workflow

This is a skunkworks project. Commit straight to `main` in `main/`.
No feature branches, worktrees, or PRs. This overrides the global
"main/ worktrees are read-only" rule for this repo only.

Commit messages use conventional commits (`feat:`, `fix:`, `docs:`,
`chore:`). No task-ID suffix.

## Where things are

- `README.md`: what the project is and its principles.
- `vision-mrd.md`: vision, goals, non-goals, risks.
- `docs/design/`: approved designs. Read the relevant one before building.

## Hard rules

- Never commit real health data. Test fixtures are synthetic.
- The web page makes no network requests unless a design says otherwise.
- Every printed page carries the "not a diagnostic tool" disclaimer.
