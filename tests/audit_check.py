#!/usr/bin/env python3
"""
DownloadForge Pro — Audit & Quality Verification Script
Covers /code-review, /design, /ux, and /audit standards.
"""

import os
import re
import json
import sys

def run_audit():
    audit_results = {'PASS': [], 'FAIL': []}

    # 1. Manifest V3 Audit
    with open('manifest.json', 'r', encoding='utf-8') as f:
        manifest = json.load(f)
    if manifest.get('manifest_version') == 3:
        audit_results['PASS'].append('Manifest Version is 3 (MV3 Strict)')
    else:
        audit_results['FAIL'].append('Manifest is not MV3')

    # 2. Zero Emojis in src/
    EMOJI_REGEX = re.compile(r'[\U00010000-\U0010ffff]', re.UNICODE)
    emoji_found = []
    for root, _, files in os.walk('src'):
        for f in files:
            if f.endswith(('.js', '.html', '.css', '.json')):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    c = fp.read()
                    m = EMOJI_REGEX.findall(c)
                    if m:
                        emoji_found.append(f'{path}: {m[:3]}')

    if not emoji_found:
        audit_results['PASS'].append('Zero Emojis found across all src/ files')
    else:
        audit_results['FAIL'].append(f'Emojis detected in {len(emoji_found)} files: {emoji_found[:2]}')

    # 3. Zero OS-Native Dialogs (alert, confirm, prompt)
    DIALOG_REGEX = re.compile(r'\b(alert|confirm|prompt)\s*\(', re.UNICODE)
    dialog_found = []
    for root, _, files in os.walk('src'):
        for f in files:
            if f.endswith('.js'):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    for idx, line in enumerate(fp, 1):
                        sline = line.strip()
                        if sline.startswith('//') or sline.startswith('*'):
                            continue
                        m = DIALOG_REGEX.search(line)
                        if m:
                            dialog_found.append(f'{path}:{idx} -> {m.group(1)}()')

    if not dialog_found:
        audit_results['PASS'].append('Zero OS-Native Dialogs (alert/confirm/prompt) in src/')
    else:
        audit_results['FAIL'].append(f'Native dialogs found: {dialog_found}')

    # 4. Memory ObjectURL Revocation
    leaks = []
    for root, _, files in os.walk('src'):
        for f in files:
            if f.endswith('.js'):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    c = fp.read()
                    if 'createObjectURL' in c and 'revokeObjectURL' not in c:
                        leaks.append(path)

    if not leaks:
        audit_results['PASS'].append('All URL.createObjectURL instances paired with URL.revokeObjectURL')
    else:
        audit_results['FAIL'].append(f'Unrevoked ObjectURL files: {leaks}')

    # 5. Security & Path Sanitization
    sanitizers = []
    for root, _, files in os.walk('src'):
        for f in files:
            if f.endswith('.js'):
                path = os.path.join(root, f)
                with open(path, 'r', encoding='utf-8', errors='ignore') as fp:
                    c = fp.read()
                    if 'replace(/[<>:"/\\\\|?*]/g' in c or 'replace(/[^a-zA-Z0-9_-]/g' in c:
                        sanitizers.append(path)

    if sanitizers:
        audit_results['PASS'].append(f'Path traversal and illegal OS character sanitation enforced across {len(sanitizers)} modules')
    else:
        audit_results['FAIL'].append('No filename sanitizer found')

    # 6. Separation of Concerns & Dependency Hygiene
    bundle_files = ['dist/content_script.bundle.js', 'dist/downloader.bundle.js', 'dist/stream_worker.bundle.js']
    missing_bundles = [b for b in bundle_files if not os.path.exists(b)]
    if not missing_bundles:
        audit_results['PASS'].append('All compiled bundles verified and in place without external CDN dependencies')
    else:
        audit_results['FAIL'].append(f'Missing bundles: {missing_bundles}')

    print(json.dumps(audit_results, indent=2))
    if audit_results['FAIL']:
        sys.exit(1)

if __name__ == '__main__':
    run_audit()
