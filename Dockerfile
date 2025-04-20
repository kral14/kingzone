# Node.js-in stabil və kiçik bir versiyasını seçin
FROM node:18-slim

# Tətbiq üçün qovluq yarat
WORKDIR /app

# Əvvəlcə package fayllarını kopyala və dependency-ləri quraşdır
# package-lock.json varsa və güncəldirsə npm ci daha sürətli və etibarlıdır
COPY package-lock.json* package.json ./
RUN npm ci --omit=dev --production
# Əgər package-lock yoxdursa və ya köhnəlibsə npm install istifadə edin
# COPY package*.json ./
# RUN npm install --omit=dev --production

# Bütün proyekt kodunu kopyala
COPY . .



# Tətbiqin işləyəcəyi portu bildir
EXPOSE 8080

# Serveri işə salmaq üçün DÜZGÜN əmr
CMD [ "node", "server/server.js" ]