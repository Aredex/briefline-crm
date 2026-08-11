/// <reference types="vite/client" />

interface ImportMetaEnv {
  /** Enable MSW dev mocks (only honored when import.meta.env.DEV). */
  readonly VITE_ENABLE_MOCKS?: 'true' | 'false'
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
