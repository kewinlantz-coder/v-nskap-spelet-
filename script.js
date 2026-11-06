let peer = null;
let connections = [];
let hostConn = null;

let myName = "";
let roomCode = "";
let isHost = false;

let players = [];
let questions = [];
let currentQuestionIndex = 0;
let votes = {};
let hasVoted = false;

function toggleModal(show) {
  document.getElementById('info-modal').classList.toggle('hidden', !show);
}

function createRoom() {
  myName = document.getElementById('username').value.trim();
  if (!myName) return alert("Skriv ditt namn först!");

  isHost = true;
  roomCode = Math.floor(1000 + Math.random() * 9000).toString();

  // Skapa unikt ID för rummet
  peer = new Peer('v-nskap-room-' + roomCode);

  peer.on('open', () => {
    players = [myName];
    showLobby();
  });

  peer.on('connection', (conn) => {
    connections.push(conn);

    conn.on('data', (data) => {
      handleHostMessages(data, conn);
    });

    conn.on('close', () => {
      connections = connections.filter(c => c !== conn);
    });
  });

  peer.on('error', (err) => {
    if (err.type === 'unavailable-id') {
      createRoom(); // Om koden krockade, generera ny kod automatiskt
    } else {
      alert("Nätverksfel vid rumsskapande. Försök igen!");
    }
  });
}

function joinRoom() {
  myName = document.getElementById('username').value.trim();
  let code = document.getElementById('room-code-input').value.trim().toUpperCase();

  if (!myName) return alert("Skriv ditt namn!");
  if (!code) return alert("Skriv in rumskoden!");

  isHost = false;
  roomCode = code;
  peer = new Peer();

  peer.on('open', () => {
    hostConn = peer.connect('v-nskap-room-' + roomCode);

    hostConn.on('open', () => {
      hostConn.send({ type: 'JOIN', name: myName });
      showLobby();
    });

    hostConn.on('data', (data) => {
      handleClientMessages(data);
    });

    hostConn.on('error', () => {
      alert("Hittade inte rummet! Kontrollera att koden stämmer.");
    });
  });
}

function broadcast(data) {
  connections.forEach(conn => conn.send(data));
}

function handleHostMessages(data, conn) {
  if (data.type === 'JOIN') {
    if (!players.includes(data.name)) {
      players.push(data.name);
    }
    broadcast({ type: 'SYNC_PLAYERS', players });
    updateLobbyUI();
  } else if (data.type === 'SUBMIT_QUESTION') {
    questions.push(data.question);
    if (questions.length === players.length) {
      broadcast({ type: 'START_VOTING', questions });
      startVotingPhase(questions);
    }
  } else if (data.type === 'SUBMIT_VOTE') {
    votes[data.target] = (votes[data.target] || 0) + 1;
    let totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
    if (totalVotes >= players.length * questions.length) {
      broadcast({ type: 'SHOW_RESULTS', votes });
      showResults(votes);
    }
  }
}

function handleClientMessages(data) {
  if (data.type === 'SYNC_PLAYERS') {
    players = data.players;
    updateLobbyUI();
  } else if (data.type === 'START_GAME') {
    document.getElementById('lobby-screen').classList.add('hidden');
    document.getElementById('question-screen').classList.remove('hidden');
  } else if (data.type === 'START_VOTING') {
    startVotingPhase(data.questions);
  } else if (data.type === 'SHOW_RESULTS') {
    showResults(data.votes);
  }
}

function showLobby() {
  document.getElementById('setup-screen').classList.add('hidden');
  document.getElementById('lobby-screen').classList.remove('hidden');
  document.getElementById('display-room-code').innerText = roomCode;
  updateLobbyUI();
}

function updateLobbyUI() {
  document.getElementById('player-count').innerText = players.length;
  let list = document.getElementById('player-list');
  list.innerHTML = players.map(p => `
    <li class="player-item">
      <span>${p} ${p === myName ? '(Du)' : ''}</span> 
      <span class="status-dot"></span>
    </li>
  `).join('');

  if (isHost) {
    document.getElementById('start-game-btn').classList.remove('hidden');
    document.getElementById('waiting-msg').classList.add('hidden');
  }
}

function hostStartGame() {
  if (players.length < 2) return alert("Vänta på att minst en kompis till ska gå med!");
  broadcast({ type: 'START_GAME' });
  document.getElementById('lobby-screen').classList.add('hidden');
  document.getElementById('question-screen').classList.remove('hidden');
}

function submitQuestion() {
  let q = document.getElementById('my-question').value.trim();
  if (!q) return alert("Skriv en fråga!");
  
  document.getElementById('question-screen').innerHTML = "<h3 style='text-align:center;'>Frågan skickad! Väntar på de andra... ⏳</h3>";

  if (isHost) {
    questions.push(q);
    if (questions.length === players.length) {
      broadcast({ type: 'START_VOTING', questions });
      startVotingPhase(questions);
    }
  } else {
    hostConn.send({ type: 'SUBMIT_QUESTION', question: q });
  }
}

function startVotingPhase(qs) {
  questions = qs;
  document.getElementById('question-screen').classList.add('hidden');
  document.getElementById('vote-screen').classList.remove('hidden');
  renderVoteQuestion();
}

function renderVoteQuestion() {
  hasVoted = false;
  document.getElementById('vote-progress').innerText = `Fråga ${currentQuestionIndex + 1} av ${questions.length}`;
  document.getElementById('current-question-text').innerText = questions[currentQuestionIndex];

  let container = document.getElementById('vote-options');
  container.innerHTML = players.map(p => `
    <button class="btn btn-secondary" style="margin-bottom: 10px;" onclick="castVote('${p}')">${p}</button>
  `).join('');
}

function castVote(targetName) {
  if (hasVoted) return;
  hasVoted = true;

  if (isHost) {
    votes[targetName] = (votes[targetName] || 0) + 1;
  } else {
    hostConn.send({ type: 'SUBMIT_VOTE', target: targetName });
  }

  currentQuestionIndex++;
  if (currentQuestionIndex < questions.length) {
    renderVoteQuestion();
  } else {
    document.getElementById('vote-screen').innerHTML = "<h3 style='text-align:center;'>Väntar på att alla ska rösta klart... 📊</h3>";
    if (isHost) {
      let totalVotes = Object.values(votes).reduce((a, b) => a + b, 0);
      if (totalVotes >= players.length * questions.length) {
        broadcast({ type: 'SHOW_RESULTS', votes });
        showResults(votes);
      }
    }
  }
}

function showResults(finalVotes) {
  document.getElementById('vote-screen').classList.add('hidden');
  document.getElementById('result-screen').classList.remove('hidden');

  confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });

  let labels = players;
  let dataValues = labels.map(name => finalVotes[name] || 0);

  let ctx = document.getElementById('resultChart').getContext('2d');
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Antal Röster',
        data: dataValues,
        backgroundColor: ['#8b5cf6', '#ec4899', '#3b82f6', '#10b981', '#f59e0b']
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1, color: '#94a3b8' } }, x: { ticks: { color: '#fff' } } }
    }
  });
}
