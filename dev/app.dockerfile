# Production image, copy all the files and run next
FROM node:20.17.0-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV=production

RUN groupadd --system --gid 1001 nextjs \
    && useradd --system --create-home --uid 1001 --gid 1001 nextjs

COPY .next/standalone .
COPY --chown=nextjs:nextjs .next ./.next

USER nextjs
EXPOSE 3000
ENV NEXT_TELEMETRY_DISABLED=1
CMD ["node", "server.js"]
