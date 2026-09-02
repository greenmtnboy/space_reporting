/**
 * Friendly names for the agent's tools, for the pills in the message stream
 * and the "Running …" status line.
 *
 * The library's own labels (`getToolDisplayName`) are studio-flavoured and
 * not exported from any package entry point, so this app keeps its own map in
 * the vocabulary of the chat: an "import" is a data source here, an
 * "artifact" is a result the user can see. Imperative phrasing, matching the
 * loading line ("Running Select data source…"). Unknown tools fall back to the
 * raw name with underscores opened up, so a new library tool still reads.
 */
const TOOL_LABELS: Record<string, string> = {
  run_trilogy_query: 'Run query',
  chart_trilogy_query: 'Chart query',
  select_active_import: 'Select data source',
  list_available_imports: 'List data sources',
  connect_data_connection: 'Connect database',
  create_markdown: 'Write report',
  list_artifacts: 'List results',
  get_artifact: 'Read result',
  get_artifact_rows: 'Read result rows',
  update_artifact: 'Update result',
  hide_artifact: 'Hide result',
  reorder_artifacts: 'Reorder results',
  search_docs: 'Search docs',
  read_doc: 'Read doc',
  open_documentation: 'Open docs',
  compact_conversation: 'Compact conversation',
  return_to_user: 'Reply',
}

export function toolLabel(name: string): string {
  const label = TOOL_LABELS[name]
  if (label) return label
  const opened = name.replace(/_/g, ' ').trim()
  if (!opened) return name
  return opened.charAt(0).toUpperCase() + opened.slice(1)
}
