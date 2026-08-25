const socket = io();
let localStream = new MediaStream();
let screenStream = null;
let peerConnection = null;
let targetSocketId = null;
let candidateQueue = [];

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
let remoteStream = new MediaStream();
remoteVideo.srcObject = remoteStream;

function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}

localVideo.onclick = () => makeFullscreen(localVideo);
remoteVideo.onclick = () => makeFullscreen(remoteVideo);

async function login() {
  const username = document.getElementById('username').value.trim();
  const roomId = document.getElementById('roomInput').value.trim();
  if (!username || !roomId) return alert('សូមបំពេញឈ្មោះ និងលេខបន្ទប់!');

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    console.log('ដំណើរការដោយគ្មាន Mic');
    localStream = new MediaStream();
  }

  document.getElementById('auth').classList.add('hidden');
  document.getElementById('room-container').classList.remove('hidden');
  document.getElementById('welcome-text').innerText = `អ្នកប្រើប្រាស់: ${username} | បន្ទប់: ${roomId}`;

  socket.emit('join-room', roomId);
}

function createPeerConnection() {
  if (peerConnection) return peerConnection;

  peerConnection = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    event.streams[0].getTracks().forEach(track => {
      remoteStream.addTrack(track);
    });
    remoteVideo.play().catch(e => console.log('Auto-play prompt:', e));
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate && targetSocketId) {
      socket.emit('signal', { to: targetSocketId, signal: { candidate: event.candidate } });
    }
  };

  return peerConnection;
}

// ពេលមានដៃគូថ្មីចូលមក
socket.on('user-joined', async (userId) => {
  targetSocketId = userId;
  const pc = createPeerConnection();
  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  socket.emit('signal', { to: userId, signal: { sdp: offer } });
});

// ទទួលទិន្នន័យ Signal
socket.on('signal', async ({ from, signal }) => {
  targetSocketId = from;
  const pc = createPeerConnection();

  if (signal.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(signal.sdp));
    
    // បញ្ចូល candidate ដែលរង់ចាំ
    while (candidateQueue.length > 0) {
      await pc.addIceCandidate(candidateQueue.shift());
    }

    if (signal.sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: from, signal: { sdp: answer } });
    }
  } else if (signal.candidate) {
    const candidate = new RTCIceCandidate(signal.candidate);
    if (pc.remoteDescription && pc.remoteDescription.type) {
      await pc.addIceCandidate(candidate);
    } else {
      candidateQueue.push(candidate);
    }
  }
});

socket.on('user-left', () => {
  remoteStream.getTracks().forEach(track => track.stop());
  remoteStream = new MediaStream();
  remoteVideo.srcObject = remoteStream;
  if (peerConnection) {
    peerConnection.close();
    peerConnection = null;
  }
});

// ចែករំលែកអេក្រង់ (Share Screen)
async function shareScreen() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    localVideo.srcObject = screenStream;

    const pc = createPeerConnection();
    const senders = pc.getSenders();
    const videoSender = senders.find(s => s.track && s.track.kind === 'video');

    if (videoSender) {
      videoSender.replaceTrack(screenTrack);
    } else {
      pc.addTrack(screenTrack, screenStream);
    }

    // ផ្ញើ Offer ថ្មីដើម្បី Update អេក្រង់ទៅដៃគូ
    if (targetSocketId) {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      socket.emit('signal', { to: targetSocketId, signal: { sdp: offer } });
    }

    screenTrack.onended = () => {
      localVideo.srcObject = null;
      if (videoSender) videoSender.replaceTrack(null);
    };
  } catch (err) {
    console.error('Error sharing screen:', err);
  }
}

function toggleMic() {
  const audioTrack = localStream.getAudioTracks()[0];
  if (!audioTrack) return alert('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!');
  audioTrack.enabled = !audioTrack.enabled;
  document.getElementById('micBtn').innerText = audioTrack.enabled ? 'បិទ មេក្រូ (Mute)' : 'បើក មេក្រូ (Unmute)';
}

function leaveRoom() {
  location.reload();
}
