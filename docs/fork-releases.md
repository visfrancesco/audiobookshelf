# VFH fork releases

The fork publishes `ghcr.io/visfrancesco/audiobookshelf` for `linux/amd64` and `linux/arm64`. Release tags use `v<server-version>-vfh.<revision>`, beginning with `v2.36.1-vfh.1`; the image tag omits the leading `v`. This distinguishes fork builds from upstream releases without changing ABS's database migration version.

## Release procedure

1. Open a PR to `master`, review it, fix blocking findings and pass the unit, integration, API lint and container checks.
2. Merge the reviewed commit into `master`.
3. Create and push an annotated release tag at that merged commit. Do not move published tags.
4. The **Build and Publish Fork Image** workflow tests the server and Python adapter, builds and smoke-tests the amd64 container, then publishes amd64/arm64 images using `GITHUB_TOKEN`. No upstream Docker Hub or GHCR credentials are needed. Publication rejects a tag with the wrong server version or a commit outside `master`.
5. Wait for publication to succeed. Download `release-image-reference` from that run; it contains the versioned image plus its immutable multi-platform digest.
6. Publish a GitHub release with that reference, setup instructions, validation evidence and migration/rollback notes. Container publication is the deployment artifact; creating a source-code release alone is insufficient.

GitHub defaults a newly published package to private. Make the package public in its settings for unauthenticated infrastructure pulls, or deliberately configure a registry credential with `read:packages`. Repository visibility alone does not make the image public. See [GitHub's container registry documentation](https://docs.github.com/en/packages/working-with-a-github-packages-registry/working-with-the-container-registry). Verify the pull mode the deployment will actually use before rollout.

## Consuming the release from vfh-infra

The existing `ansible/roles/audiobookshelf/templates/compose.yml.j2` combines `audiobookshelf_image` and `audiobookshelf_version`. Set these through a reviewed infrastructure change:

```yaml
audiobookshelf_image: ghcr.io/visfrancesco/audiobookshelf
audiobookshelf_version: "2.36.1-vfh.1"
```

For an immutable pin, use `"2.36.1-vfh.1@sha256:<published-manifest-digest>"` as the version. The generated Compose image is then `ghcr.io/visfrancesco/audiobookshelf:2.36.1-vfh.1@sha256:...`. Keep the current config, metadata, audiobook and podcast mounts. Video support stays disabled until configured; changing the image does not enable video imports or modify Pinchflat subscriptions.

Before enabling video, add a read-only mount for Pinchflat's video originals and a shared writable completion inbox, and follow [the video setup guide](video-podcasts.md). The current infrastructure only mounts Pinchflat audio into ABS. Use final file paths relative to the video root and configure a matching lifecycle adapter in Pinchflat. Account for the existing shared 2-CPU/2-GB host and root-disk capacity when choosing the audio segment budget.

Back up the 2.36.0 ABS database/config before the first fork upgrade. The 2.36.1 migration stores video source descriptors and durable import records. Rollback requires the pre-upgrade database and the previous image together; downgrading the image alone is unsupported. Pinchflat owns the original files and its retention still determines their availability.

Publishing this release does not execute Ansible or change the running `books-01` service. Native AudioAtlas build and physical-device/real-Pinchflat acceptance remain separate release checks for enabling the new playback experience.
