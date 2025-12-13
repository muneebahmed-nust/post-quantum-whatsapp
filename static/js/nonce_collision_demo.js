/**
 * ========================================================================
 * AES-GCM NONCE COLLISION DEMONSTRATION
 * ========================================================================
 * 
 * This script demonstrates the security of random nonce generation in AES-GCM.
 * 
 * The demonstration:
 * 1. Generates a single AES-256 key
 * 2. Generates N random 96-bit nonces (configurable)
 * 3. Checks for any duplicate nonces
 * 4. Calculates collision probability using birthday paradox
 * 
 * Security Analysis:
 * - 96-bit nonces provide 2^96 possible values
 * - Birthday paradox: ~50% collision after 2^48 nonces
 * - For practical usage (<2^32 nonces), collision is negligible
 * 
 * Author: Security Research Team
 * Date: December 2025
 * ========================================================================
 */

// Utility functions
function arrayBufferToHex(buffer) {
    const bytes = new Uint8Array(buffer);
    return Array.from(bytes)
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');
}

function bytesToBase64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i++) {
        binary += String.fromCharCode(bytes[i]);
    }
    return btoa(binary);
}

function arraysEqual(a, b) {
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) {
        if (a[i] !== b[i]) return false;
    }
    return true;
}

// Main demonstration class
class NonceCollisionDemo {
    constructor() {
        this.key = null;
        this.nonces = [];
        this.logs = [];
        this.startTime = 0;
        this.endTime = 0;
        this.nonceSize = 12; // 96 bits = 12 bytes for AES-GCM
        this.collisions = [];
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
        this.logs.push(separator);
    }

    printDivider() {
        console.log('─'.repeat(70));
        this.logs.push('─'.repeat(70));
    }

    async initialize() {
        this.log('Initializing AES-GCM Nonce Collision Test...', 'info');
        try {
            // Generate a 256-bit (32-byte) key for AES-256
            this.key = crypto.getRandomValues(new Uint8Array(32));
            this.log('✓ AES-256 key generated', 'success');
            this.log(`  - Key size: 256 bits (32 bytes)`, 'info');
            this.log(`  - Nonce size: 96 bits (12 bytes)`, 'info');
        } catch (error) {
            this.log(`✗ Initialization failed: ${error.message}`, 'error');
            throw error;
        }
    }

    async generateNonces(count) {
        this.log(`Generating ${count} random nonces...`, 'info');
        const startGen = performance.now();
        
        this.nonces = [];
        for (let i = 0; i < count; i++) {
            // Generate 96-bit (12-byte) random nonce
            const nonce = crypto.getRandomValues(new Uint8Array(this.nonceSize));
            this.nonces.push(nonce);
            
            // Progress indicator
            if ((i + 1) % Math.max(1000, Math.floor(count / 10)) === 0) {
                this.log(`  Progress: ${i + 1}/${count} nonces generated`, 'info');
            }
        }
        
        const endGen = performance.now();
        this.log(`✓ All ${count} nonces generated in ${(endGen - startGen).toFixed(2)}ms`, 'success');
        
        return this.nonces;
    }

    checkForDuplicates() {
        this.log('Checking for duplicate nonces...', 'info');
        const startCheck = performance.now();
        
        this.collisions = [];
        
        // Convert nonces to hex strings for easy comparison
        const nonceMap = new Map();
        
        for (let i = 0; i < this.nonces.length; i++) {
            const hexNonce = arrayBufferToHex(this.nonces[i]);
            
            if (nonceMap.has(hexNonce)) {
                // Found a collision
                this.collisions.push({
                    index1: nonceMap.get(hexNonce),
                    index2: i,
                    nonce: hexNonce
                });
                this.log(`⚠ COLLISION FOUND at indices ${nonceMap.get(hexNonce)} and ${i}`, 'warning');
            } else {
                nonceMap.set(hexNonce, i);
            }
        }
        
        const endCheck = performance.now();
        this.log(`✓ Duplicate check completed in ${(endCheck - startCheck).toFixed(2)}ms`, 'success');
        this.log(`  - Total nonces checked: ${this.nonces.length}`, 'info');
        this.log(`  - Collisions found: ${this.collisions.length}`, 'info');
        
        return this.collisions;
    }

