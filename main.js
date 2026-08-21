const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = skyway_room;
const { SkyWayAuthToken, uuidV4 } = skyway_token;

let myNumber = null;
let myAudioStream = null;
let currentRoom = null;
let meInstance = null;
let isHolding = false;
let timerInterval = null;
let secondsElapsed = 0;
let ringtoneInterval = null;
let holdMusicInterval = null; // 保留音用のタイマー
let audioCtx = null;

// 初回操作時にAudioContextを有効化する関数
function initAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// 着信音を鳴らす関数 (Web Audio API)
function playRingtone() {
  stopRingtone();
  initAudioContext();
  
  const playBeep = () => {
    try {
      if (!audioCtx) return;
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime);
      osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.15);
      
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.4);
      
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      
      osc.start();
      osc.stop(audioCtx.currentTime + 0.4);
    } catch (e) {}
  };

  playBeep();
  ringtoneInterval = setInterval(playBeep, 1200);
}

function stopRingtone() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
}

// 保留音を鳴らす関数（かえるの合唱のメロディ）
function playHoldMusic() {
  stopHoldMusic();
  initAudioContext();

  // 音階の周波数 (Hz) 定義
  // ド:523.25, レ:587.33, ミ:659.25, ファ:698.46, ソ:783.99, ラ:880.00, シ:987.77, 高いド:1046.50
  const n = {
    C5: 523.25, D5: 587.33, E5: 659.25, F5: 698.46,
    G5: 783.99, A5: 880.00, B5: 987.77, C6: 1046.50,
    rest: 0
  };

  // 「かえるの合唱」のメロディ譜面（[音, 長さ(拍)]）
  const melody = [
    [n.C6, 1], [n.B5, 1], [n.A5, 1], [n.G5, 1],
    [n.A5, 1], [n.B5, 1], [n.C6, 1], [n.rest, 1],
    [n.A5, 1], [n.G5, 1], [n.F5, 1], [n.E5, 1],
    [n.F5, 1], [n.G5, 1], [n.A5, 1], [n.rest, 1],
    [n.C6, 2], [n.C6, 2], [n.G5, 2], [n.G5, 2],
    [n.C6, 2], [n.C6, 2], [n.rest, 2],
    [n.C6, 0.5], [n.B5, 0.5], [n.A5, 0.5], [n.G5, 0.5],
    [n.C6, 0.5], [n.G5, 0.5], [n.E5, 0.5], [n.C5, 0.5],
    [n.C6, 1], [n.G5, 1], [n.C6, 2], [n.rest, 2]
  ];

  let step = 0;
  const beatDuration = 220; // 1拍のミリ秒

  const playNextNote = () => {
    try {
      if (!audioCtx || !isHolding) return;
      const [freq, duration] = melody[step];

      if (freq > 0) {
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();

        osc.type = 'triangle'; // やわらかい音色
        osc.frequency.setValueAtTime(freq, audioCtx.currentTime);

        const durSec = (beatDuration * duration) / 1000 * 0.85;
        gain.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + durSec);

        osc.connect(gain);
        gain.connect(audioCtx.destination);

        osc.start();
        osc.stop(audioCtx.currentTime + durSec);
      }

      step++;
      if (step >= melody.length) {
        step = 0; // 曲が終わったらループ
      }
    } catch (e) {}
  };

  playNextNote();
  holdMusicInterval = setInterval(playNextNote, beatDuration);
}

function stopHoldMusic() {
  if (holdMusicInterval) {
    clearInterval(holdMusicInterval);
    holdMusicInterval = null;
  }
}

function formatPhoneNumber(str) {
  let digits = str.replace(/\D/g, '');
  if (digits.length > 8) digits = digits.slice(0, 8);

  let p1 = digits.slice(0, 3);
  let p2 = digits.slice(3, 5);
  let p3 = digits.slice(5, 8);

  let formatted = p1;
  if (p2) formatted += '-' + p2;
  if (p3) formatted += '-' + p3;
  return formatted;
}

