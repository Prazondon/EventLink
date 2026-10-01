FROM python:3.12-slim

WORKDIR /app

COPY database/requirements ./database/requirements
RUN pip install --no-cache-dir -r database/requirements

COPY database ./database

EXPOSE 8000

CMD ["uvicorn", "database.main:app", "--host", "0.0.0.0", "--port", "8000"]
