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

// ============ មុខងារពង្រីកអេក្រង់ ============
function makeFullscreen(elem) {
  if (elem.requestFullscreen) {
    elem.requestFullscreen();
  } else if (elem.webkitRequestFullscreen) {
    elem.webkitRequestFullscreen();
  } else if (elem.msRequestFullscreen) {
    elem.msRequestFullscreen();
  }
}

localVideo.onclick = () => makeFullscreen(localVideo);
remoteVideo.onclick = () => makeFullscreen(remoteVideo);

// ============ មុខងារចូលបន្ទប់ ============
async function login() {
  const username = document.getElementById('username').value.trim();
  const roomId = document.getElementById('roomInput').value.trim();
  
  if (!username || !roomId) {
    return alert('សូមបំពេញឈ្មោះ និងលេខបន្ទប់!');
  }

  currentRoomId = roomId;

  // ======== ទទួល Media Stream ========
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: true, 
      video: true 
    });
    console.log('✅ Got camera and microphone');
  } catch (err) {
    console.log('⚠️ No camera, trying only microphone:', err);
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: false 
      });
      console.log('✅ Got microphone only');
    } catch (err2) {
      console.log('⚠️ No microphone, creating empty audio stream');
      localStream = createEmptyAudioStream();
    }
  }

  // បង្ហាញ local video
  if (localStream) {
    localVideo.srcObject = localStream;
  }

 // ======== បង្កើត PeerJS (ប្រើ Cloud Server) ========
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
  }
});
  // ======== PeerJS Events ========
  myPeer.on('open', (id) => {
    myId = id;
    console.log('🆔 My Peer ID:', myId);
    
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `អ្នកប្រើប្រាស់: ${username} | បន្ទប់: ${roomId}`;

    // ផ្ញើ Peer ID ទៅ Server
    socket.emit('join-room', roomId, id);
    console.log(`📥 Joined room ${roomId} with peer ID ${id}`);
  });

  // ======== ពេលមានគេហៅមក (Incoming Call) ========
  myPeer.on('call', (call) => {
    console.log('📞 Incoming call from:', call.peer);
    
    // ប្រសិនបើមាន Call ចាស់ សូមបិទវាចោល
    if (currentCall) {
      console.log('Closing old call');
      currentCall.close();
    }
    
    currentCall = call;
    call.answer(localStream);
    
    call.on('stream', (remoteStream) => {
      console.log('📺 Received remote stream');
      remoteVideo.srcObject = remoteStream;
      updatePartnerStatus(true);
    });
    
    call.on('close', () => {
      console.log('Call closed');
      remoteVideo.srcObject = null;
      currentCall = null;
      updatePartnerStatus(false);
    });
    
    call.on('error', (err) => {
      console.error('Call error:', err);
    });
  });

  myPeer.on('error', (err) => {
    console.error('❌ PeerJS Error:', err);
    if (err.type === 'peer-unavailable') {
      alert('ដៃគូមិននៅក្នុងបន្ទប់ទេ!');
    }
  });

  // ======== Socket.io Events ========
  socket.on('connect', () => {
    console.log('🔌 Socket connected');
  });

  socket.on('disconnect', () => {
    console.log('🔌 Socket disconnected');
    updatePartnerStatus(false);
  });

  // ======== ពេលមានដៃគូថ្មីចូលបន្ទប់ ========
  socket.on('user-connected', (peerId) => {
    console.log('👤 User connected:', peerId);
    if (peerId !== myId) {
      connectToNewUser(peerId, localStream);
    }
  });

  socket.on('user-disconnected', (peerId) => {
    console.log('👤 User disconnected:', peerId);
    if (peerId !== myId) {
      remoteVideo.srcObject = null;
      currentCall = null;
      updatePartnerStatus(false);
    }
  });

  // ======== Signal Handling ========
  socket.on('signal', async (data) => {
    console.log('📡 Received signal:', data);
    
    if (data.peerId === myId) return;
    
    if (currentCall && currentCall.peerConnection) {
      try {
        if (data.signal.type === 'offer') {
          await currentCall.peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.signal)
          );
          const answer = await currentCall.peerConnection.createAnswer();
          await currentCall.peerConnection.setLocalDescription(answer);
          
          socket.emit('signal', {
            roomId: currentRoomId,
            peerId: myId,
            signal: {
              type: 'answer',
              sdp: answer.sdp
            }
          });
          console.log('✅ Sent answer');
          
        } else if (data.signal.type === 'answer') {
          await currentCall.peerConnection.setRemoteDescription(
            new RTCSessionDescription(data.signal)
          );
          console.log('✅ Set remote description');
          
        } else if (data.signal.type === 'candidate') {
          await currentCall.peerConnection.addIceCandidate(
            new RTCIceCandidate(data.signal.candidate)
          );
          console.log('✅ Added ICE candidate');
        }
      } catch (err) {
        console.error('Error handling signal:', err);
      }
    }
  });

  // ======== Refresh Media ========
  socket.on('refresh-media', () => {
    console.log('🔄 Refresh media requested');
    if (currentCall && currentCall.peerConnection) {
      // ធ្វើបច្ចុប្បន្នភាព connection
    }
  });
}

