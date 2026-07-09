import os
import re

def update_file(file_path):
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            content = f.read()

        # Replace fetchUser in files with simple user
        # Look for:
        #        async fetchUser(userId) {
        #            try {
        #                const doc = await db.collection('users').doc(userId).get();
        #                if (doc.exists) {
        #                    this.user = { id: doc.id, ...doc.data() };
        #                }
        #            } catch (err) {
        #                console.error('Error fetching user:', err);
        #            }
        #        },
        pattern_simple = re.compile(
            r"""(\s*)async fetchUser\(userId\) \{
\s*try \{
\s*const doc = await db\.collection\('users'\)\.doc\(userId\)\.get\(\);
\s*if \(doc\.exists\) \{
\s*this\.user = \{ id: doc\.id, \.\.\.doc\.data\(\) \};
\s*\}
\s*\} catch \(err\) \{
\s*console\.error\('Error fetching user:', err\);
\s*\}
\s*\},""",
            re.DOTALL
        )

        replace_simple = r"""\1realtimeUnsubscribe: null,
\1async fetchUser(userId) {
\1    // Unsubscribe from previous listener if any
\1    if (this.realtimeUnsubscribe) {
\1        this.realtimeUnsubscribe();
\1    }
\1    // Set up realtime listener
\1    this.realtimeUnsubscribe = db.collection('users').doc(userId).onSnapshot(
\1        (doc) => {
\1            if (doc.exists) {
\1                this.user = { id: doc.id, ...doc.data() };
\1            }
\1        },
\1        (err) => {
\1            console.error('Error fetching user:', err);
\1        }
\1    );
\1},"""

        # Replace pattern for files with formData
        #        async fetchUser(userId) {
        #            try {
        #                const doc = await db.collection('users').doc(userId).get();
        #                if (doc.exists) {
        #                    this.user = { id: doc.id, ...doc.data() };
        #                    this.formData.firstName = this.user.firstName || '';
        #                    this.formData.lastName = this.user.lastName || '';
        #                    this.formData.email = this.user.email || '';
        #                    this.formData.phone = this.user.phone || '';
        #                    this.formData.country = this.user.country || '';
        #                }
        #            } catch (err) {
        #                console.error('Error fetching user:', err);
        #                this.showNotification('Failed to load user data', 'error');
        #            }
        #        },
        pattern_settings = re.compile(
            r"""(\s*)async fetchUser\(userId\) \{
\s*try \{
\s*const doc = await db\.collection\('users'\)\.doc\(userId\)\.get\(\);
\s*if \(doc\.exists\) \{
\s*this\.user = \{ id: doc\.id, \.\.\.doc\.data\(\) \};
\s*this\.formData\.firstName = this\.user\.firstName \|\| '';
\s*this\.formData\.lastName = this\.user\.lastName \|\| '';
\s*this\.formData\.email = this\.user\.email \|\| '';
\s*this\.formData\.phone = this\.user\.phone \|\| '';
\s*this\.formData\.country = this\.user\.country \|\| '';
\s*\}
\s*\} catch \(err\) \{
\s*console\.error\('Error fetching user:', err\);
\s*this\.showNotification\('Failed to load user data', 'error'\);
\s*\}
\s*\},""",
            re.DOTALL
        )

        replace_settings = r"""\1realtimeUnsubscribe: null,
\1async fetchUser(userId) {
\1    // Unsubscribe from previous listener if any
\1    if (this.realtimeUnsubscribe) {
\1        this.realtimeUnsubscribe();
\1    }
\1    // Set up realtime listener
\1    this.realtimeUnsubscribe = db.collection('users').doc(userId).onSnapshot(
\1        (doc) => {
\1            if (doc.exists) {
\1                this.user = { id: doc.id, ...doc.data() };
\1                this.formData.firstName = this.user.firstName || '';
\1                this.formData.lastName = this.user.lastName || '';
\1                this.formData.email = this.user.email || '';
\1                this.formData.phone = this.user.phone || '';
\1                this.formData.country = this.user.country || '';
\1            }
\1        },
\1        (err) => {
\1            console.error('Error fetching user:', err);
\1            this.showNotification('Failed to load user data', 'error');
\1        }
\1    );
\1},"""

        updated = False

        # First try to replace settings pattern
        if re.search(pattern_settings, content):
            content = re.sub(pattern_settings, replace_settings, content)
            updated = True
        # If not found, try simple pattern
        elif re.search(pattern_simple, content):
            content = re.sub(pattern_simple, replace_simple, content)
            updated = True

        if updated:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            print(f"Updated: {file_path}")
            return True
        else:
            print(f"No changes needed: {file_path}")
            return False

    except Exception as e:
        print(f"Error processing {file_path}: {e}")
        import traceback
        traceback.print_exc()
        return False


def main():
    files_to_update = [
        'dashboard.html',
        'dashboard-cards.html',
        'dashboard-currency-swap.html',
        'dashboard-deposit.html',
        'dashboard-grants.html',
        'dashboard-international-transfer.html',
        'dashboard-local-transfer.html',
        'dashboard-paybills.html',
        'dashboard-settings.html',
        'dashboard-support.html',
        'dashboard-transactions.html',
    ]

    count = 0
    for filename in files_to_update:
        if os.path.exists(filename):
            if update_file(filename):
                count += 1

    print(f"\nTotal files updated: {count}")


if __name__ == "__main__":
    main()
