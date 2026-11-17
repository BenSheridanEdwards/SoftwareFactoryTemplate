# 130. Marked parses PR body sections

- **Status:** Proposed (the maintainer accepts it by approving the PR)
- **Date:** 2026-11-17
- **Amends:** [0020](0020-pr-process-checks.md) for Markdown section parsing

## Context

The PR body validator treats every ATX-looking line as a section boundary.
Shell comments inside fenced code therefore hide valid verification fields.
A custom fence scanner also needs list indentation, inline code across lines,
escapes and Markdown block precedence. Independent review found regressions
in these cases while fixing issues #378, #379 and #382.

## Decision

Use `marked` as a root development dependency to lex the PR body into Markdown
blocks. Only top-level ATX heading tokens start sections. Append other tokens'
raw Markdown to the current section, retaining source for the existing proof
and verification checks. Keep the whole-body local-path scan on the original
input. Produce no HTML and execute no embedded content. Extend the existing
Jest ESM transform allowlist to include `marked`, so the same production lexer
runs in the tooling tests.

The [Marked lexer documentation](https://marked.js.org/using_pro) describes
heading tokens, their raw source and the lexer API. Its Node requirement fits
the repository's Node floor. The normal seven-day release age, lockfile,
dependency ADR, license and security gates apply to the added dependency.

## Alternatives

Keep a handwritten scanner: this retains a small dependency graph, but makes
the gate own a second Markdown grammar. The reproduced regressions show that
cost. A Markdown renderer would do work the validator does not need.

## Consequences

The root toolchain gains one dependency. Application bundles stay unchanged.
Regression tests pin fence, list, comment, escape and code-span cases against
the validator's public result. Revert this ADR and dependency together with
the parser change to restore the previous section boundary implementation.
