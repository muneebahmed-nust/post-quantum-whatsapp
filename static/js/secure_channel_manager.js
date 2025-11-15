import { MlKem512 } from "./mlkem.min.js";

// Check if Web Crypto API is available
if (!window.crypto || !window.crypto.subtle) {
    console.error("❌ Web Crypto API is not available. HTTPS or localhost required!");
    const warning = document.getElementById('crypto-warning');
    if (warning) warning.style.display = 'block';
    throw new Error("Web Crypto API not available - use HTTPS or localhost");
}

class SecureChannelManager {

    constructor() {
        /**
         * Manages secure channels using ML-KEM and AES encryption.
         */
        console.log('🔐 SecureChannelManager constructor called');
        this.kem = new MlKem512();
        console.log('✅ ML-KEM-512 instance created');
        this.publicKey = null;
        this.privateKey = null;
        this.keyPairReady = this.generateNewKeyPair();
        console.log('⏳ Key pair generation started...');
    }
// Used to decode received cryptographic keys and ciphertexts
    base64ToArrayBuffer(b64) {
        /**
         * Converts a Base64 encoded string back to an ArrayBuffer.
         * @param {string} b64 - The Base64 encoded string. 
         * @return {Uint8Array} - The decoded binary data as a Uint8Array.
         */

        if (typeof b64 !== "string") {
        throw new TypeError(`Expected string, got ${typeof b64}`);
    }
    const binary = atob(b64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return bytes;
}
    

arrayBufferToBase64(buf) {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
}

    // generate a new key pair for secure communication
    async generateNewKeyPair() {
        /**
         * Generates a new ML-KEM key pair and stores the public and private keys.
         */
        console.log('🔑 Generating new ML-KEM key pair...');
        const keyPair = await this.kem.generateKeyPair();
        console.log('📦 keyPair returned:', keyPair);
        console.log('📦 keyPair type:', typeof keyPair);
        console.log('📦 keyPair keys:', Object.keys(keyPair));
        
        // ML-KEM returns [publicKey, privateKey] as an array, not an object
        if (Array.isArray(keyPair)) {
            [this.publicKey, this.privateKey] = keyPair;
            console.log('✅ Extracted from array - publicKey length:', this.publicKey?.length);
            console.log('✅ Extracted from array - privateKey length:', this.privateKey?.length);
        } else {
            this.privateKey = keyPair.privateKey;
            this.publicKey = keyPair.publicKey;
            console.log('✅ Extracted from object - publicKey:', this.publicKey);
            console.log('✅ Extracted from object - privateKey:', this.privateKey);
        }

        console.log('✅ Key pair generated successfully');
    }

    encodeForTransmission(data) {
        /**
         * Converts ArrayBuffer data to Base64 string for safe transmission over text-based protocols.
         * @param {ArrayBuffer} data - The binary data to encode.
         * @returns {string} - The Base64 encoded string.
         */

        return this.arrayBufferToBase64(data);
    }

    decodeFromTransmission(b64) {
        /**
         * Converts a Base64 encoded string back to ArrayBuffer for processing.
         * @param {string} b64 - The Base64 encoded string.
         * @returns {Uint8Array} - The decoded binary data as a Uint8Array.
         */
        return this.base64ToArrayBuffer(b64);
    }

    async generateCiphertextSharedSecret(publicKey) {
        /**
         * Generates a ciphertext and shared secret using the recipient's public key.
         * @param {string} publicKey - The recipient's public key in Base64 format.
         * @returns {Object} - An object containing the ciphertext and sharedSecret.
         */
        const pubkey = this.base64ToArrayBuffer(publicKey);
        const result = await this.kem.encap(pubkey);
        console.log('🔐 encap result:', result);
        console.log('🔐 encap result type:', typeof result, 'isArray:', Array.isArray(result));
        
        // ML-KEM encap returns [ciphertext, sharedSecret] as an array
        if (Array.isArray(result)) {
            const [ciphertext, sharedSecret] = result;
            console.log('✅ Extracted from array - ciphertext length:', ciphertext?.length);
            console.log('✅ Extracted from array - sharedSecret length:', sharedSecret?.length);
            return { ciphertext, sharedSecret };
        } else {
            return result;
        }
    }

    async establishSecureConnection(publicKeyB64) {
        /**
         * Establishes a secure connection by performing KEM encapsulation
         * and importing the shared secret as an AES-GCM key.
         * @param {string} publicKeyB64 - The recipient's public key in Base64 format.
         * @returns {Promise<Object>} - Object containing ciphertextB64 (string) and aesKey (CryptoKey).
         */
        try {
            // Generate ciphertext and shared secret using KEM
            const { ciphertext, sharedSecret } = await this.generateCiphertextSharedSecret(publicKeyB64);
            
            // Convert ciphertext to Base64 for transmission
            const ciphertextB64 = this.arrayBufferToBase64(ciphertext);
            
            // Import the shared secret as an AES-GCM key
            const aesKey = await window.crypto.subtle.importKey(
                "raw",
                sharedSecret,
                "AES-GCM",
                false,
                ["encrypt", "decrypt"]
            );
            
            return { ciphertextB64, aesKey };
        } catch (err) {
            console.error("❌ Failed to establish secure connection:", err);
            throw err;
        }
    }




    // ======== AES ENCRYPT/DECRYPT ========
async  aesEncrypt(aesKey, plaintext) {
    /**
     * Encrypts plaintext using AES-GCM with the provided AES key.
     * @param {CryptoKey} aesKey - The AES key for encryption.
     * @param {string} plaintext - The plaintext message to encrypt.
     * @return {Object} - An object containing the IV and ciphertext.
     */
    const iv = window.crypto.getRandomValues(new Uint8Array(12));
    const encoded = new TextEncoder().encode(plaintext);
    const ciphertext = await window.crypto.subtle.encrypt({ name: "AES-GCM", iv }, aesKey, encoded);
    return { iv, ciphertext };
}

async  aesDecrypt(aesKey, iv, ciphertext) {
    /**
     *  
     * Decrypts ciphertext using AES-GCM with the provided AES key and IV.
     * @param {CryptoKey} aesKey - The AES key for decryption.
     * @param {Uint8Array} iv - The initialization vector used during encryption.
     * @param {ArrayBuffer} ciphertext - The ciphertext to decrypt.
     * @return {string} - The decrypted plaintext message.
     */
    const plainBuffer = await window.crypto.subtle.decrypt({ name: "AES-GCM", iv }, aesKey, ciphertext);
    return new TextDecoder().decode(plainBuffer);
}
    async 

    decryptMessage(aesKey, ivB64, ciphertextB64) {
        /**
         * Decrypts a message given the AES key, IV in Base64, and ciphertext in Base64.
         * @param {CryptoKey} aesKey - The AES key for decryption.
         * @param {string} ivB64 - The Base64 encoded initialization vector.
         * @param {string} ciphertextB64 - The Base64 encoded ciphertext.
         * @returns {Promise<string>} - The decrypted plaintext message.
         */
        const iv = this.base64ToArrayBuffer(ivB64);
        const ciphertext = this.base64ToArrayBuffer(ciphertextB64);
        return this.aesDecrypt(aesKey, iv, ciphertext);
    }

}

export { SecureChannelManager };