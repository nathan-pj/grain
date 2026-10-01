# Grain

Grain is a local macOS workspace for generating, organizing, inspecting, copying, and upscaling images.

The generator supports Higgsfield account credits, Codex through a ChatGPT subscription, and OpenAI API billing. The node canvas uses fal's SeedVR2 upscaler. Your library, prompts, tabs, references, and credentials are not included in this repository or the downloadable app.

## Download

Download `Grain-macOS-arm64.zip` from the latest GitHub release, unzip it, and move `Grain.app` to Applications. Grain currently requires an Apple Silicon Mac running macOS 14 or later.

The release is ad-hoc signed rather than notarized. On first launch, macOS may require you to right-click Grain and choose **Open**.

## Set up generation and upscaling

Select a generation provider in the bottom prompt bar:

- **Higgsfield · credits**: choose **Connect Higgsfield**, sign in, and select your billing workspace if prompted. Use the model dropdown and Options panel to choose image settings.
- **Codex · subscription**: install Codex and sign in with ChatGPT. Grain uses the built-in image model and does not guarantee selectable Sunburst or quality settings.
- **OpenAI API · pay per image**: choose **Add OpenAI API key**. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and add API credit in [OpenAI billing](https://platform.openai.com/settings/organization/billing/overview). This provider uses `gpt-image-2.5-sunburst`.
- In **Upscaler**, choose **Add fal API key**. Create a key at [fal.ai/dashboard/keys](https://fal.ai/dashboard/keys) and manage credit in [fal billing](https://fal.ai/dashboard/billing).

Keys are stored with owner-only file permissions at:

```text
~/Library/Application Support/local.images.desktop/openai-key
~/Library/Application Support/local.images.desktop/fal-key
```

They are read only by Grain's loopback service. The UI can save a replacement key but has no endpoint that returns a saved key.

## Local data

Grain stores its image library and job records at:

```text
~/Library/Application Support/local.images.desktop/data/
```

Generator and upscaler tab layouts are stored in the app's local WebKit storage. Removing the app does not automatically remove this data.

Generation sends the prompt and attached references to the selected provider. Upscaling sends the selected image to fal. Connected MCP clients can read your workspace and images through Grain's tools. Grain does not include analytics.

## Development

Requirements: Node.js 24+, npm, macOS 14+, and Xcode command-line tools for the native app.

```bash
npm ci
npm test
npm run build
PORT=4319 STUDIO_DATA_DIR="$PWD/.local-data" npm start
```

Open `http://127.0.0.1:4319/` for the browser development build. `STUDIO_DATA_DIR` keeps development data separate from the installed app.

Environment variables `OPENAI_API_KEY` and `FAL_KEY` can supply credentials during browser development. The packaged macOS app ignores inherited credential variables and uses its private Application Support files.

## Build the macOS app

```bash
npm run build:mac
```

The script builds the frontend and backend, downloads and verifies the official Node.js 24 arm64 runtime, compiles the AppKit/WebKit wrapper, ad-hoc signs the bundle, and creates:

```text
build/Grain.app
release/Grain-macOS-arm64.zip
```

## License

[MIT](LICENSE)

### Higgsfield credits

Choose **Higgsfield · credits** in the generator, then **Connect Higgsfield** and sign in in your browser. Select your billing workspace if prompted. Grain uses the pinned official Higgsfield CLI (the same account-credit billing as MCP), not Higgsfield’s separate dollar-billed API. Credentials remain in the CLI’s local credential store and are never saved in this repository or sent to the frontend.

Sunburst supports low/medium/high/xhigh/max quality and 1K/2K/4K resolution. References are uploaded to Higgsfield for each request. All generations spend plan credits; website unlimited allowances do not apply. OpenAI API remains a manually selected alternative; Grain never silently falls back to it. Each run records its provider, and retries keep the same gallery slot. Once a Higgsfield job ID is saved, interrupted processing or failed downloads retrieve that job instead of submitting another generation. If submission succeeds remotely but the connection drops before an ID is received, check Higgsfield Assets before retrying.

The npm install step downloads a checksum-verified native CLI. The macOS packaging script bundles that CLI so no global installation is needed.

Higgsfield model selection now uses its live image-model catalog. The Options panel exposes each selected model’s current parameters, including enum choices, numeric and boolean settings, and JSON inputs for structured options. Models and options persist separately in each generator tab. Video and audio models are outside Grain’s image workspace.

### Local MCP connector

Keep Grain open. Register its bundled local MCP server in Claude Code with:

```sh
claude mcp add --scope user --transport stdio grain -- /Applications/Grain.app/Contents/Resources/runtime/bin/node /Applications/Grain.app/Contents/Resources/backend/server/mcp.js
```

Restart your Claude Code session and run `/mcp` to see `grain`. Example: “Use Grain to create a tab named Summer ads, import these local images, write three variations, and generate them. Inspect the results.”

For Codex, register the same server with:

```sh
codex mcp add grain -- /Applications/Grain.app/Contents/Resources/runtime/bin/node /Applications/Grain.app/Contents/Resources/backend/server/mcp.js
```

Restart the desktop app or CLI session to load the connector. Tell the assistant to use Grain's tools directly, without mouse, keyboard, browser, or screen automation. If the tools are unavailable, it should report the missing connection.

Tools: `grain_workspace`, `grain_tabs`, `grain_set_draft`, `grain_import_image`, `grain_view_image`, `grain_models`, `grain_generate`, `grain_results`, and `grain_retry`. Tab edits synchronize through the running app; existing local tab storage is preserved and mirrored to the backend. Generation does not require a separate approval. A default cap of four active images is enforced server-side. An explicitly requested larger concurrent batch can pass `userRequestedLimit` (up to 40) and `userRequest`, the quoted user instruction. This is an agent-instruction convention, not independent verification of a human request. Each individual generation batch stays at 1–4 images. Reuse a generation request UUID after an uncertain response to avoid duplicate submissions.

The MCP process has local file access for reference imports and uses a private token in Application Support. It does not expose provider credentials. Images and prompts returned through its tools become available to the connected assistant. The MCP client's tool permission settings still apply.

### Generation providers and prompt bar

The generator dropdown selects Higgsfield credits, Codex subscription, or OpenAI API billing. Each submitted run keeps its provider for retries; there is no automatic paid fallback. Codex requires a local Codex installation signed in with ChatGPT, uses the built-in image model/default quality, and does not guarantee a Sunburst model choice. OpenAI API uses the saved OpenAI key; Higgsfield uses the linked account credits.

Drag the handle at the top of the prompt bar down to collapse it. Click the collapsed bar or drag its handle up to expand. Prompts, references, and options stay mounted and preserved. The collapsed state is remembered locally.
