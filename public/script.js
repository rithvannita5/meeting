const socket = io();
let myPeer;
let myId = '';
let myUsername = '';
let currentRoomId = '';
let localStream = null;
let currentCall = null;
let isScreenSharing = false;
let screenStream = null;
let isReceivingScreen = false;
let screenCall = null; // សម្រាប់ទទួល screen share

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const partnerStatus = document.getElementById('partnerStatus');
const screenShareIndicator = document.getElementById('screenShareIndicator');

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
    document.getElementById('welcome-text').innerText = `👋 សួស្តី ${username} | បន្ទប់: ${roomId}`;

    // ផ្ញើឈ្មោះទៅ server
    socket.emit('join-room', roomId, id, username);
    console.log(`Joined room ${roomId} with peer ID ${id}`);
  });

  // **សំខាន់៖ ទទួលការហៅវីដេអូធម្មតា**
  myPeer.on('call', (call) => {
    console.log('Incoming call from:', call.peer);
    
    // ពិនិត្យមើលថាជា screen share call ឬអត់
    if (call.metadata && call.metadata.type === 'screen-share') {
      handleScreenShareCall(call);
    } else {
      handleNormalCall(call);
    }
  });

  myPeer.on('error', (err) => {
    console.error('PeerJS Error:', err);
  });

  // **Socket Events**
  socket.on('user-connected', (peerId, username) => {
    console.log(`User ${username} (${peerId}) connected`);
    if (peerId !== myId) {
      connectToNewUser(peerId, localStream);
    }
  });

  socket.on('user-disconnected', (peerId) => {
    console.log('User disconnected:', peerId);
    if (remoteVideo.srcObject && currentCall && currentCall.peer === peerId) {
      remoteVideo.srcObject = null;
      currentCall = null;
      updatePartnerStatus(false);
    }
  });

  // **សំខាន់៖ ពេលមានអ្នកចាប់ផ្តើម Share Screen**
  socket.on('screen-share-active', ({ peerId, username }) => {
    console.log(`🖥️ ${username} started screen sharing`);
    screenShareIndicator.textContent = `📺 ${username} កំពុងចែករំលែកអេក្រង់`;
    screenShareIndicator.style.display = 'block';
    
    // ទទួល screen share ពីអ្នកដែលកំពុងចែករំលែក
    if (peerId !== myId) {
      receiveScreenShare(peerId);
    }
  });

  // **សំខាន់៖ ពេលមានអ្នកបញ្ឈប់ Share Screen**
  socket.on('screen-share-stopped', () => {
    console.log('🛑 Screen sharing stopped');
    screenShareIndicator.textContent = '';
    screenShareIndicator.style.display = 'none';
    
    // បញ្ឈប់ការទទួល screen share
    if (screenCall) {
      screenCall.close();
      screenCall = null;
    }
    isReceivingScreen = false;
    remoteVideo.srcObject = null;
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
    updatePartnerStatus(false);
  });
}

// **គ្រប់គ្រងការហៅធម្មតា**
function handleNormalCall(call) {
  currentCall = call;
  call.answer(localStream);
  
  call.on('stream', (remoteStream) => {
    console.log('Received remote stream');
    if (!isReceivingScreen) {
      remoteVideo.srcObject = remoteStream;
    }
    updatePartnerStatus(true);
  });
  
  call.on('close', () => {
    console.log('Call closed');
    if (!isReceivingScreen) {
      remoteVideo.srcObject = null;
    }
    updatePartnerStatus(false);
    currentCall = null;
  });
}

// **គ្រប់គ្រងការហៅ Screen Share**
function handleScreenShareCall(call) {
  console.log('📺 Incoming screen share call from:', call.peer);
  screenCall = call;
  isReceivingScreen = true;
  
  call.answer(); // មិនត្រូវការ stream ផ្ទាល់ខ្លួន
  
  call.on('stream', (screenStream) => {
    console.log('📺 Received screen share stream');
    remoteVideo.srcObject = screenStream;
    screenShareIndicator.textContent = '📺 កំពុងមើលអេក្រង់ដៃគូ';
    screenShareIndicator.style.display = 'block';
  });
  
  call.on('close', () => {
    console.log('📺 Screen share call closed');
    if (screenCall === call) {
      screenCall = null;
      isReceivingScreen = false;
      remoteVideo.srcObject = null;
      screenShareIndicator.textContent = '';
      screenShareIndicator.style.display = 'none';
    }
  });
}

