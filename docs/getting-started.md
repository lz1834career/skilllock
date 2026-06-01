# Getting started

## Install

Recommended via npm ([skilllock@1.1.0](https://www.npmjs.com/package/skilllock)):

```bash
npm install -D skilllock
npx skilllock --help
```

Without adding to `package.json`:

```bash
npx skilllock@1.1.0 init
npx skilllock@1.1.0 lock
```

## Five-minute workflow

```bash
# 1. Scaffold policy, tests, sources, gitignore, workflow templates
skilllock init

# 2. Import source mappings (optional)
skilllock import

# 3. List installed skills
skilllock scan

# 4. Generate lockfile
skilllock lock

# 5. CI gate
skilllock check
```

## Reproduce on a new machine

```bash
git clone <repo>
cd project
npm install   # if skilllock is in devDependencies
skilllock reproduce
skilllock verify
```

Offline: on a connected machine run `skilllock lock --snapshot`, commit `.skilllock/snapshots/`, then `skilllock reproduce` offline.

## GitHub Action

Add this workflow for PR/push checks (`init` does **not** create it; it only scaffolds weekly drift and auto-upgrade workflows):

```yaml
name: skilllock-check
on: [pull_request, push]

jobs:
  skilllock:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: lz1834career/skilllock/action@v1.1.0
        with:
          command: check
          skip-tests: "true"   # remove when skills.test.yaml has cases
```

Monorepo example: `examples/demo-project/.github/workflows/skilllock-ci.yml`.

## Policy file

`skilllock init` writes `skilllock.policy.yaml`:

```yaml
drift:
  failOn: true
untracked:
  failOn: true
audit:
  failOn: warning
  denyRules: [hidden-instruction, unicode-obfuscation]
```

## Develop skilllock from source

```bash
git clone https://github.com/lz1834career/skilllock.git
cd skilllock
npm ci
npm run build
npm install -g .
skilllock --version
```

## Next steps

- [Command reference](./commands.md)
- [Ecosystem comparison](./ecosystem.md)
