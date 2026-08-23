"""
Main code of the nikua website
"""


import bisect
import json
import os

from flask import Flask, abort, jsonify, request, send_from_directory

# The only directories served over /static/; keep in sync with the
# static_files handlers in app.yaml. Everything else under src/ (main.py,
# data/) is not reachable over HTTP.
ASSET_DIRS = {"css", "images", "js", "js_tp"}

app = Flask(__name__, static_folder=None)

def load_data():
    """ Load the nikud dictionary once at startup rather than per request. """
    with open("src/data/all.json", encoding="UTF8") as fp:
        d = json.load(fp)
    app.config["dict"] = d
    app.config["sorted"] = sorted(d.keys())


def load_build_info():
    """ Load the deploy stamp written by gcloud_deploy.sh; absent in dev. """
    try:
        with open("build_info.json", encoding="UTF8") as fp:
            info = json.load(fp)
    except FileNotFoundError:
        info = {"deploy_date": "unknown", "git_describe": "dev"}
    app.config["build_info"] = info


load_data()
load_build_info()

@app.route("/static/<directory>/<path:filename>", methods=["GET"])
def static_asset(directory, filename):
    if directory not in ASSET_DIRS:
        abort(404)
    return send_from_directory(directory, filename)


# this route is not needed in production
@app.route("/", methods=["GET"])
def index():
    return send_from_directory("html", "index.html")

@app.route("/app/version", methods=["GET"])
def version():
    info = dict(app.config["build_info"])
    info["gae_version"] = os.environ.get("GAE_VERSION", "local")
    return jsonify(info)


@app.route("/app/suggest", methods=["POST"])
def suggest():
    obj = request.get_json()
    p_naked = obj["Naked"]
    pos = bisect.bisect_left(app.config["sorted"], p_naked)
    raw_results = app.config["sorted"][pos:pos+10]
    obj["Nakeds"] = raw_results
    return jsonify(obj)


@app.route("/app/naked", methods=["POST"])
def naked():
    jsonobject = request.get_json()
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