// **ទទួល Screen Share ពីអ្នកដទៃ**
function receiveScreenShare(peerId) {
  console.log('Receiving screen share from:', peerId);
  
  if (screenCall) {
    screenCall.close();
    screenCall = null;
  }
  
  // បង្កើតការហៅថ្មីសម្រាប់ screen share
  const call = myPeer.call(peerId, null, {
    metadata: { type: 'screen-share' }
  });
  
  screenCall = call;
  isReceivingScreen = true;
  
  call.on('stream', (screenStream) => {
    console.log('📺 Received screen share stream from:', peerId);
    remoteVideo.srcObject = screenStream;
    screenShareIndicator.textContent = '📺 កំពុងមើលអេក្រង់ដៃគូ';
    screenShareIndicator.style.display = 'block';
  });
  
  call.on('close', () => {
    console.log('📺 Screen share closed from:', peerId);
    if (screenCall === call) {
      screenCall = null;
      isReceivingScreen = false;
      remoteVideo.srcObject = null;
      screenShareIndicator.textContent = '';
      screenShareIndicator.style.display = 'none';
    }
  });
}

function connectToNewUser(peerId, stream) {
  console.log('Connecting to new user:', peerId);
  
  if (!stream) {
    console.error('No stream available');
    return;
  }

  if (currentCall && currentCall.peer !== peerId) {
    console.log('Already have a call with someone else');
    return;
  }

  if (currentCall) {
    // បើមាន call ជាមួយអ្នកនេះរួចហើយ
    return;
  }

  const call = myPeer.call(peerId, stream);
  currentCall = call;
  
  call.on('stream', (remoteStream) => {
    console.log('Received remote stream from:', peerId);
    if (!isReceivingScreen) {
      remoteVideo.srcObject = remoteStream;
    }
    updatePartnerStatus(true);
  });

  call.on('close', () => {
    console.log('Call with', peerId, 'closed');
    if (!isReceivingScreen) {
      remoteVideo.srcObject = null;
    }
    currentCall = null;
    updatePartnerStatus(false);
  });

  call.on('error', (err) => {
    console.error('Call error:', err);
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

// =====================================================================
// **មុខងារ Share Screen - ដូច Discord**
// =====================================================================

async function shareScreen() {
  try {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    // ចាប់យក screen stream
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

    // **បង្ហាញ screen នៅ local**
    localVideo.srcObject = screenStream;

    // **ជូនដំណឹង Server ថាកំពុង Share Screen**
    socket.emit('start-screen-share', currentRoomId, myId, myUsername);

    // **បញ្ជូន screen stream ទៅអ្នកទាំងអស់ក្នុងបន្ទប់**
    // បិទ call ចាស់ប្រសិនបើមាន
    if (currentCall) {
      currentCall.close();
      currentCall = null;
    }

    // **សំខាន់៖ បញ្ជូន screen stream ទៅអ្នកទាំងអស់**
    const usersInRoom = getUsersInRoom();
    usersInRoom.forEach(user => {
      if (user.peerId !== myId) {
        const call = myPeer.call(user.peerId, screenStream, {
          metadata: { type: 'screen-share' }
        });
        
        call.on('stream', (stream) => {
          // នេះជា stream ពីអ្នកផ្សេង (មិនប្រើ)
        });
      }
    });

    // ពេលអ្នកប្រើបិទ screen share
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

// **បញ្ឈប់ Screen Share**
function stopScreenShare() {
  console.log('Stopping screen share...');
  
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').classList.remove('screen-share-active');
  screenShareIndicator.textContent = '';
  screenShareIndicator.style.display = 'none';

  // ជូនដំណឹង Server
  socket.emit('stop-screen-share', currentRoomId);

  // បញ្ឈប់ screen stream
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
    screenStream = null;
  }

  // ត្រឡប់ទៅកាមេរ៉ាវិញ
  if (localStream) {
    localVideo.srcObject = localStream;
  }

  // ភ្ជាប់ការហៅវីដេអូធម្មតាវិញ
  const usersInRoom = getUsersInRoom();
  usersInRoom.forEach(user => {
    if (user.peerId !== myId && !currentCall) {
      connectToNewUser(user.peerId, localStream);
    }
  });
}

// **ទទួលបញ្ជីអ្នកប្រើក្នុងបន្ទប់**
function getUsersInRoom() {
  // នេះជា function សាមញ្ញ - អ្នកអាចកែប្រែតាមតម្រូវការ
  return [];
}

// =====================================================================
// **មុខងារផ្សេងទៀត**
// =====================================================================

function toggleMic() {
  if (!localStream || localStream.getAudioTracks().length === 0) {
    return alert('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!');
  }
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  document.getElementById('micBtn').innerHTML = audioTrack.enabled ? '🎤 បិទ/បើក មេក្រូ' : '🔇 បើក មេក្រូ';
  document.getElementById('micBtn').style.background = audioTrack.enabled ? '#28a745' : '#dc3545';
}

function updatePartnerStatus(online) {
  if (partnerStatus) {
    partnerStatus.textContent = online ? 'Online' : 'Offline';
    partnerStatus.className = `status-badge ${online ? 'status-online' : 'status-offline'}`;
  }
}

function leaveRoom() {
  if (isScreenSharing) {
    stopScreenShare();
  }
  
  if (currentCall) {
    currentCall.close();
  }
  if (screenCall) {
    screenCall.close();
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

socket.on('refresh-media', () => {
  console.log('Refresh media requested');
});
