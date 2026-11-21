#!/usr/bin/env python3
"""Adds the 'Cross references' link to the existing pages. Run once from the project root:
     python3 tools/add_crossrefs_page.py
Safe to run again (it skips what is already done)."""
import json, re, sys, os
LINK = '<a href="cross-references.html" data-plan="refs">Cross references</a>'
for fn in ("index.html", "two-years.html", "three-years.html"):
    if not os.path.exists(fn): print("missing", fn); continue
    s = open(fn, encoding="utf-8").read()
    if "cross-references.html" in s: print(fn, ": already has the link"); continue
    m = re.search(r'(<a href="three-years\.html"[^>]*>.*?</a>)', s, re.S)
    if not m: print(fn, ": could not find the nav - add this line inside <nav id=\"plan-nav\"> yourself:\n   ", LINK); continue
    indent = re.search(r'([ \t]*)<a href="three-years\.html"', s).group(1)
    s = s[:m.end()] + "\n" + indent + LINK + s[m.end():]
    open(fn, "w", encoding="utf-8").write(s); print(fn, ": link added")
bible = json.load(open("data/bible.json", encoding="utf-8"))
rui = json.load(open("data/refs-ui.json", encoding="utf-8"))
changed = False
for code, lang in bible["langs"].items():
    if code in rui and "planrefs" not in lang["ui"]:
        lang["ui"]["planrefs"] = rui[code]["nav"]; changed = True
if changed:
    json.dump(bible, open("data/bible.json", "w", encoding="utf-8"), ensure_ascii=False, separators=(",", ":"))
    print("data/bible.json: added 'planrefs' texts")
css = open("assets/styles.css", encoding="utf-8").read()
if "cross references nav" not in css:
    open("assets/styles.css", "a", encoding="utf-8").write("\n/* cross references nav */\n.plan-nav{flex-wrap:wrap}\n"); print("assets/styles.css: nav can wrap")
