# Quanta: Post Quantum Secure Chat Application

**A real-time, LAN-based encrypted chat application secured with NIST-standardized post-quantum cryptography (ML-KEM-512 + AES-256-GCM).**

---

## Overview

Quanta is a real-time, browser-based chat application designed to demonstrate end-to-end encrypted communication that is resistant to attacks from quantum computers. It runs on a local area network (LAN) and requires no external services or cloud infrastructure.

The project addresses a concrete forward-looking security problem: widely deployed messaging systems rely on key exchange algorithms (such as Diffie-Hellman and RSA) that are vulnerable to Shor's algorithm on a sufficiently powerful quantum computer. This application replaces that vulnerable layer with **ML-KEM-512** (formerly known as Kyber-512), a Key Encapsulation Mechanism standardized by NIST in FIPS 203, while using **AES-256-GCM** for symmetric message encryption — the same cipher trusted in modern TLS.

Both 1-on-1 direct messages and multi-user group chats are fully encrypted. The server acts as a blind relay: it routes ciphertexts and KEM artifacts but never holds plaintext messages or symmetric keys.

The user interface design is inspired by WhatsApp, providing a familiar chat experience — sidebar contact list, conversation view, and message input — while the underlying cryptographic stack is replaced entirely with post-quantum primitives.

---

## Key Features

- **Post-Quantum Key Exchange (ML-KEM-512):** Each client generates an ML-KEM-512 key pair on login. When two users initiate a chat, the initiating client performs KEM encapsulation against the peer's public key and sends the resulting ciphertext over the server. The recipient decapsulates to derive the same shared secret — no plaintext key material ever leaves the client.

- **AES-256-GCM Message Encryption:** All messages (text and images) are encrypted with AES-256-GCM using the shared secret as a key. A fresh 96-bit nonce is generated per message using the Web Crypto API's CSPRNG, preventing nonce reuse.

- **End-to-End Encrypted Group Chats:** The group admin generates a random AES-256 group key, then individually encrypts it for each member using ML-KEM encapsulation. Members decrypt the group key using their own private key and use it to decrypt all subsequent group messages.

- **Image Sharing:** Users can attach and send images within 1-on-1 chats. Images are serialized as base64, wrapped in the same `Message` object structure as text, and encrypted end-to-end before transmission.

- **HTTPS Transport:** The Flask server auto-generates a self-signed TLS certificate (RSA-2048) at startup using pyOpenSSL. HTTPS is required because the Web Crypto API is only available in secure contexts.

- **Real-Time Communication via WebSockets:** Built on Socket.IO (Flask-SocketIO + eventlet), providing persistent, bidirectional connections with automatic reconnection and live user presence updates.

- **Zero Server-Side Key Storage:** The server maintains a mapping of usernames to socket IDs and public keys (used only for routing KEM ciphertexts), but never sees symmetric keys or decrypted messages.

- **Interactive Security Demonstrations:**
  - `/brute-force` — Runs a live brute-force simulation on ML-KEM-512, demonstrating the infeasibility of guessing a 256-bit shared secret (~2²⁵⁶ attempts required).
  - `/nonce-demo` — Generates thousands of random 96-bit AES-GCM nonces and checks for collisions, illustrating birthday-paradox collision probability and why random nonces are safe in practice.

---

## Tech Stack

| Layer | Technology |
|---|---|
| **Backend** | Python 3, Flask 3.0, Flask-SocketIO 5.3, eventlet 0.36 |
| **Real-Time Transport** | Socket.IO (server: python-socketio 5.14; client: socket.io-client 4.8) |
| **Post-Quantum KEM** | `mlkem` v2.5 (ML-KEM-512 / FIPS 203) — JavaScript implementation |
| **Symmetric Encryption** | AES-256-GCM via the browser's Web Crypto API (`window.crypto.subtle`) |
| **TLS / HTTPS** | pyOpenSSL 25.3 — self-signed RSA-2048 certificate, auto-generated at startup |
| **Frontend** | Vanilla HTML5, CSS3, JavaScript (ES6 modules) |
| **Bundler** | esbuild (dev dependency, for bundling the mlkem library) |
| **Network Scope** | Local Area Network (LAN) — `0.0.0.0:5001` |

