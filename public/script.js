// ============================================================
// GLOBAL VARIABLES
// ============================================================
let socket = null;
let socketConnected = false;
let myPeer = null;
let myId = '';
let myUsername = '';
let currentUserRole = '';
let currentRoomId = '';
let localStream = null;
let cameraStream = null;
let screenStream = null;

const peerCalls = {};
const userNamesMap = {};

let isCameraOn = false;
let isScreenSharing = false;
let isRemoteControlActive = false;
let remoteControlTarget = null;
let isBeingControlled = false;
let remotePointer = null;

let unreadChats = {};
let isChatOpen = false;

// ============================================================
// PEERJS INITIALIZATION (WITH ICE/STUN/TURN CONFIG)
// ============================================================
function initPeerJS() {
  myPeer = new Peer(undefined, {
    host: '/',
    port: location.port || (location.protocol === 'https:' ? 443 : 80),
    path: '/peerjs',
    config: {
      iceServers: [
        // STUN Servers (Google & Stunprotocol)
        { urls: 'stun:stun.l.google.com:19302' },
        { urls: 'stun:stun1.l.google.com:19302' },
        { urls: 'stun:stun2.l.google.com:19302' },
        { urls: 'stun:stun3.l.google.com:19302' },
        { urls: 'stun:stun4.l.google.com:19302' },
        { urls: 'stun:stun.services.mozilla.com' },

        // Free TURN Servers (ជួយ Relay ទិន្នន័យ Screenshare ឆ្លង NAT/Firewall)
        {
          urls: 'turn:openrelay.metered.ca:80',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        },
        {
          urls: 'turn:openrelay.metered.ca:443?transport=tcp',
          username: 'openrelayproject',
          credential: 'openrelayproject'
        }
      ]
    }
  });

  myPeer.on('open', (id) => {
    myId = id;
    console.log('✅ PeerJS Connected with ID:', myId);
    if (socket && currentRoomId) {
      socket.emit('join-room', currentRoomId, myId, myUsername);
    }
  });

  // ទទួល Call (ទាំង Stream វីដេអូ និង Screenshare)
  myPeer.on('call', (call) => {
    const isScreenCall = call.metadata && call.metadata.type === 'screen';
    
    // បញ្ជូន Stream ត្រឡប់ទៅវិញប្រសិនបើមាន
    call.answer(localStream || screenStream);

    call.on('stream', (remoteStream) => {
      const senderPeerId = call.peer;
      const senderName = (call.metadata && call.metadata.username) || userNamesMap[senderPeerId] || 'អ្នកចូលរួម';

      if (isScreenCall) {
        addRemoteScreenStream(senderPeerId, senderName, remoteStream);
      } else {
        addRemoteVideoStream(senderPeerId, senderName, remoteStream);
      }
    });

    call.on('close', () => {
      removeRemoteVideo(call.peer);
      removeRemoteScreenVideo(call.peer);
    });

    peerCalls[call.peer] = call;
  });

  myPeer.on('error', (err) => {
    console.error('❌ PeerJS Error:', err);
    showToast('⚠️ ការភ្ជាប់ Peer ជួបបញ្ហា: ' + err.type, 'warning');
  });
}

// ============================================================
// SCREENSHARE FUNCTIONALITY
// ============================================================
async function toggleScreenShare() {
  if (isScreenSharing) {
    stopScreenShare();
  } else {
    try {
      screenStream = await navigator.mediaDevices.getDisplayMedia({
        video: { cursor: "always" },
        audio: true
      });

      isScreenSharing = true;
      updateScreenShareUI(true);

      // បង្ហាញ Local Screen លើ ScreenGrid
      const localScreenVideo = document.getElementById('localScreenVideo');
      if (localScreenVideo) {
        localScreenVideo.srcObject = screenStream;
        localScreenVideo.play();
      }

      // Call ទៅកាន់គ្រប់គ្នាក្នុងបន្ទប់ដើម្បីផ្ញើ Screenshare
      Object.keys(userNamesMap).forEach((targetPeerId) => {
        if (targetPeerId !== myId) {
          const call = myPeer.call(targetPeerId, screenStream, {
            metadata: { type: 'screen', username: myUsername }
          });
          peerCalls['screen-' + targetPeerId] = call;
        }
      });

      // បើឈប់ Share Screenshare ដោយសារចុចលើ Chrome Native Stop Button
      screenStream.getVideoTracks()[0].onended = () => {
        stopScreenShare();
      };

    } catch (err) {
      console.error('Error starting screenshare:', err);
      showToast('❌ មិនអាចចែករំលែកអេក្រង់បានទេ!', 'error');
    }
  }
}

function stopScreenShare() {
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }
  isScreenSharing = false;
  updateScreenShareUI(false);
  showToast('បានបញ្ឈប់ការ Share Screen', 'info');
}

