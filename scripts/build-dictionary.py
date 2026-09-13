"""Build the bundled dictionary from Kaikki/Wiktextract JSONL (Python 3.10+).

Usage: python scripts/build-dictionary.py es [path/to/snapshot.jsonl[.gz]]
Data is CC BY-SA 4.0. See public/dictionaries/NOTICE.txt.
"""
import gzip
import hashlib
import json
import pathlib
import re
import sys
import urllib.request

LANGUAGES = {"es": "Spanish", "fr": "French", "de": "German", "it": "Italian", "pt": "Portuguese"}
code = sys.argv[1] if len(sys.argv) > 1 else "es"
language = LANGUAGES[code]
url = f"https://kaikki.org/dictionary/{language}/kaikki.org-dictionary-{language}.jsonl"
output = pathlib.Path(__file__).resolve().parent.parent / "public" / "dictionaries"
output.mkdir(parents=True, exist_ok=True)
entries, forms = {}, {}
digest = hashlib.sha256()
if len(sys.argv) > 2:
    path = sys.argv[2]
    source = gzip.open(path, "rb") if path.endswith('.gz') else open(path, "rb")
else:
    request = urllib.request.Request(url, headers={"Accept-Encoding": "gzip", "User-Agent": "Glosswatch dictionary build"})
    response = urllib.request.urlopen(request, timeout=120)
    source = gzip.GzipFile(fileobj=response) if response.headers.get("Content-Encoding") == "gzip" else response

def key(value):
    return value.lower().strip().replace("’", "'")

with source:
    for count, line in enumerate(source, 1):
        digest.update(line)
        item = json.loads(line)
        word = key(item.get("word", ""))
        if not word or len(word) > 60 or item.get("pos") in ("name", "symbol", "character"):
            continue
        meanings = []
        for sense in item.get("senses", []):
            for form in sense.get("form_of", []):
                lemma = key(form.get("word", ""))
                if lemma and lemma != word:
                    forms.setdefault(word, lemma)
            if sense.get("form_of") or sense.get("alt_of"):
                continue
            for gloss in sense.get("glosses", []):
                if gloss and gloss not in meanings:
                    meanings.append(gloss[:400])
        if meanings:
            previous = entries.get(word)
            if previous:
                previous["meanings"] = list(dict.fromkeys(previous["meanings"] + meanings))[:5]
            else:
                entries[word] = {"word": word, "pos": item.get("pos", ""), "meanings": meanings[:5],
                                 "ipa": next((s["ipa"] for s in item.get("sounds", []) if "ipa" in s), "")}
            for form in item.get("forms", []):
                variant = key(form.get("form", ""))
                if variant and variant != word and len(variant) <= 60 and " " not in variant:
                    forms.setdefault(variant, word)
        if count % 100000 == 0:
            print(f"{language}: {count:,} records", flush=True)

# Only retain inflections which resolve to a definition. Resolve chained form-of records.
resolved = {}
for word, lemma in forms.items():
    seen = {word}
    while lemma not in entries and lemma in forms and lemma not in seen:
        seen.add(lemma)
        lemma = forms[lemma]
    if lemma in entries and word not in entries:
        resolved[word] = lemma
payload = {"language": code, "source": url, "sourceSha256": digest.hexdigest(), "license": "CC-BY-SA-4.0",
           "entries": entries, "forms": resolved}
data = json.dumps(payload, ensure_ascii=False, separators=(',', ':'), sort_keys=True).encode()
(output / f"{code}.json.gz").write_bytes(gzip.compress(data, mtime=0))
print(f"{language}: {len(entries):,} definitions; {len(resolved):,} inflections; {len(data):,} bytes before compression", flush=True)