---

## Architecture

### System Overview

```
┌──────────────────────────────────────────────────────────────────┐
│                        Browser (Client A)                        │
│                                                                  │
│  SecureChannelManager        ChatHandler         ChatApp (UI)    │
│  ┌──────────────────┐   ┌──────────────────┐  ┌──────────────┐  │
│  │ ML-KEM-512 KEM   │   │  AES encrypt/    │  │  Tabs, user  │  │
│  │ Key pair gen     │◄──│  decrypt msgs    │◄─│  list, group │  │
│  │ AES-GCM wrap     │   │  KEM handshake   │  │  modal, img  │  │
│  └──────────────────┘   └──────────────────┘  └──────────────┘  │
│            │                     │                               │
│            └─────────┬───────────┘                               │
│                      │ Socket.IO (HTTPS/WSS)                     │
└──────────────────────┼───────────────────────────────────────────┘
                       │
          ┌────────────▼───────────┐
          │   Flask Server (app.py)│
          │                        │
          │  Routes KEM ciphertexts│
          │  Routes encrypted msgs │
          │  Manages group rooms   │
          │  Broadcasts user list  │
          │  Never sees plaintext  │
          └────────────┬───────────┘
                       │ Socket.IO (HTTPS/WSS)
┌──────────────────────┼───────────────────────────────────────────┐
│                      │                                           │
│            (same stack as Client A)                              │
│                        Browser (Client B)                        │
└──────────────────────────────────────────────────────────────────┘
```

### Key Exchange Flow (1-on-1)

```
Client A                          Server                       Client B
   │                                │                              │
   │── register + send pubkey_A ───►│                              │
   │                                │◄─── register + send pubkey_B─│
   │── request pubkey_B ───────────►│                              │
   │◄─ pubkey_B ────────────────────│                              │
   │                                │                              │
   │  KEM.encap(pubkey_B)           │                              │
   │  → (ciphertext_AB, sharedKey_A)│                              │
   │                                │                              │
   │── send_kem_ciphertext ────────►│── recv_kem_ciphertext ──────►│
   │                                │                              │  KEM.decap(ciphertext_AB, privkey_B)
   │                                │                              │  → sharedKey_B (== sharedKey_A)
   │                                │                              │
   │◄══════════ AES-256-GCM encrypted messages (both directions) ══│
```

### Group Key Distribution Flow

```
Admin                              Server                   Members (each)
  │                                   │                          │
  │── create_group ──────────────────►│── group_invitation ─────►│
  │◄─ group_created ──────────────────│                          │
  │                                   │                          │
  │  Generate random AES-256 group key│                          │
  │  For each member:                 │                          │
  │    KEM.encap(member_pubkey)        │                          │
  │    AES-GCM encrypt(group_key,      │                          │
  │                    shared_secret) │                          │
  │── distribute_group_key ──────────►│── group_key (encrypted) ►│
  │                                   │                          │  KEM.decap → shared_secret
  │                                   │                          │  AES-GCM decrypt → group_key
  │                                   │                          │
  │◄══════ AES-256-GCM group messages (encrypted with group key) ►│
```

---

## Getting Started

### Prerequisites

- Python 3.8 or later
- Node.js 18 or later (for the `mlkem` JavaScript package)
- pip and npm

### Installation

```bash
# 1. Clone the repository
git clone https://github.com/sudo-muneeb/quanta-post-quantum-chat
cd quanta-post-quantum-chat

# 2. Install Python dependencies
pip install -r requirements.txt

# 3. Install Node.js dependencies (mlkem library + socket.io-client)
npm install
```

### Running the Server

