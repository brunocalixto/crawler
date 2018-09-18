FROM node:10-alpine

ENV NODE_ENV production
WORKDIR /usr/src/app

COPY package*.json ./
RUN npm install
ADD config ./config
ADD src ./src

CMD ["npm", "start", "--"]
