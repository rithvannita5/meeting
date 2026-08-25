const socket = io();
let myPeer;
let myId = '';
let currentRoomId = '';
let localStream = null;
let currentCall = null;
let isScreenSharing = false;

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
    localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: true });
  } catch (err) {
    console.log('ដំណើរការដោយគ្មាន Camera/Mic');
    try {
      localStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch {
      localStream = createEmptyAudioStream();
    }
  }

  // បង្ហាញ video ក្នុងស្រុក
  localVideo.srcObject = localStream;

  // បង្កើត Peer Connection
  myPeer = new Peer();

  myPeer.on('open', (id) => {
    myId = id;
    document.getElementById('auth').classList.add('hidden');
    document.getElementById('room-container').classList.remove('hidden');
    document.getElementById('welcome-text').innerText = `អ្នកប្រើប្រាស់: ${username} | បន្ទប់: ${roomId}`;

    socket.emit('join-room', roomId, id);
  });

  // ពេលមានគេហៅមក (Incoming Call)
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
    currentCall = null;
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

// មុខងារ Share Screen - កែតម្រូវ
async function shareScreen() {
  try {
    if (isScreenSharing) {
      // បើកំពុងចែករំលែកអេក្រង់រួច សូមបញ្ឈប់
      stopScreenShare();
      return;
    }

    const screenStream = await navigator.mediaDevices.getDisplayMedia({ 
      video: true, 
      audio: false 
    });

    isScreenSharing = true;
    
    // បង្ហាញអេក្រង់នៅលើ local video
    localVideo.srcObject = screenStream;

    // បញ្ជូន screen stream ទៅកាន់ដៃគូ
    if (currentCall && currentCall.peerConnection) {
      // យក video track ពី screen stream
      const screenTrack = screenStream.getVideoTracks()[0];
      
      // ស្វែងរក sender ដែលជា video
      const senders = currentCall.peerConnection.getSenders();
      const videoSender = senders.find(s => s.track && s.track.kind === 'video');

      if (videoSender) {
        // ជំនួស track ចាស់ជាមួយ screen track
        await videoSender.replaceTrack(screenTrack);
      } else {
        // ប្រសិនបើមិនមាន sender សូមបន្ថែម track ថ្មី
        currentCall.peerConnection.addTrack(screenTrack, screenStream);
      }
    } else {
      // ប្រសិនបើគ្មាន call សូមបង្កើត call ថ្មី
      alert('សូមរង់ចាំដៃគូចូលបន្ទប់');
      isScreenSharing = false;
      return;
    }

    // ពេលបញ្ឈប់ការចែករំលែកអេក្រង់
    screenStream.getVideoTracks()[0].onended = () => {
      stopScreenShare();
    };

    // ប្ដូរអត្ថបទប៊ូតុង
    document.querySelector('button[onclick="shareScreen()"]').innerText = 'Stop Sharing';

  } catch (err) {
    console.error('Error sharing screen:', err);
    alert('មិនអាចចែករំលែកអេក្រង់បានទេ។ សូមពិនិត្យការអនុញ្ញាត។');
  }
}

// បញ្ឈប់ការចែករំលែកអេក្រង់
function stopScreenShare() {
  isScreenSharing = false;
  
  // ស្ដារ local stream ដើម
  if (localStream) {
    localVideo.srcObject = localStream;
    
    // ស្ដារ track ដើមទៅកាន់ដៃគូ
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
  
  document.querySelector('button[onclick="shareScreen()"]').innerText = 'Share Screen';
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
  if (currentCall) {
    currentCall.close();
  }
  if (myPeer) {
    myPeer.destroy();
  }
  socket.disconnect();
  location.reload();
}

// ស្ដាប់ event ពី server សម្រាប់ refresh media
socket.on('refresh-media', () => {
  if (currentCall && currentCall.peerConnection) {
    // ធ្វើបច្ចុប្បន្នភាព connection
  }
});
