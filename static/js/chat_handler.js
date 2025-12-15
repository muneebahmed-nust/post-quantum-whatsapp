import { SocketHandler } from "./socket_handler.js";

export class ChatHandler {
    constructor(userName, secureChannelManager) {
        console.log('chathandler constructor called for:', userName);
        this.secureChannelManager = secureChannelManager;
        console.log('using provided securechannelmanager');
        this.socketHandler = new SocketHandler(userName);
        console.log('sockethandler created');
        this.sharedSecrets = {};                  // peersid -> aes key (cryptokey)
        this.messageListeners = [];               // ui or other listeners
        this.pubKeyListeners = [];                // for when pubkey is received

        // Hook socket events
        this.socketHandler.onMessage(async (fromUser, base64Message) => {
            const decrypted = await this.receiveMessage(fromUser, base64Message);
            if (decrypted) this.messageListeners.forEach(fn => fn(fromUser, decrypted));
        });

        this.socketHandler.onPubKey((username, pubkeyB64) => {
            // Store the public key in SecureChannelManager
            this.secureChannelManager.storeUserPublicKey(username, pubkeyB64);
            this.pubKeyListeners.forEach(fn => fn(username, pubkeyB64));
        });

        // handle incoming kem ciphertexts to establish shared secret
        this.socketHandler.onKEMCiphertext(async (fromUser, ciphertextB64) => {
            console.log(`processing kem ciphertext from ${fromUser}`);
            
            // check if we already have a shared secret with this user
            if (this.sharedSecrets[fromUser]) {
                console.log(`already have shared secret with ${fromUser}, skipping`);
                return;
            }

            try {
                // decapsulate the ciphertext using our private key
                const ciphertext = this.secureChannelManager.base64ToArrayBuffer(ciphertextB64);
                const sharedSecret = await this.secureChannelManager.kem.decap(
                    ciphertext,
                    this.secureChannelManager.privateKey
                );
                
                console.log('decapsulated shared secret, length:', sharedSecret?.length);
                
                // import the shared secret as an aes-gcm key
                const aesKey = await window.crypto.subtle.importKey(
                    "raw",
                    sharedSecret,
                    "AES-GCM",
                    false,
                    ["encrypt", "decrypt"]
                );
                
                // store the aes key
                this.addSharedSecret(fromUser, aesKey);
                console.log(`shared secret established with ${fromUser}`);
            } catch (err) {
                console.error(`failed to process kem ciphertext from ${fromUser}:`, err);
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
            console.warn(`no aes key yet for ${toUser}`);
            // optionally: request public key here to start handshake
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
            console.warn(`received message from ${fromUser} but no aes key yet`);
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
        console.log('chathandler: preparing to send public key...');
        const pubkeyB64 = this.secureChannelManager.encodeForTransmission(
            this.secureChannelManager.publicKey
        );

        console.log(pubkeyB64)
        console.log('public key encoded, length:', pubkeyB64.length);
        console.log('emitting pubkey event to server...');
        this.socketHandler.socket.emit('pubkey', {
            name: username,
            pubkey: pubkeyB64
        });
        console.log('public key sent to server');
    }


    async makeConnectionRequest(targetUserName, timeoutMs = 10000) {
        // check if we already have a shared secret with this user
        if (this.sharedSecrets[targetUserName]) {
            console.log(`already have shared secret with ${targetUserName}`);
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
                    // Remove the listener when we get the pubkey
                    const idx = this.pubKeyListeners.indexOf(listener);
                    if (idx > -1) this.pubKeyListeners.splice(idx, 1);
                    clearInterval(interval);
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
            console.error(`failed to get public key for ${targetUserName}`);
            return false;
        }

        try {
            // establish secure connection (kem encapsulation + aes key import)
            const { ciphertextB64, aesKey } = await this.secureChannelManager.establishSecureConnection(pubkey);
            
            // send the kem ciphertext to establish shared key
            this.socketHandler.sendKEMCiphertext(targetUserName, ciphertextB64);
            
            // store the aes key
            this.addSharedSecret(targetUserName, aesKey);
            
            console.log(`connection established with ${targetUserName}`);
            return true;
        } catch (err) {
            console.error(`failed to establish connection with ${targetUserName}:`, err);
            return false;
        }
    }

    }

