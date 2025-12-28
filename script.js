const firebaseConfig = {
  apiKey: "AIzaSyDUk8d4x_7VaHLJyFko27lTEOZZ46B3zbo",
  authDomain: "zombieglobalvs.firebaseapp.com",
  projectId: "zombieglobalvs",
  storageBucket: "zombieglobalvs.firebasestorage.app",
  messagingSenderId: "1038312557504",
  appId: "1:1038312557504:web:67f4bef520987361d59625",
  measurementId: "G-6YX9YQ7PS2"
};

// Импорты для модульного Firebase
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js";
import { getAuth, signInAnonymously } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js";
import { getFirestore, collection, doc, getDoc, setDoc, query, where, getDocs, updateDoc, orderBy, limit, serverTimestamp, increment } from "https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js";

// Инициализация
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Функция старта (экспорт, чтоб видно из HTML)
export function startGame() {
    document.getElementById('intro').style.display = 'none';
    document.getElementById('hub').style.display = 'block';
    initUser();
}

// Инициализация пользователя
async function initUser() {
    await signInAnonymously(auth);
    const user = auth.currentUser;

    const urlParams = new URLSearchParams(window.location.search);
    const infectedBy = urlParams.get('infected_by') || 'Creator';

    const userDocRef = doc(collection(db, 'users'), user.uid);
    const docSnap = await getDoc(userDocRef);
    if (!docSnap.exists()) {
        const newId = Math.floor(Math.random() * 1000000);
        await setDoc(userDocRef, {
            infectionId: newId,
            infectedBy: infectedBy,
            infections: 0,
            createdAt: serverTimestamp()
        });
        document.getElementById('infection-id').innerText = newId;
        document.getElementById('infected-by').innerText = infectedBy;
    } else {
        const data = docSnap.data();
        document.getElementById('infection-id').innerText = data.infectionId;
        document.getElementById('infected-by').innerText = data.infectedBy;
    }

    const virusLink = ${window.location.origin}/?infected_by=${document.getElementById('infection-id').innerText};
    document.getElementById('virus-link').value = virusLink;

    if (infectedBy !== 'Creator') {
        const parentQuery = query(collection(db, 'users'), where('infectionId', '==', parseInt(infectedBy)));
        const parentDocs = await getDocs(parentQuery);
        if (!parentDocs.empty) {
            const parentDocRef = parentDocs.docs[0].ref;
            await updateDoc(parentDocRef, {
                infections: increment(1)
            });
        }
    }

    loadLeaderboard();
    // initMiniGame(); // Добавь позже
}

// Копировать
export function copyLink() {
    const link = document.getElementById('virus-link');
    link.select();
    document.execCommand('copy');
    alert('Link copied!');
}

// Поделиться
export function shareLink() {
    if (navigator.share) {
        navigator.share({
            title: 'Get Infected!',
            url: document.getElementById('virus-link').value
        });
    } else {
        copyLink();
    }
}

// Лидерборд
async function loadLeaderboard() {
    const leaderboardDiv = document.getElementById('leaderboard');
    leaderboardDiv.innerHTML = '<h2>Top Infectors</h2>';
    const topQuery = query(collection(db, 'users'), orderBy('infections', 'desc'), limit(10));
    const topDocs = await getDocs(topQuery);
    topDocs.forEach((docSnap) => {
        const data = docSnap.data();
        leaderboardDiv.innerHTML += <p>#${data.infectionId}: ${data.infections} infections</p>;
    });
}

// Автостарт если параметр в URL
window.onload = () => {
    if (new URLSearchParams(window.location.search).has('infected_by')) {
        startGame();
    }
    // Заглушка для видео
    const video = document.getElementById('intro-video');
    video.addEventListener('error', () => {
        document.getElementById('intro-placeholder').style.display = 'block';
        video.style.display = 'none';
    });
};
