const socket = io();
let localStream = new MediaStream();
let screenStream = null;
let peerConnection = null;
let currentRoomId = '';

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

function makeFullscreen(videoElem) {
  if (videoElem.requestFullscreen) {
    videoElem.requestFullscreen();
  } else if (videoElem.webkitRequestFullscreen) {
    videoElem.webkitRequestFullscreen();
  }
}

localVideo.onclick = () => makeFullscreen(localVideo);
remoteVideo.onclick = () => makeFullscreen(remoteVideo);

async function login() {
  const username = document.getElementById('username').value.trim();
  const roomId = document.getElementById('roomInput').value.trim();
  if (!username || !roomId) return alert('សូមបំពេញឈ្មោះ និងលេខបន្ទប់!');

  currentRoomId = roomId;

  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStream = audioStream;
  } catch (err) {
    console.log('ចូលបន្ទប់ដោយគ្មាន Microphone');
    localStream = new MediaStream();
  }

  document.getElementById('auth').classList.add('hidden');
  document.getElementById('room-container').classList.remove('hidden');
  document.getElementById('welcome-text').innerText = `អ្នកប្រើប្រាស់: ${username} | បន្ទប់: ${roomId}`;

  createPeerConnection();
  socket.emit('join-room', roomId, socket.id);
}

function createPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  peerConnection.ontrack = (event) => {
    if (event.streams && event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { to: currentRoomId, signal: { candidate: event.candidate } });
    }
  };

  // អ្នកចាស់នៅក្នុងបន្ទប់ នឹងផ្ញើ Offer ទៅកាន់អ្នកទើបចូលថ្មី
  socket.on('user-connected', async () => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { to: currentRoomId, signal: { sdp: offer } });
  });

  socket.on('signal', async (data) => {
    try {
      if (data.signal.sdp) {
        await peerConnection.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
        if (data.signal.sdp.type === 'offer') {
          const answer = await peerConnection.createAnswer();
          await peerConnection.setLocalDescription(answer);
          socket.emit('signal', { to: currentRoomId, signal: { sdp: answer } });
        }
      } else if (data.signal.candidate) {
        await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
      }
    } catch (e) {
      console.error('Error handling signal:', e);
    }
  });

  socket.on('user-disconnected', () => {
    remoteVideo.srcObject = null;
  });
}

async function shareScreen() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    localVideo.srcObject = screenStream;

    const senders = peerConnection.getSenders();
    const videoSender = senders.find(s => s.track && s.track.kind === 'video');

    if (videoSender) {
      videoSender.replaceTrack(screenTrack);
    } else {
      peerConnection.addTrack(screenTrack, screenStream);
      // បង្កើត renegotiation offer ពេលបន្ថែមអេក្រង់
      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);
      socket.emit('signal', { to: currentRoomId, signal: { sdp: offer } });
    }

    screenTrack.onended = async () => {
      localVideo.srcObject = null;
      if (videoSender) {
        peerConnection.removeTrack(videoSender);
        const offer = await peerConnection.createOffer();
        await peerConnection.setLocalDescription(offer);
        socket.emit('signal', { to: currentRoomId, signal: { sdp: offer } });
      }
    };
  } catch (err) {
    console.error('Error sharing screen: ', err);
  }
}

function toggleMic() {
  if (!localStream || localStream.getAudioTracks().length === 0) {
    return alert('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!');
  }
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  document.getElementById('micBtn').innerText = audioTrack.enabled ? 'បិទ មេក្រូ (Mute)' : 'បើក មេក្រូ (Unmute)';
}

function leaveRoom() {
  location.reload();
}
