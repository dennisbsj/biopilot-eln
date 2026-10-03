# BioPilot ELN

Standalone browser-based Electronic Laboratory Notebook for BioPilot.

## Architecture

The ELN is now split into two JavaScript applications in the same repository:

- **Frontend:** React + TypeScript + Vite, deployed as the Render static site `biopilot-eln`.
- **Backend:** Node.js + Express, deployed as the Render web service `biopilot-eln-api`.
- **Database:** PostgreSQL on Render (`biopilot-eln-db`).

The frontend talks to the API through `VITE_API_URL`. If the API/database is unavailable, the app deliberately falls back to browser storage so the editor remains usable.

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
- Experiment lookup adapter for the BioPilot backend
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
- `BIOPILOT_API_BASE_URL` — optional URL of the main BioPilot JavaScript/backend API.
- `BIOPILOT_API_TOKEN` — optional bearer token for BioPilot experiment lookup.

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
