#!/usr/bin/env python3
import os
import zipfile

def package_extension():
    out_dir = "release"
    os.makedirs(out_dir, exist_ok=True)

    include_dirs = ["dist", "assets", "icons", "src"]
    include_files = ["manifest.json", "README.md", "package.json", "build.js"]

    for version in ["v1.3.1", "v1.3.0", "v1.2.2", "v1.2.1", "v1.2.0", "v1.1.0", "v1.0.3", "v1.0.2", "v1.0.1", "v1.0.0"]:
        zip_path = os.path.join(out_dir, f"downloadforge-pro-{version}.zip")
        if os.path.exists(zip_path):
            os.remove(zip_path)

        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
            for f in include_files:
                if os.path.exists(f):
                    z.write(f, f)
            for d in include_dirs:
                for root, _, files in os.walk(d):
                    for file in files:
                        full_path = os.path.join(root, file)
                        rel_path = os.path.relpath(full_path, ".")
                        z.write(full_path, rel_path)

        size_kb = os.path.getsize(zip_path) / 1024
        print(f"[Release] Created {zip_path} ({size_kb:.1f} KB)")

if __name__ == "__main__":
    package_extension()
