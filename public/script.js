const socket = io();
let localStream = new MediaStream();
let screenStream = null;
let peerConnection;
let currentRoomId = '';

const config = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');

// មុខងារចុចលើ Video ដើម្បីពង្រីកធំ (Fullscreen)
function makeFullscreen(videoElem) {
  if (videoElem.requestFullscreen) {
    videoElem.requestFullscreen();
  } else if (videoElem.webkitRequestFullscreen) {
    videoElem.webkitRequestFullscreen();
  } else if (videoElem.msRequestFullscreen) {
    videoElem.msRequestFullscreen();
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
    console.log('ចូលបន្ទប់ដោយគ្មាន Mic');
    localStream = new MediaStream();
  }

  document.getElementById('auth').classList.add('hidden');
  document.getElementById('room-container').classList.remove('hidden');
  document.getElementById('welcome-text').innerText = `អ្នកប្រើប្រាស់: ${username} | បន្ទប់: ${roomId}`;

  initPeerConnection();
  socket.emit('join-room', roomId, socket.id);
}

function initPeerConnection() {
  peerConnection = new RTCPeerConnection(config);

  // បន្ថែម Track ទាំងអស់ដែលមានទៅកាន់ Connection
  localStream.getTracks().forEach(track => {
    peerConnection.addTrack(track, localStream);
  });

  // ទទួលយក Video/Audio ពីដៃគូ
  peerConnection.ontrack = (event) => {
    if (remoteVideo.srcObject !== event.streams[0]) {
      remoteVideo.srcObject = event.streams[0];
    }
  };

  peerConnection.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('signal', { to: currentRoomId, signal: { candidate: event.candidate } });
    }
  };

  // នៅពេលអ្នកថ្មីចូលបន្ទប់ បង្កើត Offer ផ្ញើទៅកាន់គេ
  socket.on('user-connected', async () => {
    await sendOffer();
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
      console.error('Signal Error:', e);
    }
  });
}

async function sendOffer() {
  try {
    const offer = await peerConnection.createOffer();
    await peerConnection.setLocalDescription(offer);
    socket.emit('signal', { to: currentRoomId, signal: { sdp: offer } });
  } catch (err) {
    console.error('Error sending offer:', err);
  }
}

// មុខងារ Share Screen
async function shareScreen() {
  try {
    screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    localVideo.srcObject = screenStream;

    // រកមើល Sender ដែលមានស្រាប់ ឬ Add track ថ្មី
    const senders = peerConnection.getSenders();
    const videoSender = senders.find(s => s.track && s.track.kind === 'video');

    if (videoSender) {
      videoSender.replaceTrack(screenTrack);
    } else {
      peerConnection.addTrack(screenTrack, screenStream);
      // ត្រូវ Renegotiate ផ្ញើ Offer ថ្មីភ្លាមៗ
      await sendOffer();
    }

    // នៅពេលចុច Stop Sharing
    screenTrack.onended = async () => {
      localVideo.srcObject = null;
      if (videoSender) {
        peerConnection.removeTrack(videoSender);
      }
      await sendOffer();
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
