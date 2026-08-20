"""
Main code of the nikua website
"""


import bisect
import json

from flask import Flask, jsonify, request

app = Flask(__name__, static_folder="", static_url_path="/static")

@app.before_request
def load_data():
    with open("src/data/all.json", encoding="UTF8") as fp:
        d = json.load(fp)
        app.config["dict"] = d
        app.config["sorted"] = sorted(d.keys())

# this route is not needed in production
@app.route("/", methods=["GET"])
def index():
    return app.send_static_file("html/index.html")

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
