const socket = io();
let localStream = null;
let peerConnection;
const config = {
  iceServers: [{ urls: 'stun:stun.l.google.com:19302' }]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

async function login() {
  const username = document.getElementById('username').value.trim();
  const roomId = document.getElementById('roomInput').value.trim();
  if (!username || !roomId) return alert('សូមបំពេញឈ្មោះ និងលេខបន្ទប់!');

  // ព្យាយាមចាប់យក Mic បើគ្មាន Mic ឬ User ចុច Block ក៏នៅតែអាចចូលបន្ទប់បាន
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localVideo.srcObject = localStream;
  } catch (err) {
    console.log('ចូលបន្ទប់ដោយគ្មាន Microphone');
    localStream = new MediaStream(); // បង្កើត Stream ទទេដើម្បីកុំឱ្យ Error
  }

  document.getElementById('auth').classList.add('hidden');
  document.getElementById('room-container').classList.remove('hidden');
  document.getElementById('welcome-text').innerText = `អ្នកប្រើប្រាស់: ${username} | បន្ទប់: ${roomId}`;

  initPeerConnection(roomId);
  socket.emit('join-room', roomId, socket.id);
}

function initPeerConnection(roomId) {
  peerConnection = new RTCPeerConnection(config);

  if (localStream) {
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
  }

  peerConnection.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { to: roomId, signal: { candidate: event.candidate } });
    }
  };

  socket.on('user-connected', async (userId) => {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { to: roomId, signal: { sdp: offer } });
  });

  socket.on('signal', async (data) => {
    if (data.signal.sdp) {
      await peerConnection.setLocalDescription(new RTCSessionDescription(data.signal.sdp));
      if (data.signal.sdp.type === 'offer') {
        const answer = await peerConnection.createAnswer();
        await peerConnection.setLocalDescription(answer);
        socket.emit('signal', { to: roomId, signal: { sdp: answer } });
      }
    } else if (data.signal.candidate) {
      await peerConnection.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
    }
  });
}

async function shareScreen() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    const sender = peerConnection.getSenders().find(s => s.track && s.track.kind === 'video');
    if (sender) {
      sender.replaceTrack(screenTrack);
    } else {
      peerConnection.addTrack(screenTrack, screenStream);
    }

    localVideo.srcObject = screenStream;

    screenTrack.onended = () => {
      localVideo.srcObject = localStream;
      if (sender) sender.replaceTrack(null);
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
