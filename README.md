# Grain

Grain is a local macOS workspace for generating, organizing, inspecting, copying, and upscaling images.

The generator uses OpenAI's `gpt-image-2.5-sunburst` model. The node canvas uses fal's SeedVR2 upscaler. Prompts, tabs, folders, references, generated images, and API keys stay in your Mac's Application Support folder and are not included in this repository or the downloadable app.

## Download

Download `Grain-macOS-arm64.zip` from the latest GitHub release, unzip it, and move `Grain.app` to Applications. Grain currently requires an Apple Silicon Mac running macOS 14 or later.

The release is ad-hoc signed rather than notarized. On first launch, macOS may require you to right-click Grain and choose **Open**.

## Set up API access

Grain asks for each key inside the part of the app that uses it:

- In **Create**, choose **Add OpenAI API key**. Create a key at [platform.openai.com/api-keys](https://platform.openai.com/api-keys) and add API credit in [OpenAI billing](https://platform.openai.com/settings/organization/billing/overview).
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

Images and prompts are sent to OpenAI only when you generate. Images are sent to fal only when you upscale. Grain does not include analytics.

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
