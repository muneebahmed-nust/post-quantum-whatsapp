from time import time
from typing import List, Dict
import hashlib

class Group():
    """
    Represents a group chat with members, messages, and admin.
    """
    
    def __init__(self, name: str, admin_name: str, member_names: List[str]):
        self.name = name
        self.admin_name = admin_name
        self.members: List[str] = member_names if member_names else []
        
        # Ensure admin is in members list
        if self.admin_name not in self.members:
            self.members.append(self.admin_name)
        
        self.group_id = self.make_unique_id(name)
        self.messages: List[Dict] = []  # Store message objects with metadata
        self.created_at = time()

    def make_unique_id(self, name: str) -> str:
        """
        Returns a unique ID for the group based on the group name, admin name and current time
        """
        unique_string = name + self.admin_name + str(time())
        return hashlib.sha256(unique_string.encode()).hexdigest()[:16]  # Shorter ID
    
    def add_message(self, message: Dict):
        """Add a message to the group's message history"""
        self.messages.append(message)

    def add_member(self, member_name: str):
        """Add a new member to the group"""
        if member_name not in self.members:
            self.members.append(member_name)
            return True
        return False
    
    def remove_member(self, member_name: str) -> bool:
        """Remove a member from the group (admin cannot be removed)"""
        if member_name == self.admin_name:
            return False
        if member_name in self.members:
            self.members.remove(member_name)
            return True
        return False
    
    def get_messages(self) -> List[Dict]:
        """Get all messages in the group"""
        return self.messages

    def get_members(self) -> List[str]:
        """Get list of all member usernames"""
        return self.members
    
    def get_group_id(self) -> str:
        """Get the unique group ID"""
        return self.group_id
    
    def is_member(self, username: str) -> bool:
        """Check if a user is a member of this group"""
        return username in self.members
    
    def is_admin(self, username: str) -> bool:
        """Check if a user is the admin of this group"""
        return username == self.admin_name
    
    def to_dict(self) -> Dict:
        """Convert group to dictionary for JSON serialization"""
        return {
            "group_id": self.group_id,
            "name": self.name,
            "admin": self.admin_name,
            "members": self.members,
            "created_at": self.created_at
        }


class GroupManager():
    """
    Manages multiple groups and handles expiration cleanup.
    """
    
    def __init__(self, expiration_time: int = 86400):  # 24 hours default
        self.groups: Dict[str, Group] = {}
        self.expiration_time = expiration_time  # Time in seconds before group expires
    
    def create_group(self, name: str, admin_name: str, member_names: List[str]) -> Group:
        """Create a new group and return it"""
        group = Group(name, admin_name, member_names)
        self.groups[group.group_id] = group
        return group
    
    def get_group(self, group_id: str) -> Group:
        """Get a group by its ID"""
        return self.groups.get(group_id)
    
    def delete_group(self, group_id: str) -> bool:
        """Delete a group by its ID"""
        if group_id in self.groups:
            del self.groups[group_id]
            return True
        return False
    
    def get_user_groups(self, username: str) -> List[Group]:
        """Get all groups a user is a member of"""
        return [group for group in self.groups.values() if group.is_member(username)]
    
    def cleanup_expired_groups(self):
        """Remove groups that have expired based on creation time"""
        current_time = time()
        expired_groups = [
            group_id for group_id, group in self.groups.items()
            if current_time - group.created_at > self.expiration_time
        ]
        for group_id in expired_groups:
            del self.groups[group_id]
        return len(expired_groups)