import { initializeApp } from 'firebase/app';
import { getFirestore, collectionGroup, getDocs, deleteDoc } from 'firebase/firestore';
import { getAuth, signInWithEmailAndPassword } from 'firebase/auth';
import * as readline from 'readline/promises';

const firebaseConfig = {
  projectId: "tickets-f4541",
  appId: "1:558417282259:web:61889ae0cac470703c0026",
  apiKey: "AIzaSyBGiYZkcKfmTET0B6sqC6QuiLDvoq68Z5o",
  authDomain: "tickets-f4541.firebaseapp.com",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);
const auth = getAuth(app);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const email = await rl.question('Email: ');
const password = await rl.question('Password: ');
rl.close();

await signInWithEmailAndPassword(auth, email, password);
console.log('Logged in. Fetching clients...');

const snapshot = await getDocs(collectionGroup(db, 'clients'));
console.log(`Found ${snapshot.size} clients — deleting...`);

let deleted = 0;
for (const docSnap of snapshot.docs) {
  await deleteDoc(docSnap.ref);
  deleted++;
  process.stdout.write(`\rDeleted ${deleted}/${snapshot.size}`);
}

console.log(`\nDone. All ${deleted} clients deleted.`);
process.exit(0);
