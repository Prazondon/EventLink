# EventLink

## Run with Docker

Start the API and PostgreSQL database from the repository root:

```text
docker compose up --build
```

The API is available at `http://localhost:8000`; PostgreSQL data is persisted
in the `postgres_data` Docker volume. The Compose configuration uses
development-only database credentials. Set `POSTGRES_USER`,
`POSTGRES_PASSWORD`, and `POSTGRES_DB` in the environment before starting it
to override them. Set `EVENTLINK_JWT_SECRET_KEY` to a secure value outside
local development.

## Run the API without Docker

Install the dependencies from `database/requirements`, make PostgreSQL
available on `localhost:5432`, and start FastAPI from the repository root:

```text
uvicorn database.main:app --reload
```

The default connection uses the development database URL
`postgresql+psycopg2://eventlink:eventlink_dev_password@localhost:5432/eventlink`.
Set `EVENTLINK_DATABASE_URL` to override it.