FROM node:22-alpine

RUN apk add --no-cache bash

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY run.sh /run.sh
COPY src ./src

# Normalize potential CRLF line endings (e.g. from Windows checkouts) so the
# shebang resolves correctly, then make the script executable.
RUN sed -i 's/\r$//' /run.sh && chmod a+x /run.sh

CMD [ "/run.sh" ]
