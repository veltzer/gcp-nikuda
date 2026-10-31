"""
Main code of the nikuda website
"""


import bisect
import difflib
import json
import os
import re
import threading
import time
import unicodedata
import urllib.error
import urllib.request

import onnxruntime
from flask import Flask, abort, jsonify, request, send_from_directory
from nakdimon import predict as nakdimon_predict
from nakdimon.config import MAIN_MODEL as NAKDIMON_MODEL

# The only directories served over /static/. Everything else under src/
# (main.py, data/) is not reachable over HTTP.
ASSET_DIRS = {"css", "images", "js", "js_tp"}

HERE = os.path.dirname(os.path.abspath(__file__))
# build_info.json is written next to src/, at the repo (and image) root.
BUILD_INFO = os.path.join(os.path.dirname(HERE), "build_info.json")

# Dicta's Nakdan API (doc/nakdan_api.txt) is optional: it is enabled only when
# both its URL and API key arrive in the environment. Dicta asks that neither
# be published, so they are set at deploy time (.gcp.conf), never committed.
NAKDAN_MAX_CHARS = 30000
NAKDAN_TIMEOUT = 60
# Dicta asks for 10-20 seconds between requests and none in parallel.
NAKDAN_LOCK = threading.Lock()

# Nakdimon (https://github.com/elazarg/nakdimon) runs in process. It pads
# every chunk of text to maxlen, and predict()'s default of 10000 made even
# one word cost seconds; 80 is the chunk length it was trained on, at the
# same accuracy (scripts/nikud_compare.py). That runs about 2s per 10000
# characters on one CPU.
NAKDIMON_MAXLEN = 80
# onnxruntime starts a thread per host core, but Cloud Run grants one CPU;
# the surplus threads fight over it and made a long text 8x slower.
NAKDIMON_THREADS = 1
NAKDIMON_MAX_CHARS = 10000
# The dictionary method sends a paragraph one word per entry.
NAKED_MAX_WORDS = 10000

# Vowels, dagesh, shin dots and cantillation, but not the Hebrew punctuation
# (maqaf, paseq, sof pasuq, nun hafukha) that shares the block.
MARKS = "\u0591-\u05bd\u05bf\u05c1\u05c2\u05c4\u05c5\u05c7"
# A Hebrew word: letters with any marks on them (as nikudABRegExp in nikuda.js).
HEBREW_WORD = re.compile(f"[\u05d0-\u05ea][\u05d0-\u05ea{MARKS}]*")
HEBREW_MARK = re.compile(f"[{MARKS}]")

app = Flask(__name__, static_folder=None)

def load_data():
    """ Load the nikud dictionary once at startup rather than per request. """
    with open(os.path.join(HERE, "data", "all.json"), encoding="UTF8") as fp:
        d = json.load(fp)
    app.config["dict"] = d
    app.config["sorted"] = sorted(d.keys())


def load_build_info():
    """ Load the deploy stamp written by gcloud_run_deploy.sh; absent in dev. """
    try:
        with open(BUILD_INFO, encoding="UTF8") as fp:
            info = json.load(fp)
    except FileNotFoundError:
        info = {"deploy_date": "unknown", "git_describe": "dev"}
    app.config["build_info"] = info


def load_nakdan_config():
    """ Read the optional Nakdan settings from the environment. """
    app.config["nakdan_url"] = os.environ.get("NAKDAN_URL")
    app.config["nakdan_api_key"] = os.environ.get("NAKDAN_API_KEY")
    app.config["nakdan_interval"] = float(os.environ.get("NAKDAN_MIN_INTERVAL", "10"))
    app.config["nakdan_last"] = float("-inf")


def nakdan_enabled():
    return bool(app.config["nakdan_url"] and app.config["nakdan_api_key"])


def strip_nikud(word):
    return HEBREW_MARK.sub("", word)


def with_dictionary(word, nikudim):
    """ nikudim followed by the dictionary's other forms of word. """
    result = []
    for form in nikudim + app.config["dict"].get(strip_nikud(word), []):
        # Mark order differs between sources; compare in NFC.
        form = unicodedata.normalize("NFC", form)
        if form not in result:
            result.append(form)
    return result


def load_nakdimon():
    """ Load the model now rather than on the first request. """
    options = onnxruntime.SessionOptions()
    options.intra_op_num_threads = NAKDIMON_THREADS
    options.inter_op_num_threads = NAKDIMON_THREADS
    app.config["nakdimon"] = onnxruntime.InferenceSession(
        str(NAKDIMON_MODEL), options, providers=["CPUExecutionProvider"])


load_data()
load_build_info()
load_nakdan_config()
load_nakdimon()

@app.route("/static/<directory>/<path:filename>", methods=["GET"])
def static_asset(directory, filename):
    if directory not in ASSET_DIRS:
        abort(404)
    return send_from_directory(directory, filename)


@app.route("/", methods=["GET"])
def index():
    return send_from_directory("html", "index.html")


# Browsers ask for /favicon.ico on their own, whatever the page links.
@app.route("/favicon.ico", methods=["GET"])
def favicon():
    return send_from_directory("images", "favicon.ico")

@app.route("/app/version", methods=["GET"])
def version():
    info = dict(app.config["build_info"])
    # Cloud Run injects the serving revision name at runtime.
    info["revision"] = os.environ.get("K_REVISION", "local")
    return jsonify(info)


@app.route("/app/features", methods=["GET"])
def features():
    return jsonify({"nakdan": nakdan_enabled()})


