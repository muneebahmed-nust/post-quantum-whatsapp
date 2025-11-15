/**
 * Main Chat Application Controller
 * Integrates ChatHandler, UI management, and user interactions
 */

import { ChatHandler } from "./chat_handler.js";
import { SecureChannelManager } from "./secure_channel_manager.js";

// Check if Web Crypto API is available
if (!window.crypto || !window.crypto.subtle) {
    console.error("❌ Web Crypto API is not available. HTTPS or localhost required!");
    const warning = document.getElementById('crypto-warning');
    if (warning) warning.style.display = 'block';
    throw new Error("Web Crypto API not available - use HTTPS or localhost");
}

class ChatApp {
    constructor() {
        console.log('🚀 ChatApp constructor called');
        this.currentUser = null;
        this.chatHandler = null;
        this.secureChannelManager = new SecureChannelManager();
        this.selectedUser = null;
        this.chatHistories = {}; // Store chat messages per user
        this.unreadMessages = {}; // Track unread messages per user
        
        this.initializeUI();
        console.log('✅ ChatApp initialized successfully');
    }

    initializeUI() {
        console.log('🔧 Initializing UI...');
        // Get DOM elements
        this.loginScreen = document.getElementById('login-screen');
        this.chatScreen = document.getElementById('chat-screen');
        this.usernameInput = document.getElementById('username-input');
        this.loginBtn = document.getElementById('login-btn');
        this.userList = document.getElementById('user-list');
        this.currentUserDisplay = document.getElementById('current-user');
        this.noChatSelected = document.getElementById('no-chat-selected');
        this.chatContainer = document.getElementById('chat-container');
        this.selectedUserName = document.getElementById('selected-user-name');
        this.connectionStatus = document.getElementById('connection-status');
        this.chatBox = document.getElementById('chat-box');
        this.msgInput = document.getElementById('msg');
        this.sendBtn = document.getElementById('send');

        // Event listeners
        this.loginBtn.addEventListener('click', () => {
            console.log('🖱️ Login button clicked');
            this.handleLogin();
        });
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                console.log('⌨️ Enter key pressed on username input');
                this.handleLogin();
            }
        });
        this.sendBtn.addEventListener('click', () => this.sendMessage());
        this.msgInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
        console.log('✅ Event listeners attached');
    }

    async handleLogin() {
        console.log('🔐 handleLogin called');
        const username = this.usernameInput.value.trim();
        console.log('👤 Username entered:', username);
        
        if (!username) {
            console.warn('⚠️ No username entered');
            alert('Please enter a username');
            return;
        }

        console.log('✅ Username validated, waiting for key pair...');
        await this.secureChannelManager.keyPairReady;
        console.log('✅ Key pair ready, creating ChatHandler...');
        
        this.currentUser = username;
        this.chatHandler = new ChatHandler(username, this.secureChannelManager);
        console.log('✅ ChatHandler created');


        // Set up message listener
        console.log('📨 Setting up message listener...');
        this.chatHandler.onMessage((fromUser, decryptedText) => {
            this.handleIncomingMessage(fromUser, decryptedText);
        });

        // Listen for user list updates from server
        console.log('👥 Setting up user list listener...');
        this.chatHandler.socketHandler.socket.on('user_list', (userMap) => {
            console.log('📋 User list updated:', userMap);
            this.updateUserList(userMap);
        });

        // Send public key after registration completes
        console.log('⏳ Waiting for registration to complete...');
        
        // Use a promise-based approach to wait for registration
        const waitForRegistration = new Promise((resolve) => {
            // Check if already connected
            if (this.chatHandler.socketHandler.socket.connected) {
                console.log('🔗 Socket already connected, sending pubkey shortly...');
                setTimeout(resolve, 200); // Small delay for registration to complete
            } else {
                // Wait for connection
                this.chatHandler.socketHandler.socket.once('connect', () => {
                    console.log('🔗 Socket connected, waiting for registration...');
                    setTimeout(resolve, 200); // Small delay for registration to complete
                });
            }
        });
        
        waitForRegistration.then(() => {
            console.log('🔑 Sending public key via ChatHandler...');
            this.chatHandler.sendPublicKeyToServer(username);
        });

        // Show chat screen
        console.log('🖥️ Switching to chat screen...');
        this.loginScreen.style.display = 'none';
        this.chatScreen.style.display = 'flex';
        this.currentUserDisplay.textContent = `Logged in as: ${username}`;

        console.log(`✅ Logged in as ${username}`);
    }

    updateUserListWithUnread() {
        // Refresh the user list with current unread counts
        const currentUsers = this.chatHandler.socketHandler.users;
        const userMap = { ...currentUsers };
        this.updateUserList(userMap);
    }

    updateUserList(userMap) {
        // Clear current list
        this.userList.innerHTML = '';

        // Get all users except current user
        const users = Object.keys(userMap).filter(u => u !== this.currentUser);

        if (users.length === 0) {
            this.userList.innerHTML = '<div style="padding: 1rem; text-align: center; color: #999;">No other users online</div>';
            return;
        }

        users.forEach(username => {
            const userItem = document.createElement('div');
            userItem.className = 'user-item';
            if (this.selectedUser === username) {
                userItem.classList.add('active');
            }

            const avatar = document.createElement('div');
            avatar.className = 'user-avatar';
            avatar.textContent = username.charAt(0).toUpperCase();

            const nameDiv = document.createElement('div');
            nameDiv.textContent = username;
            nameDiv.style.flex = '1';

            userItem.appendChild(avatar);
            userItem.appendChild(nameDiv);
            
            // Add unread message badge if any
            const unreadCount = this.unreadMessages[username] || 0;
            if (unreadCount > 0) {
                const badge = document.createElement('span');
                badge.className = 'unread-badge';
                badge.textContent = unreadCount;
                badge.style.cssText = 'background: #25D366; color: white; border-radius: 50%; padding: 2px 6px; font-size: 0.75rem; font-weight: bold; min-width: 20px; text-align: center;';
                userItem.appendChild(badge);
            }

            userItem.addEventListener('click', () => this.selectUser(username));

            this.userList.appendChild(userItem);
        });
    }

    async selectUser(username) {
        if (this.selectedUser === username) return;

        this.selectedUser = username;
        this.selectedUserName.textContent = username;
        
        // Clear unread messages for this user
        if (this.unreadMessages[username]) {
            this.unreadMessages[username] = 0;
            this.updateUserListWithUnread();
        }

        // Update UI
        this.noChatSelected.style.display = 'none';
        this.chatContainer.style.display = 'flex';
        this.updateConnectionStatus('connecting');

        // Update active user in list
        document.querySelectorAll('.user-item').forEach(item => {
            item.classList.remove('active');
            if (item.textContent.includes(username)) {
                item.classList.add('active');
            }
        });

        // Load chat history
        this.loadChatHistory(username);

        // Check if we already have a connection
        if (this.chatHandler.sharedSecrets[username]) {
            this.updateConnectionStatus('connected');
            this.enableMessageInput();
            return;
        }

        // Establish connection
        this.disableMessageInput();
        console.log(`🔄 Establishing connection with ${username}...`);
        
        try {
            const success = await this.chatHandler.makeConnectionRequest(username);
            
            if (success) {
                this.updateConnectionStatus('connected');
                this.enableMessageInput();
                this.addSystemMessage(`Connected securely with ${username}`);
            } else {
                this.updateConnectionStatus('failed');
                this.addSystemMessage(`Failed to connect with ${username}. Please try again.`, true);
                this.disableMessageInput();
            }
        } catch (error) {
            console.error('Connection error:', error);
            this.updateConnectionStatus('failed');
            this.addSystemMessage(`Connection error: ${error.message}`, true);
            this.disableMessageInput();
        }
    }

    updateConnectionStatus(status) {
        this.connectionStatus.className = '';
        
        switch(status) {
            case 'connecting':
                this.connectionStatus.className = 'status-connecting';
                this.connectionStatus.textContent = '🔄 Connecting...';
                break;
            case 'connected':
                this.connectionStatus.className = 'status-connected';
                this.connectionStatus.textContent = '✅ Connected';
                break;
            case 'failed':
                this.connectionStatus.className = 'status-failed';
                this.connectionStatus.textContent = '❌ Connection Failed';
                break;
        }
    }

    enableMessageInput() {
        this.msgInput.disabled = false;
        this.sendBtn.disabled = false;
        this.msgInput.placeholder = 'Type a message...';
    }

    disableMessageInput() {
        this.msgInput.disabled = true;
        this.sendBtn.disabled = true;
        this.msgInput.placeholder = 'Establishing secure connection...';
    }

    loadChatHistory(username) {
        this.chatBox.innerHTML = '';
        
        if (!this.chatHistories[username]) {
            this.chatHistories[username] = [];
        }

        this.chatHistories[username].forEach(msg => {
            this.displayMessage(msg.from, msg.text, msg.isSent, false);
        });

        this.scrollToBottom();
    }

    async sendMessage() {
        if (!this.selectedUser) {
            alert('Please select a user first');
            return;
        }

        const text = this.msgInput.value.trim();
        if (!text) return;

        try {
            await this.chatHandler.sendMessage(this.selectedUser, text);
            
            // Add to chat history
            if (!this.chatHistories[this.selectedUser]) {
                this.chatHistories[this.selectedUser] = [];
            }
            this.chatHistories[this.selectedUser].push({
                from: this.currentUser,
                text: text,
                isSent: true,
                timestamp: new Date()
            });

            // Display message
            this.displayMessage(this.currentUser, text, true);
            
            // Clear input
            this.msgInput.value = '';
            this.scrollToBottom();

        } catch (error) {
            console.error('Failed to send message:', error);
            this.addSystemMessage('Failed to send message. Please try again.', true);
        }
    }

    handleIncomingMessage(fromUser, decryptedText) {
        console.log(`📩 Message from ${fromUser}: ${decryptedText}`);

        // Add to chat history
        if (!this.chatHistories[fromUser]) {
            this.chatHistories[fromUser] = [];
        }
        this.chatHistories[fromUser].push({
            from: fromUser,
            text: decryptedText,
            isSent: false,
            timestamp: new Date()
        });

        // Display if this is the active chat
        if (this.selectedUser === fromUser) {
            this.displayMessage(fromUser, decryptedText, false);
            this.scrollToBottom();
        } else {
            // Increment unread counter
            if (!this.unreadMessages[fromUser]) {
                this.unreadMessages[fromUser] = 0;
            }
            this.unreadMessages[fromUser]++;
            this.updateUserListWithUnread();
        }
    }

    displayMessage(from, text, isSent, scroll = true) {
        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${isSent ? 'sent' : 'received'}`;

        const contentDiv = document.createElement('div');
        contentDiv.className = 'message-content';

        const senderDiv = document.createElement('div');
        senderDiv.className = 'message-sender';
        senderDiv.textContent = isSent ? 'You' : from;

        const textDiv = document.createElement('div');
        textDiv.textContent = text;

        const timeDiv = document.createElement('div');
        timeDiv.className = 'message-time';
        timeDiv.textContent = new Date().toLocaleTimeString();

        contentDiv.appendChild(senderDiv);
        contentDiv.appendChild(textDiv);
        contentDiv.appendChild(timeDiv);
        messageDiv.appendChild(contentDiv);

        this.chatBox.appendChild(messageDiv);
        
        if (scroll) this.scrollToBottom();
    }

    addSystemMessage(text, isError = false) {
        const messageDiv = document.createElement('div');
        messageDiv.style.textAlign = 'center';
        messageDiv.style.padding = '0.5rem';
        messageDiv.style.margin = '0.5rem 0';
        messageDiv.style.fontSize = '0.85rem';
        messageDiv.style.color = isError ? '#721c24' : '#666';
        messageDiv.style.background = isError ? '#f8d7da' : '#e8f4f8';
        messageDiv.style.borderRadius = '6px';
        messageDiv.textContent = text;

        this.chatBox.appendChild(messageDiv);
        this.scrollToBottom();
    }

    scrollToBottom() {
        this.chatBox.scrollTop = this.chatBox.scrollHeight;
    }
}

// Initialize the app when DOM is ready
console.log('🔍 Waiting for DOMContentLoaded...');
document.addEventListener('DOMContentLoaded', () => {
    console.log('✅ DOM Content Loaded!');
    try {
        window.chatApp = new ChatApp();
        console.log('🎉 Chat application initialized successfully');
    } catch (error) {
        console.error('❌ Failed to initialize chat application:', error);
    }
});



// import { MlKem512 } from "./mlkem.min.js";

// const socket = io();
// const chatBox = document.getElementById("chat-box");
// const msgInput = document.getElementById("msg");
// const sendBtn = document.getElementById("send");

// function logMsg(msg) {
//     chatBox.innerHTML += msg + "<br>";
//     chatBox.scrollTop = chatBox.scrollHeight;
// }

// // ======== UTILS ========
// function arrayBufferToBase64(buf) {
//     return btoa(String.fromCharCode(...new Uint8Array(buf)));
// }

// function base64ToArrayBuffer(b64) {
//     const binary = atob(b64);
//     const bytes = new Uint8Array(binary.length);
//     for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
//     return bytes;
// }



// // ======== KYBER KEYPAIR ========
// console.log("🔹 chat.js loaded");
// const kem = new MlKem512();
// console.log("🔑 Generating Kyber keypair...");
// const [pkR, skR] = await kem.generateKeyPair();
// console.log("🔑 Keypair generated:", { pkR, skR });

// let sharedSecrets = {}; // peerSid -> AES key (CryptoKey)
// let messageQueue = [];  // messages to send once keys are ready

// // send Base64-encoded public key to server
// const pkB64 = arrayBufferToBase64(pkR);
// socket.emit("pubkey", { name: "User", pubkey: pkB64 });

// // ======== SOCKET EVENTS ========
// socket.on("connect", () => {
//     console.log("🔗 Connected to server, SID:", socket.id);
// });

// socket.on("peer_pubkeys", async peers => {
//     console.log("🔹 Received peer public keys:", peers);

//     for (let [sid, pubkeyB64] of Object.entries(peers)) {
//         if (sharedSecrets[sid]) continue;

//         try {
//             const pubkey = base64ToArrayBuffer(pubkeyB64);
//             const [ct, ssS] = await kem.encap(pubkey);

//             const aesKey = await window.crypto.subtle.importKey(
//                 "raw", ssS, "AES-GCM", false, ["encrypt", "decrypt"]
//             );
//             sharedSecrets[sid] = aesKey;

//             const ctB64 = arrayBufferToBase64(ct);
//             socket.emit("send_kem_ciphertext", { to: sid, ciphertext: ctB64 });
//             console.log(`🔐 Encapsulated key sent to peer ${sid}`);
//         } catch (err) {
//             console.error("❌ KEM encapsulation failed:", err);
//         }
//     }

//     // flush queued messages
//     while (messageQueue.length) {
//         const { sid, text } = messageQueue.shift();
//         sendEncryptedMessage(sid, text);
//     }
// });

// socket.on("recv_kem_ciphertext", async ({ from, ciphertext }) => {
//     if (sharedSecrets[from]) return;

//     try {
//         const ctBuf = base64ToArrayBuffer(ciphertext);
//         const ssR = await kem.decap(ctBuf, skR);

//         const aesKey = await window.crypto.subtle.importKey(
//             "raw", ssR, "AES-GCM", false, ["encrypt", "decrypt"]
//         );
//         sharedSecrets[from] = aesKey;
//         console.log(`🔑 Shared key established with peer ${from}`);
//     } catch (err) {
//         console.error("❌ KEM decapsulation failed:", err);
//     }
// });

// // ======== AES ENCRYPT/DECRYPT ========
// async function aesEncrypt(aesKey, plaintext) {
//     const iv = window.crypto.getRandomValues(new Uint8Array(12));
//     const encoded = new TextEncoder().encode(plaintext);
//     const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
//     return { iv, ciphertext };
// }

// async function aesDecrypt(aesKey, iv, ciphertext) {
//     const plainBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
//     return new TextDecoder().decode(plainBuffer);
// }

// // ======== SEND MESSAGE ========
// async function sendEncryptedMessage(sid, text) {
//     const aesKey = sharedSecrets[sid];
//     if (!aesKey) {
//         console.warn(`⚠️ AES key not ready for peer ${sid}, queueing message`);
//         messageQueue.push({ sid, text });
//         return;
//     }

//     try {
//         const { iv, ciphertext } = await aesEncrypt(aesKey, text);
//         socket.emit("send_message", {
//             to: sid,
//             ciphertext: {
//                 iv: arrayBufferToBase64(iv),
//                 data: arrayBufferToBase64(ciphertext)
//             }
//         });
//     } catch (err) {
//         console.error(`❌ Failed to encrypt message for ${sid}:`, err);
//     }
// }

// // UI send
// sendBtn.addEventListener("click", async () => {
//     const text = msgInput.value.trim();
//     if (!text) return;
//     msgInput.value = "";
//     console.log("✉️ Sending message:", text);

//     for (let sid of Object.keys(sharedSecrets)) {
//         sendEncryptedMessage(sid, text);
//     }
//     logMsg("💬 You: " + text);
// });

// // ======== RECEIVE MESSAGE ========
// socket.on("recv_message", async ({ from, ciphertext }) => {
//     const aesKey = sharedSecrets[from];
//     if (!aesKey) {
//         console.warn(`⚠️ Received message from ${from} but no shared key exists`);
//         return;
//     }

//     try {
//         const iv = base64ToArrayBuffer(ciphertext.iv);
//         const data = base64ToArrayBuffer(ciphertext.data);
//         const decrypted = await aesDecrypt(aesKey, iv, data);
//         logMsg("Peer: " + decrypted);
//     } catch (err) {
//         console.error("❌ Failed to decrypt message from", from, err);
//     }
// });
