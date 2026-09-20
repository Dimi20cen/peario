FROM node:20-alpine AS build
WORKDIR /app
RUN corepack enable && corepack prepare pnpm@9 --activate
COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY . .
ARG VUE_APP_WS_SERVER
ARG VUE_APP_TITLE
ENV VUE_APP_WS_SERVER=$VUE_APP_WS_SERVER
ENV VUE_APP_TITLE=$VUE_APP_TITLE
RUN pnpm build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
