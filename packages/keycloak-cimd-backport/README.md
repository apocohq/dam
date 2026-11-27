# Keycloak CIMD backport

Keycloak 26.8.2 rejects unknown client metadata, including the optional field Pi publishes.
This package backports only the production change in [keycloak/keycloak#51235](https://github.com/keycloak/keycloak/pull/51235), commit `3ae27d6573a41facc37d7d697ec158fe53944eaf`.
The vendored executor comes from [Keycloak 26.8.2](https://github.com/keycloak/keycloak/blob/26.8.2/services/src/main/java/org/keycloak/protocol/oauth2/cimd/clientpolicy/executor/AbstractClientIdMetadataDocumentExecutor.java), commit `e514445f9dcdabc5bdcf67cab56c1e49655de067`, under the included Apache-2.0 license.
Its only behavior changes are that upstream patch; its first line records the modification.

The CIMD-specific mapper ignores unknown metadata as RFC 7591 requires.
The shared mapper, known-field validation, response-size limit, realm policy and client permissions are unchanged.

## Build boundary

`mise run //packages/keycloak-cimd-backport:build` compiles against Keycloak 26.8.2 and runs the HTTP fetch/parser tests.
`mise run //packages/keycloak-cimd-backport:apply -- <keycloak-home>` replaces the executor classes in that version's services JAR.
It refuses a tree without the expected versioned JAR or whose JAR has different contents.
The pinned SHA-256 matches both Maven Central's 26.8.2 services JAR and the pinned upstream image.

The existing Keycloak image task applies the patch to its scratch tree before Quarkus augmentation and includes the patched services JAR in the image.
The backport is not a provider JAR: a duplicate class in the providers directory would not reliably replace Keycloak's own class.
The cached upstream image is never modified.

`mise run //packages/keycloak-cimd-backport:test` also checks that image patching replaces the compiled classes and refuses another version without changing its JAR.
That includes a real 26.8.0 JAR under the expected 26.8.2 filename.
The metadata tests use a real loopback HTTP server and Keycloak's real fetch/decoder; only session/provider wiring is stubbed.
They cover Pi-style extensions, malformed JSON, invalid known-field types, identity and authentication restrictions, the size limit, and the shared mapper's strictness.
The original 26.8.2 executor fails the extension case.

The consuming installation must additionally prove native Pi sign-in, refresh and host restrictions against the built image.
A parser test is not that end-to-end proof.

## Removal

Remove this package and its image-task integration once the pinned stable Keycloak release contains the upstream fix and the same acceptance cases pass.
Do not silently carry these replacement classes onto another Keycloak version.
