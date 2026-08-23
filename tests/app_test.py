""" Test the nikuda flask app end to end with webtest. """

import webtest

import main


def test_get():
    """ GET / serves the static index page. """
    application = webtest.TestApp(main.app)

    response = application.get('/')
    assert response.status_int == 200
    assert b"html" in response.body.lower()


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
