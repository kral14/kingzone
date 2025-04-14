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

# ---- Build Zamanı Faylları Yoxlamaq Üçün Diaqnostika ----
# Əgər bu yollardan biri tapılmazsa, RUN əmri xəta verəcək və build dayanacaq.
RUN echo "Checking crucial files/dirs after COPY:" && \
    echo "--> Checking /app/server directory:" && \
    ls -ld /app/server && \
    echo "--> Checking /app/server/socket directory:" && \
    ls -ld /app/server/socket && \
    echo "--> Checking /app/server/socket/index.js file:" && \
    ls -l /app/server/socket/index.js && \
    echo "--> Checking /app/server/server.js file:" && \
    ls -l /app/server/server.js && \
    echo "--> File/Directory Checks Passed."
# --------------------------------------------------------

# Tətbiqin işləyəcəyi portu bildir
EXPOSE 8080

# Serveri işə salmaq üçün DÜZGÜN əmr
CMD [ "node", "server/server.js" ]