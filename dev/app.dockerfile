# Production image, copy all the files and run next
FROM node:slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends libssl-dev \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV NODE_ENV production

RUN groupadd --system --gid 1001 nextjs \
    && useradd --system --create-home --uid 1001 --gid 1001 nextjs

COPY .next/standalone .
COPY src/server-lib/applib.node ./src/server-lib/applib.node
COPY next.config.js ./
COPY public ./public
COPY --chown=nextjs:nextjs .next ./.next

USER nextjs
EXPOSE 3000
ENV NEXT_TELEMETRY_DISABLED 1
CMD ["node", "server.js"]
