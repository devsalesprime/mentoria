
const axios = require('axios');
const jwt = require('jsonwebtoken');

// Configurações idênticas ao server.cjs
const PORT = 3005;
const JWT_SECRET = 'prosperus-secret-key-2024';
const BASE_URL = `http://localhost:${PORT}`;

// 1. Gerar Token de Teste
const userEmail = 'teste.webhook@exemplo.com';
const userId = 'user-test-01';

const token = jwt.sign(
  {
    userId,
    user: userEmail,
    role: 'member',
    name: 'Usuário de Teste'
  },
  JWT_SECRET,
  { expiresIn: '1h' }
);

console.log('🔑 Token gerado:', token.substring(0, 20) + '...');

// 2. Dados com 100% de progresso
const payload = {
  formData: {
    mentor: { _completed: true },
    mentee: { _completed: true },
    method: { _completed: true },
    delivery: { _completed: true }
  },
  progressPercentage: 100
};

// 3. Enviar Requisição
async function runTest() {
  try {
    console.log(`\n📤 Enviando requisição para ${BASE_URL}/api/user/save-progress...`);
    
    const response = await axios.post(
      `${BASE_URL}/api/user/save-progress`,
      payload,
      {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      }
    );

    console.log('\n✅ Resposta do Servidor:');
    console.log('Status:', response.status);
    console.log('Body:', response.data);
    
    console.log('\n👀 Verifique o terminal onde o servidor está rodando.');
    console.log('Você deve ver: "🚀 [WEBHOOK] Enviando notificação..."');

  } catch (error) {
    console.error('\n❌ Erro na requisição:');
    if (error.response) {
      console.error('Status:', error.response.status);
      console.error('Data:', error.response.data);
    } else {
      console.error(error.message);
    }
  }
}

runTest();
