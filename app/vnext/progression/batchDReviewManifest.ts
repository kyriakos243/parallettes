/** Exact candidate for owner motion review; no production grant. */
export const batchDReviewManifest = {
  "id": "parallette25-batch-d-review.1",
  "status": "review-ready",
  "ownerAcceptance": "pending",
  "productionEnabled": false,
  "catalogueVersion": 6,
  "projectionVersion": 6,
  "candidateFingerprint": "689e543672d2c28d33185765b8d4a302ff737f549b9ed6dd6f7ea83d18dbc805",
  "motionFingerprints": {
    "straddle-l-press-handstand-transition": "858ad1ec563bdb7d174d29d2f5c9ce8e904cc111530b6d06f9287948f3075bda",
    "full-l-pike-press-to-handstand-transition": "3637ae00ee271dbc1d9dfb90210ced7c958fb3e30d9df7aa445b7c0438b59e35",
    "handstand-to-l-sit-negative": "543d4f9096f36260ccb2d97a862313dee3d9d37895f501c4f3c13ab13f978aa8",
    "straddle-planche-to-handstand-press": "2c435f4c529834c768a38b4181acbbd7c93b566976673db68267f84d0be4913b"
  },
  "playerSources": {
    "app/MotionGuide.tsx": "1f4b13104ddfbeda46a1c6c470f5f9ed81ae471057bef6bb468581a49e23626e",
    "app/vnext/media/VNextMotionGuide.tsx": "709c0288ccc0925a5f9513569613e88a5e493c4e2941f858d63b85f8abef7c0c",
    "app/vnext/media/phase10OwnedMotion.ts": "c7f4a711790f24be6bf05b128e948821d79cb62e5a06683f20b4e6284978a1fa",
    "app/vnext/releaseCandidate/WorkoutRunner.tsx": "8ddfe588c49e4f67821386b5c42b0ca67cdca6ae500052cf61e001128c49b19c",
    "app/vnext/workoutUx.ts": "31d86801e11345c478d1643aa42453904534195a5832fa7f95b679c650222fd6",
    "app/vnext/ui/phase8.css": "f391ed773213a13fdb947aef9d42daab041b494b7b7540da9196e618366e3faf",
    "app/vnext/releaseCandidate/phase9.css": "96108fe7dc881a174c7c2ed08183d041037e047674d51d6242ec3ac794c1cded",
    "app/vnext/progression/BatchDReview.tsx": "3e51dfc48884ce69c1bbb51d9afeef248ed01b3c974ad2c74bbff1f74bc959ce",
    "app/vnext/progression/batchDReview.css": "7bde7c9510c950247e8344f70514ca0defb934460ea279d5a8f2038d188d1a2c",
    "scripts/batch-d-review-entry.tsx": "d84ed1ef00d06b499857cff2e23e20d35d7abf758c0fd7715413edfacfcbf95c",
    "scripts/build-vnext-batch-d-review.mjs": "0d1bd6b6b6c09ef46048fcaaa0efcc266078b99de1a8e661739c08966bbccda1",
    "app/vnext/progression/batchDMotion.ts": "ea3199abea3ba1ac3a3dc7a28d67d5e2e1180fbeaf3b6d5b4f6f30dd1933ca72"
  }
} as const;
