🔐 Kyber Key Exchange – How Only Two Parties End Up With the AES Key

This section explains how Kyber (a post-quantum KEM) allows two parties to securely establish an AES encryption key — even if attackers can see every packet on the network.

No code. Just the security logic.

1️⃣ Receiver Generates a Kyber Keypair

The receiver starts the secure process by generating:

Public Key – safe to share with anyone

Private Key – stays on the receiver’s machine

The private key is never transmitted and never leaves the receiver.
An attacker learning the public key provides no ability to compute the shared secret.

2️⃣ Receiver Sends Public Key to the Sender

The receiver sends their public key across the network.

Attackers can intercept this safely — it doesn’t help them.
Kyber is designed so the public key reveals nothing about the derived secret.

3️⃣ Sender Creates a Shared Secret + Ciphertext

Using the receiver’s public key, the sender performs Kyber encapsulation.
This produces:

Ciphertext – safe to send

Shared Secret – will eventually become the AES key

The ciphertext is a “mathematical envelope” that only the receiver’s private key can open.

Even if intercepted, the ciphertext cannot be reversed or used to recover the secret.

4️⃣ Sender Sends the Ciphertext

The sender transmits the Kyber ciphertext to the receiver.
Again, attackers can see or copy it — it has no value without the private key.

5️⃣ Receiver Recovers the Same Shared Secret

Using the private key, the receiver decapsulates the ciphertext.
This yields the exact same shared secret the sender generated.

At this point, the shared secret is known only to:

Sender

Receiver

Not even someone who saw:

the public key

the ciphertext

all network traffic

can compute it.

6️⃣ Both Convert the Shared Secret Into an AES Key

Both sides take the shared secret and import it into AES-GCM (or another symmetric mode).

From this moment onward:

All messages are encrypted with AES

Attackers only see random ciphertext

They cannot decrypt anything without the shared key

❓ Why Can’t Attackers Derive the Shared Secret?

Kyber’s security is based on lattice problems (Learning-With-Errors), which are:

infeasible for attackers

infeasible even for quantum computers

impossible to reverse using only public values

The key idea:

Public Key + Ciphertext is not enough.

The private key is absolutely required to compute the shared secret,
and it never leaves the receiver.

✅ Final Security Guarantees

Confidentiality: Only sender & receiver get the AES key

Integrity: AES-GCM prevents tampering

Forward Secrecy (per-session secrets): New secrets can be generated for each chat

Post-Quantum Safety: Secure even against future quantum computers

---

# 🔬 Technical Deep Dive: ML-KEM to AES Key Conversion & Data Types

This section provides a detailed technical explanation of how the shared secret from ML-KEM is transformed into an AES key, along with all data type transformations throughout the security journey.

## 1️⃣ Key Pair Generation (ML-KEM-512)

```
┌─────────────────────────────────────────────────────────────┐
│  generateNewKeyPair()                                        │
├─────────────────────────────────────────────────────────────┤
│  Input:  None                                                │
│  Output: [publicKey, privateKey]                             │
│                                                              │
│  Data Types:                                                 │
│  • publicKey  → Uint8Array (800 bytes for ML-KEM-512)       │
│  • privateKey → Uint8Array (1632 bytes for ML-KEM-512)      │
└─────────────────────────────────────────────────────────────┘
```

ML-KEM-512 generates a **lattice-based** key pair resistant to quantum attacks.

---

## 2️⃣ Public Key Transmission

```
┌─────────────────────────────────────────────────────────────┐
│  Sending Public Key Over Network                             │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Uint8Array (800 bytes)                                      │
│       │                                                      │
│       ▼  arrayBufferToBase64()                               │
│  String (Base64) ─────────────────────────► Network/Socket   │
│       │                                                      │
│       │  Why Base64?                                         │
│       │  • Binary data can't travel safely over text         │
│       │    protocols (JSON, WebSocket text frames)           │
│       │  • Base64 encodes binary as ASCII-safe characters    │
│       │  • ~33% size increase but guaranteed safe transport  │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 3️⃣ KEM Encapsulation (Sender Side)

This is where the magic happens! The sender creates a **shared secret** using the recipient's public key:

```
┌─────────────────────────────────────────────────────────────┐
│  generateCiphertextSharedSecret(publicKeyB64)                │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: Decode public key                                   │
│  ─────────────────────────                                   │
│  publicKeyB64 (String)                                       │
│       │                                                      │
│       ▼  base64ToArrayBuffer()                               │
│  pubkey (Uint8Array, 800 bytes)                              │
│                                                              │
│  Step 2: KEM Encapsulation                                   │
│  ─────────────────────────                                   │
│  pubkey ──────► kem.encap(pubkey)                            │
│                      │                                       │
│                      ▼                                       │
│              [ciphertext, sharedSecret]                      │
│                                                              │
│  Output Data Types:                                          │
│  • ciphertext   → Uint8Array (768 bytes for ML-KEM-512)     │
│  • sharedSecret → Uint8Array (32 bytes) ◄── ALWAYS 32 BYTES!│
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

