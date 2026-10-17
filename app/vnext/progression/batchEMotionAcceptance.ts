/** Owner motion acceptance only. No production activation or deployment grant. */
export const batchEMotionAcceptance = {
  "id": "parallette25-batch-e-motion-acceptance.1",
  "reviewId": "parallette25-batch-e-review.1",
  "acceptedOn": "2026-10-17",
  "ownerMotionAcceptance": "accepted",
  "ownerStatement": "The five Batch E animations look good.",
  "candidateFingerprint": "78962b4e6b9d96c62a4e37e7765c289770daad1a2e6b4f2bcaccff0475890c3b",
  "motionFingerprints": {
    "extended-v-sit-hold": "362e9521c6d54c37bd97ae35e13c0a157f5cf0ef3cc9774eb1db6bb425eed08b",
    "assisted-one-arm-parallette-balance": "8891a6852ecd248a8e2f38d4ce3b0011bd935fdf6f8cb648fa5e001c6b5df249",
    "one-arm-parallette-handstand": "e79bdb319342dfaab74d7bd267c650ce34eb208976f7ad1d591194d18888099c",
    "repeated-straddle-press-to-handstand": "200d9d5d789dccf8adada903ccdb8bdd743c20f1e2436d72a18100bd1a948d15",
    "repeated-pike-press-to-handstand": "efb650e1cd98c5cacc5278ba3e30de18a9cb50324b4a4056c6682b63427d3e82"
  },
  "reviewManifestSha256": "4aa40f28c10002ab996900f3c742413df18c9377b9d84aa9304591840606deaf",
  "productionEnabled": false,
  "deploymentTiming": "after-all-progression-batches-complete",
  "ownerDeploymentInstruction": "Keep deployment on hold until all batches are finished."
} as const;
