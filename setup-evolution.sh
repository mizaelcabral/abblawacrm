#!/bin/bash

# --- CONFIGURAÇÃO PADRÃO ---
# IMPORTANTE: Altere os valores abaixo antes de executar o script!
API_URL="https://api-wa.abblahub.com"
GLOBAL_KEY="UmaChaveMuitoForteEUnica123!"

echo "============================================="
echo "INICIANDO CONFIGURAÇÃO DA EVOLUTION API"
echo "============================================="

# 1. Atualizar pacotes
echo "[1/4] Atualizando pacotes do sistema..."
sudo apt update && sudo apt upgrade -y

# 2. Instalar Docker e Docker Compose se não existirem
if ! command -v docker &> /dev/null; then
    echo "[2/4] Instalando Docker..."
    sudo apt install docker.io -y
    sudo systemctl enable --now docker
else
    echo "[2/4] Docker já instalado."
fi

if ! command -v docker-compose &> /dev/null; then
    echo "[2/4] Instalando Docker Compose..."
    sudo apt install docker-compose -y
else
    echo "[2/4] Docker Compose já instalado."
fi

# 3. Criar diretório da Evolution API
echo "[3/4] Criando pastas e arquivos de configuração..."
sudo mkdir -p /opt/evolution
cd /opt/evolution

# Criar docker-compose.yml
sudo tee docker-compose.yml > /dev/null <<EOF
version: '3.8'

services:
  evolution_api:
    image: atendai/evolution-api:v1.8.2
    container_name: evolution_api
    ports:
      - "8080:8080"
    environment:
      - PORT=8080
      - SERVER_URL=${API_URL}
      - AUTHENTICATION_TYPE=apikey
      - AUTHENTICATION_API_KEY=${GLOBAL_KEY}
      - DATABASE_ENABLED=true
      - DATABASE_PROVIDER=sqlite
      - DATABASE_CONNECTION_CLIENT=sqlite3
      - WEBHOOK_GLOBAL_ENABLED=false
    volumes:
      - evolution_data:/evolution/instances
    restart: always

volumes:
  evolution_data:
EOF

# 4. Iniciar os containers
echo "[4/4] Iniciando containers da Evolution API..."
sudo docker-compose down &> /dev/null
sudo docker-compose up -d

echo "============================================="
echo "EVOLUTION API INSTALADA E RODANDO!"
echo "Porta: 8080"
echo "URL do Servidor: ${API_URL}"
echo "API Key Global: ${GLOBAL_KEY}"
echo "Localização dos arquivos: /opt/evolution"
echo "============================================="
echo "Não se esqueça de configurar o Proxy Reverso (SSL/HTTPS)"
echo "apontando para a porta 8080 da sua VPS!"
echo "============================================="
