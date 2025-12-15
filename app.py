# Import Flask framework for web server functionality
from flask import Flask, render_template, request
# Import SocketIO for real-time bidirectional communication between clients and server
from flask_socketio import SocketIO, emit
# Import group management classes
from group import Group, GroupManager

# Initialize Flask application instance
app = Flask(__name__)
# Set secret key for session management and security (should be changed in production)
app.config['SECRET_KEY'] = 'secret!'
# Initialize SocketIO with CORS enabled to allow connections from any origin
socketio = SocketIO(app, cors_allowed_origins="*", max_http_buffer_size=10**7)  # 10MB for images

# Dictionary to store connected clients' information
# Structure: {socket_id: {"name": username, "pubkey": base64_encoded_public_key}}
clients = {}  # sid -> {"name": name, "pubkey": None}

# Dictionary to map usernames to socket IDs for easy lookup
username_to_sid = {}  # username -> sid

# Initialize group manager
group_manager = GroupManager()

# Route handler for the root URL - serves the main chat interface
@app.route("/")
def index():
    # Render and return the chat.html template to the client
    return render_template("chat.html")

# Route handler for brute force attack demonstration
@app.route("/brute-force")
def brute_force_demo():
    # Render and return the brute force demonstration page
    return render_template("brute_force.html")

# Route handler for nonce collision demonstration
@app.route("/nonce-demo")
def nonce_demo():
    # Render and return the nonce collision demonstration page
    return render_template("nonce_demo.html")

# Helper function to broadcast the current user list to all connected clients
def broadcast_user_list():
    """send updated user list (username -> socket_id mapping) to all clients"""
    user_map = {clients[sid]["name"]: sid for sid in clients if clients[sid].get("name")}
    emit("user_list", user_map, broadcast=True)
    print(f"broadcasting user list: {list(user_map.keys())}")

# WebSocket event handler for user registration
@socketio.on("register_user")
def on_register_user(data):
    """register a user with their chosen username"""
    username = data.get("name")
    if not username:
        print(f"registration failed: no username provided from {request.sid}")
        return
    
    # check if username is already taken
    if username in username_to_sid and username_to_sid[username] != request.sid:
        emit("registration_error", {"message": "Username already taken"}, to=request.sid)
        print(f"username '{username}' already taken")
        return
    
    # register the user
    clients[request.sid] = {"name": username, "pubkey": None}
    username_to_sid[username] = request.sid
    print(f"user registered: {username} (sid: {request.sid})")
    
    # confirm registration to the client
    emit("registration_confirmed", {"username": username}, to=request.sid)
    
    # broadcast updated user list to all clients
    broadcast_user_list()

# WebSocket event handler for requesting another user's public key
@socketio.on("request_pubkey")
def on_request_pubkey(data):
    """handle request for a specific user's public key"""
    target_username = data.get("username")
    print(f"pubkey request: {clients.get(request.sid, {}).get('name', 'unknown')} wants {target_username}'s pubkey")
    target_sid = username_to_sid.get(target_username)
    
    if not target_sid or target_sid not in clients:
        print(f"pubkey request failed: {target_username} not found")
        print(f"   available users: {list(username_to_sid.keys())}")
        emit("pubkey_error", {"message": f"User {target_username} not found"}, to=request.sid)
        return
    
    target_pubkey = clients[target_sid].get("pubkey")
    if not target_pubkey:
        print(f"pubkey request failed: {target_username} has no pubkey yet")
        print(f"   target sid: {target_sid}")
        print(f"   target client data: {clients[target_sid]}")
        emit("pubkey_error", {"message": f"User {target_username} has no public key"}, to=request.sid)
        return
    
    # send the requested public key back to the requester
    print(f"sending {target_username}'s pubkey (length: {len(target_pubkey)}) to requester")
    emit("pubkey_response", {"username": target_username, "pubkeyB64": target_pubkey}, to=request.sid)
    print(f"sent {target_username}'s pubkey to {request.sid}")

# WebSocket event handler triggered when a client establishes connection
@socketio.on("connect")
def on_connect():
    # log the connection with the client's unique socket id
    print(f"client connected: {request.sid}")

# WebSocket event handler triggered when a client disconnects
@socketio.on("disconnect")
def on_disconnect():
    # get the disconnected client's info before removal
    client_info = clients.get(request.sid)
    # remove the disconnected client from the clients dictionary
    # using pop with none as default to avoid keyerror if client not found
    clients.pop(request.sid, None)
    
    # remove from username mapping if exists
    if client_info and client_info.get("name"):
        username = client_info["name"]
        username_to_sid.pop(username, None)
        # notify all other clients about the disconnection
        emit("user_disconnected", username, broadcast=True, include_self=False)
    
    # log the disconnection event
    print(f"client disconnected: {request.sid}")
    
    # broadcast updated user list to all remaining clients
    broadcast_user_list()

