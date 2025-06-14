require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const fetch = require('node-fetch');
const FormData = require('form-data');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));
app.use(express.json({ limit: '10mb' }));

// Gerenciamento dos tokens
const tokensPath = path.join(__dirname, 'tokens.json');
let tokens = fs.existsSync(tokensPath) ? JSON.parse(fs.readFileSync(tokensPath)) : {};

// 📄 Rota da câmera do visitante
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// 📄 Rota da chamada do morador (usada via link do Telegram)
app.get('/chamada', (req, res) => {
  const { token } = req.query;
  if (!tokens[token] || tokens[token].used) {
    return res.status(403).send("Link inválido ou expirado.");
  }
  res.sendFile(path.join(__dirname, 'public', 'call.html'));
});

// 📸 Recebe a imagem do visitante, gera token e envia link pro Telegram
app.post('/foto', async (req, res) => {
  const data = req.body.imagem;
  const buffer = Buffer.from(data.replace(/^data:image\/\w+;base64,/, ""), 'base64');
  const fileName = `foto_${Date.now()}.png`;
  const filePath = path.join(__dirname, fileName);
  fs.writeFileSync(filePath, buffer);

  const token = Math.random().toString(36).substring(2, 10);
  tokens[token] = { used: false };
  fs.writeFileSync(tokensPath, JSON.stringify(tokens));

  const link = `${process.env.BASE_URL}/chamada?token=${token}`;

  // Envia para Telegram
  const url = `https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`;
  const form = new FormData();
  form.append('chat_id', process.env.TELEGRAM_CHAT_ID);
  form.append('caption', `🚪 Alguém está no portão!\n📞 Clique para atender: ${link}`);
  form.append('photo', fs.createReadStream(filePath));
  await fetch(url, { method: 'POST', body: form });

  fs.unlinkSync(filePath);

  res.json({ ok: true, token });
});

// 🔄 WebSocket (WebRTC signaling)
io.on('connection', (socket) => {
  // Usuário entra na sala
  socket.on('join', (room) => {
    socket.join(room);
    console.log(`🔗 Cliente entrou na sala: ${room}`);
    
    // Envia "joined" para todos da sala (inclusive quem entrou)
    io.to(room).emit('joined');
  });

  // Sinalização entre pares (oferta, resposta, ICE, rejeição)
  socket.on('signal', ({ room, data }) => {
    if (data.type === 'rejected') {
      socket.to(room).emit('rejected');
    } else {
      socket.to(room).emit('signal', data);
    }
  });

  // Confirmação de atendimento (morador aceita a chamada)
  socket.on('confirm', (room) => {
    console.log("morador aceita a chamada");
    if (tokens[room]) {
      tokens[room].used = true;
      fs.writeFileSync(tokensPath, JSON.stringify(tokens));
    }
    socket.to(room).emit('accepted');
  });
});

// 🔑 Rota que extrai o token do Referer para o morador
app.get('/token', (req, res) => {
  const referer = req.headers.referer;
  if (!referer) return res.status(400).json({ error: 'Sem referer' });

  const url = new URL(referer);
  const token = url.searchParams.get('token');

  if (!token || !tokens[token] || tokens[token].used) {
    return res.status(403).json({ error: 'Token inválido ou expirado' });
  }

  res.json({ token });
});

// 🚀 Inicia o servidor
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Servidor rodando: http://localhost:${PORT}`);
});