// ============================================================
// SOCKET.IO CONNECTION & LISTENERS
// ============================================================
function connectSocket() {
  socket = io({
    transports: ['polling', 'websocket'],
    reconnection: true,
    reconnectionAttempts: Infinity,
    reconnectionDelay: 1000,
    timeout: 60000,
    path: '/socket.io'
  });

  socket.on('connect', () => {
    console.log('✅ Socket.IO connected!');
    socketConnected = true;
    showToast('✅ ភ្ជាប់ Server បានជោគជ័យ!', 'success');
    if (myPeer && myPeer.id && currentRoomId) {
      socket.emit('join-room', currentRoomId, myPeer.id, myUsername);
    }
  });

  socket.on('disconnect', () => {
    socketConnected = false;
  });

  socket.on('receive-otp', (data) => {
    alert('🚨 ព្រមាន៖ មានគេកំពុង Login គណនីរបស់អ្នកពីឧបករណ៍ផ្សេង!\n🔐 លេខកូដ 2FA: 【 ' + data.otp + ' 】');
  });

  socket.on('existing-users', (users) => {
    users.forEach((user, index) => {
      userNamesMap[user.peerId] = user.username;
      setTimeout(() => {
        connectToUser(user.peerId);
      }, (index + 1) * 500);
    });
    updateUserCount();
  });

  socket.on('user-joined', (data) => {
    if (data.peerId !== myId) {
      userNamesMap[data.peerId] = data.username;
      updateUserCount();

      // ប្រសិនបើកំពុង Share Screen ស្រាប់ ត្រូវ Call ទៅអ្នកដែលទើបចូលថ្មី
      if (isScreenSharing && screenStream) {
        setTimeout(() => {
          myPeer.call(data.peerId, screenStream, {
            metadata: { type: 'screen', username: myUsername }
          });
        }, 1200);
      }
    }
  });

  socket.on('user-left', (peerId) => {
    removeRemoteVideo(peerId);
    removeRemoteScreenVideo(peerId);
    if (peerCalls[peerId]) {
      peerCalls[peerId].close();
      delete peerCalls[peerId];
    }
    delete userNamesMap[peerId];
    updateUserCount();
  });

  socket.on('receive-private-message', (data) => {
    const chatMsgs = document.getElementById('chat-messages');
    if (chatMsgs) {
      chatMsgs.innerHTML += `<div class="msg-item"><b>From 👤 ${data.fromUsername}:</b><br>${data.message}</div>`;
      chatMsgs.scrollTop = chatMsgs.scrollHeight;
    }
  });
}

function connectToUser(targetPeerId) {
  if (!localStream) return;
  const call = myPeer.call(targetPeerId, localStream, {
    metadata: { type: 'camera', username: myUsername }
  });

  call.on('stream', (remoteStream) => {
    addRemoteVideoStream(targetPeerId, userNamesMap[targetPeerId] || 'អ្នកចូលរួម', remoteStream);
  });

  call.on('close', () => {
    removeRemoteVideo(targetPeerId);
  });

  peerCalls[targetPeerId] = call;
}

// ============================================================
// HELPER DOM FUNCTIONS
// ============================================================
function addRemoteVideoStream(peerId, username, stream) {
  let videoGrid = document.getElementById('videoGrid');
  if (!videoGrid) return;

  let card = document.getElementById(`video-card-${peerId}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `video-card-${peerId}`;
    card.className = 'video-card';
    card.innerHTML = `
      <video id="video-${peerId}" autoplay playsinline></video>
      <div class="user-label">${username}</div>
    `;
    videoGrid.appendChild(card);
  }

  const videoEl = document.getElementById(`video-${peerId}`);
  if (videoEl) {
    videoEl.srcObject = stream;
    videoEl.play();
  }
}

function addRemoteScreenStream(peerId, username, stream) {
  let screenGrid = document.getElementById('screenGrid');
  if (!screenGrid) return;

  let card = document.getElementById(`screen-card-${peerId}`);
  if (!card) {
    card = document.createElement('div');
    card.id = `screen-card-${peerId}`;
    card.className = 'screen-card';
    card.innerHTML = `
      <video id="screen-video-${peerId}" autoplay playsinline></video>
      <div class="user-label">🖥️ Screen: ${username}</div>
    `;
    screenGrid.appendChild(card);
  }

  const videoEl = document.getElementById(`screen-video-${peerId}`);
  if (videoEl) {
    videoEl.srcObject = stream;
    videoEl.play();
  }
}

function removeRemoteVideo(peerId) {
  const card = document.getElementById(`video-card-${peerId}`);
  if (card) card.remove();
}

function removeRemoteScreenVideo(peerId) {
  const card = document.getElementById(`screen-card-${peerId}`);
  if (card) card.remove();
}

function updateUserCount() {
  const countEl = document.getElementById('userCount');
  if (countEl) {
    const total = Object.keys(userNamesMap).length + 1;
    countEl.innerText = total;
  }
}

function updateScreenShareUI(active) {
  const btn = document.getElementById('btnScreenShare');
  if (btn) {
    btn.style.backgroundColor = active ? '#f44336' : '#2196F3';
    btn.innerText = active ? '🛑 Stop Share' : '🖥️ Share Screen';
  }
}

function showToast(message, type = 'info') {
  console.log(`[Toast ${type}]: ${message}`);
}

// Initial Call on Load
document.addEventListener('DOMContentLoaded', () => {
  connectSocket();
  initPeerJS();
});
