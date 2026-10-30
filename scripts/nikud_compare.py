#!/usr/bin/env python3
"""
Compare nikud systems against hand-vocalized Hebrew text.

The nikud is stripped from each test document, put back by every system, and
the result is scored against the original:

    letters  share of Hebrew letters that got exactly the expected marks
    words    share of Hebrew words with every letter right

Systems:

    dictionary    what the site does today: each word looked up in
                  src/data/all.json and given its first vocalization
    dict-oracle   the same, but counted right when the expected form is
                  anywhere among the word's options (the best a user can
                  reach by clicking through them)
    nakdimon      the open Nakdimon model (pip package, runs locally)
    <saved>       outputs saved next to a Nakdimon-style test set, e.g. the
                  Dicta, Morfix and Snopi folders in nakdimon's tests/new

A test set is either a Nakdimon-style directory (an expected/ folder with
sibling folders of system outputs, same relative paths) or a plain file or
directory of vocalized .txt files, which is scored without saved outputs.

Get the Nakdimon test sets with:

    git clone --depth 1 https://github.com/elazarg/nakdimon.git
    scripts/nikud_compare.py nakdimon/tests/new
"""

import argparse
import difflib
import json
import os
import re
import sys
import unicodedata

import nakdimon.predict

HERE = os.path.dirname(os.path.abspath(__file__))
DICTIONARY = os.path.join(os.path.dirname(HERE), "src", "data", "all.json")
DEFAULT_SAVED = ["Dicta", "Morfix", "Snopi"]
# The chunk length the site uses (NAKDIMON_MAXLEN in src/main.py).
NAKDIMON_MAXLEN = 80

LETTER = re.compile("[א-ת]")
# Marks that are scored: the vowels, dagesh/shuruk and the shin/sin dots.
SCORED_MARKS = {chr(c) for c in range(0x05b0, 0x05bd)} | {"ׁ", "ׂ"}
# Marks folded into a scored one first: holam haser for vav and qamatz qatan.
FOLD_MARKS = {"ֺ": "ֹ", "ׇ": "ָ"}
FINALS = str.maketrans("ךםןףץ", "כמנפצ")
WORD = re.compile("[א-ת][א-ת֑-ׇ]*")


def is_mark(c):
    return "֑" <= c <= "ׇ" and not LETTER.match(c)


def strip_nikud(text):
    return "".join(c for c in text if not is_mark(c))


def analyze(text):
    """ Hebrew letters of text, each with its scored marks, and word spans. """
    letters = []
    words = []
    for match in WORD.finditer(text):
        start = len(letters)
        for c in match.group():
            if LETTER.match(c):
                letters.append([c.translate(FINALS), set()])
            else:
                c = FOLD_MARKS.get(c, c)
                if c in SCORED_MARKS:
                    letters[-1][1].add(c)
        words.append((start, len(letters)))
    return [(c, frozenset(m)) for c, m in letters], words


def score(expected, actual):
    """ Per-letter correctness of actual against expected, by letter index. """
    exp_letters, words = analyze(expected)
    act_letters, _ = analyze(actual)
    right = [False] * len(exp_letters)
    # Systems may rewrite spaces or punctuation, so align on the letters.
    matcher = difflib.SequenceMatcher(
        None, [c for c, _ in exp_letters], [c for c, _ in act_letters], autojunk=False)
    for block in matcher.get_matching_blocks():
        for k in range(block.size):
            i, j = block.a + k, block.b + k
            right[i] = exp_letters[i][1] == act_letters[j][1]
    return right, words


class Tally:
    def __init__(self):
        self.letters = self.letters_right = self.words = self.words_right = 0

    def add(self, right, words):
        self.letters += len(right)
        self.letters_right += sum(right)
        self.words += len(words)
        self.words_right += sum(all(right[a:b]) for a, b in words)

    def row(self, name):
        return f"{name:<14}{pct(self.letters_right, self.letters):>9}{pct(self.words_right, self.words):>9}"


