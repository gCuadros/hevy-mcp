# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## 0.1.0

### Minor Changes

- ac2d9aa: Add analytics tools (get-progress, get-records, get-volume-report, get-consistency, compare-periods) and MCP prompts (weekly-review, program-audit, deload-check, prepare-session). This completes v1 local: sync, cache, read tools, resources, and analytics are all wired into the stdio server.

### Patch Changes

- 404a2f1: Add analytics engine (e1RM, records, volume, consistency, compare) as a pure internal library. Not yet exposed as MCP tools — that lands once the read-tools branch (F3) is merged.
- 4c9b5fc: Add repo foundations: CLAUDE.md, gitignore, changesets, yarn, and the first Hevy API client with cache/sync.
