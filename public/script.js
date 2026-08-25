const socket = io();
let localStream = new MediaStream();
let screenStream = null;
let peerConnections = {}; // គ្រប់គ្រងការភ្ជាប់ជាមួយដៃគូ
let currentRoomId = '';

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' },
    { urls: 'stun:stun2.l.google.com:19302' }
  ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

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

  currentRoomId = roomId;

  try {
    const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    localStream = audioStream;
  } catch (err) {
    console.log('ដំណើរការដោយគ្មាន Mic');
    localStream = new MediaStream();
  }

  document.getElementById('auth').classList.add('hidden');
  document.getElementById('room-container').classList.remove('hidden');
  document.getElementById('welcome-text').innerText = `អ្នកប្រើប្រាស់: ${username} | បន្ទប់: ${roomId}`;

  socket.emit('join-room', roomId, username);
}

// ពេលចូលបន្ទប់ ហើយមានអ្នកដទៃនៅចាំស្រាប់
socket.on('all-users', (users) => {
  users.forEach(userId => {
    const pc = createPeerConnection(userId);
    // បង្កើត Offer ផ្ញើទៅអ្នកដែលមានស្រាប់
    pc.createOffer().then(offer => {
      return pc.setLocalDescription(offer);
    }).then(() => {
      socket.emit('signal', { to: userId, signal: { sdp: pc.localDescription } });
    });
  });
});

// ពេលមានអ្នកថ្មីចូលមកក្នុងបន្ទប់
socket.on('user-connected', (userId) => {
  createPeerConnection(userId);
});

// ទទួលទិន្នន័យ Signal (Offer / Answer / Candidate)
socket.on('signal', async (data) => {
  const pc = peerConnections[data.from] || createPeerConnection(data.from);

  if (data.signal.sdp) {
    await pc.setRemoteDescription(new RTCSessionDescription(data.signal.sdp));
    if (data.signal.sdp.type === 'offer') {
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('signal', { to: data.from, signal: { sdp: pc.localDescription } });
    }
  } else if (data.signal.candidate) {
    try {
      await pc.addIceCandidate(new RTCIceCandidate(data.signal.candidate));
    } catch (e) {
      console.error('Error adding ICE candidate', e);
    }
  }
});

socket.on('user-disconnected', (userId) => {
  if (peerConnections[userId]) {
    peerConnections[userId].close();
    delete peerConnections[userId];
  }
  remoteVideo.srcObject = null;
});

function createPeerConnection(userId) {
  if (peerConnections[userId]) return peerConnections[userId];

  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections[userId] = pc;

  // បញ្ចូល Audio Track
  localStream.getTracks().forEach(track => {
    pc.addTrack(track, localStream);
  });

  // បើកំពុង Share Screen បញ្ចូល Video Track ដែរ
  if (screenStream) {
    screenStream.getTracks().forEach(track => {
      pc.addTrack(track, screenStream);
    });
  }

  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { to: userId, signal: { candidate: event.candidate } });
    }
  };

  pc.ontrack = (event) => {
    remoteVideo.srcObject = event.streams[0];
  };

  return pc;
}

// មុខងារ Share Screen
async function shareScreen() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    localVideo.srcObject = screenStream;

    // បញ្ជូន Screen ទៅកាន់ដៃគូទាំងអស់
    for (const userId in peerConnections) {
      const pc = peerConnections[userId];
      const senders = pc.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');

      if (videoSender) {
        videoSender.replaceTrack(screenTrack);
      } else {
        pc.addTrack(screenTrack, screenStream);
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        socket.emit('signal', { to: userId, signal: { sdp: pc.localDescription } });
      }
    }

    screenTrack.onended = async () => {
      localVideo.srcObject = null;
      screenStream = null;
      for (const userId in peerConnections) {
        const pc = peerConnections[userId];
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          pc.removeTrack(videoSender);
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          socket.emit('signal', { to: userId, signal: { sdp: pc.localDescription } });
        }
      }
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
