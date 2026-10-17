/** Exact candidate for owner motion review. This is not a production release grant. */
export const batchAReviewManifest = {
  "id": "parallette25-batch-a-review.1",
  "status": "review-ready",
  "ownerAcceptance": "pending",
  "productionEnabled": false,
  "catalogueVersion": 3,
  "projectionVersion": 3,
  "candidateFingerprint": "01b28dab5f7d6c682f93b89994123b4f2798f8f44c33ebc38f1e1c4b78256e99",
  "motionFingerprints": {
    "parallette-balance-stable-variant": "99ff570272638c62b6db7373ad6a1ca2b8bd428f48392f9a356cfe195f4a5ec7",
    "one-leg-planche-hold": "4fb5774ce71121fc37e25add977abeab088ed91f702a94069b45a22b8d8c3d42",
    "straddle-planche-hold": "63709a8b347df9845532b2ae08ddef21a840aaa7c2e338d1116ba8e2ab65cf2e",
    "v-sit-hold": "b9ee40fea0d9fabb521e47e86cbafd2872c0531e457c6660df7936090cacafe6",
    "deep-forward-loaded-parallette-push-up": "bef897397cbf6ed5f71e0928d67b4b041a9da83a67b42e7a773f24ff1229eee2"
  },
  "playerSources": {
    "app/MotionGuide.tsx": "1f4b13104ddfbeda46a1c6c470f5f9ed81ae471057bef6bb468581a49e23626e",
    "app/vnext/media/VNextMotionGuide.tsx": "709c0288ccc0925a5f9513569613e88a5e493c4e2941f858d63b85f8abef7c0c",
    "app/vnext/media/phase10OwnedMotion.ts": "c7f4a711790f24be6bf05b128e948821d79cb62e5a06683f20b4e6284978a1fa",
    "app/vnext/releaseCandidate/WorkoutRunner.tsx": "8ddfe588c49e4f67821386b5c42b0ca67cdca6ae500052cf61e001128c49b19c",
    "app/vnext/workoutUx.ts": "31d86801e11345c478d1643aa42453904534195a5832fa7f95b679c650222fd6",
    "app/vnext/ui/phase8.css": "f391ed773213a13fdb947aef9d42daab041b494b7b7540da9196e618366e3faf",
    "app/vnext/releaseCandidate/phase9.css": "96108fe7dc881a174c7c2ed08183d041037e047674d51d6242ec3ac794c1cded",
    "app/vnext/progression/BatchAReview.tsx": "7db6c1992f37c377b8e5b94f602646a75593166e573adaef65ac2795d379b086",
    "app/vnext/progression/batchAReview.css": "4fa20721e7cbb77c5250cb49c39e7dcf1f5670a0f9d45566047f25b1dc06300c",
    "scripts/batch-a-review-entry.tsx": "4e4b09f188defef730b7f978100d311804ada558ce0c666919bf3299bd272af4",
    "scripts/build-vnext-batch-a-review.mjs": "2480ccf5f858d3523c29a01e9fe91d35945512acd04b6a7b9702941e45f87ab4"
  }
} as const;
