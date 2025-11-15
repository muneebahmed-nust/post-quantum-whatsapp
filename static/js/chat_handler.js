import { SocketHandler } from "./socket_handler.js";

export class ChatHandler {
    constructor(userName, secureChannelManager) {
        console.log('🎯 ChatHandler constructor called for:', userName);
        this.secureChannelManager = secureChannelManager;
        console.log('✅ Using provided SecureChannelManager');
        this.socketHandler = new SocketHandler(userName);
        console.log('✅ SocketHandler created');
        this.sharedSecrets = {};                  // peerSid -> AES key (CryptoKey)
        this.messageListeners = [];               // UI or other listeners
        this.pubKeyListeners = [];                // for when pubkey is received

        // Hook socket events
        this.socketHandler.onMessage(async (fromUser, base64Message) => {
            const decrypted = await this.receiveMessage(fromUser, base64Message);
            if (decrypted) this.messageListeners.forEach(fn => fn(fromUser, decrypted));
        });

        this.socketHandler.onPubKey((username, pubkeyB64) => {
            this.pubKeyListeners.forEach(fn => fn(username, pubkeyB64));
        });

        // Handle incoming KEM ciphertexts to establish shared secret
        this.socketHandler.onKEMCiphertext(async (fromUser, ciphertextB64) => {
            console.log(`🔐 Processing KEM ciphertext from ${fromUser}`);
            
            // Check if we already have a shared secret with this user
            if (this.sharedSecrets[fromUser]) {
                console.log(`⚠️ Already have shared secret with ${fromUser}, skipping`);
                return;
            }

            try {
                // Decapsulate the ciphertext using our private key
                const ciphertext = this.secureChannelManager.base64ToArrayBuffer(ciphertextB64);
                const sharedSecret = await this.secureChannelManager.kem.decap(
                    ciphertext,
                    this.secureChannelManager.privateKey
                );
                
                console.log('🔑 Decapsulated shared secret, length:', sharedSecret?.length);
                
                // Import the shared secret as an AES-GCM key
                const aesKey = await window.crypto.subtle.importKey(
                    "raw",
                    sharedSecret,
                    "AES-GCM",
                    false,
                    ["encrypt", "decrypt"]
                );
                
                // Store the AES key
                this.addSharedSecret(fromUser, aesKey);
                console.log(`✅ Shared secret established with ${fromUser}`);
            } catch (err) {
                console.error(`❌ Failed to process KEM ciphertext from ${fromUser}:`, err);
            }
        });
    }

    /** Subscribe to incoming messages (after decryption) */
    onMessage(fn) {
        this.messageListeners.push(fn);
    }

    /** Subscribe to incoming public keys */
    onPubKey(fn) {
        this.pubKeyListeners.push(fn);
    }


    /** Send message using AES key, Base64 encoded */
    async sendMessage(toUser, text) {
        let aes = this.sharedSecrets[toUser];
        if (!aes) {
            console.warn(`⚠️ No AES key yet for ${toUser}`);
            // Optionally: request public key here to start handshake
            this.socketHandler.requestPubKey(toUser);
            return;
        }

        const { iv, ciphertext } = await this.secureChannelManager.aesEncrypt(aes, text);
        const payload = {
            iv: this.secureChannelManager.arrayBufferToBase64(iv),
            data: this.secureChannelManager.arrayBufferToBase64(ciphertext)
        };

        this.socketHandler.sendMessage(toUser, payload);
    }

    /** Handle received Base64 message and decrypt */
    async receiveMessage(fromUser, payload) {
        const aes = this.sharedSecrets[fromUser];
        if (!aes) {
            console.warn(`⚠️ Received message from ${fromUser} but no AES key yet`);
            return null;
        }
        const iv = this.secureChannelManager.base64ToArrayBuffer(payload.iv);
        const data = this.secureChannelManager.base64ToArrayBuffer(payload.data);
        return await this.secureChannelManager.aesDecrypt(aes, iv, data);
    }

    /** Add or update shared AES key for a peer */
    addSharedSecret(userName, aesKey) {
        this.sharedSecrets[userName] = aesKey;
    }

    /** Send this user's public key to the server */
    sendPublicKeyToServer(username) {
        console.log('🔑 ChatHandler: Preparing to send public key...');
        const pubkeyB64 = this.secureChannelManager.encodeForTransmission(
            this.secureChannelManager.publicKey
        );

        console.log(pubkeyB64)
        console.log('🔑 Public key encoded, length:', pubkeyB64.length);
        console.log('📤 Emitting pubkey event to server...');
        this.socketHandler.socket.emit('pubkey', {
            name: username,
            pubkey: pubkeyB64
        });
        console.log('📡 Public key sent to server');
    }


    async makeConnectionRequest(targetUserName, timeoutMs = 10000) {
        // Check if we already have a shared secret with this user
        if (this.sharedSecrets[targetUserName]) {
            console.log(`✅ Already have shared secret with ${targetUserName}`);
            return true;
        }

        // Request the public key from the target user
        this.socketHandler.requestPubKey(targetUserName);

        // Wait for the public key to arrive (with timeout)
        const pubkey = await new Promise((resolve) => {
            const checkInterval = 100; // check every 100ms
            const start = Date.now();
            
            const listener = (username, pubkeyB64) => {
                if (username === targetUserName) {
                    resolve(pubkeyB64);
                }
            };
            
            this.pubKeyListeners.push(listener);
            
            const interval = setInterval(() => {
                if (Date.now() - start > timeoutMs) {
                    clearInterval(interval);
                    // Remove the listener
                    const idx = this.pubKeyListeners.indexOf(listener);
                    if (idx > -1) this.pubKeyListeners.splice(idx, 1);
                    resolve(null); // timed out
                }
            }, checkInterval);
        });

        if (!pubkey) {
            console.error(`❌ Failed to get public key for ${targetUserName}`);
            return false;
        }

        try {
            // Establish secure connection (KEM encapsulation + AES key import)
            const { ciphertextB64, aesKey } = await this.secureChannelManager.establishSecureConnection(pubkey);
            
            // Send the KEM ciphertext to establish shared key
            this.socketHandler.sendKEMCiphertext(targetUserName, ciphertextB64);
            
            // Store the AES key
            this.addSharedSecret(targetUserName, aesKey);
            
            console.log(`✅ Connection established with ${targetUserName}`);
            return true;
        } catch (err) {
            console.error(`❌ Failed to establish connection with ${targetUserName}:`, err);
            return false;
        }
    }

    }

