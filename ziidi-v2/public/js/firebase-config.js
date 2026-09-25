// Firebase initialization.
// Replace the values below with YOUR Firebase project's config
// (Firebase Console -> Project Settings -> General -> Your apps -> SDK setup and config).
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.13.0/firebase-functions.js";
const firebaseConfig = {

  apiKey: "AIzaSyBOnm-NiahRrWgM284pZsjF1Uo3BnQtQhs",

  authDomain: "ziidi002.firebaseapp.com",

  projectId: "ziidi002",

  storageBucket: "ziidi002.firebasestorage.app",

  messagingSenderId: "993365665634",

  appId: "1:993365665634:web:42509512819a356c276e3b",

  measurementId: "G-SFHBGYYSQ3"

};


export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const functions = getFunctions(app);
