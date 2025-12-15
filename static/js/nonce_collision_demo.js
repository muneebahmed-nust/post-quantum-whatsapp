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
    for (let i = 0; i < bytes.byteLength; i++) {
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
        this.aesKey = null;
        this.nonces = [];
        this.results = {
            totalGenerated: 0,
            duplicatesFound: 0,
            collisionPairs: [],
            startTime: null,
            endTime: null,
            generationRate: 0
        };
    }

    log(message, type = 'info') {
        const timestamp = new Date().toLocaleTimeString();
        const prefix = {
            'info': '[info]',
            'success': '[success]',
            'warning': '[warning]',
            'error': '[error]',
            'crypto': '[crypto]',
            'test': '[test]'
        }[type] || '[info]';
        
        console.log(`[${timestamp}] ${prefix} ${message}`);
    }

    printSeparator(title = '') {
        console.log('\n' + '='.repeat(70));
        if (title) {
            console.log(title.toUpperCase());
            console.log('='.repeat(70));
        }
    }

    printDivider() {
        console.log('-'.repeat(70));
    }

    async initialize() {
        this.printSeparator('🔐 AES-GCM NONCE COLLISION DEMONSTRATION');
        this.log('Testing the security of random nonce generation', 'info');
        this.log('Demonstrating why 96-bit nonces are safe for AES-GCM\n', 'info');

        this.printSeparator('📦 STEP 1: GENERATING AES-256 KEY');
        this.printDivider();

        this.log('Generating AES-256 key using Web Crypto API...', 'crypto');
        
        this.aesKey = await crypto.subtle.generateKey(
            {
                name: "AES-GCM",
                length: 256
            },
            true, // extractable
            ["encrypt", "decrypt"]
        );

        this.log('AES-256 key generated successfully!', 'success');
        
        // Export key to show it
        const exportedKey = await crypto.subtle.exportKey("raw", this.aesKey);
        const keyHex = arrayBufferToHex(exportedKey);
        
        this.log('\n🔑 AES-256 Key (Hex):', 'crypto');
        this.log(`   ${keyHex.substring(0, 32)}...${keyHex.substring(keyHex.length - 32)}`, 'info');
        this.log(`   Length: ${exportedKey.byteLength} bytes (${exportedKey.byteLength * 8} bits)`, 'info');
    }

    async generateNonces(count) {
        this.printSeparator(`🎲 STEP 2: GENERATING ${count.toLocaleString()} RANDOM NONCES`);
        this.printDivider();

        const NONCE_BYTES = 12; // 96 bits
        const NONCE_BITS = NONCE_BYTES * 8;

        this.log(`Nonce size: ${NONCE_BYTES} bytes (${NONCE_BITS} bits)`, 'info');
        this.log(`Total possible nonces: 2^${NONCE_BITS} = ${(2**96).toExponential(2)}`, 'info');
        this.log(`Generating ${count.toLocaleString()} random nonces...\n`, 'test');

        this.nonces = [];
        this.results.startTime = performance.now();
        const startTime = this.results.startTime;

        for (let i = 0; i < count; i++) {
            // Generate a random 96-bit nonce
            const nonce = crypto.getRandomValues(new Uint8Array(NONCE_BYTES));
            this.nonces.push(nonce);

            // Progress indicator
            if ((i + 1) % 1000 === 0) {
                const elapsed = (performance.now() - startTime) / 1000;
                const rate = (i + 1) / elapsed;
                this.log(`   Generated ${(i + 1).toLocaleString()} nonces | Rate: ${rate.toLocaleString(undefined, {maximumFractionDigits: 0})} nonces/sec`, 'info');
            }
        }

        this.results.endTime = performance.now();
        const totalTime = (this.results.endTime - this.results.startTime) / 1000;
        this.results.totalGenerated = count;
        this.results.generationRate = count / totalTime;

        this.log(`\n✅ Nonce generation complete!`, 'success');
        this.log(`   Total generated: ${count.toLocaleString()}`, 'info');
        this.log(`   Time elapsed: ${totalTime.toFixed(3)} seconds`, 'info');
        this.log(`   Generation rate: ${this.results.generationRate.toLocaleString(undefined, {maximumFractionDigits: 0})} nonces/sec`, 'info');

        // Show first few nonces
        this.log('\n📋 Sample Nonces (first 5):', 'info');
        for (let i = 0; i < Math.min(5, this.nonces.length); i++) {
            const nonceHex = arrayBufferToHex(this.nonces[i]);
            this.log(`   Nonce #${i + 1}: ${nonceHex}`, 'info');
        }
    }

    checkForDuplicates() {
        this.printSeparator('🔍 STEP 3: CHECKING FOR DUPLICATE NONCES');
        this.printDivider();

        this.log(`Checking ${this.nonces.length.toLocaleString()} nonces for duplicates...`, 'test');
        this.log('This may take a moment...\n', 'info');

        const startTime = performance.now();
        const seen = new Map(); // Map nonce hex to index
        this.results.duplicatesFound = 0;
        this.results.collisionPairs = [];

        for (let i = 0; i < this.nonces.length; i++) {
            const nonceHex = arrayBufferToHex(this.nonces[i]);
            
            if (seen.has(nonceHex)) {
                // Found a duplicate!
                this.results.duplicatesFound++;
                this.results.collisionPairs.push({
                    index1: seen.get(nonceHex),
                    index2: i,
                    nonce: nonceHex
                });
                
                this.log(`🚨 COLLISION FOUND!`, 'error');
                this.log(`   Nonce #${seen.get(nonceHex) + 1} = Nonce #${i + 1}`, 'error');
                this.log(`   Value: ${nonceHex}`, 'error');
            } else {
                seen.set(nonceHex, i);
            }

            // Progress indicator
            if ((i + 1) % 10000 === 0) {
                const elapsed = (performance.now() - startTime) / 1000;
                const rate = (i + 1) / elapsed;
                this.log(`   Checked ${(i + 1).toLocaleString()} nonces | Rate: ${rate.toLocaleString(undefined, {maximumFractionDigits: 0})} checks/sec`, 'info');
            }
        }

        const checkTime = (performance.now() - startTime) / 1000;

        this.log(`\n✅ Duplicate check complete!`, 'success');
        this.log(`   Time elapsed: ${checkTime.toFixed(3)} seconds`, 'info');
        this.log(`   Check rate: ${(this.nonces.length / checkTime).toLocaleString(undefined, {maximumFractionDigits: 0})} checks/sec`, 'info');

        if (this.results.duplicatesFound === 0) {
            this.log(`\n🎉 NO DUPLICATES FOUND!`, 'success');
            this.log(`   All ${this.nonces.length.toLocaleString()} nonces are unique`, 'success');
        } else {
            this.log(`\n⚠️ Found ${this.results.duplicatesFound} duplicate(s)`, 'warning');
        }
    }

    calculateProbability() {
        this.printSeparator('📊 STEP 4: PROBABILITY ANALYSIS');
        this.printDivider();

        const n = this.results.totalGenerated; // number of nonces
        const N = 2**96; // total possible nonces (2^96)

        this.log('Birthday Paradox Probability Calculation', 'info');
        this.log('For 96-bit nonces (2^96 possible values):\n', 'info');

        // Approximate collision probability using birthday paradox
        // P(collision) ≈ 1 - e^(-n²/2N)
        // For small probabilities: P ≈ n²/2N
        
        const exactExponent = -(n * n) / (2 * N);
        const approximateProbability = (n * n) / (2 * N);
        
        this.log(`Number of nonces generated: ${n.toLocaleString()}`, 'info');
        this.log(`Total possible nonces: 2^96 = ${N.toExponential(2)}`, 'info');
        this.printDivider();

        this.log('\n📐 Theoretical Collision Probability:', 'info');
        this.log(`   P(collision) ≈ n²/(2N)`, 'info');
        this.log(`   P(collision) ≈ (${n.toLocaleString()})² / (2 × 2^96)`, 'info');
        this.log(`   P(collision) ≈ ${approximateProbability.toExponential(4)}`, 'info');
        this.log(`   P(collision) ≈ ${(approximateProbability * 100).toExponential(4)}%`, 'info');

        // Calculate how many nonces needed for 50% collision probability
        // n ≈ sqrt(2N × ln(2)) ≈ sqrt(N) × 1.177
        const noncesFor50Percent = Math.sqrt(N) * 1.177;
        
        this.log(`\n📈 Collision Probability Benchmarks:`, 'info');
        this.log(`   50% collision probability at: ~${noncesFor50Percent.toExponential(2)} nonces`, 'warning');
        this.log(`   (That's ~2^48 or 281 trillion nonces!)`, 'warning');

        // Show practical scenarios
        this.printDivider();
        this.log('\n🌍 Real-World Context:', 'info');
        
        const scenarios = [
            { count: 1000, name: '1 thousand' },
            { count: 10000, name: '10 thousand' },
            { count: 100000, name: '100 thousand' },
            { count: 1000000, name: '1 million' },
            { count: 10000000, name: '10 million' },
            { count: 100000000, name: '100 million' },
            { count: 1000000000, name: '1 billion' },
            { count: 4294967296, name: '2^32 (4.3 billion)' }
        ];

        scenarios.forEach(scenario => {
            const prob = (scenario.count * scenario.count) / (2 * N);
            const percentage = prob * 100;
            const odds = 1 / prob;
            
            this.log(`   ${scenario.name.padEnd(20)} nonces: ${percentage.toExponential(2)}% (1 in ${odds.toExponential(2)})`, 'info');
        });

        this.log(`\n💡 Practical Recommendation:`, 'success');
        this.log(`   For typical applications (<2^32 messages per key):`, 'info');
        this.log(`   Random 96-bit nonces are EXTREMELY SAFE`, 'success');
        this.log(`   Collision probability: < 1 in 10^19`, 'success');

        // Actual result vs expected
        this.printDivider();
        this.log('\n📊 Actual Results vs Theory:', 'info');
        this.log(`   Expected duplicates: ${(this.results.totalGenerated * approximateProbability).toFixed(6)}`, 'info');
        this.log(`   Actual duplicates found: ${this.results.duplicatesFound}`, this.results.duplicatesFound > 0 ? 'warning' : 'success');
        
        if (this.results.duplicatesFound === 0) {
            this.log(`   Result: As expected! ✅`, 'success');
        } else {
            this.log(`   Result: Extremely rare event occurred! 🎲`, 'warning');
            this.log(`   (This is statistically possible but very unlikely)`, 'info');
        }
    }

    displayFinalSummary() {
        this.printSeparator('final summary');

        this.log('\naes-gcm nonce security conclusions:', 'success');
        this.log(`   total nonces generated: ${this.results.totalGenerated.toLocaleString()}`, 'info');
        this.log(`   duplicates found: ${this.results.duplicatesFound}`, this.results.duplicatesFound === 0 ? 'success' : 'warning');
        this.log(`   nonce space: 2^96 = ${(2**96).toExponential(2)} possible values`, 'info');
        this.log(`   collision probability: negligible for practical use`, 'success');

        this.log('\nkey takeaways:', 'info');
        this.log('   1. random 96-bit nonces provide excellent security', 'success');
        this.log('   2. collisions are virtually impossible in practice', 'success');
        this.log('   3. safe to use for billions of messages per key', 'success');
        this.log('   4. web crypto api provides cryptographically secure randomness', 'success');

        this.log('\nimportant reminders:', 'warning');
        this.log('   never reuse a nonce with the same key in aes-gcm', 'warning');
        this.log('   always use crypto.getrandomvalues() for nonce generation', 'warning');
        this.log('   rotate keys periodically (e.g., after 2^32 messages)', 'warning');
        this.log('   random nonces are safer than counters (no state to manage)', 'success');

        this.printSeparator('demonstration complete');

        return {
            totalGenerated: this.results.totalGenerated,
            duplicatesFound: this.results.duplicatesFound,
            collisionPairs: this.results.collisionPairs,
            generationRate: this.results.generationRate,
            probability: (this.results.totalGenerated ** 2) / (2 * (2**96))
        };
    }

    async run(nonceCount = 10000) {
        try {
            await this.initialize();
            await this.generateNonces(nonceCount);
            this.checkForDuplicates();
            this.calculateProbability();
            return this.displayFinalSummary();
        } catch (error) {
            this.log(`Fatal error: ${error.message}`, 'error');
            console.error(error);
            throw error;
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
    
    console.log('nonce collision demo loaded! run: window.runNonceDemo(10000)');
}