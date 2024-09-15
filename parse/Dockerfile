############################################################
# Build stage
############################################################
FROM parseplatform/parse-server:latest AS build

# Setup directories
COPY ./scripts/ ./scripts/

# Install necessary dependencies as root
USER root
RUN apk --no-cache add git \
    && npm install --omit=dev netreconlab/parse-server-carekit#main parse-server-any-analytics-adapter@^1.x.x @analytics/google-analytics@^1.x.x @analytics/segment@^1.x.x \
    && npm install --omit=dev @parse/s3-files-adapter@^2.x.x parse-server-api-mail-adapter@^4.x.x mailgun.js@^10.x.x \
    && npm install --omit=dev clamscan@^2.x.x newrelic@^11.x.x \
    && npm install --omit=dev underscore \
    && npm install --omit=dev sharp \
    && npm install --omit=dev @parse/gcs-files-adapter   \
    && npm install --omit=dev apple-signin-auth \
    && npm install --omit=dev authy-client \
    && npm install --omit=dev bcrypt \
    && npm install --omit=dev body-parser \
    && npm install --omit=dev check-node-version \
    && npm install --omit=dev connect-redis \
    && npm install --omit=dev convict \
    && npm install --omit=dev cookie \
    && npm install --omit=dev cors \
    && npm install --omit=dev date-fns \
    && npm install --omit=dev ejs \
    && npm install --omit=dev express \
    && npm install --omit=dev express-session \
    && npm install --omit=dev google-auth-library \
    && npm install --omit=dev grant-express \
    && npm install --omit=dev grunt \
    && npm install --omit=dev lru-cache \
    && npm install --omit=dev mailgun \
    && npm install --omit=dev mailgun-js \
    && npm install --omit=dev mime \
    && npm install --omit=dev mixpanel \
    && npm install --omit=dev mocha \
    && npm install --omit=dev mongoose \
    && npm install --omit=dev morgan \
    && npm install --omit=dev nanoid \
    && npm install --omit=dev nginx \
    && npm install --omit=dev node-fetch \
    && npm install --omit=dev node-oauth \
    && npm install --omit=dev nodemon \
    && npm install --omit=dev oauth \
    && npm install --omit=dev object.fromentries \
    && npm install --omit=dev parse-server-mailgun \
    && npm install --omit=dev path \
    && npm install --omit=dev plivo \
    && npm install --omit=dev probe-image-size \
    && npm install --omit=dev redis \
    && npm install --omit=dev yn \
    && mkdir ./files \
    && chmod +x ./scripts/wait-for-postgres.sh ./scripts/parse_idempotency_delete_expired_records.sh ./scripts/setup-dbs.sh ./scripts/setup-parse-index.sh ./scripts/setup-pgaudit.sh \
    && chown -R node ./files ./scripts

############################################################
# Release stage
############################################################
FROM parseplatform/parse-server:latest AS release

# Start parse-hipaa setup as root
USER root

# Install apps needed for image
RUN apk --no-cache add bash postgresql-client

# RUN chown -R node:node /parse-server/package.json
# Complete parse-hipaa setup as node
USER node

# Copy necessary folders/files from build phase
COPY --from=build /parse-server/node_modules /parse-server/node_modules
COPY --from=build /parse-server/files /parse-server/files
COPY --from=build /parse-server/scripts /parse-server/scripts
COPY --from=build /parse-server/package*.json /parse-server/

# Copy any other files/scripts needed
COPY ./ecosystem.config.js ./
COPY ./process.yml ./
COPY ./index.js ./
COPY ./parse-dashboard-config.json ./
COPY ./cloud/ ./cloud/

ENV CLUSTER_INSTANCES=1

ENTRYPOINT []
CMD ["./scripts/wait-for-postgres.sh", "node", "index.js"]
