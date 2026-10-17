/** Owner motion acceptance only. No production activation or deployment grant. */
export const batchBMotionAcceptance = {
  "id": "parallette25-batch-b-motion-acceptance.1",
  "reviewId": "parallette25-batch-b-review.1",
  "acceptedOn": "2026-10-17",
  "ownerMotionAcceptance": "accepted",
  "ownerStatement": "The five Batch B animations look good.",
  "candidateFingerprint": "b196a19f1930bfaca5cb832344db273bc363dcd5926507b6edbd91fc8626bed9",
  "motionFingerprints": {
    "assisted-full-planche-hold": "8a3baa9f9fc78f79780556798635fe8cd62af15a861cee2c9d50036e9c4205fd",
    "full-planche-hold": "4f562a3667e3eb78518c52f9a91bbb369b040a31fd13e13746c6f272a0fd906c",
    "bent-arm-tuck-press-to-handstand": "e52e58387e0078212cb9a0edb13433a3c1b26a980a30c7f4698173735895d6a5",
    "straddle-press-to-handstand": "67e260d8826daa03d6b96c1b6ca35269340e3b85d481f515dd6fdbec39614d4b",
    "pike-press-to-handstand": "1c76ba5f5e8c9d911534a1d9a13303bfd296875e0c6e98b17a6ae8a5788ed83c"
  },
  "reviewManifestSha256": "a97ac12e580df8f2e7ad123e858873ed4a58235c5f3acd1c4004291eefd7a8fb",
  "productionEnabled": false,
  "deploymentTiming": "after-all-progression-batches-complete",
  "ownerDeploymentInstruction": "deployment would happen once all batches will finished"
} as const;
