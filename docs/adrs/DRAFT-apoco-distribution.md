---
title: Apoco distribution and upstream contributions
status: proposed
subsystem: agent-images
tags: [release, fork]
summary: Publish immutable Apoco candidates from a small fork while contributing product changes upstream and deploying through Brainio GitOps.
---

# Apoco distribution and upstream contributions

**Date:** 2026-11-04
**Status:** Proposed
**Owner:** @ondrej-svec

## Decision

Maintain an Apoco fork with upstream-aligned main and a separate deployable integration branch.
Publish immutable Apoco chart and image candidates, then deploy their chart digest through Brainio's existing GitOps repository.
Contribute reusable product changes upstream from feature branches without Apoco publishing changes.

## Context

Brainio's AWS installation consumes a pinned upstream DAM chart.
The subscription feature needs live validation before upstream acceptance, and the owner cannot publish to upstream's registry.
The owner approved an Apoco fork, separate publishing, and an upstream contribution after testing.

## Consequences

- **Easier:** Apoco can test a candidate without waiting for an upstream release.
- **Harder:** The fork owns registry packages, build costs and integration tests while its patches remain downstream.
- **Committed-to:** Production continues to change only through reviewed Brainio configuration and immutable chart digests.
- **Committed-to:** Track local product patches upstream and retire the downstream distribution when no product patches require it.

## Alternatives Considered

- **Wait for upstream release** — prevents live testing on Apoco's schedule.
- **Patch running workloads** — bypasses the GitOps configuration and gives no complete, reproducible chart release.
