/** Owner motion acceptance only. No production activation or deployment grant. */
export const batchCMotionAcceptance = {
  "id": "parallette25-batch-c-motion-acceptance.1",
  "reviewId": "parallette25-batch-c-review.1",
  "acceptedOn": "2026-10-17",
  "ownerMotionAcceptance": "accepted",
  "ownerStatement": "The six Batch C animations look good.",
  "candidateFingerprint": "808ebaac4d681a06bdb36da51555f868645b7759b8eac09c81195ea74ac330b3",
  "motionFingerprints": {
    "freestanding-parallette-weight-shift": "71877d220a6c1ddfa8625d25468b352fbacc46e05af72dbf5f7c2410e657e237",
    "freestanding-parallette-one-hand-light-balance": "fed42f08ae4c011ce13136de76d09cee8440245eed3df1800f0e48ef9a989b6e",
    "freestanding-parallette-hspu-eccentric": "e5ec08b8a9e9fd52ab2317974b244919670be868c906fb98a72b10e29caca072",
    "partial-freestanding-parallette-hspu": "75b04142fd2b5f85df522b7a691ae7544b8eebc0ef825b0d00d315c0d0031f17",
    "freestanding-parallette-hspu": "7c3d880513042ad64961959f96f7fd77ffe2f7534c995b31aa6fd16b81eea567",
    "deficit-freestanding-parallette-hspu": "86081467b980e397cc1ef7eece3dbf0491bd7fd6e03e3807f0b4ac6023b51b09"
  },
  "reviewManifestSha256": "5ff1b03731beb22ad3d3677037d57f71d4af086b57b6961656e84fe27603406e",
  "productionEnabled": false,
  "deploymentTiming": "after-all-progression-batches-complete",
  "ownerDeploymentInstruction": "Keep deployment on hold until all batches are finished."
} as const;
