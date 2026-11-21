#!/usr/bin/env python3
"""
Collect Bible cross references (marginal references, marked with "+") from the
Watchtower ONLINE LIBRARY (WOL) into data/crossrefs.json.

Run from the project root (the folder that contains data/bible.json).

  python3 tools/scrape_crossrefs.py selftest
  python3 tools/scrape_crossrefs.py probe  --bible nwtsty
  python3 tools/scrape_crossrefs.py scrape --bible nwtsty --bible nwt
  python3 tools/scrape_crossrefs.py scrape --bible nwtsty --books 1-3,43 --overwrite
  python3 tools/scrape_crossrefs.py normalize

Output format (flat JSON, one verse per line):
  "1:1:1": ["19:102:25", "23:42:5", "45:1:20", "19:104:6-9", ...]
  keys/values are "book:chapter:verse"; a range is "book:chapter:v1-v2"
  (or "book:chapter:v1-chapter2:v2" across chapters). Book numbers are 1-66.

Only the Python standard library is used.
"""
import argparse, json, os, re, sys, time, urllib.request, urllib.error
from html.parser import HTMLParser

# --------------------------------------------------------------------------
# Book names / abbreviations (English). Cross references are the same in every
# language of an edition, so scraping the English pages is enough.
# --------------------------------------------------------------------------
NAMES = ["Genesis","Exodus","Leviticus","Numbers","Deuteronomy","Joshua","Judges","Ruth","1 Samuel","2 Samuel","1 Kings","2 Kings","1 Chronicles","2 Chronicles","Ezra","Nehemiah","Esther","Job","Psalms","Proverbs","Ecclesiastes","Song of Solomon","Isaiah","Jeremiah","Lamentations","Ezekiel","Daniel","Hosea","Joel","Amos","Obadiah","Jonah","Micah","Nahum","Habakkuk","Zephaniah","Haggai","Zechariah","Malachi","Matthew","Mark","Luke","John","Acts","Romans","1 Corinthians","2 Corinthians","Galatians","Ephesians","Philippians","Colossians","1 Thessalonians","2 Thessalonians","1 Timothy","2 Timothy","Titus","Philemon","Hebrews","James","1 Peter","2 Peter","1 John","2 John","3 John","Jude","Revelation"]
NWT_ABBR = "Ge Ex Le Nu De Jos Jg Ru 1Sa 2Sa 1Ki 2Ki 1Ch 2Ch Ezr Ne Es Job Ps Pr Ec Ca Isa Jer La Eze Da Ho Joe Am Ob Jon Mic Na Hab Zep Hag Zec Mal Mt Mr Lu Joh Ac Ro 1Co 2Co Ga Eph Php Col 1Th 2Th 1Ti 2Ti Tit Phm Heb Jas 1Pe 2Pe 1Jo 2Jo 3Jo Jude Re".split()
EXTRA_ABBR = {  # other common spellings
 "gen":1,"exo":2,"exod":2,"lev":3,"num":4,"deut":5,"josh":6,"judg":7,"1sam":9,"2sam":10,"1kgs":11,"2kgs":12,
 "1chr":13,"2chr":14,"neh":16,"esth":17,"psa":19,"psalm":19,"prov":20,"eccl":21,"eccles":21,"song":22,"sos":22,"songofsongs":22,
 "canticles":22,"isa":23,"lam":25,"ezek":26,"dan":27,"hos":28,"obad":31,"jonah":32,"mic":33,"nah":34,"zeph":36,"zech":38,
 "matt":40,"mk":41,"lk":42,"jn":43,"rom":45,"1cor":46,"2cor":47,"gal":48,"phil":50,"philem":57,"1thess":52,"2thess":53,
 "1tim":54,"2tim":55,"jas":59,"jam":59,"1pet":60,"2pet":61,"1jn":62,"2jn":63,"3jn":64,"rev":66,"revelations":66,
}
def norm(s): return re.sub(r"[^a-z0-9]", "", s.lower())
ALIAS = {}
for i, n in enumerate(NAMES, 1): ALIAS[norm(n)] = i
for i, a in enumerate(NWT_ABBR, 1): ALIAS.setdefault(norm(a), i)
ALIAS.update({k: v for k, v in EXTRA_ABBR.items()})