function switchTab(tabName, btnElem) {
  initAudioContext();
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active-tab'));
  
  document.getElementById(`screen-${tabName}`).classList.add('active-screen');
  btnElem.classList.add('active-tab');

  if (tabName === 'settings') {
    document.getElementById('current-my-num').textContent = myNumber;
  }
}

let rawDigits = "";
const dialDisplay = document.getElementById('dial-display');

function pressKey(char) {
  initAudioContext();
  if (rawDigits.length >= 8) return;
  rawDigits += char;
  dialDisplay.textContent = formatPhoneNumber(rawDigits);
}

function deleteKey() {
  initAudioContext();
  if (rawDigits.length > 0) {
    rawDigits = rawDigits.slice(0, -1);
    dialDisplay.textContent = formatPhoneNumber(rawDigits);
  }
}

window.addEventListener('DOMContentLoaded', () => {
  const saved = localStorage.getItem('my_phone_number');
  if (saved) {
    myNumber = saved;
    document.getElementById('login-screen').classList.remove('active');
    initApp();
  } else {
    document.getElementById('login-screen').classList.add('active');
  }
  loadContacts();
  loadHistory();
});

document.getElementById('login-btn').addEventListener('click', () => {
  initAudioContext();
  const inputVal = document.getElementById('login-num-input').value.trim();
  const formatted = formatPhoneNumber(inputVal);
  if (formatted.length < 9) {
    alert('正しい番号（8桁）を入力してください');
    return;
  }
  myNumber = formatted;
  localStorage.setItem('my_phone_number', myNumber);
  document.getElementById('login-screen').classList.remove('active');
  initApp();
});

document.getElementById('update-num-btn').addEventListener('click', () => {
  initAudioContext();
  const inputVal = document.getElementById('change-num-input').value.trim();
  const formatted = formatPhoneNumber(inputVal);
  if (formatted.length < 9) {
    alert('正しい番号（8桁）を入力してください');
    return;
  }
  myNumber = formatted;
  localStorage.setItem('my_phone_number', myNumber);
  alert('電話番号を更新しました！再接続します。');
  location.reload();
});

async function initApp() {
  try {
    myAudioStream = await SkyWayStreamFactory.createMicrophoneAudioStream();
    startWaitingRoom();
  } catch (err) {
    alert('マイクの取得に失敗しました');
  }
}

async function startWaitingRoom() {
  await cleanupCall();

  try {
    const context = await createSkyWayContext();
    const room = await SkyWayRoom.FindOrCreate(context, {
      type: 'p2p',
      name: `phone-room-${myNumber}`,
    });
    const me = await room.join();
    currentRoom = room;
    meInstance = me;

    let isCallStarted = false;

    room.onStreamPublished.add(async (e) => {
      if (e.publication.publisher.id === me.id) return;

      document.getElementById('incoming-overlay').style.display = 'flex';
      document.getElementById('incoming-number').textContent = "着信中...";
      
      playRingtone();

      document.getElementById('unlock-audio-btn').onclick = () => {
        initAudioContext();
      };

      document.getElementById('accept-btn').onclick = async () => {
        initAudioContext();
        isCallStarted = true;
        stopRingtone();
        document.getElementById('incoming-overlay').style.display = 'none';
        document.getElementById('incall-overlay').style.display = 'flex';
        document.getElementById('incall-target').textContent = "通話中";

        await me.publish(myAudioStream);
        const { stream } = await me.subscribe(e.publication.id);
        if (stream.contentType === 'audio') {
          const remoteAudio = document.createElement('audio');
          remoteAudio.autoplay = true;
          stream.attach(remoteAudio);
        }
        startTimer();
        addHistory("着信", "相手");
      };

      document.getElementById('reject-btn').onclick = async () => {
        initAudioContext();
        stopRingtone();
        document.getElementById('incoming-overlay').style.display = 'none';
        addHistory("不在着信", "相手");
        await forceEndCall();
      };
    });

    room.onMemberLeft.add(async () => {
      const incomingOverlay = document.getElementById('incoming-overlay');
      if (incomingOverlay.style.display === 'flex' && !isCallStarted) {
        stopRingtone();
        incomingOverlay.style.display = 'none';
        addHistory("不在着信", "相手");
      }
      await forceEndCall();
    });

  } catch (error) {
    console.error(error);
  }
}

