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