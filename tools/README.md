# Cross-reference tools

## Data file: `data/crossrefs.json`
One verse per line. Keys and values are `book:chapter:verse` (book numbers 1-66, same order as the plans):

    "1:1:1": ["19:102:25", "23:42:5", "45:1:20", "19:104:6-9"]

- A range in one chapter is `book:chapter:first-last`; across chapters it is `book:chapter:verse-chapter:verse`.
- Nested JSON (`{"1":{"1":{"1":["43:1:1"]}}}`) is also read by the page and by the script (the script writes the flat form back).
- The page sorts references in Bible order, removes duplicates and joins touching verses (26 and 27 become 26-27).

## Scraping: `scrape_crossrefs.py`
Run from the project root. Python 3 only, no extra packages.

    python3 tools/scrape_crossrefs.py selftest                  # checks the parser, no internet needed
    python3 tools/scrape_crossrefs.py probe --bible nwtsty      # fetches Genesis 1 and shows what it found
    python3 tools/scrape_crossrefs.py scrape --bible nwtsty     # all 1189 chapters, about 30 minutes
    python3 tools/scrape_crossrefs.py scrape --bible nwtsty --bible nwt --books 1-5,43

**Run `probe` first.** It prints the page as the script sees it and the references it parsed. If it says NOTHING FOUND, the page markup differs from what the script expects: send me that output.

How it works: each chapter page of the Study Bible lists the "Marginal References" (the `+` items) under every verse. The script reads one page per chapter (not one request per `+`), turns the abbreviated references (`Ps 104:6-9; 136:6`) into numbers and merges them into the file.

- **Several Bibles:** repeat `--bible` (`nwtsty`, `nwt`, `Rbi8`, ...). Results are added together and duplicates disappear. Check each one with `probe` first, since editions may mark references differently.
- **Merging:** new references are added to what is already there, so your hand-made entries stay. `--overwrite` replaces the stored list of every scraped verse instead.
- **`normalize`:** sorts and de-duplicates an existing file without scraping.
- **Politeness:** one request every 1.5 seconds (`--delay`). Pages are cached in `.wol-cache/`, so an interrupted run continues where it stopped, and it backs off on errors. Please read WOL's terms of use before running it in bulk.
- **Unknown book names** are listed at the end. Add them with `--abbr-file extra.json` (`{"Abbr": bookNumber}`).
- Cross references are the same in every language of an edition, so scrape the English pages (the default).

## One-time patch: `add_crossrefs_page.py`
Adds the "Cross references" button to the three existing pages and its name to `data/bible.json`. Run it once from the project root; running it again does nothing.