document.getElementById('dial-call-btn').addEventListener('click', async () => {
  initAudioContext();
  const targetNum = dialDisplay.textContent;
  if (!targetNum || targetNum.length < 9) {
    alert('正しい番号を入力してください');
    return;
  }
  if (targetNum === myNumber) {
    alert('自分自身にはかけられません');
    return;
  }

  document.getElementById('status-msg').textContent = `${targetNum} へ発信中...`;

  await cleanupCall();

  try {
    const context = await createSkyWayContext();
    const room = await SkyWayRoom.FindOrCreate(context, {
      type: 'p2p',
      name: `phone-room-${targetNum}`,
    });
    const me = await room.join();
    currentRoom = room;
    meInstance = me;

    await me.publish(myAudioStream);

    let answered = false;

    room.onStreamPublished.add(async (e) => {
      if (e.publication.publisher.id === me.id) return;

      answered = true;
      const { stream } = await me.subscribe(e.publication.id);
      if (stream.contentType === 'audio') {
        const remoteAudio = document.createElement('audio');
        remoteAudio.autoplay = true;
        stream.attach(remoteAudio);

        document.getElementById('incall-overlay').style.display = 'flex';
        document.getElementById('incall-target').textContent = targetNum;
        startTimer();
        document.getElementById('status-msg').textContent = "";
        addHistory("発信", targetNum);
      }
    });

    room.onMemberLeft.add(async () => {
      if (!answered) {
        document.getElementById('status-msg').textContent = "発信できませんでした（不在）";
        addHistory("不発信", targetNum);
        setTimeout(() => {
          document.getElementById('status-msg').textContent = "";
        }, 3000);
      }
      await forceEndCall();
    });

  } catch (error) {
    console.error(error);
    document.getElementById('status-msg').textContent = '発信失敗';
    setTimeout(() => {
      document.getElementById('status-msg').textContent = "";
    }, 3000);
  }
});

document.getElementById('hangup-btn').addEventListener('click', async () => {
  initAudioContext();
  await forceEndCall();
});

async function forceEndCall() {
  await cleanupCall();
  startWaitingRoom();
}

async function cleanupCall() {
  stopTimer();
  stopRingtone();
  stopHoldMusic();
  document.getElementById('incall-overlay').style.display = 'none';
  document.getElementById('incoming-overlay').style.display = 'none';
  document.getElementById('status-msg').textContent = "";
  isHolding = false;
  document.getElementById('hold-btn').style.background = '#3a3a3c';
  document.getElementById('hold-btn').style.color = '#fff';

  if (meInstance) {
    try {
      await meInstance.leave();
    } catch (e) {}
    meInstance = null;
  }

  if (currentRoom) {
    try {
      await currentRoom.close();
    } catch (e) {}
    currentRoom = null;
  }
}

// 保留ボタンの処理
document.getElementById('hold-btn').addEventListener('click', () => {
  initAudioContext();
  if (!isHolding) {
    // 保留にする（自分の音声を止めて保留音を流す）
    myAudioStream.stop();
    isHolding = true;
    document.getElementById('hold-btn').style.background = '#ffcc00';
    document.getElementById('hold-btn').style.color = '#000';
    playHoldMusic(); // 保留音スタート
  } else {
    // 保留解除
    stopHoldMusic();
    SkyWayStreamFactory.createMicrophoneAudioStream().then(stream => {
      myAudioStream = stream;
      if (currentRoom && meInstance) {
        meInstance.publish(myAudioStream);
      }
      isHolding = false;
      document.getElementById('hold-btn').style.background = '#3a3a3c';
      document.getElementById('hold-btn').style.color = '#fff';
    });
  }
});

