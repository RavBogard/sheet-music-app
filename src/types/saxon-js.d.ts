declare module 'saxon-js' {
  interface TransformOptions {
    stylesheetText?: string
    stylesheetFileName?: string
    sourceText?: string
    sourceFileName?: string
    destination?: string
    [key: string]: unknown
  }

  interface TransformResult {
    principalResult: string | unknown
    resultDocuments: Record<string, unknown>
  }

  function transform(options: TransformOptions, mode?: 'async' | 'sync'): Promise<TransformResult>

  const SaxonJS: {
    transform: typeof transform
  }

  export default SaxonJS
}
