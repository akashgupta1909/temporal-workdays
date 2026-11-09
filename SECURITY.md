# Security policy

## Supported versions

Security fixes are released for the latest minor version. `temporal-workdays` has no runtime dependencies, so a fix
never waits on another package.

## Reporting a vulnerability

Please **don't open a public issue**. Report it privately through GitHub:
[Report a vulnerability](https://github.com/akashgupta1909/temporal-workdays/security/advisories/new).

Include what you found, how to reproduce it, and which versions are affected. You'll get a reply within 7 days. Once a
fix is released, the advisory is published with credit to you unless you prefer otherwise.

## How releases are made

Releases are built and published by GitHub Actions from a tagged commit, using npm trusted publishing (no long-lived
npm token exists) with [provenance](https://docs.npmjs.com/generating-provenance-statements), so you can verify that a
version on npm was built from this repository: `npm audit signatures`.
