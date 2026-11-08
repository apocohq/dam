#!/usr/bin/env bash
set -euo pipefail
mise_version=2026.10.5
mise_image=ghcr.io/jdx/mise:2026.10.5@sha256:b71dc43c283ed85e04ce73a586bc004bd94ade5099c6011e8fb1c75d8b921663
case ${RUNNER_ARCH:?} in
  X64)
    mise_platform=linux/amd64
    expected_sha=3e1ed8c0b2741469ca7482b8975fdfbd270bd4c18f3e478fc30cc042a65f63ac
    ;;
  ARM64)
    mise_platform=linux/arm64
    expected_sha=8815f6c50f553a5d9813c84af5093f6155d41ef0e7cab39c8b927217bfe65f2e
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
