FROM node:18-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Set default API URL for the browser to hit the exposed backend port
ENV NEXT_PUBLIC_API_URL=http://localhost:8000/api

RUN npm run build

EXPOSE 3000

CMD ["npm", "start"]
