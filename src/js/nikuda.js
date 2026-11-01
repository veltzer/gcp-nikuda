// Theme handling: light / dark / os (defaults to os).
// Applied as early as possible (script is in <head>) to avoid a flash of the
// wrong theme before the document is ready.
var THEME_MODES = ['os', 'light', 'dark'];
var THEME_META = {
  os: {label: 'מערכת'},
  light: {label: 'בהיר'},
  dark: {label: 'כהה'}
};

function get_theme() {
  var stored;
  try {
    stored = window.localStorage.getItem('theme');
  } catch (e) {
    stored = null;
  }
  return (THEME_MODES.indexOf(stored) !== -1) ? stored : 'os';
}

function apply_theme(mode) {
  document.documentElement.setAttribute('data-theme', mode);
}

// Apply the persisted theme immediately, before the body renders.
apply_theme(get_theme());

// references
var origElemRef = false;

// useful regular expressions
var nikudABRegExp = /(?:[אבגדהוזחטיכךלמםנןסעפףצץקרשת]|[ְֱֲֳִֵֶַָֹֻּׁׂ])/g;
var notNikudABRegExp = /(?![אבגדהוזחטיכךלמםנןסעפףצץקרשת]|[ְֱֲֳִֵֶַָֹֻּׁׂ])[\s\S]/g;
var nikudRegExp =
    /[\u05b0\u05b1\u05b2\u05b3\u05b4\u05b5\u05b6\u05b7\u05b8\u05c2\u05c1\u05b9\u05bc\u05bb]/g;
/* var lastLettersRegExp = /[כמנפצ]$/g; */
/* var firstLettersRegExp = /^[בכלמשהו]/g; */

// Paragraph methods served by the server (app/nakdimon, app/nakdan): the
// name shown to the user and the longest text each accepts.
var REMOTE_METHODS = {
  nakdimon: {url: 'app/nakdimon', name: 'נקדימון', maxChars: 10000},
  nakdan: {url: 'app/nakdan', name: 'הנקדן של דיקטה', maxChars: 30000}
};

// Small DOM helpers (the site used jQuery for these until 2026-10).

// Server calls: POST data as JSON (or GET when data is undefined) and resolve
// with the parsed JSON reply. A failed call rejects with {status, body} and
// also fires 'nikuda:ajaxerror' on the document, which the demo listens for.
function call_json(url, data) {
  var options = {headers: {'Accept': 'application/json'}};
  if (data !== undefined) {
    options.method = 'POST';
    options.headers['Content-Type'] = 'application/json; charset=utf-8';
    options.body = JSON.stringify(data);
  }
  return fetch(url, options).then(function(response) {
    return response.json().catch(function() {
      return null;
    }).then(function(body) {
      if (!response.ok || body === null) {
        throw {status: response.status, body: body};
      }
      return body;
    });
  }, function() {
    throw {status: 0, body: null};
  }).catch(function(error) {
    document.dispatchEvent(new CustomEvent('nikuda:ajaxerror', {detail: error}));
    throw error;
  });
}

// Fade an element in or out over FADE_MS (instantly for users who asked the
// system for reduced motion). Hidden means display: none, as with the
// .help boxes whose stylesheet default is hidden.
var FADE_MS = 600;

function is_shown(elem) {
  return !elem.nikudaHiding && getComputedStyle(elem).display !== 'none';
}

function fade_duration() {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : FADE_MS;
}

function fade_in(elem) {
  if (is_shown(elem)) {
    return;
  }
  elem.nikudaHiding = false;
  elem.style.display = '';
  if (getComputedStyle(elem).display === 'none') {
    elem.style.display = 'block';
  }
  var duration = fade_duration();
  var animation = elem.animate([{opacity: 0}, {opacity: 1}], duration);
  // As in fade_out: end it by timer so a stalled animation cannot leave the
  // element transparent.
  setTimeout(function() {
    animation.cancel();
  }, duration);
}

function fade_out(elem) {
  if (!is_shown(elem)) {
    return;
  }
  elem.nikudaHiding = true;
  var duration = fade_duration();
  elem.animate([{opacity: 1}, {opacity: 0}], {duration: duration, fill: 'forwards'});
  // A timer, not the animation's onfinish: animations stall in a page that
  // is not being painted, and the box must still end up hidden.
  setTimeout(function() {
    if (elem.nikudaHiding) {
      elem.style.display = 'none';
      elem.nikudaHiding = false;
    }
    elem.getAnimations().forEach(function(animation) {
      animation.cancel();
    });
  }, duration);
}

