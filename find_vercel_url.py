import json
import re

transcript_path = r"C:\Users\sahil\.gemini\antigravity\brain\9ff46cfa-1d43-4713-9181-18592dfc857e\.system_generated\logs\transcript.jsonl"

found_urls = set()
with open(transcript_path, "r", encoding="utf-8", errors="ignore") as f:
    for line in f:
        matches = re.findall(r'https?://[a-zA-Z0-9\.\-_]*vercel\.app[^\s\"\'\<\>]*', line)
        for m in matches:
            found_urls.add(m)

print("FOUND VERCEL URLS:")
for u in sorted(found_urls):
    print(" -", u)
