import { MlKem512 } from "./mlkem.min.js";

const socket = io();
const chatBox = document.getElementById("chat-box");
const msgInput = document.getElementById("msg");
const sendBtn = document.getElementById("send");

function logMsg(msg) {
    chatBox.innerHTML += msg + "<br>";
    chatBox.scrollTop = chatBox.scrollHeight;
}

// ======== UTILS ========
function arrayBufferToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

function base64ToArrayBuffer(b64) {
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}

// Check if Web Crypto API is available
if (!window.crypto || !window.crypto.subtle) {
    console.error("❌ Web Crypto API is not available. HTTPS or localhost required!");
    const warning = document.getElementById('crypto-warning');
    if (warning) warning.style.display = 'block';
    throw new Error("Web Crypto API not available - use HTTPS or localhost");
}

// ======== KYBER KEYPAIR ========
console.log("🔹 chat.js loaded");
const kem = new MlKem512();
console.log("🔑 Generating Kyber keypair...");
const [pkR, skR] = await kem.generateKeyPair();
console.log("🔑 Keypair generated:", { pkR, skR });

let sharedSecrets = {}; // peerSid -> AES key (CryptoKey)
let messageQueue = [];  // messages to send once keys are ready

// send Base64-encoded public key to server
const pkB64 = arrayBufferToBase64(pkR);
socket.emit("pubkey", { name: "User", pubkey: pkB64 });

// ======== SOCKET EVENTS ========
socket.on("connect", () => {
    console.log("🔗 Connected to server, SID:", socket.id);
});

socket.on("peer_pubkeys", async peers => {
    console.log("🔹 Received peer public keys:", peers);

    for (let [sid, pubkeyB64] of Object.entries(peers)) {
        if (sharedSecrets[sid]) continue;

        try {
            const pubkey = base64ToArrayBuffer(pubkeyB64);
            const [ct, ssS] = await kem.encap(pubkey);

            const aesKey = await window.crypto.subtle.importKey(
                "raw", ssS, "AES-GCM", false, ["encrypt", "decrypt"]
            );
            sharedSecrets[sid] = aesKey;

            const ctB64 = arrayBufferToBase64(ct);
            socket.emit("send_kem_ciphertext", { to: sid, ciphertext: ctB64 });
            console.log(`🔐 Encapsulated key sent to peer ${sid}`);
        } catch (err) {
            console.error("❌ KEM encapsulation failed:", err);
        }
    }

    // flush queued messages
    while (messageQueue.length) {
        const { sid, text } = messageQueue.shift();
        sendEncryptedMessage(sid, text);
    }
});

socket.on("recv_kem_ciphertext", async ({ from, ciphertext }) => {
    if (sharedSecrets[from]) return;

    try {
        const ctBuf = base64ToArrayBuffer(ciphertext);
        const ssR = await kem.decap(ctBuf, skR);

        const aesKey = await window.crypto.subtle.importKey(
            "raw", ssR, "AES-GCM", false, ["encrypt", "decrypt"]
        );
        sharedSecrets[from] = aesKey;
        console.log(`🔑 Shared key established with peer ${from}`);
    } catch (err) {
        console.error("❌ KEM decapsulation failed:", err);
    }
});

// ======== AES ENCRYPT/DECRYPT ========
async function aesEncrypt(aesKey, plaintext) {
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
    return { iv, ciphertext };
}

async function aesDecrypt(aesKey, iv, ciphertext) {
    const plainBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
    return new TextDecoder().decode(plainBuffer);
}

// ======== SEND MESSAGE ========
async function sendEncryptedMessage(sid, text) {
    const aesKey = sharedSecrets[sid];
    if (!aesKey) {
        console.warn(`⚠️ AES key not ready for peer ${sid}, queueing message`);
        messageQueue.push({ sid, text });
        return;
    }

    try {
        const { iv, ciphertext } = await aesEncrypt(aesKey, text);
        socket.emit("send_message", {
            to: sid,
            ciphertext: {
                iv: arrayBufferToBase64(iv),
                data: arrayBufferToBase64(ciphertext)
            }
        });
    } catch (err) {
        console.error(`❌ Failed to encrypt message for ${sid}:`, err);
    }
}

// UI send
sendBtn.addEventListener("click", async () => {
    const text = msgInput.value.trim();
    if (!text) return;
    msgInput.value = "";
    console.log("✉️ Sending message:", text);

    for (let sid of Object.keys(sharedSecrets)) {
        sendEncryptedMessage(sid, text);
    }
    logMsg("💬 You: " + text);
});

// ======== RECEIVE MESSAGE ========
socket.on("recv_message", async ({ from, ciphertext }) => {
    const aesKey = sharedSecrets[from];
    if (!aesKey) {
        console.warn(`⚠️ Received message from ${from} but no shared key exists`);
        return;
    }

    try {
        const iv = base64ToArrayBuffer(ciphertext.iv);
        const data = base64ToArrayBuffer(ciphertext.data);
        const decrypted = await aesDecrypt(aesKey, iv, data);
        logMsg("Peer: " + decrypted);
    } catch (err) {
        console.error("❌ Failed to decrypt message from", from, err);
    }
});
