FROM node:18.15-alpine3.17
ENV NODE_ENV=production

WORKDIR /app

COPY ["package.json", "package-lock.json*", "./"]

RUN yarn install --production

COPY . .

ENTRYPOINT ["yarn", "start"]
