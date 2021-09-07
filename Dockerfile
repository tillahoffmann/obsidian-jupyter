FROM node
WORKDIR /workspace
COPY main.ts package.json rollup.config.js tsconfig.json ./
