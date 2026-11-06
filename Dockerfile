FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
ENV NODE_ENV=production DATA_FILE=/data/data.json
RUN mkdir /data && chown node /data
USER node
VOLUME /data
EXPOSE 3000
CMD ["node","server.js"]
