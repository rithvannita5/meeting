const socket = io();
let myPeer;
let myId = '';
let currentRoomId = '';
let localStream = null;
let currentCall = null;

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
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
  } catch (err) {
    console.log('ដំណើរការដោយគ្មាន Mic');
    localStream = createEmptyAudioStream();
  }

  // បង្កើត Peer Connection តាម Cloud ឥតគិតថ្លៃរបស់ PeerJS
  myPeer = new Peer();

  myPeer.on('open', (id) => {
    myId = id;
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `អ្នកប្រើប្រាស់: ${username} | បន្ទប់: ${roomId}`;

    socket.emit('join-room', roomId, id);
  });

  // ពេលមានគេខលមក (Incoming Call)
  myPeer.on('call', (call) => {
    currentCall = call;
    call.answer(localStream);
    call.on('stream', (remoteStream) => {
      remoteVideo.srcObject = remoteStream;
    });
  });

  // ពេលមានដៃគូថ្មីចូលបន្ទប់
  socket.on('user-connected', (peerId) => {
    connectToNewUser(peerId, localStream);
  });

  socket.on('user-disconnected', () => {
    remoteVideo.srcObject = null;
  });
}

function connectToNewUser(peerId, stream) {
  const call = myPeer.call(peerId, stream);
  currentCall = call;
  call.on('stream', (remoteStream) => {
    remoteVideo.srcObject = remoteStream;
  });
}

function createEmptyAudioStream() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const dst = osc.connect(ctx.createMediaStreamDestination());
  osc.start();
  const track = dst.stream.getAudioTracks()[0];
  track.enabled = false;
  return new MediaStream([track]);
}

// មុខងារ Share Screen
async function shareScreen() {
  try {
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: true });
    const screenTrack = screenStream.getVideoTracks()[0];

    localVideo.srcObject = screenStream;

    // ជំនួស Track ទៅកាន់ដៃគូ
    if (currentCall && currentCall.peerConnection) {
      const senders = currentCall.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');

      if (videoSender) {
        videoSender.replaceTrack(screenTrack);
      } else {
        currentCall.peerConnection.addTrack(screenTrack, screenStream);
      }
    } else {
      // ហៅ Call ឡើងវិញជាមួយ Stream អេក្រង់
      socket.emit('refresh-media', currentRoomId);
      localStream = screenStream;
    }

    screenTrack.onended = () => {
      localVideo.srcObject = null;
      if (currentCall && currentCall.peerConnection) {
        const senders = currentCall.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) currentCall.peerConnection.removeTrack(videoSender);
      }
    };
  } catch (err) {
    console.error('Error sharing screen:', err);
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
