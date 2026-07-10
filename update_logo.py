
import os
import glob

# Get all HTML files in the directory
html_files = glob.glob("*.html")

old_paths = [
    "images/PixVerse_Image_Effect_prompt_create a logo for.jpg",
    "images/PixVerse_Image_Effect_prompt_create_a_logo_for.jpg"
]
new_path = "images/logo.jpg"

for filename in html_files:
    if os.path.exists(filename):
        with open(filename, "r", encoding="utf-8") as f:
            content = f.read()
        
        updated_content = content
        for old_path in old_paths:
            updated_content = updated_content.replace(old_path, new_path)
        
        if updated_content != content:
            with open(filename, "w", encoding="utf-8") as f:
                f.write(updated_content)
            print(f"Updated logo path in {filename}")

print("All files updated!")