# WebSocket event handler for receiving client's public key (ML-KEM-512 post-quantum key)
@socketio.on("pubkey")
def on_pubkey(data):
    # log receipt of public key with client identification
    print(f"received pubkey from {request.sid}, name: {data.get('name')}")
    print(f"   pubkey length: {len(data.get('pubkey', ''))} characters")
    
    # update or create client entry with public key
    if request.sid in clients:
        clients[request.sid]["pubkey"] = data.get("pubkey")
        print(f"   updated existing client {clients[request.sid]['name']} with pubkey")
    else:
        clients[request.sid] = {"name": data.get("name"), "pubkey": data.get("pubkey")}
        username_to_sid[data.get("name")] = request.sid
        print(f"   created new client entry for {data.get('name')} with pubkey")
    
    print(f"   current clients: {list(clients.keys())}")
    print(f"   clients with pubkeys: {[sid for sid, c in clients.items() if c.get('pubkey')]}")
    
    # broadcast updated user list since this user now has a pubkey
    broadcast_user_list()
    
    # create a dictionary of all other connected clients' public keys (excluding current client)
    # this allows the new client to initiate key exchange with existing peers
    peer_pubkeys = {sid: c["pubkey"] for sid, c in clients.items() if sid != request.sid and c.get("pubkey")}
    # log the peer public keys being sent
    print(f"sending peer_pubkeys to {request.sid}: {peer_pubkeys.keys()}")
    # send the peer public keys only to the requesting client
    emit("peer_pubkeys", peer_pubkeys, to=request.sid)

# WebSocket event handler for forwarding KEM (Key Encapsulation Mechanism) ciphertext
# This is part of the post-quantum key exchange protocol
@socketio.on("send_kem_ciphertext")
def on_send_kem_ciphertext(data):
    # extract the target client's socket id from the message
    target_sid = data.get("to")
    # get sender's username
    sender_name = clients.get(request.sid, {}).get("name", request.sid)
    # log the kem ciphertext relay operation
    print(f"kem ciphertext from {sender_name} (sid: {request.sid}) to {target_sid}")
    # check if the target client is currently connected
    if target_sid in clients:
        # forward the encapsulated key (ciphertext) to the target client
        # include sender's username so receiver knows who to establish connection with
        emit("recv_kem_ciphertext", {"from": sender_name, "ciphertext": data.get("ciphertext")}, to=target_sid)
        print(f"   kem ciphertext forwarded to {clients.get(target_sid, {}).get('name', target_sid)}")
    else:
        # log warning if target client is not found (disconnected or invalid id)
        print(f"target sid {target_sid} not found!")

# WebSocket event handler for forwarding encrypted messages between clients
@socketio.on("send_message")
def on_send_message(data):
    # extract the target client's socket id
    target_sid = data.get("to")
    # get sender's username for logging and forwarding
    sender_name = clients.get(request.sid, {}).get("name", request.sid)
    target_name = clients.get(target_sid, {}).get("name", target_sid)
    # log the message relay operation
    print(f"message from {sender_name} to {target_name}")
    print(f"   sender sid: {request.sid}, target sid: {target_sid}")
    # verify the target client is connected
    if target_sid in clients:
        # forward the aes-gcm encrypted message to the target client
        # include sender's username so receiver can properly route the message
        emit("recv_message", {"from": sender_name, "base64Message": data.get("base64Message")}, to=target_sid)
        print(f"   message forwarded successfully")
    else:
        # log warning if target is unavailable
        print(f"target sid {target_sid} not found!")
        print(f"   available sids: {list(clients.keys())}")

# WebSocket event handler for creating a group chat
@socketio.on("create_group")
def on_create_group(data):
    """
    Handle group creation request from admin.
    Admin must ensure they have public keys of all members before creating group.
    """
    group_name = data.get("name")
    member_names = data.get("members", [])  # List of usernames
    admin_name = clients.get(request.sid, {}).get("name")
    
    if not admin_name:
        emit("group_error", {"message": "You must be registered to create a group"}, to=request.sid)
        return
    
    if not group_name or not member_names:
        emit("group_error", {"message": "Group name and members required"}, to=request.sid)
        return
    
    # Verify all members exist
    missing_members = [m for m in member_names if m not in username_to_sid]
    if missing_members:
        emit("group_error", {"message": f"Members not found: {', '.join(missing_members)}"}, to=request.sid)
        return
    
    # create the group
    group = group_manager.create_group(group_name, admin_name, member_names)
    print(f"group created: {group_name} (id: {group.group_id}) by {admin_name}")
    print(f"   members: {group.get_members()}")
    
    # send group info to admin with group id
    emit("group_created", {
        "group_id": group.group_id,
        "name": group.name,
        "admin": admin_name,
        "members": group.get_members()
    }, to=request.sid)
    
    # Notify all members about the new group
    for member_name in group.get_members():
        if member_name != admin_name:  # Admin already knows
            member_sid = username_to_sid.get(member_name)
            if member_sid:
                emit("group_invitation", {
                    "group_id": group.group_id,
                    "name": group.name,
                    "admin": admin_name,
                    "members": group.get_members()
                }, to=member_sid)

