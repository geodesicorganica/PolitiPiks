## Gemini API Tool & JSON Limitations
- **Google Search Conflict**: Do not use `responseMimeType: 'application/json'` or `responseSchema` concurrently with `tools: [{ googleSearch: {} }]`. The API will reject this combination with a 400 error.
- **Workaround**: To get JSON when using the Google Search tool, remove the strict JSON config options. Instead, instruct the model in the prompt to return only a raw JSON block, and parse `response.text` manually (stripping any markdown backticks if necessary).

## Rate Limiting in Scripts
- **Sleep Placement**: When implementing manual rate limits in iterative scripts (e.g., sleeping for 4 seconds to respect a 15 RPM quota), the sleep statement (`await new Promise(resolve => setTimeout(resolve, delay))`) MUST be placed completely outside of the `try/catch` block within the loop.
- **Rationale**: If placed inside the `try` block, any failure (including a rate limit rejection) will bypass the sleep, causing an instant infinite loop of failures that continuously hammers the API.
