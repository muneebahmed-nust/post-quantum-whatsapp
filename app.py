# Import Flask framework for web server functionality
from flask import Flask, render_template, request
# Import SocketIO for real-time bidirectional communication between clients and server
from flask_socketio import SocketIO, emit

# Initialize Flask application instance
app = Flask(__name__)
# Set secret key for session management and security (should be changed in production)
app.config['SECRET_KEY'] = 'secret!'
# Initialize SocketIO with CORS enabled to allow connections from any origin
socketio = SocketIO(app, cors_allowed_origins="*")

# Dictionary to store connected clients' information
# Structure: {socket_id: {"name": username, "pubkey": base64_encoded_public_key}}
clients = {}  # sid -> {"name": name, "pubkey": None}

# Dictionary to map usernames to socket IDs for easy lookup
username_to_sid = {}  # username -> sid

# Route handler for the root URL - serves the main chat interface
@app.route("/")
def index():
    # Render and return the chat.html template to the client
    return render_template("chat.html")

# Helper function to broadcast the current user list to all connected clients
def broadcast_user_list():
    """Send updated user list (username -> socket_id mapping) to all clients"""
    user_map = {clients[sid]["name"]: sid for sid in clients if clients[sid].get("name")}
    emit("user_list", user_map, broadcast=True)
    print(f"👥 Broadcasting user list: {list(user_map.keys())}")

# WebSocket event handler for user registration
@socketio.on("register_user")
def on_register_user(data):
    """Register a user with their chosen username"""
    username = data.get("name")
    if not username:
        print(f"⚠️ Registration failed: no username provided from {request.sid}")
        return
    
    # Check if username is already taken
    if username in username_to_sid and username_to_sid[username] != request.sid:
        emit("registration_error", {"message": "Username already taken"}, to=request.sid)
        print(f"⚠️ Username '{username}' already taken")
        return
    
    # Register the user
    clients[request.sid] = {"name": username, "pubkey": None}
    username_to_sid[username] = request.sid
    print(f"✅ User registered: {username} (SID: {request.sid})")
    
    # Confirm registration to the client
    emit("registration_confirmed", {"username": username}, to=request.sid)
    
    # Broadcast updated user list to all clients
    broadcast_user_list()

# WebSocket event handler for requesting another user's public key
@socketio.on("request_pubkey")
def on_request_pubkey(data):
    """Handle request for a specific user's public key"""
    target_username = data.get("username")
    print(f"🔍 Pubkey request: {clients.get(request.sid, {}).get('name', 'Unknown')} wants {target_username}'s pubkey")
    target_sid = username_to_sid.get(target_username)
    
    if not target_sid or target_sid not in clients:
        print(f"⚠️ Pubkey request failed: {target_username} not found")
        print(f"   Available users: {list(username_to_sid.keys())}")
        emit("pubkey_error", {"message": f"User {target_username} not found"}, to=request.sid)
        return
    
    target_pubkey = clients[target_sid].get("pubkey")
    if not target_pubkey:
        print(f"⚠️ Pubkey request failed: {target_username} has no pubkey yet")
        print(f"   Target SID: {target_sid}")
        print(f"   Target client data: {clients[target_sid]}")
        emit("pubkey_error", {"message": f"User {target_username} has no public key"}, to=request.sid)
        return
    
    # Send the requested public key back to the requester
    print(f"✅ Sending {target_username}'s pubkey (length: {len(target_pubkey)}) to requester")
    emit("pubkey_response", {"username": target_username, "pubkeyB64": target_pubkey}, to=request.sid)
    print(f"🔑 Sent {target_username}'s pubkey to {request.sid}")

# WebSocket event handler triggered when a client establishes connection
@socketio.on("connect")
def on_connect():
    # Log the connection with the client's unique socket ID
    print(f"🔗 Client connected: {request.sid}")

# WebSocket event handler triggered when a client disconnects
@socketio.on("disconnect")
def on_disconnect():
    # Get the disconnected client's info before removal
    client_info = clients.get(request.sid)
    # Remove the disconnected client from the clients dictionary
    # Using pop with None as default to avoid KeyError if client not found
    clients.pop(request.sid, None)
    
    # Remove from username mapping if exists
    if client_info and client_info.get("name"):
        username = client_info["name"]
        username_to_sid.pop(username, None)
        # Notify all other clients about the disconnection
        emit("user_disconnected", username, broadcast=True, include_self=False)
    
    # Log the disconnection event
    print(f"❌ Client disconnected: {request.sid}")
    
    # Broadcast updated user list to all remaining clients
    broadcast_user_list()

# WebSocket event handler for receiving client's public key (ML-KEM-512 post-quantum key)
@socketio.on("pubkey")
def on_pubkey(data):
    # Log receipt of public key with client identification
    print(f"📡 Received pubkey from {request.sid}, name: {data.get('name')}")
    print(f"   Pubkey length: {len(data.get('pubkey', ''))} characters")
    
    # Update or create client entry with public key
    if request.sid in clients:
        clients[request.sid]["pubkey"] = data.get("pubkey")
        print(f"   ✅ Updated existing client {clients[request.sid]['name']} with pubkey")
    else:
        clients[request.sid] = {"name": data.get("name"), "pubkey": data.get("pubkey")}
        username_to_sid[data.get("name")] = request.sid
        print(f"   ✅ Created new client entry for {data.get('name')} with pubkey")
    
    print(f"   Current clients: {list(clients.keys())}")
    print(f"   Clients with pubkeys: {[sid for sid, c in clients.items() if c.get('pubkey')]}")
    
    # Broadcast updated user list since this user now has a pubkey
    broadcast_user_list()
    
    # Create a dictionary of all other connected clients' public keys (excluding current client)
    # This allows the new client to initiate key exchange with existing peers
    peer_pubkeys = {sid: c["pubkey"] for sid, c in clients.items() if sid != request.sid and c.get("pubkey")}
    # Log the peer public keys being sent
    print(f"📤 Sending peer_pubkeys to {request.sid}: {peer_pubkeys.keys()}")
    # Send the peer public keys only to the requesting client
    emit("peer_pubkeys", peer_pubkeys, to=request.sid)

