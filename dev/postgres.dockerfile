FROM postgres:16-alpine
COPY sql /docker-entrypoint-initdb.d