// ============ មុខងារភ្ជាប់ទៅអ្នកប្រើថ្មី ============
function connectToNewUser(peerId, stream) {
  console.log('🔗 Connecting to new user:', peerId);
  
  if (!stream) {
    console.error('❌ No stream available');
    return;
  }

  if (peerId === myId) {
    console.log('⏭️ Skipping self');
    return;
  }

  if (currentCall) {
    console.log('⚠️ Already have a call, closing old one');
    currentCall.close();
    currentCall = null;
  }

  const call = myPeer.call(peerId, stream);
  currentCall = call;
  console.log('📞 Calling:', peerId);
  
  call.on('stream', (remoteStream) => {
    console.log('📺 Received remote stream from:', peerId);
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
    console.error('❌ Call error:', err);
    if (err.type === 'peer-unavailable') {
      alert('ដៃគូមិននៅក្នុងបន្ទប់ទេ!');
    }
  });
}

// ============ មុខងារបង្កើត Empty Audio Stream ============
function createEmptyAudioStream() {
  const ctx = new AudioContext();
  const osc = ctx.createOscillator();
  const dst = osc.connect(ctx.createMediaStreamDestination());
  osc.start();
  const track = dst.stream.getAudioTracks()[0];
  track.enabled = false;
  return new MediaStream([track]);
}

// ============ មុខងារ Share Screen ============
async function shareScreen() {
  try {
    if (isScreenSharing) {
      stopScreenShare();
      return;
    }

    console.log('🖥️ Starting screen share...');
    
    const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: true, 
      audio: false 
    });

    isScreenSharing = true;
    document.getElementById('screenBtn').innerHTML = '🛑 Stop Sharing';
    document.getElementById('screenBtn').classList.add('screen-share-active');

    // បង្ហាញអេក្រង់នៅ local
    localVideo.srcObject = screenStream;

    // បញ្ជូន screen stream ទៅកាន់ដៃគូ
    if (currentCall && currentCall.peerConnection) {
      const screenTrack = screenStream.getVideoTracks()[0];
      
      // ស្វែងរក video sender
      const senders = currentCall.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      
      if (videoSender) {
        // ជំនួស Track ចាស់ជាមួយ Track ថ្មី
        await videoSender.replaceTrack(screenTrack);
        console.log('✅ Screen track replaced successfully');
      } else {
        // បន្ថែម Track ថ្មី
        currentCall.peerConnection.addTrack(screenTrack, screenStream);
        console.log('✅ Screen track added successfully');
      }
      
      // បង្កើត New Offer ដើម្បីធ្វើបច្ចុប្បន្នភាព
      try {
        const offer = await currentCall.peerConnection.createOffer();
        await currentCall.peerConnection.setLocalDescription(offer);
        
        socket.emit('signal', {
          roomId: currentRoomId,
          peerId: myId,
          signal: {
            type: 'offer',
            sdp: offer.sdp
          }
        });
        console.log('✅ Sent new offer');
      } catch (err) {
        console.error('Error creating offer:', err);
      }
      
    } else {
      console.log('⚠️ No active call');
      alert('សូមរង់ចាំដៃគូចូលបន្ទប់');
      isScreenSharing = false;
      document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
      document.getElementById('screenBtn').classList.remove('screen-share-active');
      return;
    }

    // ពេលបញ្ឈប់ការចែករំលែក
    screenStream.getVideoTracks()[0].onended = () => {
      console.log('🛑 Screen share ended by user');
      stopScreenShare();
    };

  } catch (err) {
    console.error('❌ Error sharing screen:', err);
    alert('មិនអាចចែករំលែកអេក្រង់បានទេ: ' + err.message);
    isScreenSharing = false;
    document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
    document.getElementById('screenBtn').classList.remove('screen-share-active');
  }
}

