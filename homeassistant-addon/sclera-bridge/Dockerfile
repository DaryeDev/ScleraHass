FROM node:22-alpine

RUN apk add --no-cache bash

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm ci --omit=dev 2>/dev/null || npm install --omit=dev

COPY run.sh /run.sh
COPY src ./src

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