```bash
python app.py
```

On first run, the server auto-generates `cert.pem` and `key.pem` (self-signed RSA-2048 TLS certificate) in the project root if they do not already exist.

The terminal will print the accessible addresses:

```
============================================================
server is running and accessible at:
   local:   https://127.0.0.1:5001
   network: https://<YOUR_LAN_IP>:5001
============================================================

security demonstrations available:
   brute force attack:  https://127.0.0.1:5001/brute-force
   nonce collision:     https://127.0.0.1:5001/nonce-demo
============================================================
```

> **Note:** Because the certificate is self-signed, your browser will display a security warning on first visit. Proceed by clicking "Advanced" → "Accept the Risk and Continue" (Firefox) or "Advanced" → "Proceed" (Chrome). This is expected in a development/LAN context.

---

## Usage

### Starting a 1-on-1 Chat

1. Open `https://<SERVER_LAN_IP>:5001` in your browser (accept the self-signed cert).
2. Enter a username and click **Join Chat**.
3. The client generates an ML-KEM-512 key pair and registers with the server.
4. Navigate to the **All Users** tab to see online peers.
5. Click a user — the KEM handshake runs automatically in the background.
6. Once the connection status shows **Connected**, type and send messages.

### Creating a Group Chat

1. After joining, click the group icon (top-left of the sidebar).
2. Enter a group name and select members from the online user list.
3. Click **Create Group** — the admin's client generates an AES-256 group key and distributes it (encrypted per-member via ML-KEM) to all members.
4. Navigate to the **Groups** tab and select the group to send messages.

### Sending Images

- In any 1-on-1 chat, click the image attachment icon in the message input bar.
- Select an image file — a preview appears before sending.
- The image is base64-encoded, wrapped in the `Message` envelope, and encrypted end-to-end with the established AES-256-GCM session key.

### Security Demonstrations

| URL | What it shows |
|---|---|
| `/brute-force` | Runs 1,000 shared-secret guesses and 10,000 random ciphertext decapsulation attempts against a live ML-KEM-512 instance, demonstrating computational infeasibility |
| `/nonce-demo` | Generates up to 10,000 random 96-bit nonces and checks for collisions, computing birthday-paradox probability and real-world collision scenarios |

---

## Project Structure

```
post-quantum-whatsapp/
│
├── app.py                          # Flask + Flask-SocketIO server
│                                   # Handles user registration, KEM relay,
│                                   # message routing, group management
│
├── group.py                        # Group and GroupManager classes
│                                   # Server-side group state (members, history,
│                                   # expiration logic)
│
├── requirements.txt                # Python dependencies
├── package.json                    # Node.js dependencies (mlkem, socket.io-client)
│
├── cert.pem / key.pem              # Auto-generated self-signed TLS certificate
│
├── templates/
│   ├── chat.html                   # Main chat UI (login + chat screen)
│   ├── brute_force.html            # Brute-force attack demo page
│   └── nonce_demo.html             # Nonce collision demo page
│
└── static/
    ├── css/
    │   └── style.css               # WhatsApp-inspired UI styling
    │
    ├── lib/
    │   └── socket.io.min.js        # Bundled Socket.IO client
    │
    └── js/
        ├── chat_app.js             # Top-level application controller (UI, routing)
        ├── chat_handler.js         # Coordinates KEM handshake + AES encrypt/decrypt
        ├── secure_channel_manager.js # ML-KEM-512 key pair, encap/decap, AES-GCM
        ├── socket_handler.js       # Socket.IO event registration and emission
        ├── group_manager.js        # Client-side group key generation + distribution
        ├── message.js              # Message data model (text / image)
        ├── chat.js                 # Chat session / history abstraction
        ├── mlkem.min.js            # Bundled ML-KEM-512 JavaScript library
        ├── brute_force_attack_demo.js  # Live brute-force simulation
        └── nonce_collision_demo.js     # AES-GCM nonce collision analysis
```


