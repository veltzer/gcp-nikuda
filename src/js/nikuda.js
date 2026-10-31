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

$.ajaxSetup({
  contentType: 'application/json; charset=utf-8',
  dataType: 'json'
});

// General purpose methods

var toastTimeout;
function show_toast(text) {
  var toast = $('#Toast');
  clearTimeout(toastTimeout);
  if (!text) {
    toast.removeClass('toast-visible');
    return;
  }
  toast.text(text).addClass('toast-visible');
  toastTimeout = setTimeout(function() {
    toast.removeClass('toast-visible');
  }, 4000);
}

function show_to_user(text) {
  if (text) {
    console.log(text);
  }
}

function fake_use(x) {
  if (x) {
    window.junkvar = 'junkval';
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

// JSON AJAX punctuation function with success and error handlers
function naked(sentWords, successHandler, doneHandler, errorHandler) {
  // Update status
  show_to_user('מנקד...');
  // Go to the server with words & their respective IDs
  $.post({
    url: 'app/naked',
    data: JSON.stringify(sentWords),
    success: function(replyWords) {
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
    },
    error: function(jqXHR, textStatus, errorThrown) {
      if (typeof(errorHandler) === 'function') {
        errorHandler(jqXHR, textStatus, errorThrown);
      } else {
        // Update status as failure
        show_to_user('השרת נכשל בניקוד ' + textStatus);
      }
    }
  });
}

var suggestID = 0;
var currentInaked = 'משתנות';
function Suggest() {
  var inaked = Quicky.val();

  // Do not suggest when the words are too short or havent changed
  if (inaked === currentInaked || inaked.length < 3) {
    SuggestionBox.fadeOut('slow');
    SuggestionList.children('li').remove();
    return;
  } else {
    currentInaked = inaked;
  }

  show_to_user('אוטומט: ' + inaked);

  // Increment suggestions counter so we can connect
  // request to appropriate reply
  suggestID = suggestID + 1;
  // Go to the server with the word & their respective IDs
  $.post({
    url: 'app/suggest',
    data: JSON.stringify({ Naked: inaked, ID: suggestID }),
    success: function(replyWord) {
      // reset status
      show_to_user('');

      // Clear the old
      SuggestionList.children('li').remove();

      var nakeds = replyWord.Nakeds;
      var ID = replyWord.ID;

      if ((ID === suggestID) && (nakeds.length > 0)) {
        // fade in the suggestion box if it is hidden
        SuggestionBox.fadeIn('slow');
        // Add all suggestions to suggestion list
        // as received from server
        for (var i = 0; i < nakeds.length; i++) {
          // Create new DOM list element
          // Append element to the suggestion list
          SuggestionList.append($('<li>', {text: nakeds[i]}));
        }
      }
      else {
        // if we have no suggestions or this is a misplaced
        // suggestion request then fadeout the box
        SuggestionBox.fadeOut('slow');
      }
    },
    error: function(jqXHR, textStatus, errorThrown) {
      fake_use(textStatus);
      fake_use(jqXHR);
      // Update status as failure
      show_to_user('Auto suggest method failed: ' + errorThrown);
    }
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
  spElem.attr('title', nikudim);

  // Mark unpunctuated words with red underline
  var hasNikud = false;
  for (var i = 0; i < nikudim.length; i++) {
    if (nikudim[i].search(nikudRegExp) !== -1) {
      hasNikud = true;
      break;
    }
  }
  if (!hasNikud) {
    spElem.addClass('unpunctuated');
  }

  // Set unique ID data of the span element
  runningID = runningID + 1;
  spElem.data('ID', runningID);

  // Return the span dom element
  return spElem;
}

function print_nikud(nikud) {
  // Create new DOM span element with some attributres and return it
  return $('<span>', {
    style: 'cursor: pointer',
    text: nikud});
}

function cycle_nikud() {
  // Get possible punctuations from title
  var nikudim = trim($(origElemRef).attr('title')).split(',');

  // Find the current punctuation in the punctuations list
  var currentNikud = trim($(origElemRef).text());
  for (var i = 0; i < nikudim.length; i++) {
    if (nikudim[i] === currentNikud) {
      break;
    }
  }
  var newNikud = ((i === nikudim.length - 1) ? nikudim[0] : nikudim[i + 1]);

  $(origElemRef).text(newNikud);

  select_option(newNikud);
}

function change_nikud(elem) {
  var newNikud = trim($(elem).text());

  // If we have an orig element referece then update it
  if (origElemRef !== false) {
    // Check that this is a punctuation of the origElemRef
    if ($(origElemRef).data('ID') === $(elem).data('ID')) {
      $(origElemRef).text(newNikud);
    }
  }

  select_option(newNikud);
}

function nikudize(doneHandler) {
  // Reset input boxes
  SuggestionList.children('li').remove();
  Quicky.val('');
  update_buttons();

  // Hide all other punctuation ways punctuate automatic and focus on text
  MeNaked.addClass('me-naked-hidden');

  var txt = MainText.val();
  txt = txt.replace(/\n/g, '<br>');

  Answer.children('span').remove();
  Answer.text('');

  // Build word list array (sent to server)
  var sentWords = Array();
  while (true) {
    var pos = txt.search(nikudABRegExp);
    if (pos > 0)
    {
      // Add whatever came b4 the word to the div element
      Answer.append(txt.substring(0, pos));
      txt = txt.substr(pos);
    }
    if (pos < 0)
    {
      // Add whats left of the text to the div element
      Answer.append(txt);
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
    Answer.append(print_nikudim([word]));

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
        $.each(Answer.children('span'), function(index, element) {
          fake_use(index);
          if ($.data(element, 'ID') === nikudID) {
            $(element).replaceWith(print_nikudim(nikudim));
            return false;
          }
          return undefined;
        });
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
  SuggestionList.children('li').remove();
  Quicky.val('');
  update_buttons();
  MeNaked.addClass('me-naked-hidden');

  var txt = MainText.val();
  if (txt.length > method.maxChars) {
    show_toast('הטקסט ארוך מדי ל' + method.name + ' (עד ' + method.maxChars + ' תווים)');
    return;
  }

  show_toast('מנקד בעזרת ' + method.name + '...');
  paragraphBusy = true;
  update_buttons();
  $.post({
    url: method.url,
    data: JSON.stringify({Text: txt}),
    success: function(tokens) {
      show_toast('');
      Answer.children('span').remove();
      Answer.text('');
      for (var i = 0; i < tokens.length; i++) {
        var token = tokens[i];
        if (token.Sep || token.Nikudim.length === 0) {
          // Separators (and anything not Hebrew) are copied as is
          var lines = token.Str.split('\n');
          for (var j = 0; j < lines.length; j++) {
            if (j > 0) {
              Answer.append('<br>');
            }
            Answer.append(document.createTextNode(lines[j]));
          }
        } else {
          // Keep the naked word last, as naked() does
          var nikudim = token.Nikudim.slice();
          nikudim.push(token.Str);
          Answer.append(print_nikudim(nikudim));
        }
      }
    },
    error: function(jqXHR) {
      if (jqXHR.status === 429) {
        var wait = Math.ceil(jqXHR.responseJSON.RetryAfter);
        show_toast(method.name + ' עסוק, נסו שוב בעוד ' + wait + ' שניות');
      } else {
        show_toast(method.name + ' נכשל (' + jqXHR.status + ')');
      }
    },
    complete: function() {
      paragraphBusy = false;
      update_buttons();
    }
  });
}

function set_QuickyAns(nikudim, nikud, ID) {
  // Add the words to the QuickyAns
  QuickyAns.children('span').remove();
  QuickyAns.text('');

  // Add all possible punctuations to the QuickyAns div with the
  // origElemRef ID
  for (var i = 0; i < nikudim.length; i++) {
    QuickyAns.append(print_nikud(nikudim[i]).data('ID', ID));
    QuickyAns.append(' ');
  }

  // Update quicky with naked word
  SuggestionList.children('li').remove();
  Quicky.val(trim(nikud).replace(nikudRegExp, ''));
  update_buttons();
  select_option(nikud);
}

// Bold the chosen form among the options and show them
function select_option(nikud) {
  show_to_user('');
  QuickyAns.children('span').css('font-weight', 'normal');
  $.each(QuickyAns.children('span'), function(index, element) {
    fake_use(index);
    if ($(element).text() === nikud) {
      $(element).css('font-weight', 'bold');
      return false;
    }
    return undefined;
  });
  // (if already shown, does nothing)
  MeNaked.removeClass('me-naked-hidden');
}

// Each button is enabled only while the box above it has something in it
// (and the paragraph button not while a paragraph is being punctuated)
function update_buttons() {
  NikudizeButton.prop('disabled', paragraphBusy || trim(MainText.val()) === '');
  QuickyButton.prop('disabled', trim(Quicky.val()) === '');
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

// On document ready event (to be run after document loading)
$(document).ready(function() {
  // Get the main constant participants by their ids to save searching the
  // DOM later
  MainText = $('#MainText');
  MeNaked = $('#MeNaked');
  Quicky = $('#Quicky');
  SuggestionBox = $('#SuggestionBox');
  SuggestionList = $('#SuggestionList');
  QuickyAns = $('#QuickyAns');
  Answer = $('#Answer');
  HelpBox = $('#HelpBox');
  NikudizeButton = $('#NikudizeButton');
  QuickyButton = $('#QuickyButton');
  //SelectAll = $('#SelectAll');
  // Sometimes the browsers decide to save the latest state of the inputs
  // so override them
  MainText.removeAttr('disabled');
  Quicky.removeAttr('disabled');
  update_buttons();
  MainText.on('input', update_buttons);
  Quicky.on('input', update_buttons);

  // Input fields start empty; placeholders provide guidance

  // Clear placeholder and value on first user focus
  MainText.one('focus', function() { $(this).removeAttr('placeholder'); $(this).val(''); update_buttons(); });
  Quicky.one('focus', function() { $(this).removeAttr('placeholder'); $(this).val(''); update_buttons(); });

  // Enter in MainText triggers NikudizeButton
  MainText.keydown(function(evt) {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      // .click() runs the handler even on a disabled button
      if (!NikudizeButton.prop('disabled')) {
        NikudizeButton.click();
      }
    }
  });

  // Enter in Quicky triggers QuickyButton
  Quicky.keydown(function(evt) {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      if (!QuickyButton.prop('disabled')) {
        QuickyButton.click();
      }
    }
  });

  // Escape key closes floating windows
  $(document).keydown(function(evt) {
    if (evt.key === 'Escape') {
      HelpBox.hide('slow');
      $('#MemorialBox').hide('slow');
    }
  });

  // Click outside floater closes it
  $(document).click(function(evt) {
    if (HelpBox.is(':visible') && !$(evt.target).closest('#HelpBox, #HelpButton').length) {
      HelpBox.hide('slow');
    }
    if ($('#MemorialBox').is(':visible') && !$(evt.target).closest('#MemorialBox, #MemorialButton').length) {
      $('#MemorialBox').hide('slow');
    }
  });

  // Make the MainText keypress event validate its input
  MainText.keydown(validate_Hebrew);
  // Setup the Answer click event to handle all text word clicks
  Answer.click(function(evt) {
    if ($(evt.target).is('span')) {
      // Change the original element reference and bold it
      if (origElemRef !== evt.target) {
        if (origElemRef !== false) {
          $(origElemRef).css('font-weight', 'normal');
        }

        origElemRef = evt.target;
        $(origElemRef).css('font-weight', 'bold');

        set_QuickyAns($(origElemRef).attr('title').split(','),
            $(origElemRef).text(), $(origElemRef).data('ID'));
      }
      else {
        // Cycle possible punctuations and set the draft area appropriately
        cycle_nikud();
      }
    }
  });

  // Make the Quicky keypress event validate its input
  Quicky.keydown(validate_Hebrew);
  // Setup the QuickyAns click event to handle all punctuation option
  // word clicks
  QuickyAns.click(function(evt) {
    if ($(evt.target).is('span')) {
      // Set the answer punctuation and set the draft area appropriately
      change_nikud(evt.target);
    }
  });

  // Setup the form buttons
  NikudizeButton.click(function(evt) {
    fake_use(evt);
    var method = $('#ParagraphMethod').val();
    if (method in REMOTE_METHODS) {
      nikudize_remote(REMOTE_METHODS[method]);
    } else {
      nikudize();
    }
  });

  function update_QuickyAns(minAllowed) {
    return function(evt) {
      fake_use(evt);
      if (Quicky.val().length > 0) {
        if (origElemRef !== false) {
          if (trim(Quicky.val()) !==
              trim($(origElemRef).text()).replace(nikudRegExp, '')) {
            // We are no longer working on a main text word so remove
            // the reference and unbolden it
            $(origElemRef).css('font-weight', 'normal');
            origElemRef = false;
          }
        }

        // Get new ID and send word to punctuation
        runningID++;
        naked(
            Array({Naked: do_enders(Quicky.val()), ID: runningID}),
            function(nikudim, nikudID) {
              // If we get an in time non empty reply for the current
              // requested word
              if (runningID === nikudID) {
                if (nikudim.length > minAllowed) {
                  // Set the first possibility for punctuation
                  set_QuickyAns(nikudim, nikudim[0], nikudID);
                  return false;
                }
              }
              return undefined;
            });
      }
    };
  }

  QuickyButton.click(update_QuickyAns(0));
  Quicky.keyup(function(evt) {
    fake_use(evt);
    Suggest();
  });
  Quicky.blur(function(evt) {
    fake_use(evt);
    SuggestionBox.fadeOut('slow');
  });
  Quicky.focus(function(evt) {
    fake_use(evt);
    // Only fade in the suggestion box if there are items there
    if (SuggestionList.children('li').length > 0) {
      SuggestionBox.fadeIn('slow');
    }
  });
  Quicky.submit(update_QuickyAns(0));
  SuggestionList.click(function(evt) {
    if ($(evt.target).is('li')) {
      // Remove all suggestions
      SuggestionList.children('li').remove();
      SuggestionBox.hide('slow');
      // Insert suggestions to quicky box and update
      Quicky.val($(evt.target).text());
      update_buttons();
      Quicky.submit();
    }
  });

  // Theme toggle: cycle os -> light -> dark -> os, persist, and update button
  var ThemeToggle = $('#ThemeToggle');
  var ThemeLabel = $('#ThemeLabel');

  function refresh_theme_button(mode) {
    ThemeLabel.text(THEME_META[mode].label);
  }

  function set_theme(mode) {
    apply_theme(mode);
    try {
      window.localStorage.setItem('theme', mode);
    } catch (e) {
      fake_use(e);
    }
    refresh_theme_button(mode);
  }

  // Reflect the theme that was applied early in the page load
  refresh_theme_button(get_theme());

  ThemeToggle.click(function(evt) {
    fake_use(evt);
    var current = get_theme();
    var next = THEME_MODES[(THEME_MODES.indexOf(current) + 1) % THEME_MODES.length];
    set_theme(next);
  });

  //SelectAll.click(function(evt) {
  //  fake_use(evt);
  //  Answer.children().select();
  //});

  // Show pre-punctuated welcome text with clickable spans
  Answer.children('span').remove();
  Answer.text('');
  var welcomeWords = [
    '\u05D1\u05BC\u05B0\u05E8\u05D5\u05BC\u05DB\u05B4\u05D9\u05DD',
    '\u05D4\u05B7\u05D1\u05BC\u05B8\u05D0\u05B4\u05D9\u05DD',
    '\u05DC\u05E0\u05B4\u05E7\u05BB\u05D3\u05B7\u05D4\u05BC!',
    '\n',
    '\u05DC\u05B8\u05D7\u05B2\u05E6\u05D5\u05BC',
    '\u05E2\u05B7\u05DC',
    '\u05D4\u05B7\u05DE\u05BC\u05B4\u05DC\u05BC\u05B4\u05D9\u05DD',
    '\u05DB\u05BC\u05B8\u05D0\u05DF',
    '\u05D5\u05BC\u05E8\u05B0\u05D0\u05D5\u05BC',
    '\u05DB\u05BC\u05B5\u05D9\u05E6\u05B7\u05D3',
    '\u05D4\u05B5\u05DF',
    '\u05DE\u05B7\u05E9\u05C1\u05B0\u05EA\u05B7\u05E0\u05BC\u05D5\u05B9\u05EA.',
    '\n',
    '\u05E9\u05C1\u05B4\u05DE\u05BC\u05D5\u05BC\u05E9\u05C1',
    '\u05DE\u05BB\u05E6\u05B0\u05DC\u05B8\u05D7!'
  ];
  for (var i = 0; i < welcomeWords.length; i++) {
    if (welcomeWords[i] === '\n') {
      Answer.append('<br>');
    } else {
      Answer.append(print_nikudim([welcomeWords[i]]));
      if (i + 1 < welcomeWords.length && welcomeWords[i + 1] !== '\n') {
        Answer.append(' ');
      }
    }
  }

  // Offer Dicta's Nakdan only when the server is configured for it
  $.getJSON('app/features', function(features) {
    if (features.nakdan) {
      $('#NakdanMethod').removeAttr('disabled').removeAttr('hidden');
      $('#NakdanCredit').show();
    }
  });

  // Show which version is serving: git describe, deploy date and the Cloud
  // Run revision, stamped by scripts/deploy.sh and served by app/version.
  $.getJSON('app/version', function(info) {
    $('#VersionInfo').text(
        info.git_describe + ' · ' + info.deploy_date + ' · ' +
        info.revision);
  });
});
