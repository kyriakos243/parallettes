/** Exact candidate for owner motion review; no production grant. */
export const batchEReviewManifest = {
  "id": "parallette25-batch-e-review.1",
  "status": "review-ready",
  "ownerAcceptance": "pending",
  "productionEnabled": false,
  "catalogueVersion": 7,
  "projectionVersion": 7,
  "candidateFingerprint": "78962b4e6b9d96c62a4e37e7765c289770daad1a2e6b4f2bcaccff0475890c3b",
  "motionFingerprints": {
    "extended-v-sit-hold": "362e9521c6d54c37bd97ae35e13c0a157f5cf0ef3cc9774eb1db6bb425eed08b",
    "assisted-one-arm-parallette-balance": "8891a6852ecd248a8e2f38d4ce3b0011bd935fdf6f8cb648fa5e001c6b5df249",
    "one-arm-parallette-handstand": "e79bdb319342dfaab74d7bd267c650ce34eb208976f7ad1d591194d18888099c",
    "repeated-straddle-press-to-handstand": "200d9d5d789dccf8adada903ccdb8bdd743c20f1e2436d72a18100bd1a948d15",
    "repeated-pike-press-to-handstand": "efb650e1cd98c5cacc5278ba3e30de18a9cb50324b4a4056c6682b63427d3e82"
  },
  "playerSources": {
    "app/MotionGuide.tsx": "1f4b13104ddfbeda46a1c6c470f5f9ed81ae471057bef6bb468581a49e23626e",
    "app/vnext/media/VNextMotionGuide.tsx": "709c0288ccc0925a5f9513569613e88a5e493c4e2941f858d63b85f8abef7c0c",
    "app/vnext/media/phase10OwnedMotion.ts": "c7f4a711790f24be6bf05b128e948821d79cb62e5a06683f20b4e6284978a1fa",
    "app/vnext/releaseCandidate/WorkoutRunner.tsx": "8ddfe588c49e4f67821386b5c42b0ca67cdca6ae500052cf61e001128c49b19c",
    "app/vnext/workoutUx.ts": "31d86801e11345c478d1643aa42453904534195a5832fa7f95b679c650222fd6",
    "app/vnext/ui/phase8.css": "f391ed773213a13fdb947aef9d42daab041b494b7b7540da9196e618366e3faf",
    "app/vnext/releaseCandidate/phase9.css": "96108fe7dc881a174c7c2ed08183d041037e047674d51d6242ec3ac794c1cded",
    "app/vnext/progression/BatchEReview.tsx": "2888325623859f2fb5c7bfdd267d1a0997cf3ad7e64a0f4d969f82c41565f98b",
    "app/vnext/progression/batchEReview.css": "f2fb27144bf9b615d62cc5978b21d02187cd459344fa95da86978d1eb809a033",
    "scripts/batch-e-review-entry.tsx": "8dec352b88cdd8b053cf64dd849236deeccdfa22e77797afe5193022f0d73d2d",
    "scripts/build-vnext-batch-e-review.mjs": "0269cefccce76403d406aa147387404b890bca72f180633385220a3e606f5139",
    "app/vnext/progression/batchEMotion.ts": "f3f29bf6b657d2190ae539009fdfd2e318e3b87e4cf1500ca198d7f2cba442a5"
  }
} as const;
