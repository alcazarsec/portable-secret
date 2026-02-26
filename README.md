# Portable Secret

Portable Secret lets you encrypt text and files into a single HTML file that can be opened in any modern browser.

No app install is required for the recipient. You share one file, share the password separately, and they can decrypt locally in the browser.

Project site and live tool: https://alcazarsec.github.io/portable-secret/

## Why people use it

- Send private documents through normal channels like email or chat
- Keep sensitive backups in cloud drives, USB sticks, or other untrusted storage
- Access emergency documents from almost any device with a browser

## What a Portable Secret file is

A [Portable Secret](https://mprimi.github.io/portable-secret/) is a self-contained HTML document with:

- encrypted data (text and optional attachments)
- JavaScript needed to decrypt it in the browser

That file can be opened offline. If the password is correct, the secret is recovered locally on the device.

## Security model (short version)

- Encryption uses modern browser cryptography (AES-GCM)
- Passwords are stretched with a KDF before key use
- Decryption happens in the browser, not on a remote server
- Password strength still matters a lot

If you want details and practical guidance, see the FAQ in [`src/routes/faq.md`](./src/routes/faq.md).

## This repository

This repo contains the standalone SvelteKit app that creates Portable Secret files.

When you build this project, you get:

1. A static web app (`build/index.html`) for creating secrets
2. Generated `.ps.html` files that are also self-contained

## Local development

Install dependencies:

```bash
pnpm install
```

Run in development mode:

```bash
pnpm run dev
```

Build for production:

```bash
pnpm run build
```

Build output is in `build/`.

## Notes for deployment

This project uses `adapter-static` with prerendering. The generated app can be served as static files. The `.ps.html` files created by the app are standalone and portable by design.