// Append text to an element, turning each newline into a <br>. The text is
// never parsed as HTML.
function append_text(elem, text) {
  var lines = text.split('\n');
  for (var i = 0; i < lines.length; i++) {
    if (i > 0) {
      elem.appendChild(document.createElement('br'));
    }
    if (lines[i] !== '') {
      elem.appendChild(document.createTextNode(lines[i]));
    }
  }
}

// General purpose methods

var toastTimeout;
function show_toast(text) {
  var toast = document.getElementById('Toast');
  clearTimeout(toastTimeout);
  if (!text) {
    toast.classList.remove('toast-visible');
    return;
  }
  toast.textContent = text;
  toast.classList.add('toast-visible');
  toastTimeout = setTimeout(function() {
    toast.classList.remove('toast-visible');
  }, 4000);
}

function show_to_user(text) {
  if (text) {
    console.log(text);
  }
}

function validate_Hebrew(evt) {
  if (evt.ctrlKey || evt.altKey || evt.metaKey) {
    return;
  }
  // evt.key gives the actual character for printable keys
  if (evt.key && evt.key.length === 1 && /[a-zA-Z]/.test(evt.key)) {
    // Do not allow english letters
    show_toast('אנא השתמש במקלדת עיברית...');
    evt.preventDefault();
  }
}

// JSON AJAX punctuation function with success and done handlers
function naked(sentWords, successHandler, doneHandler) {
  // Update status
  show_to_user('מנקד...');
  // Go to the server with words & their respective IDs
  call_json('app/naked', sentWords).then(function(replyWords) {
    // reset status
    show_to_user('');
    for (var i = 0; i < replyWords.length; i++) {
      var nikudim = replyWords[i].Nikudim;
      var original = replyWords[i].Naked;

      if (nikudim.length > 0) {
        // Make sure we don't have duplicates in the DB
        nikudim = remove_duplicates(nikudim);
      }
      else {
        // Update status as failure
        show_to_user('השרת לא מצא ניקוד למילה [' +
                     original + ']');
      }

      // Add naked word to the punctuations at the end
      nikudim.push(original);
      // Call supplied success handler to handle naked punctuation
      successHandler(nikudim, replyWords[i].ID);
    }

    if (typeof(doneHandler) === 'function') {
      doneHandler();
    }
  }, function(error) {
    // Update status as failure
    show_to_user('השרת נכשל בניקוד ' + error.status);
  });
}

var suggestID = 0;
var currentInaked = 'משתנות';
function Suggest() {
  var inaked = Quicky.value;

  // Do not suggest when the words are too short or havent changed
  if (inaked === currentInaked || inaked.length < 3) {
    fade_out(SuggestionBox);
    SuggestionList.replaceChildren();
    return;
  } else {
    currentInaked = inaked;
  }

  show_to_user('אוטומט: ' + inaked);

  // Increment suggestions counter so we can connect
  // request to appropriate reply
  suggestID = suggestID + 1;
  // Go to the server with the word & their respective IDs
  call_json('app/suggest', {Naked: inaked, ID: suggestID}).then(function(replyWord) {
    // reset status
    show_to_user('');

    // Clear the old
    SuggestionList.replaceChildren();

    var nakeds = replyWord.Nakeds;
    var ID = replyWord.ID;

    if ((ID === suggestID) && (nakeds.length > 0)) {
      // fade in the suggestion box if it is hidden
      fade_in(SuggestionBox);
      // Add all suggestions to suggestion list as received from server
      for (var i = 0; i < nakeds.length; i++) {
        var item = document.createElement('li');
        item.textContent = nakeds[i];
        SuggestionList.appendChild(item);
      }
    }
    else {
      // if we have no suggestions or this is a misplaced
      // suggestion request then fadeout the box
      fade_out(SuggestionBox);
    }
  }, function(error) {
    // Update status as failure
    show_to_user('Auto suggest method failed: ' + error.status);
  });
}

function remove_duplicates(words) {
  // Build unique words list from words by 1 pass using a hash table
  var uniqueWords = Array();
  var hash = {};
  for (var i = 0; i < words.length; i++) {
    var word = do_enders(words[i]);
    if (hash[word] !== 1) {
      uniqueWords.push(word);
      hash[word] = 1;
    }
  }

  // Return the unique words
  return uniqueWords;
}

