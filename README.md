# BioPilot ELN

Standalone browser-based Electronic Laboratory Notebook.

## Architecture

The ELN is now split into two JavaScript applications in the same repository:

- **Frontend:** React + TypeScript + Vite, deployed as the Render static site `biopilot-eln`.
- **Frontend storage:** Browser IndexedDB is the default persistence layer, so the ELN does not depend on any paid or hosted database.
- **Backend:** Node.js + Express, deployed as the Render web service `biopilot-eln-api`, mainly for optional API coupling.
- **Optional database mode:** PostgreSQL is still supported if `VITE_STORAGE_MODE=server` is explicitly enabled.

This repository and application are intentionally standalone. They do not share a backend, login, database, repository, or runtime dependency with any other application. ELN can optionally connect to an external API through a narrow, configurable bridge without requiring access to that application's repository or backend code.

The ELN is browser-first. Documents, versions and attachments are stored in IndexedDB on the current device by default. The frontend can still talk to its own ELN API through `VITE_API_URL` for optional external API lookup. Hosted database persistence is opt-in rather than required. The API continues to start and serve the external lookup bridge even when PostgreSQL is absent or unavailable.

## Implemented ELN features

- Direct entry into a new ELN document
- Five most recently edited ELNs plus full Browse view
- Search, sorting, year/status/experiment filters
- Sequential ELN numbers
- Document names and experiment references
- Rich text with headings, lists, checklist markers, tables, highlight, rules, superscript/subscript, links and alignment
- Autosave and manual save
- Version history / audit snapshots
- Draft, Final and Signed document states
- Final/Signed document locking
- Soft delete / Trash / Restore / permanent delete
- Attachments and inline image insertion
- Print / Save as PDF
- Automatic migration of existing browser-local ELNs when the server database becomes available

## Backend

Start locally:

```bash
npm install
DATABASE_URL=postgresql://... FRONTEND_ORIGIN=http://localhost:5173 npm run start:api
```

The API automatically creates its own PostgreSQL tables on startup.

Important environment variables:

- `DATABASE_URL` — PostgreSQL connection string.
- `FRONTEND_ORIGIN` — allowed browser origin.
- `EXTERNAL_API_BASE_URL` — optional base URL for an external API.
- `EXTERNAL_API_TOKEN` — optional bearer token used only when ELN calls that API.
- `EXTERNAL_EXPERIMENTS_PATH` — optional experiment-search path, default `/experiments`.
- `EXTERNAL_EXPERIMENTS_QUERY_PARAM` — optional query parameter name, default `search`.
- `EXTERNAL_API_TIMEOUT_MS` — optional external lookup timeout, default 5000 ms (clamped to 500–30000 ms).

## Frontend

```bash
npm install
VITE_API_URL=http://localhost:3001 npm run dev
```

Production frontend: https://biopilot-eln.onrender.com  
Production API: https://biopilot-eln-api.onrender.com

## Data model

The backend creates these tables automatically:

- `eln_documents`
- `eln_versions`
- `eln_attachments`
- `eln_sequences`

Attachments are currently stored in PostgreSQL. This keeps the deployment self-contained; for large-scale use they should later move to object storage while PostgreSQL retains their metadata.

## Compliance note

The current Final/Signed workflow provides immutability and an audit history at the application level. It should not be described as a validated GxP / 21 CFR Part 11 / Annex 11 electronic-signature system without the additional identity, authorization, validation and operational controls required for such use.


## Optional external API coupling

ELN does not need source-code access to another application. To enable experiment lookup, configure the ELN backend with an external API URL and, if required, a token. The external system only needs to expose an HTTP endpoint.

Example:

```bash
EXTERNAL_API_BASE_URL=https://example.internal
EXTERNAL_EXPERIMENTS_PATH=/api/experiments
EXTERNAL_EXPERIMENTS_QUERY_PARAM=search
EXTERNAL_API_TOKEN=...
```

ELN normalizes common response shapes such as an array, `results`, `items`, or `data`, and common experiment identifiers such as `experimentNumber`, `experiment_number`, `number`, `code`, or `id`.

If the external API is not configured or is unavailable, ELN falls back to experiment numbers already present in its own ELN documents.