# WebSocket event handler for distributing group encryption key
@socketio.on("distribute_group_key")
def on_distribute_group_key(data):
    """
    Admin distributes the AES-256 group key encrypted with each member's public key.
    data: {
        "group_id": str,
        "encrypted_keys": {username: base64_encrypted_key, ...}
    }
    """
    group_id = data.get("group_id")
    encrypted_keys = data.get("encrypted_keys", {})
    admin_name = clients.get(request.sid, {}).get("name")
    
    group = group_manager.get_group(group_id)
    if not group:
        emit("group_error", {"message": "Group not found"}, to=request.sid)
        return
    
    if not group.is_admin(admin_name):
        emit("group_error", {"message": "Only admin can distribute keys"}, to=request.sid)
        return
    
    print(f"distributing group keys for {group.name}")
    
    # send encrypted key to each member
    for member_name, encrypted_key in encrypted_keys.items():
        if member_name in group.get_members():
            member_sid = username_to_sid.get(member_name)
            if member_sid:
                emit("group_key", {
                    "group_id": group_id,
                    "group_name": group.name,
                    "encrypted_key": encrypted_key
                }, to=member_sid)
                print(f"   key sent to {member_name}")

# WebSocket event handler for sending group messages
@socketio.on("send_group_message")
def on_send_group_message(data):
    """
    Forward encrypted group message to all members.
    Message is encrypted with the shared group key.
    """
    group_id = data.get("group_id")
    encrypted_message = data.get("encrypted_message")
    sender_name = clients.get(request.sid, {}).get("name")
    
    group = group_manager.get_group(group_id)
    if not group:
        emit("group_error", {"message": "Group not found"}, to=request.sid)
        return
    
    if not group.is_member(sender_name):
        emit("group_error", {"message": "You are not a member of this group"}, to=request.sid)
        return
    
    print(f"group message from {sender_name} to {group.name}")
    
    # store message in group history
    group.add_message({
        "sender": sender_name,
        "encrypted_message": encrypted_message,
        "timestamp": __import__('time').time()
    })
    
    # forward to all members except sender
    for member_name in group.get_members():
        member_sid = username_to_sid.get(member_name)
        if member_sid and member_sid != request.sid:  # Don't send back to sender
            emit("recv_group_message", {
                "group_id": group_id,
                "group_name": group.name,
                "sender": sender_name,
                "encrypted_message": encrypted_message
            }, to=member_sid)

# WebSocket event handler for getting user's groups
@socketio.on("get_my_groups")
def on_get_my_groups():
    """Return all groups the user is a member of"""
    username = clients.get(request.sid, {}).get("name")
    if not username:
        return
    
    user_groups = group_manager.get_user_groups(username)
    groups_data = [g.to_dict() for g in user_groups]
    
    emit("my_groups", {"groups": groups_data}, to=request.sid)

# Main entry point - only runs when script is executed directly (not imported)
if __name__ == "__main__":
    print("starting server on 0.0.0.0:5001 with https")
    # import ssl and certificate generation libraries
    # https is required for web crypto api to work in browsers
    import ssl
    from OpenSSL import crypto
    import os
    
    # Define file paths for SSL certificate and private key
    # These will be used to enable HTTPS on the Flask server
    cert_file = 'cert.pem'
    key_file = 'key.pem'
    
    # check if certificate files already exist to avoid regenerating
    if not os.path.exists(cert_file) or not os.path.exists(key_file):
        print("generating self-signed certificate...")
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
        print("certificate generated!")
    
    # start the flask-socketio server with ssl/tls enabled
    # host="0.0.0.0" allows connections from any network interface
    # port=5001 is the listening port
    # debug=True enables auto-reload and detailed error messages
    # certfile and keyfile enable HTTPS (required for Web Crypto API)
    
    # Get and display local IPv4 address
    import socket
    try:
        s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
        s.connect(("8.8.8.8", 80))
        local_ip = s.getsockname()[0]
        s.close()
        print(f"\n{'='*60}")
        print("server is running and accessible at:")
        print(f"   local:   https://127.0.0.1:5001")
        print(f"   network: https://{local_ip}:5001")
        print(f"{'='*60}\n")
        print("security demonstrations available:")
        print(f"   brute force attack:  https://127.0.0.1:5001/brute-force")
        print(f"   nonce collision:     https://127.0.0.1:5001/nonce-demo")
        print(f"{'='*60}\n")
        print("note: you'll need to accept the self-signed certificate")
        print("    in your browser when connecting.\n")
    except:
        print("https://127.0.0.1:5001")
    
    socketio.run(app, host="0.0.0.0", port=5001, debug=True, 
                 certfile=cert_file, keyfile=key_file)
    