var runningID = 0;
// True while a paragraph is being punctuated by a server side method
var paragraphBusy = false;
function print_nikudim(nikudim) {
  // Create span dom element with the first punctuation
  var spElem = print_nikud(nikudim[0]);

  // Set title attribute to hold all possible punctuations
  spElem.title = nikudim.join(',');

  // Mark unpunctuated words with red underline
  var hasNikud = false;
  for (var i = 0; i < nikudim.length; i++) {
    if (nikudim[i].search(nikudRegExp) !== -1) {
      hasNikud = true;
      break;
    }
  }
  if (!hasNikud) {
    spElem.classList.add('unpunctuated');
  }

  // Set unique ID of the span element
  runningID = runningID + 1;
  spElem.nikudaID = runningID;

  // Return the span dom element
  return spElem;
}

function print_nikud(nikud) {
  // Create new DOM span element with some attributres and return it
  var spElem = document.createElement('span');
  spElem.style.cursor = 'pointer';
  spElem.textContent = nikud;
  return spElem;
}

function cycle_nikud() {
  // Get possible punctuations from title
  var nikudim = trim(origElemRef.title).split(',');

  // Find the current punctuation in the punctuations list
  var currentNikud = trim(origElemRef.textContent);
  for (var i = 0; i < nikudim.length; i++) {
    if (nikudim[i] === currentNikud) {
      break;
    }
  }
  var newNikud = ((i === nikudim.length - 1) ? nikudim[0] : nikudim[i + 1]);

  origElemRef.textContent = newNikud;

  select_option(newNikud);
}

function change_nikud(elem) {
  var newNikud = trim(elem.textContent);

  // If we have an orig element referece then update it
  if (origElemRef !== false) {
    // Check that this is a punctuation of the origElemRef
    if (origElemRef.nikudaID === elem.nikudaID) {
      origElemRef.textContent = newNikud;
    }
  }

  select_option(newNikud);
}

function nikudize(doneHandler) {
  // Reset input boxes
  SuggestionList.replaceChildren();
  Quicky.value = '';
  update_buttons();

  // Hide all other punctuation ways punctuate automatic and focus on text
  MeNaked.classList.add('me-naked-hidden');

  var txt = MainText.value;

  Answer.replaceChildren();

  // Build word list array (sent to server)
  var sentWords = Array();
  while (true) {
    var pos = txt.search(nikudABRegExp);
    if (pos > 0)
    {
      // Add whatever came b4 the word to the div element
      append_text(Answer, txt.substring(0, pos));
      txt = txt.substr(pos);
    }
    if (pos < 0)
    {
      // Add whats left of the text to the div element
      append_text(Answer, txt);
      break;
    }
    // Now our text begins with the next word
    var last = txt.search(notNikudABRegExp);
    if (last < 0)
    {
      // Add eof case
      last = txt.length;
    }
    var word = do_enders(txt.substr(0, last));

    // Add a span element containing the word to the answer
    Answer.appendChild(print_nikudim([word]));

    sentWords.push(
        {Naked: word,
          ID: runningID});

    txt = txt.substr(last);
  }

  // Call naked with success handler that punctuates the span element and
  // done handler that focuses the text and calls input done handler
  naked(
        sentWords,
        function(nikudim, nikudID) {
        var spans = Answer.querySelectorAll(':scope > span');
        for (var i = 0; i < spans.length; i++) {
          if (spans[i].nikudaID === nikudID) {
            spans[i].replaceWith(print_nikudim(nikudim));
            break;
          }
        }
      },
        function() {
        if (typeof(doneHandler) === 'function') {
          doneHandler();
        }
      });
}

