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
    console.log('មិនមាន Camera/Mic:', err);
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      });
    } catch {
      localStream = createEmptyAudioStream();
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
    debug: 2
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

  // ============================================================
  // **Socket Events**
  // ============================================================

  socket.on('all-users', (users) => {
    console.log('📋 All users in room:', users);
    users.forEach(user => {
      if (user.peerId !== myId) {
        addRemoteVideo(user.peerId, user.username);
        setTimeout(() => connectToUser(user.peerId), 500);
      }
    });
    updateUserCount();
  });

  socket.on('user-joined', ({ peerId, username }) => {
    console.log(`👤 ${username} (${peerId}) joined the room`);
    if (peerId !== myId) {
      addRemoteVideo(peerId, username);
      setTimeout(() => connectToUser(peerId), 500);
      updateUserCount();
    }
  });

  socket.on('user-left', (peerId) => {
    console.log(`👤 User ${peerId} left the room`);
    removeRemoteVideo(peerId);
    if (peerConnections[peerId]) {
      peerConnections[peerId].close();
      delete peerConnections[peerId];
    }
    updateUserCount();
  });

  socket.on('connect', () => {
    console.log('✅ Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('❌ Socket disconnected');
  });
}

// ============================================================
// **គ្រប់គ្រងការភ្ជាប់**
// ============================================================

function connectToUser(peerId) {
  console.log('🔗 Attempting to connect to:', peerId);
  
  if (!localStream) {
    console.error('❌ No local stream available');
    return;
  }

  if (peerConnections[peerId]) {
    console.log('Already connected to:', peerId);
    return;
  }

  try {
    const call = myPeer.call(peerId, localStream);
    peerConnections[peerId] = call;
    updateConnectionStatus(peerId, '⏳ Connecting...');

    call.on('stream', (remoteStream) => {
      console.log('📺 Received stream from:', peerId);
      const videoElement = document.getElementById(`video-${peerId}`);
      if (videoElement) {
        videoElement.srcObject = remoteStream;
        updateConnectionStatus(peerId, '🟢 Online');
      }
    });

    call.on('close', () => {
      console.log('🔌 Call closed with:', peerId);
      delete peerConnections[peerId];
      const videoElement = document.getElementById(`video-${peerId}`);
      if (videoElement) {
        videoElement.srcObject = null;
      }
      updateConnectionStatus(peerId, '🔴 Offline');
    });

    call.on('error', (err) => {
      console.error('❌ Call error with', peerId, ':', err);
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

  } catch (err) {
    console.error('❌ Error calling peer:', err);
    delete peerConnections[peerId];
    updateConnectionStatus(peerId, '🔴 Offline');
  }
}

function handleIncomingCall(call) {
  const peerId = call.peer;
  console.log('📞 Incoming call from:', peerId);
  
  if (peerConnections[peerId]) {
    console.log('Already connected to this peer');
    return;
  }

  peerConnections[peerId] = call;
  updateConnectionStatus(peerId, '⏳ Connecting...');

  try {
    call.answer(localStream);

    call.on('stream', (remoteStream) => {
      console.log('📺 Received stream from:', peerId);
      const videoElement = document.getElementById(`video-${peerId}`);
      if (videoElement) {
        videoElement.srcObject = remoteStream;
        updateConnectionStatus(peerId, '🟢 Online');
      }
    });

    call.on('close', () => {
      console.log('🔌 Call closed with:', peerId);
      delete peerConnections[peerId];
      const videoElement = document.getElementById(`video-${peerId}`);
      if (videoElement) {
        videoElement.srcObject = null;
      }
      updateConnectionStatus(peerId, '🔴 Offline');
    });

    call.on('error', (err) => {
      console.error('❌ Call error with', peerId, ':', err);
      delete peerConnections[peerId];
      updateConnectionStatus(peerId, '🔴 Offline');
    });

  } catch (err) {
    console.error('❌ Error answering call:', err);
    delete peerConnections[peerId];
    updateConnectionStatus(peerId, '🔴 Offline');
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

// ============================================================
// **គ្រប់គ្រង Video Elements**
// ============================================================

function addRemoteVideo(peerId, username) {
  if (document.getElementById(`video-container-${peerId}`)) {
    return;
  }

  const container = document.createElement('div');
  container.className = 'video-box';
  container.id = `video-container-${peerId}`;
  container.dataset.peerId = peerId;
  
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
  if (container) {
    container.remove();
  }
}

function updateUserCount() {
  const count = Object.keys(peerConnections).length + 1;
  document.getElementById('welcome-text').innerHTML = 
    `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
}

// ============================================================
// **មុខងារ Create Stream**
// ============================================================

function createEmptyAudioStream() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const dst = osc.connect(ctx.createMediaStreamDestination());
  osc.start();
  const track = dst.stream.getAudioTracks()[0];
  track.enabled = false;
  return new MediaStream([track]);
}

// ============================================================
// **មុខងារ Share Screen**
// ============================================================

async function shareScreen() {
  try {
    if (isScreenSharing) {
      await stopScreenShare(); // បន្ថែម await
      return;
    }

    screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: true 
    });

    isScreenSharing = true;
    document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
    document.getElementById('screenBtn').classList.add('screen-share-active');
    screenShareIndicator.textContent = '📺 អ្នកកំពុងចែករំលែកអេក្រង់';
    screenShareIndicator.style.display = 'block';

    localVideo.srcObject = screenStream;

    console.log('📤 Sending screen to all users...');
    
    for (const [peerId, call] of Object.entries(peerConnections)) {
      try {
        const pc = call.peerConnection;
        if (!pc) {
          console.error('No peer connection for:', peerId);
          continue;
        }

        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        
        if (videoSender) {
          await videoSender.replaceTrack(screenStream.getVideoTracks()[0]);
          console.log('✅ Screen sent to:', peerId);
        } else {
          pc.addTrack(screenStream.getVideoTracks()[0], screenStream);
          console.log('✅ Screen added to:', peerId);
        }

        const audioTrack = screenStream.getAudioTracks()[0];
        if (audioTrack) {
          const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
          if (audioSender) {
            await audioSender.replaceTrack(audioTrack);
          }
        }

      } catch (err) {
        console.error('❌ Error sending screen to', peerId, ':', err);
      }
    }

    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

  } catch (err) {
    console.error('❌ Error sharing screen:', err);
    alert('មិនអាចចែករំលែកអេក្រង់បានទេ: ' + err.message);
    isScreenSharing = false;
    screenStream = null;
    document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
    document.getElementById('screenBtn').classList.remove('screen-share-active');
    screenShareIndicator.textContent = '';
    screenShareIndicator.style.display = 'none';
  }
}

// ============================================================
// **បញ្ឈប់ Screen Share - ធ្វើជា async**
// ============================================================

async function stopScreenShare() {  // <-- បន្ថែម async
  console.log('🛑 Stopping screen share...');
  
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').classList.remove('screen-share-active');
  screenShareIndicator.textContent = '';
  screenShareIndicator.style.display = 'none';

  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  if (localStream) {
    localVideo.srcObject = localStream;

    for (const [peerId, call] of Object.entries(peerConnections)) {
      try {
        const pc = call.peerConnection;
        if (!pc) continue;

        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        
        if (videoSender && localStream.getVideoTracks().length > 0) {
          await videoSender.replaceTrack(localStream.getVideoTracks()[0]); // <-- await នៅទីនេះ
          console.log('✅ Returned to camera for:', peerId);
        }
      } catch (err) {
        console.error('❌ Error returning to camera for', peerId, ':', err);
      }
    }
  }
}

// ============================================================
// **មុខងារផ្សេងទៀត**
// ============================================================

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
  if (isScreenSharing) {
    stopScreenShare(); // លុប await ចេញ ព្រោះមិនមែន async
  }
  
  for (const [peerId, call] of Object.entries(peerConnections)) {
    call.close();
  }
  
  if (myPeer) {
    myPeer.destroy();
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  socket.disconnect();
  location.reload();
}
