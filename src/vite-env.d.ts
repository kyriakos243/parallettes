/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_PROFILE_API_URL?: string;
  readonly VITE_VNEXT_RC_ENABLED?: string;
  readonly VITE_VNEXT_RC_ID?: string;
  readonly VITE_VNEXT_PRODUCTION_ENABLED?: string;
  readonly VITE_VNEXT_PRODUCTION_ID?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
