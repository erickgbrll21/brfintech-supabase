/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_CIELO_API_URL?: string
  readonly VITE_CIELO_MERCHANT_ID?: string
  readonly VITE_CIELO_MERCHANT_KEY?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

