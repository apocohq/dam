# Apoco distribution

The Apoco fork publishes tested candidates for Brainio's AWS installation while reusable features are contributed upstream.
Its `main` branch follows upstream; `apoco` is the integration branch and the repository's default branch.
Feature branches start from upstream and contain no Apoco publishing changes.
Pull requests into `apoco` run checks, unit tests and the reduced end-to-end suite with read-only permissions.
The subscription feature has its own draft upstream pull request until live account testing passes.

The upstream CI/CD entry point is restricted to the upstream repository.
Apoco publishes only through the manually dispatched **Apoco candidate** workflow, from `apoco`.
The workflow reuses DAM's build and check tasks, publishes all component and mirrored images to `ghcr.io/apocohq/dam`, and publishes the chart only after the complete build and both end-to-end gateway lanes succeed.
The chart and its starter kits use the Apoco image namespace.
There is no npm CLI publication and no automatic production deployment.
Registry packages must allow public pulls before a test installation can consume a candidate.
Use the repository-scoped Actions token to publish; do not create a registry password or give this workflow AWS credentials.

Choose a new chart version such as `0.2.25-apoco.1`, matching the upstream base version.
Existing chart versions cannot be replaced by the release task.
The workflow artifact contains the chart and a release manifest with the source commit, chart digest, and image digests.
A failed build publishes no chart; published intermediate image tags are not a deployment.

Test the candidate in a separate installation, including upgrade compatibility, native device login, web chat, Slack, and API-provider regression checks.
AWS currently runs an older upstream development chart, so a successful fresh install alone does not verify its upgrade path.
The production change belongs in Brainio: update its DAM OCI repository URL, chart version and digest through a pull request.
Flux applies that reviewed change; never patch the running Deployments around Flux.
Keep the prior chart digest for rollback, and assess database migration reversibility before reverting a release.

Integrate upstream through reviewed changes to `apoco`, keeping local publishing changes separate from product patches.
Track each product patch's upstream pull request and test upstream's replacement before returning deployments to upstream artifacts.
