# EventLink

EventLink is a monolithic FastAPI application organized into separate
`backend/` and `database/` packages. `backend/` owns HTTP routes, services,
authentication, validation schemas, and application configuration.
`database/` owns SQLAlchemy models, the engine/session, database settings, and
Alembic migrations. The backend imports and uses the database package in the
same process; these folders are not independently deployed services.

## Run with Docker

```text
docker compose up --build
```

Compose waits for PostgreSQL, applies Alembic migrations, then starts the API
on `http://localhost:8000`. Interactive API documentation is available at
`http://localhost:8000/docs`; `/health` checks both the API and database.
PostgreSQL data persists in the `postgres_data` Docker volume.

The Compose defaults are for local development only. Before deployment, set
`POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`, and a strong,
unpredictable `EVENTLINK_JWT_SECRET_KEY`. Set `EVENTLINK_ENVIRONMENT=production`
and configure `EVENTLINK_SMTP_HOST` and `EVENTLINK_SMTP_FROM_EMAIL` (plus
credentials as needed) to enable password-reset email delivery. The frontend
reset page can be set with `EVENTLINK_PASSWORD_RESET_URL`, and the allowed
comma-separated frontend origins with `EVENTLINK_CORS_ORIGINS`.

To provision the first administrator, run:

```text
docker compose exec api python -m backend.cli create-admin --email admin@example.com
```

The password is entered interactively and is never passed on the command line.
Administrators can manage categories and review business verification
requests; public registration cannot create administrator accounts.

## Run without Docker

Install dependencies, make PostgreSQL available, then run migrations and the
API from the repository root:

```text
pip install -r requirements.txt
python -m database.migrate
uvicorn backend.main:app --reload
```

Set `EVENTLINK_DATABASE_URL` to override the development database URL.
`EVENTLINK_JWT_SECRET_KEY` should also be overridden outside local
development. `EVENTLINK_*` configuration can be supplied through environment
variables or a `.env` file.

If upgrading a database created by the earlier `create_all` startup, the
migration runner stamps the baseline only when all expected tables already
exist. It refuses to guess how to repair a partial, unversioned schema; back
up and resolve that database before continuing.

## Run the frontend

Start the API and database first, then open a second terminal:

```text
cd frontend
npm install
npm run dev
```

Open `http://localhost:5173`. The frontend calls the API at
`http://localhost:8000` by default; set `VITE_API_URL` before starting Vite to
use a different API URL. For example, in PowerShell:

```powershell
$env:VITE_API_URL = "http://localhost:8000"
npm run dev
```

To create a production build, run `npm run build` from `frontend/`. The build
is written to `frontend/dist/`.

## Test

Tests use an isolated in-memory SQLite database and do not require Docker:

```text
pip install -r requirements-dev.txt
python -m pytest -q
```

## API areas

- **Authentication:** registration, login, current-user lookup, password
  reset, and logout under `/auth`.
- **Business accounts:** account/profile editing, services, portfolio images,
  verification requests, and business dashboard under `/business/me`.
- **Catalog:** public category and approved/published business search and
  detail under `/categories` and `/businesses`.
- **Customers:** customer profile/dashboard, reviews, saved businesses,
  interactions, and recommendations under `/customers/me` and `/businesses`.
- **Administration:** category management and business verification decisions
  under `/admin`; requires an administrator token.

Use the OpenAPI page at `/docs` for request and response schemas.
