FROM gcr.io/distroless/static-debian11
COPY ./pdx-tools-api /app
CMD ["/app"]