**Key insight**: The `sharedSecret` is **always 32 bytes (256 bits)** regardless of ML-KEM variant. This is perfect for AES-256!

---

## 4️⃣ Shared Secret → AES Key Conversion (The Critical Step)

This is the most important transformation:

```
┌─────────────────────────────────────────────────────────────┐
│  establishSecureConnection() - The Key Conversion            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  sharedSecret (Uint8Array, 32 bytes)                         │
│       │                                                      │
│       ▼                                                      │
│  window.crypto.subtle.importKey(                             │
│      "raw",           // Format: raw binary bytes            │
│      sharedSecret,    // The 32-byte key material            │
│      "AES-GCM",       // Algorithm to use                    │
│      false,           // Not extractable (security!)         │
│      ["encrypt", "decrypt"]  // Allowed operations           │
│  )                                                           │
│       │                                                      │
│       ▼                                                      │
│  aesKey (CryptoKey object)                                   │
│                                                              │
│  ┌─────────────────────────────────────────────────────┐    │
│  │  CryptoKey {                                         │    │
│  │    type: "secret",                                   │    │
│  │    algorithm: { name: "AES-GCM", length: 256 },     │    │
│  │    extractable: false,                               │    │
│  │    usages: ["encrypt", "decrypt"]                    │    │
│  │  }                                                   │    │
│  └─────────────────────────────────────────────────────┘    │
│                                                              │
│  WHY THIS WORKS:                                             │
│  ─────────────────                                           │
│  • ML-KEM shared secret = 32 bytes = 256 bits               │
│  • AES-256 needs exactly 256 bits of key material           │
│  • Perfect match! No hashing/derivation needed              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 5️⃣ KEM Decapsulation (Receiver Side)

The receiver recovers the **same shared secret** using their private key:

```
┌─────────────────────────────────────────────────────────────┐
│  decapsulateKey(ciphertextB64)                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  ciphertextB64 (String)                                      │
│       │                                                      │
│       ▼  base64ToArrayBuffer()                               │
│  ciphertext (Uint8Array, 768 bytes)                          │
│       │                                                      │
│       ▼                                                      │
│  kem.decap(ciphertext, this.privateKey)                      │
│       │                                                      │
│       ▼                                                      │
│  sharedSecret (Uint8Array, 32 bytes)                         │
│       │                                                      │
│       │  SAME secret as sender computed!                     │
│       │  This is the "magic" of KEM                          │
│       ▼                                                      │
│  (Convert to AES key same as sender)                         │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 6️⃣ AES-GCM Encryption