def pct(part, whole):
    return f"{100 * part / whole:.1f}%" if whole else "-"


def load_dictionary():
    with open(DICTIONARY, encoding="UTF8") as fp:
        d = json.load(fp)
    # Unicode mark order varies between sources; compare in NFC.
    return {k: list(dict.fromkeys(unicodedata.normalize("NFC", w) for w in v)) for k, v in d.items()}


def dictionary_vocalize(text, dictionary, expected=None):
    """ The site's lookup: first option per word. With expected, pick the
    expected form when it is among the options instead (the oracle). """
    exp_words = iter(WORD.findall(expected)) if expected is not None else None

    def replace(match):
        word = match.group()
        options = dictionary.get(word, [])
        if exp_words is not None:
            target = analyze(next(exp_words, ""))[0]
            for option in options:
                if analyze(option)[0] == target:
                    return option
        return options[0] if options else word

    return WORD.sub(replace, text)


def find_documents(path):
    """ Yield (test set root or None, path of an expected document). """
    if os.path.isfile(path):
        yield None, path
        return
    expected = os.path.join(path, "expected")
    root = path if os.path.isdir(expected) else None
    for dirpath, _, files in sorted(os.walk(expected if root else path)):
        for name in sorted(files):
            if name.endswith(".txt"):
                yield root, os.path.join(dirpath, name)


def read(path):
    with open(path, encoding="utf-8-sig") as fp:
        return unicodedata.normalize("NFC", fp.read())


def compare(path, dictionary, saved, use_nakdimon):
    tallies = {}
    coverage = [0, 0, 0]  # words, words in dictionary, exact form in dictionary
    for root, doc in find_documents(path):
        expected = read(doc)
        naked = strip_nikud(expected)
        outputs = {
            "dictionary": dictionary_vocalize(naked, dictionary),
            "dict-oracle": dictionary_vocalize(naked, dictionary, expected),
        }
        if use_nakdimon:
            outputs["nakdimon"] = nakdimon.predict.predict(naked, maxlen=NAKDIMON_MAXLEN)
        if root:
            rel = os.path.relpath(doc, os.path.join(root, "expected"))
            for system in saved:
                other = os.path.join(root, system, rel)
                if os.path.isfile(other):
                    outputs[system] = read(other)
        for system, actual in outputs.items():
            tallies.setdefault(system, Tally()).add(*score(expected, actual))
        for word in WORD.findall(expected):
            options = dictionary.get(strip_nikud(word), [])
            coverage[0] += 1
            coverage[1] += bool(options)
            coverage[2] += any(analyze(o)[0] == analyze(word)[0] for o in options)
    return tallies, coverage


def main():
    parser = argparse.ArgumentParser(description="Compare nikud systems against hand-vocalized text.")
    parser.add_argument("test_sets", nargs="+", help="Nakdimon-style test set dirs, or vocalized .txt files/dirs")
    parser.add_argument("--saved", nargs="*", default=DEFAULT_SAVED,
                        help=f"saved system outputs to score (default: {' '.join(DEFAULT_SAVED)})")
    parser.add_argument("--no-nakdimon", action="store_true", help="skip running the Nakdimon model")
    args = parser.parse_args()

    dictionary = load_dictionary()
    for path in args.test_sets:
        if not os.path.exists(path):
            sys.exit(f"no such test set: {path}")
        tallies, (words, known, exact) = compare(path, dictionary, args.saved, not args.no_nakdimon)
        print(f"== {path}")
        print(f"{tallies['dictionary'].words} words; in dictionary: {pct(known, words)}, "
              f"with the expected form: {pct(exact, words)}")
        print(f"{'system':<14}{'letters':>9}{'words':>9}")
        for system, tally in sorted(tallies.items(), key=lambda kv: -kv[1].words_right):
            print(tally.row(system))
        print()


if __name__ == "__main__":
    main()