# --------------------------------------------------------------------------
# HTML -> lines of text (headings get "#", list items get "- ")
# --------------------------------------------------------------------------
BLOCK = {"p","div","li","ul","ol","h1","h2","h3","h4","h5","h6","br","section","article","header",
         "footer","table","tr","td","th","aside","nav","dl","dt","dd","blockquote","figure","figcaption","main"}
class Linearizer(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.lines, self.buf, self.prefix, self.skip = [], [], "", 0
    def flush(self):
        t = re.sub(r"\s+", " ", "".join(self.buf).replace("\xa0", " ")).strip()
        self.buf = []
        if t:
            self.lines.append(self.prefix + t); self.prefix = ""
    def handle_starttag(self, tag, attrs):
        if tag in ("script", "style", "noscript"): self.skip += 1; return
        if tag in BLOCK:
            self.flush()
            if re.fullmatch(r"h[1-6]", tag): self.prefix = "#" * int(tag[1]) + " "
            elif tag == "li": self.prefix = "- "
    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript"): self.skip = max(0, self.skip - 1); return
        if tag in BLOCK:
            self.flush()
            if re.fullmatch(r"h[1-6]", tag): self.prefix = ""
    def handle_data(self, data):
        if not self.skip: self.buf.append(data)
def linearize(html):
    p = Linearizer(); p.feed(html); p.flush(); return p.lines

# --------------------------------------------------------------------------
# Reference parsing
# --------------------------------------------------------------------------
class Ctx:
    def __init__(self, counts, alias):
        self.counts, self.alias = counts, alias
        self.unresolved, self.warnings = {}, []
def last_verse(ctx, b, c):
    ch = ctx.counts[b - 1]
    return ch[c - 1] if 1 <= c <= len(ch) else 999

def parse_refs(text, ctx, where=""):
    """'Ps 104:6-9; 136:6; Isa 40:26' -> [(b,c1,v1,c2,v2), ...]"""
    text = text.replace("\xa0", " ").replace("–", "-").replace("—", "-").replace("−", "-")
    out, book = [], None
    for piece in re.split(r"\s*;\s*", text.strip()):
        piece = piece.strip().rstrip(".").strip()
        if not piece: continue
        if re.match(r"^(?:[1-3]\s?)?[A-Za-z]", piece):
            m = re.match(r"^((?:[1-3]\s?)?[A-Za-z][A-Za-z.\s]*?)\s*(?=\d|$)", piece)
            name, rest = m.group(1).strip(), piece[m.end():].strip()
            book = ctx.alias.get(norm(name))
            if book is None:
                ctx.unresolved[name] = ctx.unresolved.get(name, 0) + 1
                continue
        else:
            rest = piece
            if book is None: continue          # inherited from an unresolved book
        out += parse_book_part(ctx, book, rest, where)
    return out

def parse_book_part(ctx, b, rest, where):
    nch = len(ctx.counts[b - 1]); res = []
    if rest == "":                                   # whole book
        return [(b, 1, 1, nch, last_verse(ctx, b, nch))]
    chap, verse_mode = (1, True) if nch == 1 else (None, False)
    for tok in [t.strip() for t in rest.split(",") if t.strip()]:
        m = re.fullmatch(r"(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?", tok)
        if m:
            c, v = int(m.group(1)), int(m.group(2))
            c2 = int(m.group(3)) if m.group(3) else c
            v2 = int(m.group(4)) if m.group(4) else v
            res.append((b, c, v, c2, v2)); chap, verse_mode = c2, True; continue
        m = re.fullmatch(r"(\d+)(?:-(\d+))?", tok)
        if m and verse_mode:
            v = int(m.group(1)); v2 = int(m.group(2) or v)
            res.append((b, chap, v, chap, v2)); continue
        if m:                                        # chapter(s) only in a multi-chapter book
            c = int(m.group(1)); c2 = int(m.group(2) or c)
            res.append((b, c, 1, c2, last_verse(ctx, b, c2))); continue
        ctx.warnings.append("cannot parse %r in %s %s" % (tok, NAMES[b - 1], where))
    return res

def fmt(r):
    b, c1, v1, c2, v2 = r
    if (c1, v1) == (c2, v2): return "%d:%d:%d" % (b, c1, v1)
    if c1 == c2: return "%d:%d:%d-%d" % (b, c1, v1, v2)
    return "%d:%d:%d-%d:%d" % (b, c1, v1, c2, v2)
def unfmt(s):
    m = re.fullmatch(r"\s*(\d+):(\d+):(\d+)(?:-(?:(\d+):)?(\d+))?\s*", str(s))
    if not m: return None
    b, c, v = int(m.group(1)), int(m.group(2)), int(m.group(3))
    c2 = int(m.group(4)) if m.group(4) else c
    v2 = int(m.group(5)) if m.group(5) else v
    return (b, c, v, c2, v2)

def normalize_refs(items):
    """Parse, sort in Bible order, drop duplicates / contained refs, merge touching ranges."""
    rs = sorted({r for r in (unfmt(x) if not isinstance(x, tuple) else x for x in items) if r})
    out = []
    for r in rs:
        if out:
            p = out[-1]
            if p[0] == r[0]:
                if (r[1], r[2]) >= (p[1], p[2]) and (r[3], r[4]) <= (p[3], p[4]): continue    # contained
                if p[1] == p[3] == r[1] == r[3] and r[2] <= p[4] + 1:                         # overlap / adjacent
                    out[-1] = (p[0], p[1], p[2], p[3], max(p[4], r[4])); continue
        out.append(r)
    return [fmt(r) for r in out]

# --------------------------------------------------------------------------
# Chapter page -> {verse: [refs]}
# --------------------------------------------------------------------------
def extract_chapter(html, book, chapter, ctx, marker="+"):
    lines = linearize(html)
    found, verse = {}, None
    hdr = re.compile(r"^(#+)\s+.*?(\d+):(\d+)(?:\s*-\s*\d+)?\s*$")
    mk = re.escape(marker)
    for ln in lines:
        m = hdr.match(ln)
        if m and int(m.group(2)) == chapter:
            verse = int(m.group(3)); continue
        if ln.startswith("#"):
            if len(ln) - len(ln.lstrip("#")) <= 3: verse = None   # a new section: h4 sub-headings keep the verse
            continue
        m = re.match(r"^-\s*" + mk + r"\s*(.+)$", ln)
        if m and verse:
            refs = parse_refs(m.group(1), ctx, "%d:%d" % (chapter, verse))
            found.setdefault(verse, []).extend(refs)
    return {"%d:%d:%d" % (book, chapter, v): normalize_refs(r) for v, r in found.items() if r}, lines

# --------------------------------------------------------------------------
# Data file handling
# --------------------------------------------------------------------------
def flatten(data):
    out = {}
    for k, v in data.items():
        if isinstance(v, list): out[str(k)] = v
        elif isinstance(v, dict):
            for c, cv in v.items():
                for vs, lst in cv.items(): out["%s:%s:%s" % (k, c, vs)] = lst
    return out
def keyorder(k):
    try: return tuple(int(x) for x in k.split(":"))
    except ValueError: return (999, 0, 0)
def load_data(path):
    if not os.path.exists(path): return {}
    with open(path, encoding="utf-8") as f: txt = f.read().strip()
    return flatten(json.loads(txt)) if txt else {}
def save_data(path, data):
    data = {k: normalize_refs(v) for k, v in data.items()}
    data = {k: v for k, v in data.items() if v}
    lines = ['  %s: %s' % (json.dumps(k), json.dumps(data[k], ensure_ascii=False)) for k in sorted(data, key=keyorder)]
    os.makedirs(os.path.dirname(os.path.abspath(path)), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f: f.write("{\n" + ",\n".join(lines) + "\n}\n")
    os.replace(tmp, path)
    return len(data)
def merge(existing, new, overwrite):
    for k, refs in new.items():
        existing[k] = list(refs) if overwrite else list(existing.get(k, [])) + list(refs)
    return existing

# --------------------------------------------------------------------------
# Fetching
# --------------------------------------------------------------------------
def chapter_url(a, bible, b, c):
    return "https://wol.jw.org/%s/wol/b/%s/%s/%s/%d/%d" % (a.lang, a.rsconf, a.lib, bible, b, c)
def fetch(url, a):
    req = urllib.request.Request(url, headers={"User-Agent": a.user_agent, "Accept-Language": "en"})
    for attempt in range(5):
        try:
            with urllib.request.urlopen(req, timeout=40) as r: return r.read().decode("utf-8", "replace")
        except urllib.error.HTTPError as e:
            if e.code == 404: return None
            wait = int(e.headers.get("Retry-After", "0") or 0) or 5 * (attempt + 1) ** 2
            print("  HTTP %s - waiting %ss" % (e.code, wait), file=sys.stderr); time.sleep(wait)
        except (urllib.error.URLError, TimeoutError) as e:
            print("  network error %s - retrying" % e, file=sys.stderr); time.sleep(5 * (attempt + 1))
    raise SystemExit("giving up on " + url)
def get_page(a, bible, b, c):
    path = os.path.join(a.cache, bible, "%02d_%03d.html" % (b, c))
    if os.path.exists(path) and not a.refresh:
        with open(path, encoding="utf-8") as f: return f.read(), False
    html = fetch(chapter_url(a, bible, b, c), a)
    if html is not None:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as f: f.write(html)
    return html, True

def load_counts(a):
    with open(a.bible_json, encoding="utf-8") as f: return json.load(f)["counts"]
def make_ctx(a):
    alias = dict(ALIAS)
    if a.abbr_file:
        with open(a.abbr_file, encoding="utf-8") as f:
            for k, v in json.load(f).items(): alias[norm(k)] = int(v)
    return Ctx(load_counts(a), alias)
def parse_books(spec, nbooks=66):
    if not spec: return list(range(1, nbooks + 1))
    out = []
    for part in spec.split(","):
        if "-" in part: x, y = part.split("-"); out += range(int(x), int(y) + 1)
        else: out.append(int(part))
    return out

def cmd_probe(a):
    ctx = make_ctx(a); bible = a.bible[0]
    html, _ = get_page(a, bible, a.book, a.chapter)
    if html is None: raise SystemExit("page not found: " + chapter_url(a, bible, a.book, a.chapter))
    found, lines = extract_chapter(html, a.book, a.chapter, ctx, a.marker)
    print("URL:", chapter_url(a, bible, a.book, a.chapter)); print("HTML bytes:", len(html), " text lines:", len(lines))
    print("\n--- first 40 lines of the page as text ---")
    for ln in lines[:40]: print(ln[:150])
    print("\n--- lines that look like marginal references ---")
    n = 0
    for ln in lines:
        if re.match(r"^-\s*" + re.escape(a.marker), ln): print(ln[:150]); n += 1
        if n >= 15: break
    print("\n--- parsed ---")
    for k in sorted(found, key=keyorder)[:15]: print(k, found[k])
    print("verses with references:", len(found), "| unresolved names:", ctx.unresolved or "none")
    if not found: print("\nNOTHING FOUND: the page markup differs from what this script expects. Send the output above.")
    dump = os.path.join(a.cache, "probe_%s_%d_%d.txt" % (bible, a.book, a.chapter))
    os.makedirs(a.cache, exist_ok=True)
    with open(dump, "w", encoding="utf-8") as f: f.write("\n".join(lines))
    print("full text dump:", dump)

def cmd_scrape(a):
    ctx = make_ctx(a); data = load_data(a.out)
    books = parse_books(a.books)
    for bible in a.bible:
        total_refs = verses = pages = 0
        print("== %s ==" % bible)
        for b in books:
            new = {}
            for c in range(1, len(ctx.counts[b - 1]) + 1):
                if a.chapters and c not in parse_books(a.chapters): continue
                html, live = get_page(a, bible, b, c)
                if html is None: print("  %s %d: no page" % (NAMES[b - 1], c)); continue
                found, _ = extract_chapter(html, b, c, ctx, a.marker); pages += 1
                new.update(found)
                if live: time.sleep(a.delay)
            data = merge(data, new, a.overwrite)
            n = save_data(a.out, data)
            verses += len(new); total_refs += sum(len(v) for v in new.values())
            print("  %-16s verses with refs: %4d   (file now has %d verses)" % (NAMES[b - 1], len(new), n))
        print("  pages: %d, verses with refs: %d, references: %d" % (pages, verses, total_refs))
        if verses == 0: print("  WARNING: nothing found for %r. Run 'probe' to see how the page looks." % bible)
    if ctx.unresolved:
        print("\nUnrecognised book names (add them with --abbr-file):")
        for k, v in sorted(ctx.unresolved.items(), key=lambda x: -x[1]): print("  %-12s x%d" % (k, v))
    for w in ctx.warnings[:20]: print("warning:", w)

def cmd_normalize(a):
    data = load_data(a.out); n = save_data(a.out, data); print("normalized %s: %d verses" % (a.out, n))

# --------------------------------------------------------------------------
# Self test (uses text taken from the Genesis 1 page of the Study Bible)
# --------------------------------------------------------------------------
SAMPLE = {1:["Ps 102:25; Isa 42:5; 45:18; Ro 1:20; Heb 1:10; Re 4:11; 10:6"],2:["Pr 8:27, 28","Ps 33:6; Isa 40:26","Ps 104:5, 6"],
 3:["Isa 45:7; 2Co 4:6"],5:["Ge 8:22"],6:["Ge 1:20","2Pe 3:5"],7:["Ge 7:11; Pr 8:27, 28"],9:["Job 38:8, 11; Ps 104:6-9; 136:6"],
 10:["Ps 95:5","Pr 8:29","De 32:4"],12:["Ps 104:14"],14:["De 4:19","Ps 104:19","Ge 8:22"],16:["Ps 136:7, 8","Ps 8:3; Jer 31:35"],
 18:["Ps 74:16"],20:["Ge 2:19"],22:["Ne 9:6; Ps 104:25"],24:["Ge 2:19"],26:["Pr 8:30; Joh 1:3; Col 1:16","1Co 11:7","Ge 5:1; Jas 3:9","Ge 9:2"],
 27:["Ps 139:14; Mt 19:4; Mr 10:6; 1Co 11:7, 9"],28:["Ge 9:1","Ge 2:15","Ps 8:4, 6"],29:["Ge 9:3; Ps 104:14; Ac 14:17"],
 30:["Ps 147:9; Mt 6:26"],31:["De 32:4; Ps 104:24; 1Ti 4:4"]}
def sample_html():
    h = ["<html><body><h1>Genesis</h1><p>In the beginning God created the heavens and the earth.<a>+</a></p>"]
    for v in range(1, 32):
        h.append("<div><h3>Genesis 1:%d</h3>" % v)
        if v in SAMPLE:
            h.append("<h4>Marginal References</h4><ul>" + "".join("<li><a>+</a>%s</li>" % r for r in SAMPLE[v]) + "</ul>")
        h.append("<h4>Indexes</h4><ul><li>Research Guide <a>It-1 “Creation”</a></li></ul></div>")
    h.append("<h3>Parallel Translations</h3><h3>General</h3><p>Gen. 1:1Ps 102:25; Isa 42:5</p></body></html>")
    return "".join(h)
def cmd_selftest(a):
    counts = load_counts(a); ctx = Ctx(counts, ALIAS)
    t = lambda s: [fmt(r) for r in parse_refs(s, ctx)]
    assert t("Ps 102:25; Isa 42:5; 45:18") == ["19:102:25", "23:42:5", "23:45:18"]
    assert t("Pr 8:27, 28") == ["20:8:27", "20:8:28"]
    assert t("Job 38:8, 11; Ps 104:6-9; 136:6") == ["18:38:8", "18:38:11", "19:104:6-9", "19:136:6"]
    assert t("1Co 11:7, 9; 2Co 4:6") == ["46:11:7", "46:11:9", "47:4:6"]
    assert t("Jude 14") == ["65:1:14"] and t("Ob 10-12") == ["31:1:10-12"]
    assert t("Ps 23") == ["19:23:1-6"] and t("Ge 1:26-2:3") == ["1:1:26-2:3"]
    assert t("1Sa 3:4; 2Sa 1:1; Ca 2:1; Php 1:1; Phm 4; Re 1:1") == ["9:3:4","10:1:1","22:2:1","50:1:1","57:1:4","66:1:1"]
    assert normalize_refs(["20:8:27", "20:8:28", "20:8:27", "19:1:1", "19:1:1-3"]) == ["19:1:1-3", "20:8:27-28"]
    found, _ = extract_chapter(sample_html(), 1, 1, ctx)
    assert found["1:1:1"] == ["19:102:25", "23:42:5", "23:45:18", "45:1:20", "58:1:10", "66:4:11", "66:10:6"], found["1:1:1"]
    assert found["1:1:2"] == ["19:33:6", "19:104:5-6", "20:8:27-28", "23:40:26"], found["1:1:2"]
    assert "1:1:4" not in found and len(found) == 21
    assert not ctx.unresolved and not ctx.warnings
    print("selftest ok: %d verses with references in the sample chapter" % len(found))
    return found
def cmd_sample(a):
    found = cmd_selftest(a)
    n = save_data(a.out, merge(load_data(a.out), found, False)); print("wrote %d verses to %s" % (n, a.out))

def main():
    p = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    p.add_argument("command", choices=["probe", "scrape", "normalize", "selftest", "sample"])
    p.add_argument("--bible", action="append", default=None, help="WOL bible code, repeatable (default nwtsty). e.g. nwtsty, nwt, Rbi8")
    p.add_argument("--lang", default="en"); p.add_argument("--rsconf", default="r1"); p.add_argument("--lib", default="lp-e")
    p.add_argument("--out", default="data/crossrefs.json"); p.add_argument("--bible-json", default="data/bible.json")
    p.add_argument("--books", help="e.g. 1-5,19,43 (default: all 66)"); p.add_argument("--chapters", help="e.g. 1-3")
    p.add_argument("--book", type=int, default=1); p.add_argument("--chapter", type=int, default=1)
    p.add_argument("--overwrite", action="store_true", help="replace the stored refs of every scraped verse instead of adding to them")
    p.add_argument("--refresh", action="store_true", help="ignore cached pages"); p.add_argument("--cache", default=".wol-cache")
    p.add_argument("--delay", type=float, default=1.5, help="seconds between live requests (default 1.5)")
    p.add_argument("--marker", default="+"); p.add_argument("--abbr-file", help="JSON {abbreviation: book number} for extra names")
    p.add_argument("--user-agent", default="BibleGems-crossref-script/1.0 (personal study project)")
    a = p.parse_args(); a.bible = a.bible or ["nwtsty"]
    {"probe": cmd_probe, "scrape": cmd_scrape, "normalize": cmd_normalize, "selftest": cmd_selftest, "sample": cmd_sample}[a.command](a)
if __name__ == "__main__": main()
