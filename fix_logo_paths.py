
import os

files_to_process = [
    "dashboard-local-transfer.html",
    "dashboard-cards.html",
    "dashboard-currency-swap.html",
    "dashboard-deposit.html",
    "dashboard-grants.html",
    "dashboard-international-transfer.html",
    "dashboard-paybills.html",
    "dashboard-settings.html",
    "dashboard-support.html",
    "dashboard-transactions.html"
]

old_filename = "PixVerse_Image_Effect_prompt_create_a_logo_for.jpg"
new_filename = "PixVerse_Image_Effect_prompt_create a logo for.jpg"

for filename in files_to_process:
    if os.path.exists(filename):
        with open(filename, "r", encoding="utf-8") as f:
            content = f.read()
        
        updated_content = content.replace(old_filename, new_filename)
        
        if updated_content != content:
            with open(filename, "w", encoding="utf-8") as f:
                f.write(updated_content)
            print(f"Fixed logo path in {filename}")

print("Done!")
