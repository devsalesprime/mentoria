#!/bin/bash

echo "🔧 Iniciando servidor Prosperus..."

# Parar processos existentes
echo "🛑 Parando processos existentes..."
pm2 delete all 2>/dev/null
pkill -f "node.*server" 2>/dev/null

# Liberar porta 3000
echo "🚪 Liberando porta 3000..."
sudo fuser -k 3000/tcp 2>/dev/null || true
sudo fuser -k 3001/tcp 2>/dev/null || true

# Esperar
sleep 2

# Verificar portas
echo "📡 Verificando portas..."
if ss -tulpn | grep -q :3000; then
    echo "⚠️  Porta 3000 ainda em uso, usando 3001..."
    PORT=3001
else
    PORT=3000
fi

# Atualizar porta no servidor
sed -i "s/const PORT = process.env.PORT || [0-9]*;/const PORT = process.env.PORT || ${PORT};/g" server.cjs

# Iniciar servidor
echo "🚀 Iniciando servidor na porta ${PORT}..."
node server.cjs