// Same as nikudize, but the whole paragraph is punctuated in context by a
// server side method (one of REMOTE_METHODS) instead of word by word.
function nikudize_remote(method) {
  SuggestionList.replaceChildren();
  Quicky.value = '';
  update_buttons();
  MeNaked.classList.add('me-naked-hidden');

  var txt = MainText.value;
  if (txt.length > method.maxChars) {
    show_toast('הטקסט ארוך מדי ל' + method.name + ' (עד ' + method.maxChars + ' תווים)');
    return;
  }

  show_toast('מנקד בעזרת ' + method.name + '...');
  paragraphBusy = true;
  update_buttons();
  call_json(method.url, {Text: txt}).then(function(tokens) {
    show_toast('');
    Answer.replaceChildren();
    for (var i = 0; i < tokens.length; i++) {
      var token = tokens[i];
      if (token.Sep || token.Nikudim.length === 0) {
        // Separators (and anything not Hebrew) are copied as is
        append_text(Answer, token.Str);
      } else {
        // Keep the naked word last, as naked() does
        var nikudim = token.Nikudim.slice();
        nikudim.push(token.Str);
        Answer.appendChild(print_nikudim(nikudim));
      }
    }
  }, function(error) {
    if (error.status === 429 && error.body) {
      var wait = Math.ceil(error.body.RetryAfter);
      show_toast(method.name + ' עסוק, נסו שוב בעוד ' + wait + ' שניות');
    } else {
      show_toast(method.name + ' נכשל (' + error.status + ')');
    }
  }).finally(function() {
    paragraphBusy = false;
    update_buttons();
  });
}

function set_QuickyAns(nikudim, nikud, ID) {
  // Add the words to the QuickyAns
  QuickyAns.replaceChildren();

  // Add all possible punctuations to the QuickyAns div with the
  // origElemRef ID
  for (var i = 0; i < nikudim.length; i++) {
    var option = print_nikud(nikudim[i]);
    option.nikudaID = ID;
    QuickyAns.appendChild(option);
    QuickyAns.appendChild(document.createTextNode(' '));
  }

  // Update quicky with naked word
  SuggestionList.replaceChildren();
  Quicky.value = trim(nikud).replace(nikudRegExp, '');
  update_buttons();
  select_option(nikud);
}

// Bold the chosen form among the options and show them
function select_option(nikud) {
  show_to_user('');
  var options = QuickyAns.querySelectorAll(':scope > span');
  var found = false;
  for (var i = 0; i < options.length; i++) {
    var chosen = !found && options[i].textContent === nikud;
    options[i].style.fontWeight = chosen ? 'bold' : 'normal';
    found = found || chosen;
  }
  // (if already shown, does nothing)
  MeNaked.classList.remove('me-naked-hidden');
}

// Each button is enabled only while the box above it has something in it
// (and the paragraph button not while a paragraph is being punctuated)
function update_buttons() {
  NikudizeButton.disabled = paragraphBusy || trim(MainText.value) === '';
  QuickyButton.disabled = trim(Quicky.value) === '';
}

function trim(str) {
  str = str.replace(/^\s+/, '');
  str = str.replace(/\s+$/, '');
  return str;
}

/*
function char_exp(c) {
  if ((c == 'ך') || (c == 'כ')) { return '[כך]'; }
  if ((c == 'ם') || (c == 'מ')) { return '[מם]'; }
  if ((c == 'ן') || (c == 'נ')) { return '[נן]'; }
  if ((c == 'ף') || (c == 'פ')) { return '[פף]'; }
  if ((c == 'ץ') || (c == 'צ')) { return '[צץ]'; }
  return c;
}
*/

/*
function undo_enders(word) {
  word = word.replace(/ך$/g, 'כ');
  word = word.replace(/ם$/g, 'מ');
  word = word.replace(/ן$/g, 'נ');
  word = word.replace(/ף$/g, 'פ');
  word = word.replace(/ץ$/g, 'צ');
  return word;
}
*/

function do_enders(word) {
  word = word.replace(
      /\u05da/g,
      '\u05db');
  word = word.replace(
      /\u05dd/g,
      '\u05de');
  word = word.replace(
      /\u05df/g,
      '\u05e0');
  word = word.replace(
      /\u05e3/g,
      '\u05e4');
  word = word.replace(
      /\u05e5/g,
      '\u05e6');
  word = word.replace(
      /\u05DB[\u05B0\u05B1\u05B2\u05B3\u05B4\u05B5\u05B6\u05B7\u05C2\u05C1\u05B9\u05BC\u05BB]*$/,
      '\u05DA');
  word = word.replace(
      /\u05DB\u05B8$/,
      '\u05DA\u05B8');
  word = word.replace(
      /\u05DE[\u05B0\u05B1\u05B2\u05B3\u05B4\u05B5\u05B6\u05B7\u05B8\u05C2\u05C1\u05B9\u05BC\u05BB]*$/,
      '\u05DD');
  word = word.replace(
      /\u05E0[\u05B0\u05B1\u05B2\u05B3\u05B4\u05B5\u05B6\u05B7\u05B8\u05C2\u05C1\u05B9\u05BC\u05BB]*$/,
      '\u05DF');
  word = word.replace(
      /\u05E4[\u05B0\u05B1\u05B2\u05B3\u05B4\u05B5\u05B6\u05B7\u05B8\u05C2\u05C1\u05B9\u05BC\u05BB]*$/,
      '\u05E3');
  word = word.replace(
      /\u05E6[\u05B0\u05B1\u05B2\u05B3\u05B4\u05B5\u05B6\u05B7\u05B8\u05C2\u05C1\u05B9\u05BC\u05BB]*$/,
      '\u05E5');
  return word;
}

