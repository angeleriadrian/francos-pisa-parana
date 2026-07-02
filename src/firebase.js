import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyCslFEfiJ0ADgKhD4Ul9ruoTfMkGJ9f3mE",
  authDomain: "francos-pisa-parana.firebaseapp.com",
  projectId: "francos-pisa-parana",
  storageBucket: "francos-pisa-parana.firebasestorage.app",
  messagingSenderId: "1078861347565",
  appId: "1:1078861347565:web:13ab20e8e6adf6f7baaae4"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
