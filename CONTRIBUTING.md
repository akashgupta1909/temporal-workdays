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

- Property tests (fast-check) compare the real implementation with deliberately simple reference models: a day by
  day workday walk, a minute by minute working time walk, and an oracle that uses only Temporal around real DST
  transitions. New behaviour should come with a property test, not only examples.
- Holiday rules are checked against `date-holidays` data, and the migration guides against the real
  `moment-business-days`, `luxon-business-days` and `date-fns`.
- Every `ts` code block in the README and in `docs/` runs in the test suite, and each `expression; // → value` line is
  asserted. Use `typescript` as the code block language for code that can't run there.
- Coverage is kept at 100%. Code that can't be reached is removed rather than excluded.

Useful commands:

| Command                 | What it does                                                   |
| ----------------------- | -------------------------------------------------------------- |
| `npm test`              | tests with coverage                                            |
| `FC_SCALE=10 npm test`  | 10× more property-test cases (run before a release)            |
| `npm run test:watch`    | watch mode                                                     |
| `npm run test:mutation` | mutation testing with Stryker (slow)                           |
| `npm run bench`         | benchmark against moment-business-days and luxon-business-days |
| `npm run test:runtimes` | the tests on Deno, Bun, browsers and Cloudflare Workers        |
| `npm run docs:dev`      | the docs site at localhost:5173                                |

## Pull requests

- Keep the public API backward compatible unless the change is discussed in an issue first.
- Add a line to `CHANGELOG.md` under the unreleased version.
- `npm run check` must pass.

## Releasing (maintainers)

1. Move the `CHANGELOG.md` entries under the new version and bump `version` in `package.json`.
2. Commit, then tag and push: `git tag v0.4.0 && git push origin main --tags`.
3. The [Release workflow](.github/workflows/release.yml) checks everything, publishes to npm with provenance and
   creates the GitHub Release from the changelog.
