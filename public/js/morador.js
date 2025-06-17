const remoteVideo = document.getElementById('remoteVideo');
const localVideo = document.getElementById('localVideo');
const aceitarBtn = document.getElementById('aceitar');
const recusarBtn = document.getElementById('recusar');
let socket, pc, token;

// Inicia câmera do morador
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  console.log('🎥 Câmera do morador iniciada');
  remoteVideo.srcObject = stream;
  window.localStream = stream;
});

recusarBtn.onclick = async () => {
  alert("Você cancelou a chamada.");
  // window.opener.close(); 
  // remotePeerConnection.close();
  // window.location.reload();
  window.close(); // Pode não funcionar em dispositivos móveis
};

aceitarBtn.onclick = async () => {
  aceitarBtn.disabled = true;
  aceitarBtn.innerText = 'Conectando...';

  const res = await fetch('/token');
  const result = await res.json();
  token = result.token;

  console.log('🔑 Token recebido:', token);
  iniciarWebRTC();
};

function iniciarWebRTC() {
  socket = io();
  console.log('🔌 Socket conectado');

  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });
  console.log('🌐 PeerConnection criada');

  // Adiciona a câmera local do morador
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      console.log('📤 Enviando ICE candidate');
      socket.emit('signal', { room: token, data: { candidate: e.candidate } });
    }
  };

  pc.ontrack = (e) => {
    console.log('📹 Recebido stream remoto do visitante');
    remoteVideo.srcObject = e.streams[0];
  };

  socket.emit('join', token);
  console.log('👥 Entrou na sala:', token);

  socket.on('signal', async (data) => {
    console.log('📨 Sinal recebido:', data);

    if (data.sdp?.type === 'offer') {
      try {
        await pc.setRemoteDescription(new RTCSessionDescription(data.sdp));
        console.log('✅ remoteDescription definida');

        const answer = await pc.createAnswer();
        await pc.setLocalDescription(answer);
        console.log('📤 Enviando resposta (answer)');

        socket.emit('signal', { room: token, data: { sdp: pc.localDescription } });
      } catch (err) {
        console.error('❌ Erro ao processar oferta:', err);
      }
    }

    if (data.candidate) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(data.candidate));
        console.log('✅ ICE candidate adicionado');
      } catch (err) {
        console.error('❌ Erro ao adicionar ICE candidate:', err);
      }
    }
  });
}
