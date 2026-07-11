FROM python:3.11-slim

# Java 21 для PySpark + DejaVu для PDF с кириллицей
RUN apt-get update && apt-get install -y --no-install-recommends \
    openjdk-21-jre-headless \
    fonts-dejavu-core \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

# JAVA_HOME для Java 21 в Debian
ENV JAVA_HOME=/usr/lib/jvm/java-21-openjdk-amd64
ENV PATH="${JAVA_HOME}/bin:${PATH}"

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]