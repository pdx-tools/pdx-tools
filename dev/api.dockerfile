FROM gcr.io/distroless/static-debian12
COPY ./pdx-tools-api /app
CMD ["/app"]