# WebSocket event handler for forwarding KEM (Key Encapsulation Mechanism) ciphertext
# This is part of the post-quantum key exchange protocol
@socketio.on("send_kem_ciphertext")
def on_send_kem_ciphertext(data):
    # Extract the target client's socket ID from the message
    target_sid = data.get("to")
    # Get sender's username
    sender_name = clients.get(request.sid, {}).get("name", request.sid)
    # Log the KEM ciphertext relay operation
    print(f"🔐 KEM ciphertext from {sender_name} (SID: {request.sid}) to {target_sid}")
    # Check if the target client is currently connected
    if target_sid in clients:
        # Forward the encapsulated key (ciphertext) to the target client
        # Include sender's username so receiver knows who to establish connection with
        emit("recv_kem_ciphertext", {"from": sender_name, "ciphertext": data.get("ciphertext")}, to=target_sid)
        print(f"   ✅ KEM ciphertext forwarded to {clients.get(target_sid, {}).get('name', target_sid)}")
    else:
        # Log warning if target client is not found (disconnected or invalid ID)
        print(f"⚠️ Target SID {target_sid} not found!")

# WebSocket event handler for forwarding encrypted messages between clients
@socketio.on("send_message")
def on_send_message(data):
    # Extract the target client's socket ID
    target_sid = data.get("to")
    # Get sender's username for logging and forwarding
    sender_name = clients.get(request.sid, {}).get("name", request.sid)
    target_name = clients.get(target_sid, {}).get("name", target_sid)
    # Log the message relay operation
    print(f"✉️ Message from {sender_name} to {target_name}")
    print(f"   Sender SID: {request.sid}, Target SID: {target_sid}")
    # Verify the target client is connected
    if target_sid in clients:
        # Forward the AES-GCM encrypted message to the target client
        # Include sender's username so receiver can properly route the message
        emit("recv_message", {"from": sender_name, "base64Message": data.get("base64Message")}, to=target_sid)
        print(f"   ✅ Message forwarded successfully")
    else:
        # Log warning if target is unavailable
        print(f"⚠️ Target SID {target_sid} not found!")
        print(f"   Available SIDs: {list(clients.keys())}")

# Main entry point - only runs when script is executed directly (not imported)
if __name__ == "__main__":
    print("Starting server on 0.0.0.0:5001 with HTTPS")
    # Import SSL and certificate generation libraries
    # HTTPS is required for Web Crypto API to work in browsers
    import ssl
    from OpenSSL import crypto
    import os
    
    # Define file paths for SSL certificate and private key
    # These will be used to enable HTTPS on the Flask server
    cert_file = 'cert.pem'
    key_file = 'key.pem'
    
    # Check if certificate files already exist to avoid regenerating
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print("Generating self-signed certificate...")
        # Create a new RSA key pair (2048-bit) for the certificate
        k = crypto.PKey()
        k.generate_key(crypto.TYPE_RSA, 2048)
        
        # Create a new X.509 certificate object
        cert = crypto.X509()
        # Set certificate subject fields (organization information)
        cert.get_subject().C = "US"  # Country
        cert.get_subject().ST = "State"  # State/Province
        cert.get_subject().L = "City"  # Locality/City
        cert.get_subject().O = "Organization"  # Organization name
        cert.get_subject().OU = "Organizational Unit"  # Department
        cert.get_subject().CN = "localhost"  # Common Name (domain)
        # Set unique serial number for the certificate
        cert.set_serial_number(1000)
        # Set certificate validity period: valid from now
        cert.gmtime_adj_notBefore(0)
        # Set certificate expiration: valid for 1 year (31536000 seconds)
        cert.gmtime_adj_notAfter(31536000)  # Valid for 1 year
        # Self-signed: issuer is the same as subject
        cert.set_issuer(cert.get_subject())
        # Attach the public key to the certificate
        cert.set_pubkey(k)
        # Sign the certificate with the private key using SHA-256
        cert.sign(k, 'sha256')
        
        # Write the certificate and private key to PEM files
        # PEM (Privacy Enhanced Mail) is a base64 encoded format
        with open(cert_file, "wb") as f:
            # Convert certificate to PEM format and write to file
            f.write(crypto.dump_certificate(crypto.FILETYPE_PEM, cert))
        with open(key_file, "wb") as f:
            # Convert private key to PEM format and write to file
            f.write(crypto.dump_privatekey(crypto.FILETYPE_PEM, k))
        print("Certificate generated!")
    
    # Start the Flask-SocketIO server with SSL/TLS enabled
    # host="0.0.0.0" allows connections from any network interface
    # port=5001 is the listening port
    # debug=True enables auto-reload and detailed error messages
    # certfile and keyfile enable HTTPS (required for Web Crypto API)
    print("https://127.0.0.1:5001")
    socketio.run(app, host="0.0.0.0", port=5001, debug=True, 
                 certfile=cert_file, keyfile=key_file)
    

