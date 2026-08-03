# Copilot instructions

**The full instructions for this repository are in [`AGENTS.md`](../AGENTS.md) at the repo
root. Read it before making changes.** Several directories add local rules in their own
`AGENTS.md` — `src/hevy/`, `src/engine/` and `src/auth/`.

The essentials, so that a short session does not go wrong before it gets there:

- **Package manager is yarn classic (v1).** Never npm, npx or pnpm.
- **Validate every change with `yarn typecheck && yarn test && yarn build`.** There is no
  linter; `yarn lint` does not exist.
- **Local imports need the `.js` extension** (`./tools/read.js`) — the project is ESM with
  `moduleResolution: NodeNext`.
- **Never add a tool that writes workout history.** The server reads history and writes
  only routines. That guarantee is published to users in `docs/CONNECTOR.md`.
- **Never log an API key, token or sealing key.**
- **Hevy's API has no DELETE**, so failed writes are never retried and writes resolve
  every name before sending anything.
- **All arithmetic belongs in `src/engine/`** as pure, fixture-tested functions. The
  server computes the numbers; the model interprets them.
- Add a changeset (`yarn changeset`) for any user-facing change, and never commit to
  `main` directly.
