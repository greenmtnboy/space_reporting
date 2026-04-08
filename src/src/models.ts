// Import all .preql model files at build time as raw strings.
// This replaces the scripts/bundle_models.py + public/models.json approach.
const preqlModules = import.meta.glob('../../data/raw/*.preql', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

export interface PreqlModel {
  id: string
  name: string
  contents: string
  type: 'preql'
}

export const PREQL_MODELS: PreqlModel[] = Object.entries(preqlModules).map(
  ([path, contents]) => {
    const filename = path.split('/').pop()!
    return {
      id: filename,
      name: filename.replace('.preql', ''),
      contents,
      type: 'preql' as const,
    }
  },
)
