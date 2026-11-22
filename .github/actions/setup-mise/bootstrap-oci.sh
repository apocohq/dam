#!/usr/bin/env bash
set -euo pipefail
mise_version=2026.11.5
mise_image=ghcr.io/jdx/mise:2026.11.5@sha256:3beda11ba592da44277cac15061103b844c69420a55cb5c41694dc4f2734d0cb
case ${RUNNER_ARCH:?} in
  X64)
    mise_platform=linux/amd64
    expected_sha=bf1d8c76f631318df901450cfadc740fa693c733b29844a1e8b12b278cddb4e3
    ;;
  ARM64)
    mise_platform=linux/arm64
    expected_sha=860314b72da022d4bbc661b174bbf51f72ce457eb25e3626035bc590016cc0f9
    ;;
  *) echo 'Unsupported architecture for the pinned Mise OCI bootstrap' >&2; exit 1 ;;
esac
container_id=
scratch_file=
cleanup() {
  if [[ -n $container_id ]]; then docker rm "$container_id" >/dev/null || true; fi
  if [[ -n $scratch_file ]]; then rm -f -- "$scratch_file"; fi
}
trap cleanup EXIT
container_id=$(docker create --platform "$mise_platform" "$mise_image")
scratch_file=$(mktemp "${RUNNER_TEMP:-${TMPDIR:-/tmp}}/mise-bootstrap.XXXXXX")
docker cp "$container_id:/usr/local/bin/mise" "$scratch_file"
printf '%s  %s\n' "$expected_sha" "$scratch_file" | sha256sum --check --status
mise_root=${MISE_DATA_DIR:-${XDG_DATA_HOME:-$HOME/.local/share}/mise}
install -d "$mise_root/bin"
install -m 0755 "$scratch_file" "$mise_root/bin/mise"
printf '%s\n' "$mise_version" > "$mise_root/bin/mise-version"
printf 'sha256=%s\n' "$expected_sha" >> "${GITHUB_OUTPUT:?}"
echo "Installed verified Mise $mise_version from its pinned official OCI image"
