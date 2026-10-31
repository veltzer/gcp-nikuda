""" Test the nikuda flask app end to end with webtest. """

import webtest

import main


def test_get():
    """ GET / serves the static index page. """
    application = webtest.TestApp(main.app)

    response = application.get('/')
    assert response.status_int == 200
    assert b"html" in response.body.lower()


def test_favicon():
    """ GET /favicon.ico serves the icon browsers ask for on their own. """
    application = webtest.TestApp(main.app)

    response = application.get('/favicon.ico')
    assert response.status_int == 200
    assert response.body[:4] == b"\x00\x00\x01\x00"


def test_social_card():
    """ GET / links a 1200x630 PNG preview card that is actually served. """
    application = webtest.TestApp(main.app)

    page = application.get('/').text
    url = "https://nikuda.co.il/static/images/social_card.png"
    assert f'<meta property="og:image" content="{url}" />' in page
    assert f'<meta name="twitter:image" content="{url}" />' in page
    response = application.get('/static/images/social_card.png')
    assert response.content_type == "image/png"
    assert response.body[:8] == b"\x89PNG\r\n\x1a\n"
    assert int.from_bytes(response.body[16:20], "big") == 1200
    assert int.from_bytes(response.body[20:24], "big") == 630


def test_version():
    """ GET /app/version reports the deploy stamp and the serving revision. """
    application = webtest.TestApp(main.app)

    response = application.get('/app/version')
    assert response.status_int == 200
    for key in ("deploy_date", "git_describe", "revision"):
        assert key in response.json


def test_suggest():
    """ POST /app/suggest completes a prefix from the dictionary. """
    application = webtest.TestApp(main.app)

    response = application.post_json('/app/suggest', {"Naked": ""})
    assert response.status_int == 200
    assert "Nakeds" in response.json


def test_suggest_bad_request():
    """ POST /app/suggest rejects a body without a string prefix. """
    application = webtest.TestApp(main.app)

    application.post_json('/app/suggest', {"Text": "של"}, status=400)
    application.post_json('/app/suggest', ["של"], status=400)
    application.post_json('/app/suggest', {"Naked": 5}, status=400)


def test_naked():
    """ POST /app/naked returns the dictionary forms of each word. """
    application = webtest.TestApp(main.app)

    words = application.post_json('/app/naked', [{"Naked": "שלום", "ID": 1}]).json
    assert words[0]["ID"] == 1
    assert words[0]["Nikudim"]
    for form in words[0]["Nikudim"]:
        assert main.strip_nikud(form) == "שלום"


def test_naked_bad_request():
    """ POST /app/naked rejects anything but a list of words, and long lists. """
    application = webtest.TestApp(main.app)

    application.post_json('/app/naked', {"Naked": "שלום"}, status=400)
    application.post_json('/app/naked', [{"Text": "שלום"}], status=400)
    application.post_json('/app/naked', ["שלום"], status=400)
    words = [{"Naked": "א"}] * (main.NAKED_MAX_WORDS + 1)
    application.post_json('/app/naked', words, status=413)


def test_features():
    """ GET /app/features reports Nakdan off when it is not configured. """
    application = webtest.TestApp(main.app)

    response = application.get('/app/features')
    assert response.status_int == 200
    assert response.json == {"nakdan": False}


def test_nakdan_disabled():
    """ POST /app/nakdan does not exist when Nakdan is not configured. """
    application = webtest.TestApp(main.app)

    application.post_json('/app/nakdan', {"Text": "שלום"}, status=404)


NAKDAN_REPLY = {"data": [
    {"sep": False, "str": "שלום", "nakdan": {
        "word": "שלום",
        "options": [{"w": "שָׁלוֹם"}, {"w": "שָׁלוֹם"}, {"w": "שְׁלוֹם"}]}},
    {"sep": True, "str": " ", "nakdan": {"word": " "}},
    {"sep": False, "str": "לעולם", "nakdan": {
        "word": "לעולם",
        "options": [{"w": "לָ|עוֹלָם"}]}},
]}


def enable_nakdan(monkeypatch, reply):
    """ Configure Nakdan and replace the remote API with a canned reply. """
    monkeypatch.setitem(main.app.config, "nakdan_url", "https://nakdan.invalid/")
    monkeypatch.setitem(main.app.config, "nakdan_api_key", "key")
    monkeypatch.setitem(main.app.config, "nakdan_last", float("-inf"))
    monkeypatch.setattr(main, "nakdan_request", lambda text: reply["data"])


def test_nakdan(monkeypatch):
    """ POST /app/nakdan returns each token with its distinct options. """
    enable_nakdan(monkeypatch, NAKDAN_REPLY)
    application = webtest.TestApp(main.app)

    assert application.get('/app/features').json == {"nakdan": True}
    tokens = application.post_json('/app/nakdan', {"Text": "שלום לעולם"}).json
    assert [(t["Str"], t["Sep"]) for t in tokens] == [("שלום", False), (" ", True), ("לעולם", False)]
    # Dicta's distinct options come first, then the dictionary's other forms.
    assert tokens[0]["Nikudim"][:2] == ["שָׁלוֹם", "שְׁלוֹם"]
    assert len(tokens[0]["Nikudim"]) > 2
    assert tokens[1]["Nikudim"] == []
    assert tokens[2]["Nikudim"][0] == "לָעוֹלָם"


def test_nakdan_throttle(monkeypatch):
    """ A second request inside the interval is turned away with 429. """
    enable_nakdan(monkeypatch, NAKDAN_REPLY)
    application = webtest.TestApp(main.app)

    application.post_json('/app/nakdan', {"Text": "שלום"})
    response = application.post_json('/app/nakdan', {"Text": "שלום"}, status=429)
    assert response.json["RetryAfter"] > 0


def test_nakdan_bad_request(monkeypatch):
    """ POST /app/nakdan rejects a body without text, and oversized text. """
    enable_nakdan(monkeypatch, NAKDAN_REPLY)
    application = webtest.TestApp(main.app)

    application.post_json('/app/nakdan', {"Naked": "שלום"}, status=400)
    text = "א" * (main.NAKDAN_MAX_CHARS + 1)
    application.post_json('/app/nakdan', {"Text": text}, status=413)


def test_nakdimon():
    """ POST /app/nakdimon keeps the text and vocalizes every word. """
    application = webtest.TestApp(main.app)

    text = "שלום עולם!\nזה Test, ארץ־ישראל."
    tokens = application.post_json('/app/nakdimon', {"Text": text}).json
    assert "".join(t["Str"] for t in tokens) == text
    words = [t for t in tokens if not t["Sep"]]
    assert [t["Str"] for t in words] == ["שלום", "עולם", "זה", "ארץ", "ישראל"]
    for t in words:
        assert t["Nikudim"]
        assert main.strip_nikud(t["Nikudim"][0]) == t["Str"]
        assert t["Nikudim"][0] != t["Str"]
    assert words[0]["Nikudim"][0] == "שָׁלוֹם"


def test_nakdimon_bad_request():
    """ POST /app/nakdimon rejects a body without text, and oversized text. """
    application = webtest.TestApp(main.app)

    application.post_json('/app/nakdimon', {"Naked": "שלום"}, status=400)
    text = "א" * (main.NAKDIMON_MAX_CHARS + 1)
    application.post_json('/app/nakdimon', {"Text": text}, status=413)
