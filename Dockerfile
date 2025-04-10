# Node.js-in stabil və kiçik bir versiyasını seçin
FROM node:18-slim

# Tətbiq üçün qovluq yarat
WORKDIR /app

# Əvvəlcə package fayllarını kopyala və dependency-ləri quraşdır
COPY package*.json ./
RUN npm install --omit=dev --production

# Bütün proyekt kodunu kopyala
# server_multi.js və public qovluğunun 'server' adlı alt qovluqda olduğunu fərz edirik
COPY . .
# ----- YENİ DİAQNOSTİKA ƏMRLƏRİ -----
    RUN ls -la /app
    RUN ls -la /app/server || echo "Server directory /app/server not found during build"
    # ----- YENİ DİAQNOSTİKA ƏMRLƏRİ SONU -----
    
# Tətbiqin işləyəcəyi portu bildir (server.js-dəki ilə eyni - 8080)
EXPOSE 8080

# Serveri işə salmaq üçün əmr
# server_multi.js faylının 'server' qovluğunda olduğunu yoxlayın!
CMD [ "node", "server/server_multi.js" ]