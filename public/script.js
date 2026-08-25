const socket = io();
let myPeer;
let myId = '';
let currentRoomId = '';
let localStream = null;
let currentCall = null;
let isScreenSharing = false;
let screenStream = null;
let isCameraActive = true; // តាមដានថាកំពុងប្រើកាមេរ៉ា ឬ screen

const localVideo = document.getElementById('localVideo');
const remoteVideo = document.getElementById('remoteVideo');
const partnerStatus = document.getElementById('partnerStatus');

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
    document.getElementById('welcome-text').innerText = `អ្នកប្រើប្រាស់: ${username} | បន្ទប់: ${roomId}`;

    socket.emit('join-room', roomId, id);
    console.log(`Joined room ${roomId} with peer ID ${id}`);
  });

  myPeer.on('call', (call) => {
    console.log('Incoming call from:', call.peer);
    currentCall = call;
    
    // **សំខាន់៖ ឆ្លើយតបជាមួយ localStream**
    call.answer(localStream);
    
    call.on('stream', (remoteStream) => {
      console.log('Received remote stream');
      remoteVideo.srcObject = remoteStream;
      updatePartnerStatus(true);
    });
    
    call.on('close', () => {
      console.log('Call closed');
      remoteVideo.srcObject = null;
      updatePartnerStatus(false);
      currentCall = null;
    });
  });

  myPeer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    alert('កំហុស PeerJS: ' + err.message);
  });

  socket.on('user-connected', (peerId) => {
    console.log('User connected:', peerId);
    if (peerId !== myId) {
      connectToNewUser(peerId, localStream);
    }
  });

  socket.on('user-disconnected', (peerId) => {
    console.log('User disconnected:', peerId);
    remoteVideo.srcObject = null;
    currentCall = null;
    updatePartnerStatus(false);
  });

  socket.on('connect', () => {
    console.log('Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('Socket disconnected');
    updatePartnerStatus(false);
  });
}

function connectToNewUser(peerId, stream) {
  console.log('Connecting to new user:', peerId);
  
  if (!stream) {
    console.error('No stream available');
    return;
  }

  if (currentCall) {
    console.log('Already have a call, closing old one');
    currentCall.close();
    currentCall = null;
  }

  const call = myPeer.call(peerId, stream);
  currentCall = call;
  
  call.on('stream', (remoteStream) => {
    console.log('Received remote stream from:', peerId);
    remoteVideo.srcObject = remoteStream;
    updatePartnerStatus(true);
  });

  call.on('close', () => {
    console.log('Call with', peerId, 'closed');
    remoteVideo.srcObject = null;
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

// **=====================================================================**
// **មុខងារ Share Screen - កែតម្រូវថ្មី**
// **=====================================================================**

async function shareScreen() {
  try {
    // បើកំពុង share រួច បិទ
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    // **1. ចាប់យក screen stream**
    screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: { 
        width: { ideal: 1280 },
        height: { ideal: 720 },
        frameRate: { ideal: 30 }
      },
      audio: true 
    });

    isScreenSharing = true;
    isCameraActive = false;
    document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
    document.getElementById('screenBtn').classList.add('screen-share-active');

    // **2. បង្ហាញ screen នៅ local**
    localVideo.srcObject = screenStream;

    // **3. បញ្ជូន screen stream ទៅដៃគូ**
    if (currentCall) {
      await replaceStreamInCall(screenStream);
    } else {
      // បើគ្មាន call រង់ចាំដៃគូ
      console.log('No active call, waiting for connection');
      // រក្សាទុក screen stream ហើយរង់ចាំ
    }

    // **4. ពេលអ្នកប្រើបិទ screen share**
    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

  } catch (err) {
    console.error('Error sharing screen:', err);
    alert('មិនអាចចែករំលែកអេក្រង់បានទេ: ' + err.message);
    // Reset state
    isScreenSharing = false;
    isCameraActive = true;
    screenStream = null;
    document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
    document.getElementById('screenBtn').classList.remove('screen-share-active');
  }
}

// **មុខងារជំនួស stream ក្នុងការហៅ**
async function replaceStreamInCall(newStream) {
  if (!currentCall || !currentCall.peerConnection) {
    console.error('No active call to replace stream');
    return;
  }

  try {
    const senders = currentCall.peerConnection.getSenders();
    
    // **ជំនួស video track**
    const videoTrack = newStream.getVideoTracks()[0];
    if (videoTrack) {
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      if (videoSender) {
        await videoSender.replaceTrack(videoTrack);
        console.log('✅ Video track replaced successfully');
      } else {
        // បន្ថែម video track ថ្មី
        currentCall.peerConnection.addTrack(videoTrack, newStream);
        console.log('✅ Video track added');
      }
    }

    // **ជំនួស audio track**
    const audioTrack = newStream.getAudioTracks()[0];
    if (audioTrack) {
      const audioSender = senders.find(s => s.track && s.track.kind === 'audio');
      if (audioSender) {
        await audioSender.replaceTrack(audioTrack);
        console.log('✅ Audio track replaced successfully');
      } else {
        currentCall.peerConnection.addTrack(audioTrack, newStream);
        console.log('✅ Audio track added');
      }
    }

    // **បង្ខំឱ្យ renegotiate**
    await currentCall.peerConnection.createOffer().then(offer => {
      return currentCall.peerConnection.setLocalDescription(offer);
    }).then(() => {
      // ផ្ញើ SDP ថ្មីទៅកាន់ដៃគូ
      currentCall.peerConnection.onicecandidate = (event) => {
        if (event.candidate) {
          // PeerJS នឹងគ្រប់គ្រងការផ្ញើដោយស្វ័យប្រវត្តិ
        }
      };
    });

    console.log('✅ Stream replaced successfully');

  } catch (err) {
    console.error('Error replacing stream:', err);
    throw err;
  }
}

// **មុខងារបញ្ឈប់ Screen Share**
function stopScreenShare() {
  console.log('Stopping screen share...');
  
  isScreenSharing = false;
  isCameraActive = true;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').classList.remove('screen-share-active');

  // **1. បញ្ឈប់ screen stream**
  if (screenStream) {
    screenStream.getTracks().forEach(track => {
      track.stop();
      console.log('Stopped track:', track.kind);
    });
    screenStream = null;
  }

  // **2. ត្រឡប់ទៅកាមេរ៉ាវិញ**
  if (localStream && currentCall) {
    // បង្ហាញ local camera
    localVideo.srcObject = localStream;
    
    // ជំនួស stream ក្នុងការហៅ
    replaceStreamInCall(localStream).catch(err => {
      console.error('Error returning to camera:', err);
    });
  } else if (localStream) {
    localVideo.srcObject = localStream;
  }
}

// **=====================================================================**
// **មុខងារផ្សេងទៀត**
// **=====================================================================**

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
  if (myPeer) {
    myPeer.destroy();
  }
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (screenStream) {
    screenStream.getTracks().forEach(track => track.stop());
  }
  socket.disconnect();
  location.reload();
}

socket.on('refresh-media', () => {
  console.log('Refresh media requested');
});
