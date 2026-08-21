const { SkyWayContext, SkyWayRoom, SkyWayStreamFactory } = skyway_room;
const { SkyWayAuthToken, uuidV4 } = skyway_token;

let myNumber = null;
let myAudioStream = null;
let currentRoom = null;
let meInstance = null;
let isHolding = false;
let timerInterval = null;
let secondsElapsed = 0;

// 数字を自動で `00X-XX-XXX` の形にフォーマットする関数
function formatPhoneNumber(str) {
  let digits = str.replace(/\D/g, ''); // 数字以外を削除
  if (digits.length > 8) digits = digits.slice(0, 8); // 最大8桁

  let p1 = digits.slice(0, 3);
  let p2 = digits.slice(3, 5);
  let p3 = digits.slice(5, 8);

  let formatted = p1;
  if (p2) formatted += '-' + p2;
  if (p3) formatted += '-' + p3;
  return formatted;
}

// タブ切り替え
function switchTab(tabName, btnElem) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active-screen'));
  document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active-tab'));
  
  document.getElementById(`screen-${tabName}`).classList.add('active-screen');
  btnElem.classList.add('active-tab');

  if (tabName === 'settings') {
    document.getElementById('current-my-num').textContent = myNumber;
  }
}

// ダイヤルパッド操作（自動ハイフン）
let rawDigits = "";
const dialDisplay = document.getElementById('dial-display');

function pressKey(char) {
  if (rawDigits.length >= 8) return;
  rawDigits += char;
  dialDisplay.textContent = formatPhoneNumber(rawDigits);
}

function deleteKey() {
  if (rawDigits.length > 0) {
    rawDigits = rawDigits.slice(0, -1);
    dialDisplay.textContent = formatPhoneNumber(rawDigits);
  }
}

// 起動時チェック
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

// 初回ログイン
document.getElementById('login-btn').addEventListener('click', () => {
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

// 番号変更（設定画面）
document.getElementById('update-num-btn').addEventListener('click', () => {
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

// 待受
async function startWaitingRoom() {
  try {
    const context = await createSkyWayContext();
    const room = await SkyWayRoom.FindOrCreate(context, {
      type: 'p2p',
      name: `phone-room-${myNumber}`,
    });
    const me = await room.join();
    currentRoom = room;
    meInstance = me;

    // 誰かが入ってきた（着信）
    room.onStreamPublished.add(async (e) => {
      if (e.publication.publisher.id === me.id) return;

      document.getElementById('incoming-overlay').style.display = 'flex';
      document.getElementById('incoming-number').textContent = "着信中...";

      document.getElementById('accept-btn').onclick = async () => {
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

      document.getElementById('reject-btn').onclick = () => {
        document.getElementById('incoming-overlay').style.display = 'none';
      };
    });

    // 相手が退出（電話を切った）とき
    room.onMemberLeft.add(async () => {
      await forceEndCall();
    });

  } catch (error) {
    console.error(error);
  }
}

// 発信
document.getElementById('dial-call-btn').addEventListener('click', async () => {
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

    room.onStreamPublished.add(async (e) => {
      if (e.publication.publisher.id === me.id) return;

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
      await forceEndCall();
    });

  } catch (error) {
    console.error(error);
    document.getElementById('status-msg').textContent = '発信失敗';
  }
});

// 自分が電話を切るボタン
document.getElementById('hangup-btn').addEventListener('click', async () => {
  await cleanupCall();
  startWaitingRoom();
});

// 相手が切ったときや通話終了時の共通処理
async function forceEndCall() {
  await cleanupCall();
  startWaitingRoom();
}

async function cleanupCall() {
  stopTimer();
  document.getElementById('incall-overlay').style.display = 'none';
  document.getElementById('incoming-overlay').style.display = 'none';
  isHolding = false;
  document.getElementById('hold-btn').style.background = '#3a3a3c';
  document.getElementById('hold-btn').style.color = '#fff';
  document.getElementById('status-msg').textContent = '通話が終了しました';

  if (currentRoom) {
    try {
      if (meInstance) {
        await meInstance.leave();
      }
      await currentRoom.close();
    } catch (e) {
      console.error(e);
    }
    currentRoom = null;
    meInstance = null;
  }
}

// 保留
document.getElementById('hold-btn').addEventListener('click', () => {
  if (!isHolding) {
    myAudioStream.stop();
    isHolding = true;
    document.getElementById('hold-btn').style.background = '#ffcc00';
    document.getElementById('hold-btn').style.color = '#000';
  } else {
    SkyWayStreamFactory.createMicrophoneAudioStream().then(stream => {
      myAudioStream = stream;
      isHolding = false;
      document.getElementById('hold-btn').style.background = '#3a3a3c';
      document.getElementById('hold-btn').style.color = '#fff';
    });
  }
});

// タイマー
function startTimer() {
  secondsElapsed = 0;
  document.getElementById('call-timer').textContent = '00:00';
  timerInterval = setInterval(() => {
    secondsElapsed++;
    const mins = Math.floor(secondsElapsed / 60).toString().padStart(2, '0');
    const secs = (secondsElapsed % 60).toString().padStart(2, '0');
    document.getElementById('call-timer').textContent = `${mins}:${secs}`;
  }, 1000);
}
function stopTimer() { clearInterval(timerInterval); }

// 電話帳
document.getElementById('add-contact-btn').addEventListener('click', () => {
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
  rawDigits = num.replace(/-/g, '');
  dialDisplay.textContent = num;
  switchTab('dial', document.querySelectorAll('.nav-item')[0]);
}

// 履歴
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
    li.innerHTML = `<span><b>${h.type === '発信' ? '↗️' : '↙️'} ${h.num}</b><br><small style="color:var(--text-secondary)">${h.time}</small></span>`;
    list.appendChild(li);
  });
}

// SkyWayトークン作成
function createSkyWayContext() {
  const token = new SkyWayAuthToken({
    jti: uuidV4(),
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24,
    scope: {
      app: {
        id: 'e24483fd-d035-404f-8617-8ead41ced6bd',     // ← あなたのApp ID
        turn: true,
        actions: ['read'],
        channels: [
          {
            id: '*', name: '*', actions: ['write'],
            members: [
              {
                id: '*', name: '*', actions: ['write'],
                publication: { actions: ['write'] },
                subscription: { actions: ['write'] },
              },
            ],
            sfuBots: [{ actions: ['write'], forwardings: [{ actions: ['write'] }] }]
          },
        ],
      },
    },
  }).encode('SwR9Hpm1B3HR9O+4GLgZrdZ0H15rL0Y0IgPX+uJbkNM='); // ← あなたのSecret Key

  return SkyWayContext.Create(token);
}