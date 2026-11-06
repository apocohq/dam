# Apoco distribution

The Apoco fork publishes tested candidates for Brainio's AWS installation while reusable features are contributed upstream.
Its `main` branch follows upstream; `apoco` is the integration branch and the repository's default branch.
Feature branches start from upstream and contain no Apoco publishing changes.
Pull requests into `apoco` run checks, unit tests and the reduced end-to-end suite with read-only permissions.
Repository settings live in `.github/settings`: integration requires a pull request and passing checks, and the upstream mirror cannot be deleted or rewritten.
Product patches record an independent model review in the pull request; an additional human approval is not required.
The subscription feature has its own draft upstream pull request until live account testing passes.

On `apoco`, the upstream CI/CD entry point is restricted to the upstream repository.
The `main` mirror keeps upstream's workflow definitions, which lack that repository restriction.
Keep the inherited `cd.yml` workflow disabled for the whole fork in Actions settings, including during mirror updates.
Keep `apoco-ci.yml` and `apoco-release.yml` enabled.
Confirm the target commit is on upstream's `main`, then fast-forward the fork's mirror to it.
Integrate that commit through a pull request into `apoco`.
Preserve the Apoco workflow guards when resolving that merge.
Apoco publishes only through the manually dispatched **Apoco candidate** workflow, from `apoco`.
The workflow reuses DAM's build and check tasks, publishes compiled DAM components to `ghcr.io/apocohq/dam`, and publishes the chart only after the complete build and both end-to-end gateway lanes succeed.
The chart and its starter kits use the Apoco namespace for DAM components and retain upstream's public third-party dependency images.
The publisher verifies those dependencies exist and records their digests in the release manifest.
Trusted manual builds on `apoco` save build caches; pull-request checks cannot write those caches.
Checks fetch upstream release tags for the existing CRD compatibility gate, and candidates also compare CRDs against Brainio's deployed build.
There is no npm CLI publication and no automatic production deployment.
The source fork and Helm chart are public; compiled executable images remain private.
After the first chart publication, set only the `dam/charts/platform` package to public in GitHub Packages.
Keep the compiled component packages private so AWS still authenticates their pulls.
GitHub Actions uses its repository token; installations use a dedicated read-only registry credential provisioned through AWS secret management.
Platform pods and VM image pullers need that credential before an installation can consume a candidate.
The public chart lets CI and local stacks render the same pinned version without registry credentials.
Use the repository-scoped Actions token to publish; do not create a registry password or give this workflow AWS credentials.

Choose a new chart version such as `0.3.0-apoco.1`, matching the upstream base version.
Existing chart versions cannot be replaced by the release task.
The workflow artifact contains the chart and a release manifest with the source commit, chart digest, and image digests.
A failed build publishes no chart; published intermediate image tags are not a deployment.

Run the release checks and rehearse the database migration before upgrading the installation chosen by the operator.
Brainio's existing DAM is the integration target for subscription device login, web chat, Slack, and API-provider regression checks after rollout.
Take a fresh database backup before its chart pin changes, and record the restore point with the deployment.
AWS currently runs an older upstream development chart, so a successful fresh install alone does not verify its upgrade path.
The production change belongs in Brainio: update its DAM OCI repository URL, chart version and digest through a pull request.
Flux applies that reviewed change; never patch the running Deployments around Flux.
Keep the prior chart digest for rollback, and assess database migration reversibility before reverting a release.
An image rollback alone does not reverse database migrations.
If restoration is needed, restore only DAM's and Keycloak's databases from a separate database clone; Brainio's other databases share the instance.

Integrate upstream through reviewed changes to `apoco`, keeping local publishing changes separate from product patches.
Track each product patch's upstream pull request and test upstream's replacement before returning deployments to upstream artifacts.