// ============ មុខងារបញ្ឈប់ Screen Share ============
function stopScreenShare() {
  console.log('🛑 Stopping screen share');
  
  isScreenSharing = false;
  document.getElementById('screenBtn').innerHTML = '🖥️ Share Screen';
  document.getElementById('screenBtn').classList.remove('screen-share-active');

  // ស្ដារ local stream ដើម
  if (localStream) {
    localVideo.srcObject = localStream;
    
    if (currentCall && currentCall.peerConnection) {
      const senders = currentCall.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');
      
      if (videoSender && localStream.getVideoTracks().length > 0) {
        const originalVideoTrack = localStream.getVideoTracks()[0];
        videoSender.replaceTrack(originalVideoTrack)
          .then(() => {
            console.log('✅ Restored original video track');
            
            // បង្កើត New Offer
            return currentCall.peerConnection.createOffer();
          })
          .then(offer => {
            return currentCall.peerConnection.setLocalDescription(offer);
          })
          .then(() => {
            socket.emit('signal', {
              roomId: currentRoomId,
              peerId: myId,
              signal: {
                type: 'offer',
                sdp: currentCall.peerConnection.localDescription.sdp
              }
            });
            console.log('✅ Sent restore offer');
          })
          .catch(err => {
            console.error('Error restoring video:', err);
          });
      } else if (videoSender) {
        currentCall.peerConnection.removeTrack(videoSender);
        console.log('✅ Removed screen track');
      }
    }
  }
}

// ============ មុខងារ Toggle Mic ============
function toggleMic() {
  if (!localStream || localStream.getAudioTracks().length === 0) {
    return alert('ឧបករណ៍របស់អ្នកមិនមាន Microphone ទេ!');
  }
  
  const audioTrack = localStream.getAudioTracks()[0];
  audioTrack.enabled = !audioTrack.enabled;
  
  document.getElementById('micBtn').innerHTML = audioTrack.enabled ? '🎤 បិទ/បើក មេក្រូ' : '🔇 បើក មេក្រូ';
  document.getElementById('micBtn').style.background = audioTrack.enabled ? '#28a745' : '#dc3545';
  
  console.log(`🎤 Microphone ${audioTrack.enabled ? 'enabled' : 'disabled'}`);
}

// ============ មុខងារធ្វើបច្ចុប្បន្នភាពស្ថានភាពដៃគូ ============
function updatePartnerStatus(online) {
  if (partnerStatus) {
    partnerStatus.textContent = online ? '✅ Online' : '❌ Offline';
    partnerStatus.className = `status-badge ${online ? 'status-online' : 'status-offline'}`;
  }
}

// ============ មុខងារចាកចេញពីបន្ទប់ ============
function leaveRoom() {
  console.log('🚪 Leaving room...');
  
  if (currentCall) {
    currentCall.close();
    currentCall = null;
  }
  
  if (myPeer) {
    myPeer.destroy();
  }
  
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  socket.disconnect();
  location.reload();
}

// ============ ស្ដាប់ព្រឹត្តិការណ៍ Unload ============
window.addEventListener('beforeunload', () => {
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
  }
  if (myPeer) {
    myPeer.destroy();
  }
});

console.log('🚀 Application loaded successfully');
