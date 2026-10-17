/** Exact candidate for owner motion review; no production grant. */
export const batchCReviewManifest = {
  "id": "parallette25-batch-c-review.1",
  "status": "review-ready",
  "ownerAcceptance": "pending",
  "productionEnabled": false,
  "catalogueVersion": 5,
  "projectionVersion": 5,
  "candidateFingerprint": "808ebaac4d681a06bdb36da51555f868645b7759b8eac09c81195ea74ac330b3",
  "motionFingerprints": {
    "freestanding-parallette-weight-shift": "71877d220a6c1ddfa8625d25468b352fbacc46e05af72dbf5f7c2410e657e237",
    "freestanding-parallette-one-hand-light-balance": "fed42f08ae4c011ce13136de76d09cee8440245eed3df1800f0e48ef9a989b6e",
    "freestanding-parallette-hspu-eccentric": "e5ec08b8a9e9fd52ab2317974b244919670be868c906fb98a72b10e29caca072",
    "partial-freestanding-parallette-hspu": "75b04142fd2b5f85df522b7a691ae7544b8eebc0ef825b0d00d315c0d0031f17",
    "freestanding-parallette-hspu": "7c3d880513042ad64961959f96f7fd77ffe2f7534c995b31aa6fd16b81eea567",
    "deficit-freestanding-parallette-hspu": "86081467b980e397cc1ef7eece3dbf0491bd7fd6e03e3807f0b4ac6023b51b09"
  },
  "playerSources": {
    "app/MotionGuide.tsx": "1f4b13104ddfbeda46a1c6c470f5f9ed81ae471057bef6bb468581a49e23626e",
    "app/vnext/media/VNextMotionGuide.tsx": "709c0288ccc0925a5f9513569613e88a5e493c4e2941f858d63b85f8abef7c0c",
    "app/vnext/media/phase10OwnedMotion.ts": "c7f4a711790f24be6bf05b128e948821d79cb62e5a06683f20b4e6284978a1fa",
    "app/vnext/releaseCandidate/WorkoutRunner.tsx": "8ddfe588c49e4f67821386b5c42b0ca67cdca6ae500052cf61e001128c49b19c",
    "app/vnext/workoutUx.ts": "31d86801e11345c478d1643aa42453904534195a5832fa7f95b679c650222fd6",
    "app/vnext/ui/phase8.css": "f391ed773213a13fdb947aef9d42daab041b494b7b7540da9196e618366e3faf",
    "app/vnext/releaseCandidate/phase9.css": "96108fe7dc881a174c7c2ed08183d041037e047674d51d6242ec3ac794c1cded",
    "app/vnext/progression/BatchCReview.tsx": "8ea1fed01ab40cca567053bc9c05a40a5638a8d676a163bd31e1f84d61618642",
    "app/vnext/progression/batchCReview.css": "f3e33cbde6be2114475e94c81ac23ccb27b92f51813da21c600417ed3f9d9715",
    "scripts/batch-c-review-entry.tsx": "edbfc414ce0f3e0eac8009e67709ef07d554e3b01619499f67d404b10e738d0a",
    "scripts/build-vnext-batch-c-review.mjs": "6cf1dcca45daf1f0094936d17874c11422e72c5b317e8e5f2cd83cffd8808112"
  }
} as const;