    calculateProbability() {
        this.log('Calculating collision probability using Birthday Paradox...', 'info');
        
        const n = this.nonces.length; // number of nonces
        const N = Math.pow(2, 96); // total possible nonces (2^96)
        
        // Birthday paradox approximation: P(collision) ≈ 1 - e^(-n²/2N)
        // For small n: P(collision) ≈ n²/2N
        
        const nSquared = n * n;
        const denominator = 2 * N;
        const approximateCollisionProb = nSquared / denominator;
        
        // Using more accurate formula for non-negligible probabilities
        // P(no collision) ≈ e^(-n²/2N)
        const exponent = -(nSquared / (2 * N));
        const probNoCollision = Math.exp(exponent);
        const probCollision = 1 - probNoCollision;
        
        this.log(`Birthday Paradox Analysis:`, 'info');
        this.log(`  - Total nonces generated: ${n.toLocaleString()}`, 'info');
        this.log(`  - Total possible 96-bit values: 2^96 ≈ 7.92 × 10^28`, 'info');
        this.log(`  - Approximate collision probability: ${(probCollision * 100).toFixed(10)}%`, 'info');
        this.log(`  - Probability of NO collision: ${(probNoCollision * 100).toFixed(10)}%`, 'info');
        
        // Calculate 50% collision threshold
        const threshold50 = Math.sqrt(2 * N * Math.log(2));
        this.log(``, 'info');
        this.log(`  - 50% collision threshold: ~2^48 ≈ ${threshold50.toLocaleString()} nonces`, 'info');
        this.log(`  - Current nonces: ${n.toLocaleString()}`, 'info');
        
        if (n < threshold50 / 1000) {
            this.log(`  - Risk level: NEGLIGIBLE (far below threshold)`, 'success');
        } else if (n < threshold50 / 10) {
            this.log(`  - Risk level: VERY LOW`, 'success');
        } else if (n < threshold50) {
            this.log(`  - Risk level: LOW TO MODERATE`, 'warning');
        } else {
            this.log(`  - Risk level: HIGH (approaching or exceeding 50% threshold)`, 'error');
        }
        
        return {
            collisionProb: probCollision,
            noCollisionProb: probNoCollision,
            threshold50: threshold50,
            noncesGenerated: n
        };
    }

    displayFinalSummary() {
        this.printSeparator('FINAL NONCE COLLISION ANALYSIS SUMMARY');
        
        this.log(``, 'info');
        this.log(`AES-GCM Nonce Security Assessment:`, 'info');
        this.log(``, 'info');
        
        this.log(`✓ Test Results:`, 'success');
        this.log(`  - Nonces generated: ${this.nonces.length.toLocaleString()}`, 'info');
        this.log(`  - Nonce size: 96 bits (12 bytes)`, 'info');
        this.log(`  - Possible values: 2^96 ≈ 7.92 × 10^28`, 'info');
        this.log(`  - Collisions detected: ${this.collisions.length}`, 'info');
        this.log(``, 'info');
        
        this.log(`✓ Security Implications:`, 'success');
        if (this.collisions.length === 0) {
            this.log(`  - No collisions found in ${this.nonces.length.toLocaleString()} nonces`, 'info');
            this.log(`  - Random nonce generation is working correctly`, 'info');
            this.log(`  - For typical messaging applications (<2^32 messages):`, 'info');
            this.log(`    Collision probability is negligibly small`, 'info');
        } else {
            this.log(`  - ${this.collisions.length} collision(s) detected!`, 'warning');
            this.log(`  - This is statistically unexpected for this sample size`, 'warning');
            this.log(`  - Consider using a different RNG if this persists`, 'warning');
        }
        
        this.log(``, 'info');
        this.log(`Best Practices:`, 'info');
        this.log(`  1. Use cryptographically secure RNG (crypto.getRandomValues)`, 'info');
        this.log(`  2. Generate unique 96-bit nonce for each encryption`, 'info');
        this.log(`  3. Never reuse the same (key, nonce) pair for AES-GCM`, 'info');
        this.log(`  4. For high-volume systems, monitor nonce usage`, 'info');
        
        this.printSeparator();
    }

    async run(nonceCount = 10000) {
        this.startTime = performance.now();
        
        this.printSeparator('AES-GCM NONCE COLLISION DEMONSTRATION');
        this.log(`Test suite initialized at ${new Date().toISOString()}`, 'info');
        this.log(`Configuration: Testing ${nonceCount.toLocaleString()} random nonces`, 'info');
        
        try {
            // Initialize
            await this.initialize();
            this.printDivider();
            
            // Generate nonces
            await this.generateNonces(nonceCount);
            this.printDivider();
            
            // Check for duplicates
            this.checkForDuplicates();
            this.printDivider();
            
            // Calculate probability
            const probabilityAnalysis = this.calculateProbability();
            this.printDivider();
            
            // Display summary
            this.displayFinalSummary();
            
            this.endTime = performance.now();
            const totalDuration = (this.endTime - this.startTime) / 1000;
            
            this.log(`Total test duration: ${totalDuration.toFixed(2)} seconds`, 'success');
            this.log(`All tests completed successfully!`, 'success');
            
            return {
                success: true,
                nonceCount: nonceCount,
                collisionsFound: this.collisions.length,
                probabilityAnalysis: probabilityAnalysis,
                totalDuration: totalDuration,
                logs: this.logs
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
export { NonceCollisionDemo };

// Auto-run if loaded directly (not as module)
if (typeof window !== 'undefined') {
    window.NonceCollisionDemo = NonceCollisionDemo;
    
    // Make it available globally for easy testing
    window.runNonceDemo = async function(count = 10000) {
        const demo = new NonceCollisionDemo();
        return await demo.run(count);
    };
    
    console.log('💡 Nonce Collision Demo loaded! Run: window.runNonceDemo(10000)');
}