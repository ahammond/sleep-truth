# Contributing to Sleep Truth

Thanks for helping. One person maintains this in spare time, so small,
boring changes land fastest.

## Before you start

- Read the principles and non-goals in [README.md](README.md). Changes that
  add a server, a relay, accounts, or hosted data will be declined.
- Open an [issue](https://github.com/ahammond/sleep-truth/issues) first for
  anything bigger than a fix.
- Adding a device? Follow
  [Add a device](https://sleep-truth.agh1973.com/devices/add/).

## Set up

Install [mise](https://mise.jdx.dev). It pins Node and pnpm.

```sh
git clone https://github.com/ahammond/sleep-truth.git
cd sleep-truth
mise trust
mise exec -- pnpm install
```

## Check your change

```sh
mise exec -- pnpm test
mise exec -- pnpm typecheck
```

For a printout change, build the page with
`mise exec -- pnpm -C packages/web build`, load a synthetic nights file,
and print it. Attach the PDF to the pull request.

## Rules

- Never commit real health data, not even your own. Test data is made up.
- The web page makes no network requests.
- Every printed page carries the "not a diagnostic tool" disclaimer.
- Designs live in `docs/design/`. Read the one your change touches.
- Commit messages follow [Conventional Commits](https://www.conventionalcommits.org):
  `feat:`, `fix:`, `docs:`, `chore:`.

## License

Contributions are licensed under [Apache 2.0](LICENSE), like the rest of
the project.