```
┌─────────────────────────────────────────────────────────────┐
│  aesEncrypt(aesKey, plaintext)                               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Step 1: Generate Random IV                                  │
│  ──────────────────────────                                  │
│  iv = crypto.getRandomValues(new Uint8Array(12))             │
│       │                                                      │
│       │  • 12 bytes = 96 bits (optimal for GCM)             │
│       │  • MUST be unique per encryption                     │
│       │  • Random is fine (not reused with same key)         │
│                                                              │
│  Step 2: Encode Plaintext                                    │
│  ────────────────────────                                    │
│  plaintext (String)                                          │
│       │                                                      │
│       ▼  TextEncoder.encode()                                │
│  encoded (Uint8Array)                                        │
│                                                              │
│  Step 3: Encrypt                                             │
│  ───────────────                                             │
│  crypto.subtle.encrypt(                                      │
│      { name: "AES-GCM", iv },                                │
│      aesKey,      // CryptoKey                               │
│      encoded      // Uint8Array                              │
│  )                                                           │
│       │                                                      │
│       ▼                                                      │
│  ciphertext (ArrayBuffer)                                    │
│       │                                                      │
│       │  Includes 16-byte authentication tag!                │
│       │  GCM provides: Confidentiality + Integrity           │
│                                                              │
│  Return: { iv: Uint8Array(12), ciphertext: ArrayBuffer }     │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

---

## 7️⃣ Complete Data Type Flow Diagram

```
┌─────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE ENCRYPTION JOURNEY                           │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  ALICE (Sender)                         BOB (Receiver)                   │
│  ─────────────                          ──────────────                   │
│                                                                          │
│                    ◄──── Bob's publicKeyB64 (String) ────                │
│                                                                          │
│  1. Decode: String → Uint8Array(800)                                     │
│                                                                          │
│  2. KEM Encap:                                                           │
│     Uint8Array(800) → [Uint8Array(768), Uint8Array(32)]                 │
│                        ciphertext       sharedSecret                     │
│                                                                          │
│  3. Import Key:                                                          │
│     Uint8Array(32) → CryptoKey                                          │
│                                                                          │
│  4. Encrypt Message:                                                     │
│     String → Uint8Array → ArrayBuffer                                    │
│     "Hello" → [72,101,108,108,111] → encrypted bytes                    │
│                                                                          │
│  5. Encode for transmission:                                             │
│     ArrayBuffer → String (Base64)                                        │
│     Uint8Array(12) → String (Base64)  // IV                             │
│     Uint8Array(768) → String (Base64) // KEM ciphertext                 │
│                                                                          │
│  ═══════════════════════════════════════════════════════════════════    │
│                         NETWORK TRANSMISSION                             │
│                    (Everything is Base64 Strings)                        │
│  ═══════════════════════════════════════════════════════════════════    │
│                                                                          │
│                                         6. Decode ciphertext:            │
│                                            String → Uint8Array(768)      │
│                                                                          │
│                                         7. KEM Decap:                    │
│                                            Uint8Array(768) +             │
│                                            privateKey →                  │
│                                            Uint8Array(32) sharedSecret   │
│                                                                          │
│                                         8. Import Key:                   │
│                                            Uint8Array(32) → CryptoKey    │
│                                                                          │
│                                         9. Decrypt:                      │
│                                            CryptoKey + IV + ciphertext   │
│                                            → String "Hello"              │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 📊 Data Type Summary Table

| Variable | Type | Size | Purpose |
|----------|------|------|---------|
| `publicKey` | `Uint8Array` | 800 bytes | ML-KEM-512 public key |
| `privateKey` | `Uint8Array` | 1632 bytes | ML-KEM-512 private key |
| `ciphertext` (KEM) | `Uint8Array` | 768 bytes | Encapsulated key material |
| `sharedSecret` | `Uint8Array` | **32 bytes** | Raw key material (256 bits) |
| `aesKey` | `CryptoKey` | N/A (opaque) | Web Crypto key object |
| `iv` | `Uint8Array` | 12 bytes | Initialization vector |
| `ciphertext` (AES) | `ArrayBuffer` | variable | Encrypted message + 16-byte auth tag |
| `*B64` variants | `String` | ~33% larger | Base64 encoded for network |

---

## 🛡️ Security Properties Summary

| Property | How It's Achieved |
|----------|-------------------|
| **Quantum Resistance** | ML-KEM-512 lattice-based cryptography |
| **Confidentiality** | AES-256-GCM encryption |
| **Integrity** | GCM authentication tag (16 bytes) |
| **Forward Secrecy** | New KEM encapsulation per session |
| **Key Non-extractability** | `extractable: false` in importKey |

---

## 🔄 Why the Shared Secret Works as an AES Key

The elegance of ML-KEM's design:

1. **Fixed Output Size**: ML-KEM always produces a 32-byte (256-bit) shared secret
2. **High Entropy**: The shared secret has full cryptographic randomness
3. **Perfect Match**: AES-256 requires exactly 256 bits of key material
4. **No Derivation Needed**: Unlike some protocols, no additional key derivation function (KDF) is required
5. **Direct Import**: The raw bytes can be directly imported as an AES key via Web Crypto API

This makes the integration seamless and secure!