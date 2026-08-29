const expectedProfileApiOrigin = "https://parallette25-profile-api.kyriakos243.workers.dev";
const configured = process.env.VITE_PROFILE_API_URL?.replace(/\/$/u, "");

if (configured !== expectedProfileApiOrigin) {
  throw new Error(`VITE_PROFILE_API_URL must equal ${expectedProfileApiOrigin} for the production lane.`);
}

console.log("vNext production environment is bound to the exact profile API origin.");
