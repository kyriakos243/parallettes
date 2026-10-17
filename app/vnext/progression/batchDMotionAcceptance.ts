/** Owner motion acceptance only. No production activation or deployment grant. */
export const batchDMotionAcceptance = {
  "id": "parallette25-batch-d-motion-acceptance.1",
  "reviewId": "parallette25-batch-d-review.1",
  "acceptedOn": "2026-10-17",
  "ownerMotionAcceptance": "accepted",
  "ownerStatement": "The four Batch D animations look good.",
  "candidateFingerprint": "689e543672d2c28d33185765b8d4a302ff737f549b9ed6dd6f7ea83d18dbc805",
  "motionFingerprints": {
    "straddle-l-press-handstand-transition": "858ad1ec563bdb7d174d29d2f5c9ce8e904cc111530b6d06f9287948f3075bda",
    "full-l-pike-press-to-handstand-transition": "3637ae00ee271dbc1d9dfb90210ced7c958fb3e30d9df7aa445b7c0438b59e35",
    "handstand-to-l-sit-negative": "543d4f9096f36260ccb2d97a862313dee3d9d37895f501c4f3c13ab13f978aa8",
    "straddle-planche-to-handstand-press": "2c435f4c529834c768a38b4181acbbd7c93b566976673db68267f84d0be4913b"
  },
  "reviewManifestSha256": "8b8ecba9a47a26fd6adbcaf755c8f5b649b3bd19a4ef82ed36977995cc5649d2",
  "productionEnabled": false,
  "deploymentTiming": "after-all-progression-batches-complete",
  "ownerDeploymentInstruction": "Keep deployment on hold until all batches are finished."
} as const;
