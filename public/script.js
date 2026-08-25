const socket = io();
let myPeer;
let myId = '';
let myUsername = '';
let currentRoomId = '';
let localStream = null;
const peerConnections = {};
let isScreenSharing = false;
let screenStream = null;

const localVideo = document.getElementById('localVideo');
const remoteVideosContainer = document.getElementById('remoteVideos');
const screenShareIndicator = document.getElementById('screenShareIndicator');

function makeFullscreen(elem) {
  if (elem.requestFullscreen) elem.requestFullscreen();
  else if (elem.webkitRequestFullscreen) elem.webkitRequestFullscreen();
}

localVideo.onclick = () => makeFullscreen(localVideo);

// បង្កើត Dummy Media Stream ប្រសិនបើគ្មាន Camera/Mic
function createDummyMediaStream() {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 480;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  const videoStream = canvas.captureStream(10);
  const videoTrack = videoStream.getVideoTracks()[0];

  const audioCtx = new AudioContext();
  const osc = audioCtx.createOscillator();
  const dst = osc.connect(audioCtx.createMediaStreamDestination());
  osc.start();
  const audioTrack = dst.stream.getAudioTracks()[0];
  audioTrack.enabled = false;

  return new MediaStream([videoTrack, audioTrack]);
}

// ជ្រើសរើស Stream ណាដែលកំពុងដំណើរការ (បើកំពុង Share Screen យក ScreenStream)
function getCurrentActiveStream() {
  if (isScreenSharing && screenStream) {
    return screenStream;
  }
  return localStream;
}

async function login() {
  const username = document.getElementById('username').value.trim();
  const roomId = document.getElementById('roomInput').value.trim();
  if (!username || !roomId) return alert('សូមបំពេញឈ្មោះ និងលេខបន្ទប់!');

  myUsername = username;
  currentRoomId = roomId;

  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: true, 
      video: true 
    });
  } catch (err) {
    console.log('មិនមាន Camera/Mic ពេញលេញ:', err);
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
      const dummy = createDummyMediaStream();
      localStream = new MediaStream([audioStream.getAudioTracks()[0], dummy.getVideoTracks()[0]]);
    } catch {
      localStream = createDummyMediaStream();
    }
  }

  if (localStream) {
    localVideo.srcObject = localStream;
  }

  myPeer = new Peer({
    config: {
      iceServers: [
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    },
    debug: 1
  });

  myPeer.on('open', (id) => {
    myId = id;
    console.log('✅ My Peer ID:', myId);
    
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `👋 សួស្តី ${username} | បន្ទប់: ${roomId}`;

    socket.emit('join-room', roomId, id, username);
  });

  myPeer.on('call', (call) => {
    console.log('📞 Incoming call from:', call.peer);
    handleIncomingCall(call);
  });

  myPeer.on('error', (err) => {
    console.error('❌ PeerJS Error:', err);
  });

  // Socket Events
  socket.on('all-users', (users) => {
    users.forEach(user => {
      if (user.peerId !== myId) {
        addRemoteVideo(user.peerId, user.username);
        setTimeout(() => connectToUser(user.peerId), 500);
      }
    });
    updateUserCount();
  });

  socket.on('user-joined', ({ peerId, username }) => {
    if (peerId !== myId) {
      addRemoteVideo(peerId, username);
      setTimeout(() => connectToUser(peerId), 500);
      updateUserCount();
    }
  });

  socket.on('user-left', (peerId) => {
    removeRemoteVideo(peerId);
    if (peerConnections[peerId]) {
      peerConnections[peerId].close();
      delete peerConnections[peerId];
    }
    updateUserCount();
  });
}

