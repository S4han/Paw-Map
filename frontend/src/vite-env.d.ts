/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_KAKAO_JS_KEY?: string
  readonly VITE_DATASET_BASE?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