// The page's controls, looked up once the document is ready (demo.js uses
// them too).
var MainText, MeNaked, Quicky, SuggestionBox, SuggestionList, QuickyAns;
var Answer, HelpBox, MemorialBox, NikudizeButton, QuickyButton;

// Close a floating box (help, memorial) on Escape or a click outside it and
// its button.
function setup_floater(box, button) {
  button.addEventListener('click', function() {
    fade_in(box);
  });
  document.addEventListener('keydown', function(evt) {
    if (evt.key === 'Escape') {
      fade_out(box);
    }
  });
  document.addEventListener('click', function(evt) {
    if (is_shown(box) && !box.contains(evt.target) && !button.contains(evt.target)) {
      fade_out(box);
    }
  });
}

// On document ready event (to be run after document loading)
document.addEventListener('DOMContentLoaded', function() {
  // Get the main constant participants by their ids to save searching the
  // DOM later
  MainText = document.getElementById('MainText');
  MeNaked = document.getElementById('MeNaked');
  Quicky = document.getElementById('Quicky');
  SuggestionBox = document.getElementById('SuggestionBox');
  SuggestionList = document.getElementById('SuggestionList');
  QuickyAns = document.getElementById('QuickyAns');
  Answer = document.getElementById('Answer');
  HelpBox = document.getElementById('HelpBox');
  MemorialBox = document.getElementById('MemorialBox');
  NikudizeButton = document.getElementById('NikudizeButton');
  QuickyButton = document.getElementById('QuickyButton');
  // Sometimes the browsers decide to save the latest state of the inputs
  // so override them
  MainText.disabled = false;
  Quicky.disabled = false;
  update_buttons();
  MainText.addEventListener('input', update_buttons);
  Quicky.addEventListener('input', update_buttons);

  // Clear placeholder and value on first user focus
  [MainText, Quicky].forEach(function(input) {
    input.addEventListener('focus', function() {
      input.removeAttribute('placeholder');
      input.value = '';
      update_buttons();
    }, {once: true});
  });

  // Enter in MainText triggers NikudizeButton, Enter in Quicky QuickyButton
  // (a disabled button ignores click())
  MainText.addEventListener('keydown', function(evt) {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      NikudizeButton.click();
    }
  });
  Quicky.addEventListener('keydown', function(evt) {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      QuickyButton.click();
    }
  });

  setup_floater(HelpBox, document.getElementById('HelpButton'));
  setup_floater(MemorialBox, document.getElementById('MemorialButton'));

  // Make the MainText keypress event validate its input
  MainText.addEventListener('keydown', validate_Hebrew);
  // Setup the Answer click event to handle all text word clicks
  Answer.addEventListener('click', function(evt) {
    if (evt.target.tagName === 'SPAN') {
      // Change the original element reference and bold it
      if (origElemRef !== evt.target) {
        if (origElemRef !== false) {
          origElemRef.style.fontWeight = 'normal';
        }

        origElemRef = evt.target;
        origElemRef.style.fontWeight = 'bold';

        set_QuickyAns(origElemRef.title.split(','),
            origElemRef.textContent, origElemRef.nikudaID);
      }
      else {
        // Cycle possible punctuations and set the draft area appropriately
        cycle_nikud();
      }
    }
  });

  // Make the Quicky keypress event validate its input
  Quicky.addEventListener('keydown', validate_Hebrew);
  // Setup the QuickyAns click event to handle all punctuation option
  // word clicks
  QuickyAns.addEventListener('click', function(evt) {
    if (evt.target.tagName === 'SPAN') {
      // Set the answer punctuation and set the draft area appropriately
      change_nikud(evt.target);
    }
  });

  // Setup the form buttons
  NikudizeButton.addEventListener('click', function() {
    var method = document.getElementById('ParagraphMethod').value;
    if (method in REMOTE_METHODS) {
      nikudize_remote(REMOTE_METHODS[method]);
    } else {
      nikudize();
    }
  });

  // Look up the word in Quicky and offer its forms in QuickyAns
  function quicky_lookup() {
    if (Quicky.value.length > 0) {
      if (origElemRef !== false) {
        if (trim(Quicky.value) !==
            trim(origElemRef.textContent).replace(nikudRegExp, '')) {
          // We are no longer working on a main text word so remove
          // the reference and unbolden it
          origElemRef.style.fontWeight = 'normal';
          origElemRef = false;
        }
      }

      // Get new ID and send word to punctuation
      runningID++;
      naked(
          Array({Naked: do_enders(Quicky.value), ID: runningID}),
          function(nikudim, nikudID) {
            // If we get an in time non empty reply for the current
            // requested word, set the first possibility for punctuation
            if (runningID === nikudID && nikudim.length > 0) {
              set_QuickyAns(nikudim, nikudim[0], nikudID);
            }
          });
    }
  }

  QuickyButton.addEventListener('click', quicky_lookup);
  Quicky.addEventListener('keyup', Suggest);
  Quicky.addEventListener('blur', function() {
    fade_out(SuggestionBox);
  });
  Quicky.addEventListener('focus', function() {
    // Only fade in the suggestion box if there are items there
    if (SuggestionList.children.length > 0) {
      fade_in(SuggestionBox);
    }
  });
  SuggestionList.addEventListener('click', function(evt) {
    if (evt.target.tagName === 'LI') {
      // Insert the suggestion into the quicky box and look it up
      Quicky.value = evt.target.textContent;
      SuggestionList.replaceChildren();
      fade_out(SuggestionBox);
      update_buttons();
      quicky_lookup();
    }
  });

  // Theme toggle: cycle os -> light -> dark -> os, persist, and update button
  var ThemeLabel = document.getElementById('ThemeLabel');

  function refresh_theme_button(mode) {
    ThemeLabel.textContent = THEME_META[mode].label;
  }

  // Reflect the theme that was applied early in the page load
  refresh_theme_button(get_theme());

  document.getElementById('ThemeToggle').addEventListener('click', function() {
    var current = get_theme();
    var next = THEME_MODES[(THEME_MODES.indexOf(current) + 1) % THEME_MODES.length];
    apply_theme(next);
    try {
      window.localStorage.setItem('theme', next);
    } catch (e) {
      // private windows may refuse storage; the theme still applies
    }
    refresh_theme_button(next);
  });

  // Show pre-punctuated welcome text with clickable spans
  Answer.replaceChildren();
  var welcomeWords = [
    'בְּרוּכִים',
    'הַבָּאִים',
    'לנִקֻדַהּ!',
    '\n',
    'לָחֲצוּ',
    'עַל',
    'הַמִּלִּים',
    'כָּאן',
    'וּרְאוּ',
    'כֵּיצַד',
    'הֵן',
    'מַשְׁתַנּוֹת.',
    '\n',
    'שִׁמּוּשׁ',
    'מֻצְלָח!'
  ];
  for (var i = 0; i < welcomeWords.length; i++) {
    if (welcomeWords[i] === '\n') {
      Answer.appendChild(document.createElement('br'));
    } else {
      Answer.appendChild(print_nikudim([welcomeWords[i]]));
      if (i + 1 < welcomeWords.length && welcomeWords[i + 1] !== '\n') {
        Answer.appendChild(document.createTextNode(' '));
      }
    }
  }

  // Offer Dicta's Nakdan only when the server is configured for it
  call_json('app/features').then(function(features) {
    if (features.nakdan) {
      var option = document.getElementById('NakdanMethod');
      option.disabled = false;
      option.hidden = false;
      document.getElementById('NakdanCredit').style.display = '';
      document.getElementById('NakdanHelp').style.display = '';
    }
  }, function() {});

  // Show which version is serving: git describe, deploy date and the Cloud
  // Run revision, stamped by gcloud_run_deploy.sh and served by app/version.
  call_json('app/version').then(function(info) {
    document.getElementById('VersionInfo').textContent =
        info.git_describe + ' · ' + info.deploy_date + ' · ' + info.revision;
  }, function() {});
});
