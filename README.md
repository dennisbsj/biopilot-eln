# BioPilot ELN

Standalone browser-based Electronic Laboratory Notebook.

## Architecture

The ELN is now split into two JavaScript applications in the same repository:

- **Frontend:** React + TypeScript + Vite, deployed as the Render static site `biopilot-eln`.
- **Frontend storage:** Browser IndexedDB is the default persistence layer, so the ELN does not depend on any paid or hosted database.
- **Backend:** Node.js + Express, deployed as the Render web service `biopilot-eln-api`, mainly for optional API coupling.
- **Optional database mode:** PostgreSQL remains supported for future use, but production does not require it. Server persistence is enabled only if `VITE_STORAGE_MODE=server` is explicitly set and the API has a working `DATABASE_URL`.

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
- JSON Backup / Restore for browser-local documents, versions and attachments
- Seven-day backup reminder when browser-local data exists
- Protection against restoring altered content over existing Final/Signed ELNs
- Atomic ELN-number allocation across concurrent browser tabs

## Backend

Start locally without a database:

```bash
npm install
FRONTEND_ORIGIN=http://localhost:5173 npm run start:api
```

The API starts normally without PostgreSQL and can still provide the optional external API bridge. If `DATABASE_URL` is supplied, it also initializes the optional PostgreSQL persistence tables.

Important environment variables:

- `DATABASE_URL` — optional PostgreSQL connection string. Leave unset for the normal browser-first deployment.
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

## Storage and data model

In the default production mode, ELN data is stored in the browser's IndexedDB database. Documents include attachment payloads, while version snapshots contain the document text/metadata history. Backup exports package the browser-local documents, versions, attachments and sequence state into one JSON file that can be restored later or on another browser.

PostgreSQL is optional. When server persistence is deliberately enabled, the backend creates `eln_documents`, `eln_versions`, `eln_attachments` and `eln_sequences` automatically. The browser-first deployment does not require those tables or a database service.

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

If the external API is not configured or is unavailable, ELN falls back to experiment numbers already present in its own ELN documents. The external API bridge does not require PostgreSQL.
