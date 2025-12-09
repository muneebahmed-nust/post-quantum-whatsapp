# 🔐 Quanta - Post-Quantum Secure Chat Application

[![ML-KEM-512](https://img.shields.io/badge/Quantum_Resistant-ML--KEM--512-blue)](https://csrc.nist.gov/projects/post-quantum-cryptography)
[![AES-GCM](https://img.shields.io/badge/Encryption-AES--GCM-green)](https://en.wikipedia.org/wiki/Galois/Counter_Mode)
[![WebSocket](https://img.shields.io/badge/Real--time-Socket.IO-black)](https://socket.io/)

Quanta is a secure, real-time chat application that implements **post-quantum cryptography** to protect communications against both classical and quantum computer attacks. It uses **ML-KEM-512 (Kyber)** for key exchange and **AES-GCM** for message encryption.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Why Post-Quantum Cryptography?](#why-post-quantum-cryptography)
- [Architecture](#architecture)
- [Technology Stack](#technology-stack)
- [How It Works](#how-it-works)
- [Code Structure](#code-structure)
- [Message Journey](#message-journey)
- [Security Features](#security-features)
- [Installation](#installation)
- [Usage](#usage)
- [Project Structure](#project-structure)

---

## 🌟 Overview

Quanta provides WhatsApp-like user interface with military-grade encryption that's resistant to quantum computer attacks. It demonstrates how post-quantum cryptographic algorithms can be integrated into real-world applications.

**Key Features:**
- 🛡️ **Post-Quantum Security**: Uses NIST-standardized ML-KEM-512 (Kyber) algorithm
- 🔒 **End-to-End Encryption**: Messages encrypted with AES-256-GCM
- ⚡ **Real-time Communication**: Built on WebSocket (Socket.IO) for instant messaging
- 💬 **Modern UI**: Clean, responsive WhatsApp-inspired interface
- 🔍 **User Search**: Find and connect with online users easily
- 📱 **Tab System**: Separate views for active chats and all users
- 👥 **Group Chat**: Create groups, distribute keys securely, and chat with multiple members in real time
- 🖼️ **Encrypted Images**: Share images (with optional captions) in 1:1 and group chats, encrypted end‑to‑end

---

## 🔮 Why Post-Quantum Cryptography?

Traditional encryption methods like RSA and Elliptic Curve Cryptography (ECC) will become vulnerable once large-scale quantum computers are available. Quantum computers can use **Shor's algorithm** to break these systems efficiently.

**ML-KEM (Module-Lattice-Based Key-Encapsulation Mechanism)** is based on the hardness of lattice problems, which are believed to be resistant to both classical and quantum attacks. In 2024, NIST standardized ML-KEM as one of the primary post-quantum cryptographic algorithms.

---

## 🏗️ Architecture

The application follows a **client-server architecture** with end-to-end encryption:

```
┌─────────────────┐                  ┌─────────────────┐
│   Client A      │                  │   Client B      │
│  (Browser)      │                  │  (Browser)      │
│                 │                  │                 │
│  ┌───────────┐  │                  │  ┌───────────┐  │
│  │ ML-KEM    │  │                  │  │ ML-KEM    │  │
│  │ KeyPair   │  │                  │  │ KeyPair   │  │
│  └───────────┘  │                  │  └───────────┘  │
│  ┌───────────┐  │                  │  ┌───────────┐  │
│  │ AES-GCM   │  │                  │  │ AES-GCM   │  │
│  │ Encryption│  │                  │  │ Decryption│  │
│  └───────────┘  │                  │  └───────────┘  │
└────────┬────────┘                  └────────┬────────┘
         │                                    │
         │         WebSocket (Socket.IO)      │
         └────────────┬───────────────────────┘
                      │
              ┌───────▼────────┐
              │  Flask Server  │
              │  (app.py)      │
              │                │
              │  - Routes      │
              │  - User Mgmt   │
              │  - Key Relay   │
              └────────────────┘
```

### Components:

1. **Frontend (Browser)**
   - User interface (HTML/CSS)
   - Cryptographic operations (JavaScript)
   - WebSocket communication

2. **Backend (Flask Server)**
   - User session management
   - Message routing
   - Public key distribution
   - No access to plaintext messages

3. **Cryptographic Layer**
   - ML-KEM for key exchange
   - AES-GCM for message encryption
   - Web Crypto API for secure operations

---

## 🛠️ Technology Stack

### Backend
- **Python 3.x** - Server-side programming
- **Flask** - Web framework
- **Flask-SocketIO** - Real-time WebSocket communication
- **python-socketio** - Socket.IO server implementation

### Frontend
- **HTML5/CSS3** - User interface
- **JavaScript (ES6 Modules)** - Client-side logic
- **Socket.IO Client** - Real-time communication
- **Web Crypto API** - Browser cryptographic operations
- **ML-KEM JavaScript Library** - Post-quantum key exchange
- **Group Chat Manager** - Client-side group lifecycle and messaging

### Cryptography
- **ML-KEM-512 (Kyber)** - Post-quantum key encapsulation
- **AES-256-GCM** - Symmetric encryption
- **Base64 Encoding** - Binary data transmission

---

## 🔍 How It Works

### Stage 1: User Registration & Key Generation

When a user opens the application:

```javascript
// 1. Generate ML-KEM key pair (secure_channel_manager.js)
const kem = new MlKem512();
const [publicKey, privateKey] = await kem.generateKeyPair();

// 2. Connect to server via WebSocket
socket.connect();

// 3. Register username
socket.emit("register_user", { name: username });

// 4. Send public key to server
socket.emit("send_pubkey", { 
    name: username, 
    pubkey: base64EncodedPublicKey 
});
```

**What happens:**
- Browser generates a quantum-resistant key pair locally
- Private key **NEVER** leaves the browser
- Public key sent to server for distribution
- Server stores username-to-socketID mapping

### Stage 2: Establishing Secure Connection

When User A wants to chat with User B:

```javascript
// 1. User A requests User B's public key
socket.emit("request_pubkey", { username: "UserB" });

// 2. Server sends User B's public key to User A
socket.on("pubkey_response", ({ username, pubkeyB64 }) => {
    // 3. User A encapsulates a shared secret using User B's public key
    const [ciphertext, sharedSecret] = await kem.encap(pubkeyB64);
    
    // 4. User A sends ciphertext to User B
    socket.emit("send_kem_ciphertext", { 
        to: "UserB", 
        ciphertext: base64Ciphertext 
    });
});

// 5. User B receives and decapsulates the ciphertext
socket.on("recv_kem_ciphertext", async ({ from, ciphertext }) => {
    const sharedSecret = await kem.decap(ciphertext, privateKey);
    
    // 6. Both users derive the same AES key from shared secret
    const aesKey = await crypto.subtle.importKey(
        "raw", 
        sharedSecret, 
        "AES-GCM", 
        false, 
        ["encrypt", "decrypt"]
    );
});
```

**What happens:**
1. **Key Exchange Protocol (ML-KEM)**:
   - User A gets User B's public key from server
   - User A generates a random shared secret
   - User A encrypts the secret using User B's public key (encapsulation)
   - Only User B can decrypt it with their private key (decapsulation)
   - Both users now have the same shared secret

2. **Quantum Security**:
   - Even if someone intercepts the ciphertext, they cannot derive the shared secret
   - Quantum computers cannot break the lattice-based mathematics
   - Forward secrecy: Each chat session can use a different key

### Stage 3: Sending Messages

```javascript
// Sender (User A)
async function sendMessage(recipient, plaintext) {
    // 1. Generate random IV (Initialization Vector)
    const iv = crypto.getRandomValues(new Uint8Array(12));
    
    // 2. Encrypt message with AES-GCM
    const ciphertext = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        new TextEncoder().encode(plaintext)
    );
    
    // 3. Send IV + ciphertext to server
    socket.emit("send_message", {
        to: recipient,
        ciphertext: {
            iv: base64(iv),
            data: base64(ciphertext)
        }
    });
}
```

**What happens:**
- Message encrypted locally in browser
- Server only sees encrypted data
- Server routes encrypted message to recipient
- Server CANNOT read the message

### Group Messaging (End‑to‑End)

Group chats use a shared AES‑256 key per group. The group admin generates this key locally and distributes it to each member using their ML‑KEM public key:

1. Admin creates a group → a random AES‑256 group key is generated in the browser.
2. For each member, the admin encapsulates a unique shared secret using ML‑KEM and encrypts the group key with it.
3. The server relays the per‑member encrypted group key; only the intended member can decrypt it.
4. All group messages (and images) are then encrypted with the group key and delivered in real time.

This approach keeps the server unaware of plaintext and of the group key itself.

### Stage 4: Receiving Messages

```javascript
// Receiver (User B)
socket.on("recv_message", async ({ from, ciphertext }) => {
    // 1. Extract IV and encrypted data
    const iv = base64ToArrayBuffer(ciphertext.iv);
    const encryptedData = base64ToArrayBuffer(ciphertext.data);
    
    // 2. Decrypt using shared AES key
    const decrypted = await crypto.subtle.decrypt(
        { name: "AES-GCM", iv: iv },
        aesKey,
        encryptedData
    );
    
    // 3. Convert to readable text
    const plaintext = new TextDecoder().decode(decrypted);
    
    // 4. Display in chat UI
    displayMessage(from, plaintext);
});
```

**What happens:**
- Only the intended recipient can decrypt
- AES-GCM provides authentication (detects tampering)
- Message displayed in chat interface

---

## 📂 Code Structure

### Backend (`app.py`)

```python
# Flask Server - Message Router & User Manager

@socketio.on('register_user')
def handle_register_user(data):
    """
    Registers a new user and broadcasts updated user list
    - Stores username and socket ID
    - Maintains online user list
    - Notifies all clients of new user
    """

@socketio.on('send_pubkey')
def handle_send_pubkey(data):
    """
    Stores user's public key for distribution
    - Associates public key with user
    - Enables other users to request it
    """

@socketio.on('request_pubkey')
def handle_request_pubkey(data):
    """
    Retrieves and sends a user's public key
    - Looks up requested user's public key
    - Sends to requesting user
    """

@socketio.on('send_kem_ciphertext')
def handle_send_kem_ciphertext(data):
    """
    Relays KEM ciphertext from sender to recipient
    - Routes encapsulated shared secret
    - No decryption on server
    """

@socketio.on('send_message')
def handle_send_message(data):
    """
    Routes encrypted messages between users
    - Server sees only ciphertext
    - End-to-end encryption maintained
    """
```

### Frontend JavaScript Modules

#### 1. `chat_app.js` - Main Application Controller

```javascript
class ChatApp {
    constructor() {
        // Manages overall application state
        this.currentUser = null;
        this.selectedUser = null;
        this.chatHistories = {};
        this.unreadMessages = {};
    }

    async handleLogin() {
        // User authentication and initialization
        // Creates ChatHandler and SecureChannelManager
    }

    filterAndDisplayUsers() {
        // Search functionality
        // Tab switching (Chats vs All Users)
        // User list rendering
    }

    async selectUser(username) {
        // Establishes secure connection with selected user
        // Loads chat history
        // Enables message input
    }

    async sendMessage() {
        // Encrypts and sends message
        // Updates chat history
        // Displays sent message
    }

    handleIncomingMessage(fromUser, decryptedText) {
        // Processes received messages
        // Updates unread counts
        // Displays in chat
    }
}
```

#### 2. `group_manager.js` - Group Lifecycle & Messaging

```javascript
class GroupChatManager {
    // Creates groups, distributes per‑group AES‑256 keys using ML‑KEM,
    // decrypts incoming group keys, and encrypts/decrypts group messages.
    // Integrates with SocketHandler for signaling and delivery.
}
```

#### 3. `secure_channel_manager.js` - Cryptographic Core

```javascript
class SecureChannelManager {
    constructor() {
        // Initializes ML-KEM instance
        this.kem = new MlKem512();
    }

    async generateNewKeyPair() {
        // Creates quantum-resistant key pair
        // Stores private key securely in browser
        const [publicKey, privateKey] = await this.kem.generateKeyPair();
    }

    arrayBufferToBase64(buf) {
        // Encodes binary data for transmission
    }

    base64ToArrayBuffer(b64) {
        // Decodes received binary data
    }

    async encapsulateSharedSecret(recipientPublicKey) {
        // ML-KEM encapsulation
        // Generates shared secret + ciphertext
    }

    async decapsulateSharedSecret(ciphertext, privateKey) {
        // ML-KEM decapsulation
        // Recovers shared secret
    }

    async encryptMessage(plaintext, aesKey) {
        // AES-GCM encryption
        // Returns IV + ciphertext
    }

    async decryptMessage(ciphertext, iv, aesKey) {
        // AES-GCM decryption
        // Returns plaintext
    }
}
```

#### 4. `chat_handler.js` - Message Protocol Handler

```javascript
class ChatHandler {
    constructor(userName, secureChannelManager) {
        // Bridges SocketHandler and SecureChannelManager
        this.socketHandler = new SocketHandler(userName);
        this.secureChannelManager = secureChannelManager;
        this.sharedSecrets = {}; // username -> AES key
    }

    async makeConnectionRequest(username) {
        // Initiates key exchange with another user
        // 1. Request their public key
        // 2. Encapsulate shared secret
        // 3. Send KEM ciphertext
        // 4. Store resulting AES key
    }

    async sendMessage(recipient, plaintext) {
        // Encrypts message with shared AES key
        // Sends via SocketHandler
    }

    async receiveMessage(sender, encryptedMessage) {
        // Decrypts incoming message
        // Returns plaintext to UI
    }

    sendPublicKeyToServer(username) {
        // Publishes user's public key
        // Enables others to establish secure channels
    }
}
```

#### 5. `socket_handler.js` - WebSocket Communication

```javascript
class SocketHandler {
    constructor(userName) {
        // Manages Socket.IO connection
        this.socket = io();
        this.userName = userName;
        this.users = {}; // username -> socketId mapping
    }

    _setupSocketEvents() {
        // Registers all socket event listeners
        // - connect/disconnect
        // - user_list updates
        // - pubkey_response
        // - recv_kem_ciphertext
        // - recv_message
    }

    requestPublicKey(username) {
        // Asks server for user's public key
    }

    sendKEMCiphertext(recipient, ciphertext) {
        // Sends encapsulated shared secret
    }

    sendEncryptedMessage(recipient, encryptedData) {
        // Sends encrypted message payload
    }
}
```

---

## 🔄 Message Journey (Complete Flow)

### Scenario: Alice sends "Hello!" to Bob

#### **Phase 1: Initial Setup (On Page Load)**

**Alice's Browser:**
```
1. Generate ML-KEM key pair
   ├─ Public Key:  pkA (shared with server)
   └─ Private Key: skA (never leaves browser)

2. Connect to server via WebSocket
   └─ Socket ID: sid_alice

3. Register username "Alice"
   └─ Server stores: sid_alice → "Alice"

4. Send public key to server
   └─ Server stores: "Alice" → pkA
```

**Bob's Browser:**
```
1. Generate ML-KEM key pair
   ├─ Public Key:  pkB (shared with server)
   └─ Private Key: skB (never leaves browser)

2. Connect to server
   └─ Socket ID: sid_bob

3. Register username "Bob"
   └─ Server stores: sid_bob → "Bob"

4. Send public key to server
   └─ Server stores: "Bob" → pkB
```

**Server State:**
```javascript
clients = {
    sid_alice: { name: "Alice", pubkey: "base64(pkA)" },
    sid_bob:   { name: "Bob",   pubkey: "base64(pkB)" }
}

username_to_sid = {
    "Alice": sid_alice,
    "Bob":   sid_bob
}
```

#### **Phase 2: Alice Selects Bob (First Time Connection)**

**Step 1: Alice Requests Bob's Public Key**
```
Alice's Browser → Server:
    Event: "request_pubkey"
    Data: { username: "Bob" }

Server → Alice's Browser:
    Event: "pubkey_response"
    Data: { username: "Bob", pubkeyB64: "base64(pkB)" }
```

**Step 2: Alice Encapsulates Shared Secret**
```javascript
// In Alice's browser (secure_channel_manager.js)

// 1. Decode Bob's public key
const pkB = base64ToArrayBuffer(pubkeyB64);

// 2. Run ML-KEM encapsulation
const [ciphertext, sharedSecret] = await kem.encap(pkB);
// ciphertext: encrypted container for sharedSecret
// sharedSecret: 32-byte random key (only Alice knows)

// 3. Derive AES key from shared secret
const aesKey_A = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
);

// 4. Store AES key for Bob
sharedSecrets["Bob"] = aesKey_A;
```

**Step 3: Alice Sends Ciphertext to Bob**
```
Alice's Browser → Server:
    Event: "send_kem_ciphertext"
    Data: { 
        to: "Bob", 
        ciphertext: "base64(ciphertext)" 
    }

Server → Bob's Browser:
    Event: "recv_kem_ciphertext"
    Data: { 
        from: "Alice", 
        ciphertext: "base64(ciphertext)" 
    }
```

**Step 4: Bob Decapsulates Shared Secret**
```javascript
// In Bob's browser (secure_channel_manager.js)

// 1. Decode ciphertext
const ct = base64ToArrayBuffer(ciphertext);

// 2. Run ML-KEM decapsulation with Bob's private key
const sharedSecret = await kem.decap(ct, skB);
// sharedSecret: same 32-byte key Alice generated!

// 3. Derive AES key from shared secret
const aesKey_B = await crypto.subtle.importKey(
    "raw",
    sharedSecret,
    "AES-GCM",
    false,
    ["encrypt", "decrypt"]
);

// 4. Store AES key for Alice
sharedSecrets["Alice"] = aesKey_B;
```

**Result:** Both Alice and Bob now have the same AES key!
```
Alice: sharedSecrets["Bob"]   = aesKey_A
Bob:   sharedSecrets["Alice"] = aesKey_B
aesKey_A === aesKey_B ✓
```

### Socket.IO Events (Reference)

- `register_user` / `registration_confirmed`: username registration
- `pubkey` / `pubkey_response`: publish/request ML‑KEM public keys
- `send_kem_ciphertext` / `recv_kem_ciphertext`: share encapsulated secrets
- `send_message` / `recv_message`: 1:1 encrypted messages
- `create_group` / `group_created` / `group_invitation`: group lifecycle
- `distribute_group_key` / `group_key`: per‑member delivery of encrypted group key
- `send_group_message` / `recv_group_message`: encrypted group messages

#### **Phase 3: Alice Sends Message "Hello!"**

**Step 1: Encrypt Message**
```javascript
// In Alice's browser (chat_handler.js)

const plaintext = "Hello!";
const aesKey = sharedSecrets["Bob"];

// 1. Generate random IV (Initialization Vector)
const iv = crypto.getRandomValues(new Uint8Array(12));
// IV: ensures same message encrypts differently each time

// 2. Encode plaintext to bytes
const plaintextBytes = new TextEncoder().encode(plaintext);

// 3. Encrypt with AES-GCM
const ciphertext = await crypto.subtle.encrypt(
    {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128  // Authentication tag
    },
    aesKey,
    plaintextBytes
);

// 4. Prepare encrypted payload
const encryptedMessage = {
    iv: base64(iv),           // Need this to decrypt
    data: base64(ciphertext)  // Encrypted message
};
```

**Step 2: Send to Server**
```
Alice's Browser → Server:
    Event: "send_message"
    Data: { 
        to: "Bob",
        ciphertext: {
            iv: "rAnD0mIv==",
            data: "eNcRyPt3dDaTa=="
        }
    }
```

**Step 3: Server Routes to Bob**
```python
# In app.py
@socketio.on('send_message')
def handle_send_message(data):
    recipient = data['to']
    ciphertext = data['ciphertext']
    
    # Look up Bob's socket ID
    recipient_sid = username_to_sid.get(recipient)
    
    # Forward encrypted message to Bob
    emit('recv_message', {
        'from': clients[request.sid]['name'],  # "Alice"
        'ciphertext': ciphertext
    }, room=recipient_sid)
```

**Step 4: Bob Receives and Decrypts**
```javascript
// In Bob's browser (chat_handler.js)

// 1. Extract IV and ciphertext
const iv = base64ToArrayBuffer(encryptedMessage.iv);
const ciphertext = base64ToArrayBuffer(encryptedMessage.data);
const aesKey = sharedSecrets["Alice"];

// 2. Decrypt with AES-GCM
const plaintextBytes = await crypto.subtle.decrypt(
    {
        name: "AES-GCM",
        iv: iv,
        tagLength: 128
    },
    aesKey,
    ciphertext
);

// 3. Decode bytes to text
const plaintext = new TextDecoder().decode(plaintextBytes);
// plaintext = "Hello!" ✓

// 4. Display in chat UI
displayMessage("Alice", "Hello!");
```

#### **Phase 4: Bob Replies "Hi Alice!"**

The process repeats in reverse:
```
Bob encrypts "Hi Alice!" with sharedSecrets["Alice"]
→ Server routes to Alice
→ Alice decrypts with sharedSecrets["Bob"]
→ Displays "Hi Alice!"
```

---

## 🔒 Security Features

### 1. **Post-Quantum Key Exchange**
- **ML-KEM-512** (Kyber) provides 128-bit post-quantum security
- Resistant to Shor's algorithm and quantum attacks
- Based on Module Learning With Errors (MLWE) problem

### 2. **End-to-End Encryption**
- Messages encrypted in sender's browser
- Decrypted only in recipient's browser
- Server cannot read message content

### 3. **Forward Secrecy**
- Each chat session can use unique keys
- Compromising one key doesn't affect others

### 4. **Authenticated Encryption**
- AES-GCM provides both confidentiality and authenticity
- Detects message tampering
- 128-bit authentication tag

### 5. **Secure Key Storage**
- Private keys never transmitted
- Keys stored in browser memory (not persistent)
- Web Crypto API provides secure cryptographic operations

### 6. **Random IV Generation**
- Each message uses a unique initialization vector
- Prevents pattern analysis
- Ensures semantic security

---

## 🚀 Installation

### Prerequisites
- Python 3.8 or higher
- pip (Python package manager)
- Modern web browser (Chrome, Firefox, Edge)

### Steps

1. **Clone the repository**
```bash
git clone https://github.com/muneebahmed-nust/post-quantum-whatsapp.git
cd post-quantum-whatsapp
```

2. **Create virtual environment**
```bash
python -m venv .venv
```

3. **Activate virtual environment**

**Windows (PowerShell):**
```powershell
.venv\Scripts\Activate.ps1
```

**Windows (Command Prompt):**
```cmd
.venv\Scripts\activate.bat
```

**Linux/Mac:**
```bash
source .venv/bin/activate
```

4. **Install dependencies**
```bash
pip install -r requirements.txt
```

5. **Run the application**
```bash
python app.py
```

6. **Access the application**
- Open browser and navigate to: `http://localhost:5000`
- For HTTPS (recommended): `https://localhost:5001`

### HTTPS & Browser Trust

This app generates a self‑signed certificate on first run (via `pyOpenSSL`) so the Web Crypto API can operate over HTTPS.

- When visiting `https://localhost:5001` you may see a browser warning.
- Proceed to the site and accept the certificate for local development.
- If the page shows a Web Crypto warning, reload after trusting the certificate.

Change the maximum upload size (images) by adjusting `max_http_buffer_size` in `app.py` (default: 10 MB).

### Requirements

Create `requirements.txt`:
```
Flask==3.0.0
Flask-SocketIO==5.3.5
python-socketio==5.10.0
```

---

## 💻 Usage

### Starting a Chat

1. **Open the application** in your browser
2. **Enter a username** and click "Join Chat"
3. **Click "All Users" tab** to see online users
4. **Click on a user** to start a secure chat
5. Wait for "✅ Connected" status
6. **Type your message** and click "Send"

### Features

**Search Users:**
- Use the search bar to filter users by name

**View Tabs:**
- **Chats**: Shows only users you've messaged
- **All Users**: Shows all online users

**Unread Messages:**
- Green badges show unread message count
- Badges clear when you open the chat

**Connection Status:**
- 🔄 Connecting: Establishing secure connection
- ✅ Connected: Ready to send messages
- ❌ Failed: Connection error

### Group Chat

- Click the group icon and choose “New Group”.
- Select members (they must be online so their public keys are available).
- The app generates a group key and securely distributes it to members.
- Select the group from the sidebar to send and receive group messages.

### Sending Images (Direct & Group)

- Click the paperclip icon → choose an image.
- Optionally add a caption in the message box.
- Click Send. The image is encrypted client‑side (like text messages).
- Images and captions work in both 1:1 and group chats.

---

## 📁 Project Structure

```
post-quantum-whatsapp/
├── app.py                          # Flask server & Socket.IO handlers
├── requirements.txt                # Python dependencies
├── README.md                       # This file
├── SECURITY_README.md             # Security documentation
├── package.json                    # Node.js metadata (if any)
│
├── templates/
│   └── chat.html                   # Main HTML template
│
├── static/
│   ├── css/
│   │   └── style.css              # Application styles
│   │
│   ├── js/
│   │   ├── chat_app.js            # Main application controller
│   │   ├── chat_handler.js        # Message protocol handler
│   │   ├── group_manager.js       # Group creation, key distribution, group messaging
│   │   ├── secure_channel_manager.js  # Cryptographic operations
│   │   ├── socket_handler.js      # WebSocket communication
│   │   └── mlkem.min.js           # ML-KEM library
│   │
│   └── lib/
│       └── socket.io.min.js       # Socket.IO client library
│
└── .venv/                          # Virtual environment (not in git)
```

---

## 🔬 Technical Details

### ML-KEM-512 Parameters

- **Security Level**: NIST Level 1 (128-bit post-quantum security)
- **Public Key Size**: 800 bytes
- **Ciphertext Size**: 768 bytes
- **Shared Secret Size**: 32 bytes (256 bits)

### AES-GCM Parameters

- **Key Size**: 256 bits (derived from ML-KEM shared secret)
- **IV Size**: 96 bits (12 bytes)
- **Tag Size**: 128 bits (16 bytes)
- **Mode**: Galois/Counter Mode (authenticated encryption)

### Performance Characteristics

- **Key Generation**: ~5-10ms
- **Encapsulation**: ~3-5ms
- **Decapsulation**: ~3-5ms
- **AES Encryption**: <1ms per message
- **Total Connection Setup**: ~20-50ms

---

## 🛡️ Security Considerations

### What This Application Protects Against:

✅ Quantum computer attacks on key exchange  
✅ Man-in-the-middle attacks  
✅ Message interception and eavesdropping  
✅ Message tampering (authenticated encryption)  
✅ Server compromise (end-to-end encryption)

### What This Application Does NOT Protect Against:

❌ Browser/endpoint compromise  
❌ User impersonation (no authentication system)  
❌ Replay attacks (no message sequence numbers)  
❌ Traffic analysis (connection metadata visible)  
❌ Social engineering attacks

### Production Considerations:

For production deployment, consider:

1. **User Authentication**: Add login system with secure passwords
2. **Key Persistence**: Implement secure key storage for persistent identities
3. **Perfect Forward Secrecy**: Rotate keys periodically
4. **Rate Limiting**: Prevent spam and DoS attacks
5. **HTTPS**: Always use TLS for transport security
6. **Audit Logging**: Log security events
7. **Input Validation**: Sanitize all user inputs
8. **Session Management**: Implement proper session timeouts

### Troubleshooting

- **Web Crypto API not available**: Use `https://localhost:5001` and accept the self‑signed cert. HTTP pages block `crypto.subtle`.
- **Image fails to send**: Check size (default 10 MB). Increase `max_http_buffer_size` in `app.py` if needed.
- **Group chat shows no messages**: Wait for the group key to arrive (admin distributes it). You’ll see a prompt when the key is decrypted.
- **Peers missing from list**: They must finish registration and publish their public key before secure channels can be established.

---

## 🤝 Contributing

Contributions are welcome! Areas for improvement:

- Add user authentication system
- Implement key persistence and identity management
- Implement perfect forward secrecy with key rotation
- Add voice/video calling
- Enhance media handling (video/documents) with encryption
- Create mobile app version
- Add typing indicators and read receipts
- Implement offline message queuing
- Add message search and per‑chat key rotation controls

---

## 📄 License

This project is for educational purposes. Use appropriate licensing for production.

---

## 🙏 Acknowledgments

- **NIST** for standardizing post-quantum cryptography
- **ML-KEM (Kyber)** developers for the post-quantum algorithm
- **Socket.IO** team for real-time communication framework
- **Flask** team for the web framework
- **Web Crypto API** for browser cryptographic capabilities

---

## 📚 References

- [NIST Post-Quantum Cryptography Standardization](https://csrc.nist.gov/projects/post-quantum-cryptography)
- [ML-KEM Specification (FIPS 203)](https://csrc.nist.gov/publications/detail/fips/203/final)
- [AES-GCM Specification (NIST SP 800-38D)](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-38d.pdf)
- [Web Crypto API Documentation](https://developer.mozilla.org/en-US/docs/Web/API/Web_Crypto_API)
- [Socket.IO Documentation](https://socket.io/docs/)

---

## 📞 Contact

For questions or feedback:
- GitHub: [@muneebahmed-nust](https://github.com/muneebahmed-nust)
- Repository: [post-quantum-whatsapp](https://github.com/muneebahmed-nust/post-quantum-whatsapp)

---

**Remember**: This is a demonstration of post-quantum cryptography concepts. For production use, conduct thorough security audits and implement additional security measures.

🔐 **Stay Quantum-Safe!**




