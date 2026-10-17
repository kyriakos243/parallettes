/** Owner motion acceptance; production release is granted separately. */
export const batchFMotionAcceptance = {
  "id": "parallette25-batch-f-motion-acceptance.1",
  "reviewId": "parallette25-batch-f-review.1",
  "acceptedOn": "2026-10-17",
  "ownerMotionAcceptance": "accepted",
  "ownerStatement": "The five Batch F animations look good.",
  "candidateFingerprint": "719f6e6df825b8ebea006478b2f2ae91628e7944cc1f7243bbb2cda6f34a19fc",
  "motionFingerprints": {
    "full-planche-push-up-eccentric": "c6740f0ff0faec4dd1a4a255cbca042024bca5927ebf92a3c11db2768238feeb",
    "full-planche-push-up": "291c88f9cb846a7333dcf8723e2b775f6bf608a6c757253928693256b01eff08",
    "ninety-degree-parallette-hspu": "98dccfe41e416f5fff7ff530a75093e0414bd86374dec9f5378b07a22d54271e",
    "full-planche-to-handstand-transition": "97969861559e6a8d4094888fd0b7d0bf397eb87767e1e65462e6964b97ce6483",
    "ninety-degree-handstand-to-planche-transition": "0377ade8e7a2eeb950076f29dba0e05cc1ffb96173e0706643c08159d31a0947"
  },
  "reviewManifestSha256": "76e01b9a6076443823880a0403d3d90e8ec220f080dbcc6b38d281b7a1b432b7",
  "productionEnabled": false,
  "deploymentTiming": "after-all-progression-batches-complete",
  "ownerDeploymentInstruction": "Go ahead with the combined release checks, then deploy once everything passes."
} as const;
