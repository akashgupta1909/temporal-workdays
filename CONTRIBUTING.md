# Contributing

Thanks for helping! Bug reports, failing cases and pull requests are all welcome.

## Setup

```sh
git clone https://github.com/akashgupta1909/temporal-workdays.git
cd temporal-workdays
npm ci
npm run check   # everything CI runs: types, lint, format, tests (100% coverage), build, package lint, size, smoke
```

Node.js 22+ is needed for development (the published package supports Node 18+).

## How the code is tested

Correctness is the point of this library, so changes come with tests of the same kind:

- **Reference models** — property tests (fast-check) compare the real implementation with deliberately naive ones:
  a day-by-day workday walk, a minute-by-minute working-time walk, and a Temporal-only oracle around real DST
  transitions. A new behaviour should get a property, not just examples.
- **Real-world oracles** — holiday rules are checked against `date-holidays` data, and the migration guides against
  the real `moment-business-days`, `luxon-business-days` and `date-fns`.
- **Executable docs** — every `ts` code block in the README runs in the test suite, and each `expr; // → value` line is
  asserted.
- **Coverage** is held at 100%. Unreachable branches are removed rather than excluded.

Useful commands:

| Command                 | What it does                                        |
| ----------------------- | --------------------------------------------------- |
| `npm test`              | tests with coverage                                 |
| `FC_SCALE=10 npm test`  | 10× more property-test cases (run before a release) |
| `npm run test:watch`    | watch mode                                          |
| `npm run test:mutation` | mutation testing (Stryker); slow                    |
| `npm run bench`         | benchmark against moment-business-days              |

## Pull requests

- Keep the public API backward compatible unless the change is discussed in an issue first.
- Add a line to `CHANGELOG.md` under the unreleased version.
- `npm run check` must pass.

## Releasing (maintainers)

1. Move the `CHANGELOG.md` entries under the new version and bump `version` in `package.json`.
2. Commit, then tag and push: `git tag v0.4.0 && git push origin main --tags`.
3. The [Release workflow](.github/workflows/release.yml) checks everything, publishes to npm with provenance and
   creates the GitHub Release from the changelog.
