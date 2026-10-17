/** Exact candidate for owner motion review; no production grant. */
export const batchBReviewManifest = {
  "id": "parallette25-batch-b-review.1",
  "status": "review-ready",
  "ownerAcceptance": "pending",
  "productionEnabled": false,
  "catalogueVersion": 4,
  "projectionVersion": 4,
  "candidateFingerprint": "b196a19f1930bfaca5cb832344db273bc363dcd5926507b6edbd91fc8626bed9",
  "motionFingerprints": {
    "assisted-full-planche-hold": "8a3baa9f9fc78f79780556798635fe8cd62af15a861cee2c9d50036e9c4205fd",
    "full-planche-hold": "4f562a3667e3eb78518c52f9a91bbb369b040a31fd13e13746c6f272a0fd906c",
    "bent-arm-tuck-press-to-handstand": "e52e58387e0078212cb9a0edb13433a3c1b26a980a30c7f4698173735895d6a5",
    "straddle-press-to-handstand": "67e260d8826daa03d6b96c1b6ca35269340e3b85d481f515dd6fdbec39614d4b",
    "pike-press-to-handstand": "1c76ba5f5e8c9d911534a1d9a13303bfd296875e0c6e98b17a6ae8a5788ed83c"
  },
  "playerSources": {
    "app/MotionGuide.tsx": "1f4b13104ddfbeda46a1c6c470f5f9ed81ae471057bef6bb468581a49e23626e",
    "app/vnext/media/VNextMotionGuide.tsx": "709c0288ccc0925a5f9513569613e88a5e493c4e2941f858d63b85f8abef7c0c",
    "app/vnext/media/phase10OwnedMotion.ts": "c7f4a711790f24be6bf05b128e948821d79cb62e5a06683f20b4e6284978a1fa",
    "app/vnext/releaseCandidate/WorkoutRunner.tsx": "8ddfe588c49e4f67821386b5c42b0ca67cdca6ae500052cf61e001128c49b19c",
    "app/vnext/workoutUx.ts": "31d86801e11345c478d1643aa42453904534195a5832fa7f95b679c650222fd6",
    "app/vnext/ui/phase8.css": "f391ed773213a13fdb947aef9d42daab041b494b7b7540da9196e618366e3faf",
    "app/vnext/releaseCandidate/phase9.css": "96108fe7dc881a174c7c2ed08183d041037e047674d51d6242ec3ac794c1cded",
    "app/vnext/progression/BatchBReview.tsx": "26d7720febf533ff7dbc1f48eb891924c41b55c10b266a3f27a33623e5da8ae7",
    "app/vnext/progression/batchBReview.css": "26cd5389aeec298b76dadfcc25695bdd43608ef24f58a3fd4fa60908b671cbd6",
    "scripts/batch-b-review-entry.tsx": "14a9ae8a702355ae20d29dda0c68204767918a1afd83d321b69f8e61194a7e9d",
    "scripts/build-vnext-batch-b-review.mjs": "3017c2a54f82fddc6e85692210c17541063a65f079b4b0ae76edc0cd6b4e452c"
  }
} as const;