def nakdan_request(text):
    """ Send text to the Nakdan API and return its list of tokens. """
    params = {
        "task": "nakdan",
        "useTokenization": True,
        "genre": "modern",
        "data": text,
        "addmorph": False,
        "matchpartial": True,
        "keepmetagim": False,
        "keepqq": False,
        "apiKey": app.config["nakdan_api_key"],
    }
    req = urllib.request.Request(
        app.config["nakdan_url"],
        data=json.dumps(params).encode("UTF8"),
        headers={"Content-Type": "text/plain;charset=UTF-8"},
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=NAKDAN_TIMEOUT) as response:
        reply = json.loads(response.read().decode("UTF8"))
    # The documented reply is {"data": [token, ...]}; older API versions
    # returned the bare list.
    if isinstance(reply, dict):
        reply = reply["data"]
    return reply


def nakdan_option_word(option):
    """ The vocalized word of one option, without the prefix separator. """
    # An option is {"w": ..., "lex": ..., "morph": ...}; without addmorph some
    # API versions send the word alone or as the first item of a list.
    if isinstance(option, dict):
        option = option["w"]
    elif isinstance(option, list):
        option = option[0]
    return option.replace("|", "")


def nakdan_tokens(tokens):
    """ Reduce Nakdan tokens to what the page needs: text and options. """
    result = []
    for token in tokens:
        analysis = token.get("nakdan", token)
        nikudim = []
        if not token.get("sep"):
            for option in analysis.get("options", []):
                word = nakdan_option_word(option)
                if word not in nikudim:
                    nikudim.append(word)
        text = token["str"] if "str" in token else analysis["word"]
        result.append({
            "Str": text,
            "Sep": bool(token.get("sep")),
            "Nikudim": [] if token.get("sep") else with_dictionary(text, nikudim),
        })
    return result


@app.route("/app/nakdan", methods=["POST"])
def nakdan():
    if not nakdan_enabled():
        abort(404)
    obj = request.get_json(silent=True)
    if not isinstance(obj, dict) or not isinstance(obj.get("Text"), str):
        abort(400)
    text = obj["Text"]
    if len(text) > NAKDAN_MAX_CHARS:
        abort(413)
    # Each process sends at most one request at a time, spaced by the
    # interval; anything else is turned away rather than queued.
    if not NAKDAN_LOCK.acquire(blocking=False):
        return jsonify({"RetryAfter": app.config["nakdan_interval"]}), 429
    try:
        wait = app.config["nakdan_last"] + app.config["nakdan_interval"] - time.monotonic()
        if wait > 0:
            return jsonify({"RetryAfter": wait}), 429
        try:
            result = nakdan_tokens(nakdan_request(text))
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError,
                TypeError, AttributeError) as e:
            app.logger.warning("nakdan request failed: %s", e)
            abort(502)
        finally:
            app.config["nakdan_last"] = time.monotonic()
        return jsonify(result)
    finally:
        NAKDAN_LOCK.release()


def nakdimon_tokens(text):
    """ Split text into separators and words, each word with Nakdimon's
    vocalization first, then the dictionary's. """
    words = HEBREW_WORD.findall(text)
    naked = [strip_nikud(w) for w in words]
    vocalized = HEBREW_WORD.findall(nakdimon_predict.predict(
        strip_nikud(text), model=app.config["nakdimon"], maxlen=NAKDIMON_MAXLEN))
    # Pair output words with input words by their letters, so a word the
    # model changed or dropped falls back to the dictionary alone.
    choice = {}
    matcher = difflib.SequenceMatcher(
        None, naked, [strip_nikud(v) for v in vocalized], autojunk=False)
    for block in matcher.get_matching_blocks():
        for k in range(block.size):
            choice[block.a + k] = vocalized[block.b + k]

    result = []
    pos = 0
    for i, match in enumerate(HEBREW_WORD.finditer(text)):
        if match.start() > pos:
            result.append({"Str": text[pos:match.start()], "Sep": True, "Nikudim": []})
        nikudim = [choice[i]] if i in choice else []
        result.append({
            "Str": match.group(),
            "Sep": False,
            "Nikudim": with_dictionary(match.group(), nikudim),
        })
        pos = match.end()
    if pos < len(text):
        result.append({"Str": text[pos:], "Sep": True, "Nikudim": []})
    return result


@app.route("/app/nakdimon", methods=["POST"])
def nakdimon():
    obj = request.get_json(silent=True)
    if not isinstance(obj, dict) or not isinstance(obj.get("Text"), str):
        abort(400)
    text = obj["Text"]
    if len(text) > NAKDIMON_MAX_CHARS:
        abort(413)
    return jsonify(nakdimon_tokens(text))


@app.route("/app/suggest", methods=["POST"])
def suggest():
    obj = request.get_json(silent=True)
    if not isinstance(obj, dict) or not isinstance(obj.get("Naked"), str):
        abort(400)
    p_naked = obj["Naked"]
    pos = bisect.bisect_left(app.config["sorted"], p_naked)
    raw_results = app.config["sorted"][pos:pos+10]
    obj["Nakeds"] = raw_results
    return jsonify(obj)


@app.route("/app/naked", methods=["POST"])
def naked():
    jsonobject = request.get_json(silent=True)
    if not isinstance(jsonobject, list) or not all(
            isinstance(obj, dict) and isinstance(obj.get("Naked"), str)
            for obj in jsonobject):
        abort(400)
    if len(jsonobject) > NAKED_MAX_WORDS:
        abort(413)
    for obj in jsonobject:
        p_naked = obj["Naked"]
        d = app.config["dict"]
        if p_naked in d:
            results = d[p_naked]
        else:
            results = []
        obj["Nikudim"] = results
    return jsonify(jsonobject)


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=8080, debug=True)
