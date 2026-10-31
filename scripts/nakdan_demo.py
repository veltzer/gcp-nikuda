#!/usr/bin/env python
"""
Standalone demo of Dicta's Nakdan API (see doc/nakdan_api.txt).

Vocalizes Hebrew text given on the command line (or a built-in sample) and
prints the result, optionally with every option the Nakdan offers per word.

The API key and endpoint come from pass(1), entry keys/dicta.org.il:

    <api key>
    url: <endpoint>

NAKDAN_API_KEY and NAKDAN_URL in the environment override pass.

Dicta asks for 10-20 seconds between requests and none in parallel, so run
it by hand, not in a loop.
"""

import argparse
import json
import os
import subprocess
import sys
import urllib.request

PASS_ENTRY = "keys/dicta.org.il"
SAMPLE = "שלום עולם, זהו ניסיון של הנקדן של דיקטה."
MAX_CHARS = 30000


def read_pass():
    """ Return (api key, url) from the pass entry. """
    proc = subprocess.run(
        ["pass", "show", PASS_ENTRY],
        check=False, capture_output=True, text=True,
    )
    if proc.returncode != 0:
        sys.exit(f"cannot read pass entry {PASS_ENTRY}: {proc.stderr.strip()}")
    lines = proc.stdout.splitlines()
    url = None
    for line in lines[1:]:
        if line.startswith("url:"):
            url = line[len("url:"):].strip()
    return lines[0].strip(), url


def get_credentials():
    key = os.environ.get("NAKDAN_API_KEY")
    url = os.environ.get("NAKDAN_URL")
    if not (key and url):
        pass_key, pass_url = read_pass()
        key = key or pass_key
        url = url or pass_url
    if not url:
        sys.exit(f"no 'url:' line in pass entry {PASS_ENTRY}")
    return key, url


def nakdan(text, key, url, genre):
    """ Send text to the Nakdan and return its list of tokens. """
    params = {
        "task": "nakdan",
        "useTokenization": True,
        "genre": genre,
        "data": text,
        "addmorph": True,
        "matchpartial": True,
        "keepmetagim": False,
        "keepqq": False,
        "apiKey": key,
    }
    req = urllib.request.Request(
        url,
        data=json.dumps(params).encode("UTF8"),
        headers={"Content-Type": "text/plain;charset=UTF-8"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=60) as response:
        reply = json.loads(response.read().decode("UTF8"))
    if isinstance(reply, dict):
        reply = reply["data"]
    return reply


def option_word(option):
    """ The vocalized word of an option, without the prefix separator. """
    if isinstance(option, dict):
        option = option["w"]
    elif isinstance(option, list):
        option = option[0]
    return option.replace("|", "")


def main():
    parser = argparse.ArgumentParser(description="Vocalize Hebrew text with Dicta's Nakdan API.")
    parser.add_argument("text", nargs="*", help="text to vocalize (default: a sample sentence)")
    parser.add_argument("--genre", choices=["modern", "rabbinic", "premodern"], default="modern")
    parser.add_argument("--options", action="store_true", help="also list every option per word")
    parser.add_argument("--raw", action="store_true", help="print the raw JSON reply")
    args = parser.parse_args()

    text = " ".join(args.text) or SAMPLE
    if len(text) > MAX_CHARS:
        sys.exit(f"text is longer than the API's {MAX_CHARS} characters")
    key, url = get_credentials()
    tokens = nakdan(text, key, url, args.genre)

    if args.raw:
        print(json.dumps(tokens, ensure_ascii=False, indent=1))
        return

    result = []
    for token in tokens:
        options = token.get("nakdan", token).get("options", [])
        if token.get("sep") or not options:
            result.append(token["str"])
        else:
            result.append(option_word(options[0]))
    print(text)
    print("".join(result))

    if args.options:
        print()
        for token in tokens:
            if token.get("sep"):
                continue
            options = token.get("nakdan", token).get("options", [])
            words = []
            for option in options:
                word = option_word(option)
                if word not in words:
                    words.append(word)
            print(f"{token['str']}: {', '.join(words)}")


if __name__ == "__main__":
    main()
