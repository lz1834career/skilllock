# skilllock demo project

Minimal runnable example: init → lock → check → reproduce.

## Layout

```
examples/demo-project/
├── .cursor/skills/          # installed skills
├── skills.lock.yaml         # lockfile v2
├── skilllock.policy.yaml
├── skills.test.yaml
├── .skilllock-sources.yaml
└── .github/workflows/       # CI example
```

## Try locally

From the repository root:

```bash
npm run build
node dist/cli.js init --project examples/demo-project --force
node dist/cli.js lock --project examples/demo-project
node dist/cli.js check --project examples/demo-project --skip-tests
```

From the demo directory (with skilllock installed):

```bash
cd examples/demo-project
npx skilllock check
npx skilllock tree
npx skilllock graph
npx skilllock why demo-skill
```

## CI

`.github/workflows/skilllock-ci.yml` shows monorepo install from source. Standalone repos can use `lz1834career/skilllock/action@v1.1.0` or `npm install -D skilllock`.