function connectToUser(peerId) {
  if (peerConnections[peerId]) return;

  const streamToSend = getCurrentActiveStream();

  try {
    const call = myPeer.call(peerId, streamToSend);
    peerConnections[peerId] = call;
    updateConnectionStatus(peerId, '⏳ Connecting...');

    call.on('stream', (remoteStream) => {
      const videoElement = document.getElementById(`video-${peerId}`);
      if (videoElement) {
        videoElement.srcObject = remoteStream;
        updateConnectionStatus(peerId, '🟢 Online');
      }
    });

    call.on('close', () => {
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

    call.on('error', () => {
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

  } catch (err) {
    console.error('❌ Error calling peer:', err);
  }
}

function handleIncomingCall(call) {
  const peerId = call.peer;
  if (peerConnections[peerId]) return;

  peerConnections[peerId] = call;
  updateConnectionStatus(peerId, '⏳ Connecting...');

  const streamToSend = getCurrentActiveStream();

  try {
    call.answer(streamToSend);

    call.on('stream', (remoteStream) => {
      const videoElement = document.getElementById(`video-${peerId}`);
      if (videoElement) {
        videoElement.srcObject = remoteStream;
        updateConnectionStatus(peerId, '🟢 Online');
      }
    });

    call.on('close', () => {
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

    call.on('error', () => {
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

  } catch (err) {
    console.error('❌ Error answering call:', err);
  }
}

function updateConnectionStatus(peerId, status) {
  const statusElement = document.getElementById(`status-${peerId}`);
  if (statusElement) {
    statusElement.textContent = status;
    if (status.includes('🟢')) {
      statusElement.style.color = '#28a745';
    } else if (status.includes('🔴')) {
      statusElement.style.color = '#dc3545';
    } else {
      statusElement.style.color = '#ffc107';
    }
  }
}

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) return;

  const container = document.createElement('div');
  container.className = 'video-box';
  container.id = `video-container-${peerId}`;
  
  container.innerHTML = `
    <p><strong>👤 ${username}</strong> 
      <span id="status-${peerId}" style="color: #ffc107;">⏳ Connecting...</span>
    </p>
    <video id="video-${peerId}" autoplay playsinline></video>
  `;
  
  remoteVideosContainer.appendChild(container);
  
  const video = document.getElementById(`video-${peerId}`);
  if (video) {
    video.onclick = () => makeFullscreen(video);
  }
}

function removeRemoteVideo(peerId) {
  const container = document.getElementById(`video-container-${peerId}`);
  if (container) container.remove();
}

function updateUserCount() {
  const count = Object.keys(peerConnections).length + 1;
  document.getElementById('welcome-text').innerText = 
    `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
}

// មុខងារ Share Screen
async function shareScreen() {
  try {
    if (isScreenSharing) {
      await stopScreenShare();
      return;
    }

    screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: true,
      audio: true 
    });

    isScreenSharing = true;
    document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
    document.getElementById('screenBtn').classList.add('screen-share-active');
    screenShareIndicator.style.display = 'block';

    localVideo.srcObject = screenStream;

    const screenTrack = screenStream.getVideoTracks()[0];

    // ប្តូរ Track ទៅកាន់ដៃគូទាំងអស់ដែលមានស្រាប់
    for (const [peerId, call] of Object.entries(peerConnections)) {
      const pc = call.peerConnection;
      if (!pc) continue;

      const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(screenTrack);
      }
    }

    screenTrack.onended = () => {
      stopScreenShare();
    };

  } catch (err) {
    console.error('❌ Error sharing screen:', err);
    stopScreenShare();
  }
}

async function stopScreenShare() {
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').classList.remove('screen-share-active');
  screenShareIndicator.style.display = 'none';

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  if (localStream) {
    localVideo.srcObject = localStream;
    const localVideoTrack = localStream.getVideoTracks()[0];

    for (const [peerId, call] of Object.entries(peerConnections)) {
      const pc = call.peerConnection;
      if (!pc) continue;

      const videoSender = pc.getSenders().find(s => s.track && s.track.kind === 'video');
      if (videoSender && localVideoTrack) {
        await videoSender.replaceTrack(localVideoTrack);
      }
    }
  }
}

function toggleMic() {
  if (!localStream || localStream.getAudioTracks().length === 0) {
    return alert('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!');
  }
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  document.getElementById('micBtn').innerHTML = audioTrack.enabled ? '🎤 បិទ/បើក មេក្រូ' : '🔇 បើក មេក្រូ';
  document.getElementById('micBtn').style.background = audioTrack.enabled ? '#28a745' : '#dc3545';
}

function leaveRoom() {
  if (isScreenSharing) stopScreenShare();
  for (const [peerId, call] of Object.entries(peerConnections)) call.close();
  if (myPeer) myPeer.destroy();
  if (localStream) localStream.getTracks().forEach(track => track.stop());
  socket.disconnect();
  location.reload();
}
