const firebaseConfig = {
  apiKey: "AIzaSyBt2VQ1A3hRFn7nsR-T7kJixB9Gw-M2Gbk",
  authDomain: "virusgamegl.firebaseapp.com",
  projectId: "virusgamegl",
  storageBucket: "virusgamegl.firebasestorage.app",
  messagingSenderId: "93098679136",
  appId: "1:93098679136:web:d8964eabdc4dda5510dc05",
  measurementId: "G-87WNMZ2HJJ"
};
// Инициализация Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

function startGame() {
    document.getElementById('intro').style.display = 'none';
    document.getElementById('hub').style.display = 'block';
    initUser();
}

async function initUser() {
    await auth.signInAnonymously();
    const user = auth.currentUser;

    const urlParams = new URLSearchParams(window.location.search);
    const infectedBy = urlParams.get('infected_by') || 'Creator';

    const userDoc = db.collection('users').doc(user.uid);
    const doc = await userDoc.get();
    if (!doc.exists) {
        const newId = Math.floor(Math.random() * 1000000);
        await userDoc.set({
            infectionId: newId,
            infectedBy: infectedBy,
            infections: 0,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        });
        document.getElementById('infection-id').innerText = newId;
        document.getElementById('infected-by').innerText = infectedBy;
    } else {
        const data = doc.data();
        document.getElementById('infection-id').innerText = data.infectionId;
        document.getElementById('infected-by').innerText = data.infectedBy;
    }

    const virusLink = ${window.location.origin}/?infected_by=${document.getElementById('infection-id').innerText};
    document.getElementById('virus-link').value = virusLink;

    if (infectedBy !== 'Creator') {
        const parentQuery = db.collection('users').where('infectionId', '==', parseInt(infectedBy));
        const parentDocs = await parentQuery.get();
        if (!parentDocs.empty) {
            const parentDoc = parentDocs.docs[0];
            await parentDoc.ref.update({
                infections: firebase.firestore.FieldValue.increment(1)
            });
        }
    }

    loadLeaderboard();
    initMiniGame(); // Добавим мини-игру позже
}

function copyLink() {
    const link = document.getElementById('virus-link');
    link.select();
    document.execCommand('copy');
    alert('Link copied!');
}

function shareLink() {
    if (navigator.share) {
        navigator.share({
            title: 'Get Infected!',
            url: document.getElementById('virus-link').value
        });
    } else {
        copyLink();
    }
}

async function loadLeaderboard() {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '<h2>Top Infectors</h2>';
    const topUsers = await db.collection('users').orderBy('infections', 'desc').limit(10).get();
    topUsers.forEach(doc => {
        const data = doc.data();
        leaderboardDiv.innerHTML += <p>#${data.infectionId}: ${data.infections} infections</p>;
    });
}

window.onload = () => {
    if (new URLSearchParams(window.location.search).has('infected_by')) {
        startGame();
    }
};
