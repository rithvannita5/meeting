const socket = io();
let myPeer;
let myId = '';
let myUsername = '';
let currentRoomId = '';
let localStream = null;
const peerConnections = {}; // រក្សាទុកការភ្ជាប់ជាមួយអ្នកប្រើទាំងអស់
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
    }
  });

  myPeer.on('open', (id) => {
    myId = id;
    console.log('My Peer ID:', myId);
    
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `👋 សួស្តី ${username} | បន្ទប់: ${roomId} | អ្នកប្រើ: 1`;

    socket.emit('join-room', roomId, id, username);
  });

  myPeer.on('call', (call) => {
    console.log('📞 Incoming call from:', call.peer);
    handleIncomingCall(call);
  });

  myPeer.on('error', (err) => {
    console.error('PeerJS Error:', err);
  });

  // ============================================================
  // **Socket Events - Multi-User**
  // ============================================================

  // **ទទួលបញ្ជីអ្នកប្រើទាំងអស់**
  socket.on('all-users', (users) => {
    console.log('📋 All users in room:', users);
    users.forEach(user => {
      if (user.peerId !== myId) {
        addRemoteVideo(user.peerId, user.username);
        connectToUser(user.peerId);
      }
    });
    updateUserCount();
  });

  // **ពេលមានអ្នកថ្មីចូល**
  socket.on('user-joined', ({ peerId, username }) => {
    console.log(`👤 ${username} (${peerId}) joined the room`);
    if (peerId !== myId) {
      addRemoteVideo(peerId, username);
      connectToUser(peerId);
      updateUserCount();
    }
  });

  // **ពេលអ្នកណាម្នាក់ចាកចេញ**
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
    console.log('Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
  });
}

// ============================================================
// **គ្រប់គ្រងការភ្ជាប់ជាមួយអ្នកប្រើ**
// ============================================================

function connectToUser(peerId) {
  console.log('🔗 Connecting to user:', peerId);
  
  if (!localStream) {
    console.error('No local stream available');
    return;
  }

  // ប្រសិនបើភ្ជាប់រួចហើយ មិនភ្ជាប់បន្ថែម
  if (peerConnections[peerId]) {
    console.log('Already connected to:', peerId);
    return;
  }

  const call = myPeer.call(peerId, localStream);
  peerConnections[peerId] = call;

  call.on('stream', (remoteStream) => {
    console.log('📺 Received stream from:', peerId);
    const videoElement = document.getElementById(`video-${peerId}`);
    if (videoElement) {
      videoElement.srcObject = remoteStream;
      // បង្ហាញ status Online
      const statusElement = document.getElementById(`status-${peerId}`);
      if (statusElement) {
        statusElement.textContent = '🟢 Online';
        statusElement.style.color = '#28a745';
      }
    }
  });

  call.on('close', () => {
    console.log('🔌 Call closed with:', peerId);
    delete peerConnections[peerId];
    const videoElement = document.getElementById(`video-${peerId}`);
    if (videoElement) {
      videoElement.srcObject = null;
    }
    const statusElement = document.getElementById(`status-${peerId}`);
    if (statusElement) {
      statusElement.textContent = '🔴 Offline';
      statusElement.style.color = '#dc3545';
    }
  });

  call.on('error', (err) => {
    console.error('Call error with', peerId, ':', err);
  });
}

function handleIncomingCall(call) {
  const peerId = call.peer;
  console.log('📞 Incoming call from:', peerId);
  
  // ប្រសិនបើមានការភ្ជាប់រួចហើយ
  if (peerConnections[peerId]) {
    console.log('Already connected to this peer, ignoring call');
    return;
  }

  peerConnections[peerId] = call;
  call.answer(localStream);

  call.on('stream', (remoteStream) => {
    console.log('📺 Received stream from:', peerId);
    const videoElement = document.getElementById(`video-${peerId}`);
    if (videoElement) {
      videoElement.srcObject = remoteStream;
      const statusElement = document.getElementById(`status-${peerId}`);
      if (statusElement) {
        statusElement.textContent = '🟢 Online';
        statusElement.style.color = '#28a745';
      }
    }
  });

  call.on('close', () => {
    console.log('🔌 Call closed with:', peerId);
    delete peerConnections[peerId];
    const videoElement = document.getElementById(`video-${peerId}`);
    if (videoElement) {
      videoElement.srcObject = null;
    }
    const statusElement = document.getElementById(`status-${peerId}`);
    if (statusElement) {
      statusElement.textContent = '🔴 Offline';
      statusElement.style.color = '#dc3545';
    }
  });
}

// ============================================================
// **គ្រប់គ្រង Video Elements**
// ============================================================

function addRemoteVideo(peerId, username) {
  // ពិនិត្យមើលថាមានរួចហើយឬនៅ
  if (document.getElementById(`video-container-${peerId}`)) {
    return;
  }

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
  
  // ចុចលើវីដេអូដើម្បីពង្រីក
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
  const count = Object.keys(peerConnections).length + 1; // +1 សម្រាប់ខ្លួនឯង
  document.getElementById('welcome-text').innerHTML = 
    `👋 សួស្តី ${myUsername} | បន្ទប់: ${currentRoomId} | អ្នកប្រើ: ${count}`;
}

// ============================================================
// **មុខងារផ្សេងទៀត**
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

async function shareScreen() {
  try {
    if (isScreenSharing) {
      stopScreenShare();
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

    // បង្ហាញ screen នៅ local
    localVideo.srcObject = screenStream;

    // **បញ្ជូន screen stream ទៅអ្នកទាំងអស់**
    for (const [peerId, call] of Object.entries(peerConnections)) {
      try {
        const senders = call.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender) {
          videoSender.replaceTrack(screenStream.getVideoTracks()[0]);
        }
      } catch (err) {
        console.error('Error sending screen to', peerId, ':', err);
      }
    }

    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

  } catch (err) {
    console.error('Error sharing screen:', err);
    alert('មិនអាចចែករំលែកអេក្រង់បានទេ: ' + err.message);
    isScreenSharing = false;
    screenStream = null;
    document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
    document.getElementById('screenBtn').classList.remove('screen-share-active');
    screenShareIndicator.textContent = '';
    screenShareIndicator.style.display = 'none';
  }
}

function stopScreenShare() {
  console.log('Stopping screen share...');
  
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
    
    // ត្រឡប់ទៅកាមេរ៉ាវិញសម្រាប់អ្នកទាំងអស់
    for (const [peerId, call] of Object.entries(peerConnections)) {
      try {
        const senders = call.peerConnection.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === 'video');
        if (videoSender && localStream.getVideoTracks().length > 0) {
          videoSender.replaceTrack(localStream.getVideoTracks()[0]);
        }
      } catch (err) {
        console.error('Error returning to camera for', peerId, ':', err);
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
  if (isScreenSharing) {
    stopScreenShare();
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
