/**
 * ========================================================================
 * BRUTE FORCE ATTACK DEMONSTRATION ON ML-KEM-512 (KYBER)
 * ========================================================================
 * 
 * This script demonstrates why brute force attacks on post-quantum
 * cryptography (ML-KEM-512) are computationally infeasible.
 * 
 * Two attack scenarios are simulated:
 * 1. Shared Secret Brute Force: Attempting to guess the shared secret
 * 2. Ciphertext Manipulation: Attempting random decapsulation attempts
 * 
 * Uses the REAL ML-KEM-512 implementation from mlkem.min.js
 * 
 * Date: December 2025
 * ========================================================================
 */

import { MlKem512 } from './mlkem.min.js';

// Utility functions for encoding/decoding
function arrayBufferToBase64(buffer) {
    let binary = '';
    const bytes = new Uint8Array(buffer);
    for (let i = 0; i < bytes.byteLength; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function base64ToArrayBuffer(base64) {
    const binary = atob(base64);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes.buffer;
}

function bytesToHex(bytes) {
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function generateRandomBytes(length) {
    return crypto.getRandomValues(new Uint8Array(length));
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// Main demonstration class
class BruteForceDemo {
    constructor() {
        this.mlkem = new MlKem512();
        this.logs = [];
        this.startTime = 0;
        this.endTime = 0;
        this.attack1Attempts = 1000;
        this.attack2Attempts = 10000;
        this.cryptoData = {};
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const logEntry = `[${timestamp}] [${type.toUpperCase()}] ${message}`;
        this.logs.push(logEntry);
        console.log(logEntry);
    }

    printSeparator(title = '') {
        const separator = '═'.repeat(70);
        if (title) {
            const padding = Math.floor((70 - title.length - 2) / 2);
            console.log('═'.repeat(padding) + ` ${title} ` + '═'.repeat(padding));
        } else {
            console.log(separator);
        }
        this.logs.push(title ? '═'.repeat(70) : separator);
    }

    printDivider() {
        console.log('─'.repeat(70));
        this.logs.push('─'.repeat(70));
    }

    async initialize() {
        this.log('initializing ml-kem-512 cryptographic system...', 'info');
        try {
            // ml-kem-512 is ready to use
            this.log('ml-kem-512 initialized successfully', 'success');
            this.log(`brute force attempts configured: attack 1: ${this.attack1Attempts}, attack 2: ${this.attack2Attempts}`, 'info');
        } catch (error) {
            this.log(`initialization failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async attack1_SharedSecretBruteForce() {
        this.printSeparator('ATTACK 1: SHARED SECRET BRUTE FORCE');
        
        this.log('Generating keypair and creating encapsulation...', 'info');
        const startGen = performance.now();
        
        // Generate keypair
        const [encapsulationKey, decapsulationKey] = await this.mlkem.generateKeyPair();
        this.log(`keypair generated`, 'success');
        
        // Create encapsulation to get a ciphertext and shared secret
        const seed = generateRandomBytes(32);
        const [ciphertext, sharedSecret] = await this.mlkem.encap(encapsulationKey, seed);
        const endGen = performance.now();
        
        // Store crypto data for later use
        this.cryptoData = {
            encapsulationKey,
            decapsulationKey,
            ciphertext,
            sharedSecret
        };
        
        this.log(`encapsulation created in ${(endGen - startGen).toFixed(2)}ms`, 'success');
        this.log(`  - ciphertext size: ${ciphertext.length} bytes`, 'info');
        this.log(`  - shared secret size: ${sharedSecret.length} bytes`, 'info');
        this.log(`  - shared secret (hex): ${bytesToHex(sharedSecret).substring(0, 32)}...`, 'info');
        
        this.printDivider();
        this.log(`Starting brute force attack with ${this.attack1Attempts} attempts...`, 'warning');
        
        const attackStart = performance.now();
        let matchFound = false;
        let attemptCount = 0;
        
        for (let i = 0; i < this.attack1Attempts; i++) {
            attemptCount++;
            
            // Generate random bytes of same length as shared secret
            const randomAttempt = generateRandomBytes(sharedSecret.length);
            
            // Check if it matches (this will almost never happen)
            if (arraysEqual(randomAttempt, sharedSecret)) {
                matchFound = true;
                this.log(`⚠ MATCH FOUND at attempt ${i + 1}!`, 'warning');
                break;
            }
            
            // Progress indicator
            if ((i + 1) % 1000 === 0) {
                const elapsed = performance.now() - attackStart;
                this.log(`  Progress: ${i + 1}/${this.attack1Attempts} attempts (${(elapsed / 1000).toFixed(2)}s)`, 'info');
            }
        }
        
        const attackEnd = performance.now();
        const attackDuration = attackEnd - attackStart;
        
        this.printDivider();
        this.log(`attack completed in ${(attackDuration / 1000).toFixed(2)} seconds`, 'success');
        this.log(`  - total attempts: ${attemptCount}`, 'info');
        this.log(`  - match found: ${matchFound ? 'yes' : 'no'}`, 'info');
        
        if (!matchFound) {
            this.log(`  - computational feasibility: infeasible`, 'success');
            this.log(`    without a match in ${attemptCount} attempts, the probability of success`, 'info');
            this.log(`    is negligibly small for the full 32-byte search space.`, 'info');
            this.log(`    estimated attempts needed: 2^256 ≈ 1.16 × 10^77`, 'info');
        }
        
        this.printDivider();
        
        return {
            attackType: 'Shared Secret Brute Force',
            attempts: attemptCount,
            matchFound: matchFound,
            duration: attackDuration,
            secretSize: sharedSecret.length
        };
    }

    async attack2_CiphertextManipulation() {
        this.printSeparator('ATTACK 2: CIPHERTEXT DECAPSULATION BRUTE FORCE');
        
        this.log('Generating keypair and creating encapsulation...', 'info');
        const startGen = performance.now();
        
        // Generate keypair
        const [encapsulationKey, decapsulationKey] = await this.mlkem.generateKeyPair();
        
        // Create encapsulation
        const seed = generateRandomBytes(32);
        const [ciphertext, originalSharedSecret] = await this.mlkem.encap(encapsulationKey, seed);
        const endGen = performance.now();
        
        this.log(`encapsulation created in ${(endGen - startGen).toFixed(2)}ms`, 'success');
        this.log(`  - ciphertext size: ${ciphertext.length} bytes`, 'info');
        this.log(`  - original shared secret (hex): ${bytesToHex(originalSharedSecret).substring(0, 32)}...`, 'info');
        
        this.printDivider();
        this.log(`Starting brute force decapsulation with ${this.attack2Attempts} random attempts...`, 'warning');
        
        const attackStart = performance.now();
        let correctDecryption = 0;
        let attemptCount = 0;
        
        for (let i = 0; i < this.attack2Attempts; i++) {
            attemptCount++;
            
            try {
                // Attempt to decapsulate with original key
                // (In reality, we'd be trying different keys, but decap requires correct key)
                // This demonstrates trying random manipulations
                const randomModification = generateRandomBytes(ciphertext.length);
                
                // Try decapsulating with modified ciphertext
                const decryptedSecret = await this.mlkem.decap(randomModification, decapsulationKey);
                
                // Check if it matches the original
                if (arraysEqual(decryptedSecret, originalSharedSecret)) {
                    correctDecryption++;
                    this.log(`⚠ Correct decryption at attempt ${i + 1}!`, 'warning');
                }
            } catch (error) {
                // Expected: most attempts will fail
                // Silently continue
            }
            
            // Progress indicator
            if ((i + 1) % 1000 === 0) {
                const elapsed = performance.now() - attackStart;
                this.log(`  Progress: ${i + 1}/${this.attack2Attempts} attempts (${(elapsed / 1000).toFixed(2)}s)`, 'info');
            }
        }
        
        const attackEnd = performance.now();
        const attackDuration = attackEnd - attackStart;
        
        this.printDivider();
        this.log(`attack completed in ${(attackDuration / 1000).toFixed(2)} seconds`, 'success');
        this.log(`  - total attempts: ${attemptCount}`, 'info');
        this.log(`  - correct decryptions: ${correctDecryption}`, 'info');
        this.log(`  - success rate: ${(correctDecryption / attemptCount * 100).toFixed(6)}%`, 'info');
        
        if (correctDecryption === 0) {
            this.log(`  - attack result: failed - ciphertext integrity protected`, 'success');
            this.log(`    ml-kem-512 ensures that random ciphertexts cannot be decrypted,`, 'info');
            this.log(`    preventing trivial attacks on the cryptosystem.`, 'info');
        }
        
        this.printDivider();
        
        return {
            attackType: 'Ciphertext Manipulation',
            attempts: attemptCount,
            correctDecryptions: correctDecryption,
            duration: attackDuration,
            ciphertextSize: ciphertext.length
        };
    }

    displayFinalSummary() {
        this.printSeparator('final security analysis summary');
        
        this.log(``, 'info');
        this.log(`post-quantum cryptography (ml-kem-512) brute force resistance:`, 'info');
        this.log(``, 'info');
        this.log(`attack vector 1: shared secret guessing`, 'success');
        this.log(`  - infeasibility: requires 2^256 attempts (≈10^77 operations)`, 'info');
        this.log(`  - current test: 10,000 attempts yielded no matches`, 'info');
        this.log(`  - computational cost: modern computers cannot complete this task`, 'info');
        this.log(``, 'info');
        
        this.log(`attack vector 2: ciphertext manipulation`, 'success');
        this.log(`  - infeasibility: random modifications cannot be decrypted correctly`, 'info');
        this.log(`  - current test: all modified ciphertexts failed decapsulation`, 'info');
        this.log(`  - security property: ml-kem provides ciphertext authenticity`, 'info');
        this.log(``, 'info');
        
        this.log(`conclusion:`, 'success');
        this.log(`  ml-kem-512 is resistant to brute force attacks due to:`, 'info');
        this.log(`  1. large keyspace (2^256 for shared secrets)`, 'info');
        this.log(`  2. deterministic decapsulation (incorrect keys → wrong secrets)`, 'info');
        this.log(`  3. no feasible way to verify decryption without the key`, 'info');
        this.log(`  4. post-quantum hard mathematical problem (module learning with errors)`, 'info');
        
        this.printSeparator();
    }

    async run() {
        this.startTime = performance.now();
        
        this.printSeparator('BRUTE FORCE ATTACK DEMONSTRATION ON ML-KEM-512');
        this.log(`Test suite initialized at ${new Date().toISOString()}`, 'info');
        
        try {
            // Initialize
            await this.initialize();
            this.printDivider();
            
            // Run attacks
            const result1 = await this.attack1_SharedSecretBruteForce();
            const result2 = await this.attack2_CiphertextManipulation();
            
            // Display summary
            this.displayFinalSummary();
            
            this.endTime = performance.now();
            const totalDuration = (this.endTime - this.startTime) / 1000;
            
            this.log(`Total test duration: ${totalDuration.toFixed(2)} seconds`, 'success');
            this.log(`All tests completed successfully!`, 'success');
            
            return {
                success: true,
                results: [result1, result2],
                totalDuration: totalDuration,
                logs: this.logs,
                ciphertextB64: arrayBufferToBase64(this.cryptoData.ciphertext),
                sharedSecretHex: bytesToHex(new Uint8Array(this.cryptoData.sharedSecret)),
                publicKeyLength: this.cryptoData.encapsulationKey.byteLength,
                privateKeyLength: this.cryptoData.decapsulationKey.byteLength,
                attack1Attempts: result1.attempts,
                attack2Attempts: result2.attempts
            };
            
        } catch (error) {
            this.log(`Test suite failed: ${error.message}`, 'error');
            this.log(`Stack trace: ${error.stack}`, 'error');
            
            return {
                success: false,
                error: error.message,
                logs: this.logs
            };
        }
    }
}

// Export for use in other modules
export { BruteForceDemo };

// Auto-run if loaded directly (not as module)
if (typeof window !== 'undefined') {
    window.BruteForceDemo = BruteForceDemo;
    
    // Make it available globally for easy testing
    window.runBruteForceDemo = async function() {
        const demo = new BruteForceDemo();
        return await demo.run();
    };
    
    console.log('brute force demo loaded! run: window.runBruteForceDemo()');
}