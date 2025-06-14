const video = document.getElementById('preview');
const btn = document.getElementById('btnChamar');
let socket, pc, token;

// Inicia câmera
navigator.mediaDevices.getUserMedia({ video: true, audio: true }).then(stream => {
  video.srcObject = stream;
  window.localStream = stream;
});

// Ao clicar no botão
btn.onclick = async () => {
  btn.disabled = true;
  btn.innerText = 'Aguardando resposta...';

  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  canvas.getContext('2d').drawImage(video, 0, 0);
  const imagem = canvas.toDataURL('image/png');

  const res = await fetch('/foto', {
    method: 'POST',
    body: JSON.stringify({ imagem }),
    headers: { 'Content-Type': 'application/json' }
  });

  const result = await res.json();
  token = result.token;

  iniciarWebRTC();
};

function iniciarWebRTC() {
  socket = io();

  pc = new RTCPeerConnection({ iceServers: [{ urls: 'stun:stun.l.google.com:19302' }] });

  localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

  pc.onicecandidate = (e) => {
    if (e.candidate) {
      socket.emit('signal', { room: token, data: { candidate: e.candidate } });
    }
  };

  pc.ontrack = (e) => {
    console.log("Recebido stream do morador");
    // Você pode adicionar um <video id="moradorVideo"> para exibir o vídeo do morador, se quiser
  };

  socket.emit('join', token);

  socket.on('joined', async () => {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    socket.emit('signal', { room: token, data: { sdp: offer } });
  });

  socket.on('signal', async (data) => {
    if (data.sdp) {
      await pc.setRemoteDescription(data.sdp);
    }
    if (data.candidate) {
      try {
        await pc.addIceCandidate(data.candidate);
      } catch (err) {
        console.error('Erro ICE', err);
      }
    }
  });
}
