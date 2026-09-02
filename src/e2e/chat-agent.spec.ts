import { test, expect, type Page, type Route } from '@playwright/test'

/*
  Integration tests for the chat agent loop with a scripted model.

  The demo provider is an OpenRouter connection whose key comes from a token
  service, so three endpoints are mocked: the token mint, the model list, and
  chat completions. Everything else is real: the app opens DuckDB-wasm in the
  browser, the Trilogy resolver compiles the queries, and the library's tool
  loop runs the scripted calls. That is the surface that broke when the
  library changed its connection-store key format: the model was told the
  data connection was down and every query failed, which no unit test saw.

  Each test scripts the model's turns as tool calls and records every request
  the app sends, so assertions can be made on the system prompt and on the
  tool results the model was fed, not only on what rendered.
*/

interface ToolCall {
  name: string
  input: Record<string, unknown>
}

interface RecordedRequest {
  system: string
  /** Tool results in this request, oldest first, as the model would read them. */
  toolResults: string[]
}

function completion(toolCall: ToolCall, index: number) {
  return {
    id: `mock-${index}`,
    model: 'mock-model',
    choices: [
      {
        index: 0,
        finish_reason: 'tool_calls',
        message: {
          role: 'assistant',
          content: '',
          tool_calls: [
            {
              id: `call_${index}`,
              type: 'function',
              function: { name: toolCall.name, arguments: JSON.stringify(toolCall.input) },
            },
          ],
        },
      },
    ],
    usage: { prompt_tokens: 1, completion_tokens: 1, total_tokens: 2 },
  }
}

/** Install the provider mocks. Returns the requests the app made, in order. */
async function scriptModel(page: Page, turns: ToolCall[]): Promise<RecordedRequest[]> {
  const requests: RecordedRequest[] = []
  await page.route('https://open-router-token-service.fly.dev/**', (route: Route) =>
    route.fulfill({ json: { api_key: 'sk-or-test' } }),
  )
  await page.route('https://openrouter.ai/api/v1/models', (route: Route) =>
    route.fulfill({ json: { data: [{ id: 'google/gemini-3-flash-preview', name: 'Mock Gemini' }] } }),
  )
  await page.route('https://openrouter.ai/api/v1/chat/completions', (route: Route) => {
    const body = route.request().postDataJSON() as { messages: { role: string; content: unknown }[] }
    requests.push({
      system: body.messages.find((m) => m.role === 'system')?.content as string,
      toolResults: body.messages.filter((m) => m.role === 'tool').map((m) => String(m.content)),
    })
    const index = requests.length - 1
    const turn = turns[index]
    if (!turn) {
      return route.fulfill({ status: 500, json: { error: { message: `no scripted turn ${index}` } } })
    }
    return route.fulfill({ json: completion(turn, index) })
  })
  return requests
}

async function connectDemoAndAsk(page: Page, question: string) {
  await page.goto('./chat')
  await page.getByTestId('provider-select').selectOption('demo')
  await page.getByRole('button', { name: 'Connect' }).click()
  await expect(page.getByTestId('chat-container')).toBeVisible()
  // The badge reads the real connection state; the query below needs it open.
  await expect(page.locator('.db-status.ready')).toBeVisible({ timeout: 120000 })
  await page.locator('textarea').fill(question)
  await page.keyboard.press('Enter')
}

test.describe('Chat agent loop with a scripted model', () => {
  // DuckDB-wasm plus a resolver round trip per query: well past the default.
  test.setTimeout(180000)

  test('runs a query against the local database and returns to the user', async ({ page }) => {
    const requests = await scriptModel(page, [
      { name: 'select_active_import', input: { import_name: 'launch' } },
      { name: 'run_trilogy_query', input: { connection: 'space-duckdb', query: 'select 1 -> one;' } },
      { name: 'return_to_user', input: { message: 'One row, as requested.' } },
    ])
    await connectDemoAndAsk(page, 'Run a select 1')

    await expect(page.locator('.chat-msg--assistant').last()).toContainText('One row, as requested.', {
      timeout: 120000,
    })
    // The loop ended: input is live again and no spinner is left behind.
    await expect(page.locator('.chat-loading')).toHaveCount(0)
    await expect(page.locator('textarea')).toBeEnabled()

    // The prompt must never claim the connection the app just opened is down.
    // (Library 0.1.25 also stops naming connect_data_connection when the app
    // withholds it; assert that here once the app is on it.)
    expect(requests).toHaveLength(3)
    for (const request of requests) {
      expect(request.system).not.toContain('NOT CONNECTED')
    }
    // Each scripted call succeeded and its result reached the model.
    const final = requests[2].toolResults
    expect(final[0]).toContain('Successfully selected "launch"')
    expect(final[1]).toMatch(/^Success\./)
    expect(final[1]).toContain('1 rows')

    // Friendly names, no failures.
    const pills = page.getByTestId('chat-tool-pill')
    await expect(pills).toHaveText(['Select data source', 'Run query', 'Reply'])
    await expect(page.locator('.chat-tool-pill--error')).toHaveCount(0)
  })

  test('marks a failed call and shows its error in the inspector', async ({ page }) => {
    await scriptModel(page, [
      {
        name: 'run_trilogy_query',
        input: { connection: 'space-duckdb', query: 'select no_such_field;' },
      },
      { name: 'return_to_user', input: { message: 'That field does not exist.' } },
    ])
    await connectDemoAndAsk(page, 'Show me no_such_field')

    await expect(page.locator('.chat-msg--assistant').last()).toContainText('That field does not exist.', {
      timeout: 120000,
    })

    const failed = page.locator('.chat-tool-pill--error')
    await expect(failed).toHaveCount(1)
    await expect(failed).toContainText('Run query')
    await expect(failed.locator('.chat-tool-pill-icon')).toHaveCount(1)

    await failed.click()
    const inspector = page.getByTestId('tool-inspector')
    await expect(inspector).toBeVisible()
    await expect(inspector.locator('.tool-inspector-status')).toHaveText('failed')
    await expect(inspector.locator('.tool-inspector-call-raw')).toHaveText('run_trilogy_query')
    await expect(inspector.locator('.tool-inspector-pre').nth(0)).toContainText('no_such_field')
    await expect(inspector.locator('.tool-inspector-pre').nth(1)).toContainText(/error/i)

    await page.keyboard.press('Escape')
    await expect(inspector).toHaveCount(0)
  })
})
