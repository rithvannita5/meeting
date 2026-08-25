const socket = io();
let myPeer;
let myId = '';
let currentRoomId = '';
let localStream = null;
let currentCall = null;
let isScreenSharing = false;
let isConnected = false;

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

  // បង្ហាញ local video
  if (localStream) {
    localVideo.srcObject = localStream;
  }

  // **សំខាន់៖ បង្កើត Peer ជាមួយ STUN/TURN Server**
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

    // ផ្ញើ Peer ID ទៅ Server
    socket.emit('join-room', roomId, id);
    console.log(`Joined room ${roomId} with peer ID ${id}`);
  });

  // **សំខាន់៖ ពេលមានគេហៅមក (Incoming Call)**
  myPeer.on('call', (call) => {
    console.log('Incoming call from:', call.peer);
    currentCall = call;
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
    });
  });

  myPeer.on('error', (err) => {
    console.error('PeerJS Error:', err);
    alert('កំហុស PeerJS: ' + err.message);
  });

  // **សំខាន់៖ ពេលមានដៃគូថ្មីចូលបន្ទប់**
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

  // **សំខាន់៖ ពេលភ្ជាប់ Socket រួច**
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

  // **ពិនិត្យមើលថាតើមាន call រួចហើយឬនៅ**
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
    alert('កំហុសការហៅ: ' + err.message);
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

// **មុខងារ Share Screen - កែតម្រូវ**
// មុខងារ Share Screen - កែតម្រូវថ្មី
async function shareScreen() {
  try {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: true, 
      audio: false 
    });

    isScreenSharing = true;
    document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
    document.getElementById('screenBtn').classList.add('screen-share-active');

    // **បង្ហាញអេក្រង់នៅ local**
    localVideo.srcObject = screenStream;

    // **បញ្ជូន screen stream ទៅកាន់ដៃគូ**
    if (currentCall && currentCall.peerConnection) {
      const screenTrack = screenStream.getVideoTracks()[0];
      
      // **វិធីសាស្ត្រថ្មី៖ លុប Track ចាស់ ហើយបន្ថែម Track ថ្មី**
      const senders = currentCall.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      
      if (videoSender) {
        // **ជំនួស Track ចាស់ជាមួយ Track ថ្មី**
        await videoSender.replaceTrack(screenTrack);
        console.log('✅ Screen track replaced successfully');
      } else {
        // **ប្រសិនបើគ្មាន sender សូមបន្ថែមថ្មី**
        currentCall.peerConnection.addTrack(screenTrack, screenStream);
        console.log('✅ Screen track added successfully');
      }
      
      // **សំខាន់៖ បង្កើត New Offer ដើម្បីធ្វើបច្ចុប្បន្នភាព**
      const offer = await currentCall.peerConnection.createOffer();
      await currentCall.peerConnection.setLocalDescription(offer);
      
      // **ផ្ញើ Offer ថ្មីទៅដៃគូ**
      socket.emit('signal', {
        roomId: currentRoomId,
        peerId: myId,
        signal: { 
          type: 'offer',
          sdp: offer.sdp
        }
      });
      
    } else {
      console.log('No active call, waiting for connection');
      alert('សូមរង់ចាំដៃគូចូលបន្ទប់');
      isScreenSharing = false;
      document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
      document.getElementById('screenBtn').classList.remove('screen-share-active');
      return;
    }

    // **ពេលបញ្ឈប់ការចែករំលែក**
    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

  } catch (err) {
    console.error('Error sharing screen:', err);
    alert('មិនអាចចែករំលែកអេក្រង់បានទេ: ' + err.message);
    isScreenSharing = false;
    document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
    document.getElementById('screenBtn').classList.remove('screen-share-active');
  }
}

function stopScreenShare() {
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').classList.remove('screen-share-active');

  // **ស្ដារ local stream ដើម**
  if (localStream) {
    localVideo.srcObject = localStream;
    
    if (currentCall && currentCall.peerConnection) {
      const senders = currentCall.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      
      if (videoSender && localStream.getVideoTracks().length > 0) {
        const originalVideoTrack = localStream.getVideoTracks()[0];
        videoSender.replaceTrack(originalVideoTrack);
        console.log('✅ Restored original video track');
      } else if (videoSender) {
        currentCall.peerConnection.removeTrack(videoSender);
        console.log('✅ Removed screen track');
      }
    }
  }
}
function stopScreenShare() {
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').classList.remove('screen-share-active');

  if (localStream) {
    localVideo.srcObject = localStream;
    
    if (currentCall && currentCall.peerConnection) {
      const senders = currentCall.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      
      if (videoSender && localStream.getVideoTracks().length > 0) {
        const originalVideoTrack = localStream.getVideoTracks()[0];
        videoSender.replaceTrack(originalVideoTrack);
      } else if (videoSender) {
        currentCall.peerConnection.removeTrack(videoSender);
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

function updatePartnerStatus(online) {
  if (partnerStatus) {
    partnerStatus.textContent = online ? 'Online' : 'Offline';
    partnerStatus.className = `status-badge ${online ? 'status-online' : 'status-offline'}`;
  }
}

function leaveRoom() {
  if (currentCall) {
    currentCall.close();
  }
  if (myPeer) {
    myPeer.destroy();
  }
  socket.disconnect();
  location.reload();
}

// **ស្ដាប់ event refresh-media**
socket.on('refresh-media', () => {
  console.log('Refresh media requested');
  if (currentCall && currentCall.peerConnection) {
    // ធ្វើបច្ចុប្បន្នភាព connection
  }
});