function startTimer() {
  secondsElapsed = 0;
  document.getElementById('call-timer').textContent = '00:00';
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    secondsElapsed++;
    const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
    const secs = (secondsElapsed % 60).toString().padStart(2, '0');
    document.getElementById('call-timer').textContent = `${mins}:${secs}`;
  }, 1000);
}

function stopTimer() {
  if (timerInterval) {
    clearInterval(timerInterval);
    timerInterval = null;
  }
}

document.getElementById('add-contact-btn').addEventListener('click', () => {
  initAudioContext();
  const name = document.getElementById('contact-name').value;
  const numInput = document.getElementById('contact-num').value;
  const formattedNum = formatPhoneNumber(numInput);
  if (!name || formattedNum.length < 9) return;

  let contacts = JSON.parse(localStorage.getItem('phone_contacts') || '[]');
  contacts.push({ name, num: formattedNum });
  localStorage.setItem('phone_contacts', JSON.stringify(contacts));
  loadContacts();
  document.getElementById('contact-name').value = '';
  document.getElementById('contact-num').value = '';
});

function loadContacts() {
  const list = document.getElementById('contacts-list');
  list.innerHTML = '';
  let contacts = JSON.parse(localStorage.getItem('phone_contacts') || '[]');
  contacts.forEach(c => {
    const li = document.createElement('li');
    li.className = 'card-item';
    li.innerHTML = `<span><b>${c.name}</b><br><small style="color:var(--text-secondary)">${c.num}</small></span> <button class="btn btn-success" style="width: auto; padding: 6px 12px; font-size: 12px;" onclick="callContact('${c.num}')">発信</button>`;
    list.appendChild(li);
  });
}

function callContact(num) {
  initAudioContext();
  rawDigits = num.replace(/-/g, '');
  dialDisplay.textContent = num;
  switchTab('dial', document.querySelectorAll('.nav-item')[0]);
}

function addHistory(type, num) {
  let history = JSON.parse(localStorage.getItem('phone_history') || '[]');
  const time = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  history.unshift({ type, num, time });
  if (history.length > 20) history.pop();
  localStorage.setItem('phone_history', JSON.stringify(history));
  loadHistory();
}

function loadHistory() {
  const list = document.getElementById('history-list');
  list.innerHTML = '';
  let history = JSON.parse(localStorage.getItem('phone_history') || '[]');
  history.forEach(h => {
    const li = document.createElement('li');
    li.className = 'card-item';
    let icon = '↗️';
    if (h.type === '着信') icon = '↙️';
    if (h.type === '不在着信') icon = '📞❌';
    if (h.type === '不発信') icon = '🚫';
    li.innerHTML = `<span><b>${icon} ${h.type}: ${h.num}</b><br><small style="color:var(--text-secondary)">${h.time}</small></span>`;
    list.appendChild(li);
  });
}

function createSkyWayContext() {
  const token = new SkyWayAuthToken({
    jti: uuidV4(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    scope: {
      app: {
        id: 'e24483fd-d035-404f-8617-8ead41ced6bd',
        turn: true,
        actions: ['read'],
        channels: [
          {
            id: '*', name: '*', actions: ['write'],
            members: [
              {
                id: '*', name: '*', actions: ['write'],
                publication: { actions: ['write'] },
              },
            ],
            sfuBots: [{ actions: ['write'], forwardings: [{ actions: ['write'] }] }]
          },
        ],
      },
    },
  }).encode('SwR9Hpm1B3HR9O+4GLgZrdZ0H15rL0Y0IgPX+uJbkNM=');

  return SkyWayContext.Create(token);
}
