# BioPilot ELN

Standalone browser-based Electronic Lab Notebook for BioPilot.

## Stack

React + TypeScript + Vite.

## Current prototype

- New / Open / Delete document workflows
- Rich-text ELN editor
- Sequential ELN numbering by year
- Experiment-number linking field
- Searchable document list
- Autosave and manual save
- Browser-local persistence for the prototype

The current prototype stores ELN documents in browser localStorage. Production storage, permissions, audit history, and BioPilot API integration will be added separately.

## Development

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

The app is configured for deployment as a Render static site.
