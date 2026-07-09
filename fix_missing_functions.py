
import os

# The code to insert
CODE_TO_INSERT = """,
        showNotification(message, type = 'success') {
            const notification = document.createElement('div');
            notification.className = `fixed top-4 right-4 z-[100000] px-6 py-4 rounded-xl shadow-2xl transition-all duration-300 transform translate-x-full ${type === 'success' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`;
            notification.textContent = message;
            document.body.appendChild(notification);
            
            setTimeout(() => {
                notification.classList.remove('translate-x-full');
                notification.classList.add('translate-x-0');
            }, 10);
            
            setTimeout(() => {
                notification.classList.remove('translate-x-0');
                notification.classList.add('translate-x-full');
                setTimeout(() => notification.remove(), 300);
            }, 5000);
        },
        getInitials(user) {
            if (!user) return 'UN';
            const first = user.firstName ? user.firstName.charAt(0).toUpperCase() : 'U';
            const last = user.lastName ? user.lastName.charAt(0).toUpperCase() : 'N';
            return first + last;
        },
        realtimeUnsubscribe: null,
        fetchUser(userId) {
            // Unsubscribe from previous listener if any
            if (this.realtimeUnsubscribe) {
                this.realtimeUnsubscribe();
            }
            // Set up realtime listener
            this.realtimeUnsubscribe = db.collection('users').doc(userId).onSnapshot(
                (doc) => {
                    if (doc.exists) {
                        this.user = { id: doc.id, ...doc.data() };
                    }
                },
                (err) => {
                    console.error('Error fetching user:', err);
                }
            );
        },
        async signOutUser() {
            try {
                await auth.signOut();
                window.location.href = 'index.html';
            } catch (err) {
                console.error('Error signing out:', err);
                this.showNotification('Failed to sign out', 'error');
            }
        }
"""

files_to_process = [
    'dashboard-cards.html',
    'dashboard-currency-swap.html',
    'dashboard-deposit.html',
    'dashboard-grants.html',
    'dashboard-international-transfer.html',
    'dashboard-paybills.html',
    'dashboard-settings.html',
    'dashboard-support.html',
    'dashboard-transactions.html',
]

def process_file(file_path):
    with open(file_path, 'r', encoding='utf-8') as f:
        content = f.read()

    # Exact pattern to match
    pattern = """        initDarkMode() {
            if (this.darkMode) {
                document.documentElement.classList.add('dark');
            } else {
                document.documentElement.classList.remove('dark');
            }
        }"""

    if pattern in content:
        updated_content = content.replace(pattern, pattern + CODE_TO_INSERT)
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(updated_content)
        print(f"Updated {file_path}")
        return True
    else:
        print(f"Pattern not found in {file_path}")
        return False

def main():
    count = 0
    for filename in files_to_process:
        if os.path.exists(filename):
            if process_file(filename):
                count +=1
    print(f"Processed {count} files")

if __name__ == '__main__':
    main()
