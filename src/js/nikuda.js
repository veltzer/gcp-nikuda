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
var draftElemRef = false;
var letterElemRef = false;

// useful regular expressions
var nikudABRegExp = /[אבגדהוזחטיכךלמםנןסעפףצץקרשתְֱֲֳִֵֶַָֹֻּׁׂ]/g;
var notNikudABRegExp = /[^אבגדהוזחטיכךלמםנןסעפףצץקרשתְֱֲֳִֵֶַָֹֻּׁׂ]/g;
var sinNikudRegExp = /[ׁׂ]/g;
var dageshRegExp = /ּ/g;
var notSinNikudRegExp = /[ְֱֲֳִֵֶַָֹֻ]/g;
var nikudRegExp =
    /[\u05b0\u05b1\u05b2\u05b3\u05b4\u05b5\u05b6\u05b7\u05b8\u05c2\u05c1\u05b9\u05bc\u05bb]/g;
/* var lastLettersRegExp = /[כמנפצ]$/g; */
/* var firstLettersRegExp = /^[בכלמשהו]/g; */
var ABRegExp = /[אבגדהוזחטיכךלמםנןסעפףצץקרשת]/g;

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

function log(text) {
  if (window.console) {
    window.console.log(text);
  }
}

function log_error(text) {
  log(text);
}

function get_Key_Code(evt) {
  if (window.event) { // IE
    return evt.keyCode;
  } else if (evt.which) { // Netscape/Firefox/Opera
    return evt.which;
  }
  log_error('coundnt get keycode');
  return undefined;
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

  set_Draft(newNikud);
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

  set_Draft(newNikud);
}

function nikudize(doneHandler) {
  // Reset input boxes
  SuggestionList.children('li').remove();
  Quicky.val('');
  Draft.text('');

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
        doneHandler();
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

  // Select quicky ans element
  QuickyAns.children('span').css('font-weight', 'normal');
  $.each(QuickyAns.children('span'), function(index, element) {
    fake_use(index);
    if ($(element).text() === nikud) {
      draftElemRef = element;
      return false;
    }
    return undefined;
  });
  $(draftElemRef).css('font-weight', 'bold');

  var word = trim($(draftElemRef).text());
  // Update quicky with naked word
  SuggestionList.children('li').remove();
  Quicky.val(word.replace(nikudRegExp, ''));
  // Update draft with punc word
  set_Draft(word);
}

function set_Draft(nikud) {
  //Reset the status div
  show_to_user('');
  // Add each letter as a span element to the draft div
  // Remove current letters
  Draft.children('span').remove();
  Draft.text('');

  // Traverse the word breaking it up into letters
  // (and perhaps their punctuations)
  var pos;
  var brokenWord = nikud;
  while (true) {
    pos = brokenWord.search(ABRegExp);
    if (pos === -1) {
      break;
    }
    var posLast = brokenWord.substr(pos + 1).search(ABRegExp);
    if (posLast === -1) {
      posLast = brokenWord.length;
    }
    else {
      posLast = posLast + pos + 1;
    }

    // Add the single letter as span element
    Draft.append(print_nikud(brokenWord.substr(pos, posLast)));

    // Move to next letter
    brokenWord = brokenWord.substr(posLast);
  }

  letterElemRef = Draft.children(':first');
  $(letterElemRef).css('font-weight', 'bold');

  // Iterate over the quicky ans words and bold just the selected word
  QuickyAns.children('span').css('font-weight', 'normal');
  $.each(QuickyAns.children('span'), function(index, element) {
    fake_use(index);
    if ($(element).text() === nikud) {
      $(element).css('font-weight', 'bold');
      return false;
    }
    return undefined;
  });

  // Show the punctuation div now that it is set up
  // (if already shown, does nothing)
  MeNaked.removeClass('me-naked-hidden');
}

function update_Draft() {
  if (!draftElemRef) {
    show_to_user('ראשית כל יש להקליק על מילה בטקסט המנוקד.\n' +
        'אחכ אפשר לשנות אותה במשבצת.\n' +
        'ורק אז לחץ עלי כדי לעדכנה חזרה לטקסט המנוקד.');
    return false;
  }

  // Add letters up to a word
  var current = '';
  $.each(Draft.children('span'), function(index, element) {
    fake_use(index);
    current += $(element).text();
  });
  // Remove illegal end word punctuations
  current = do_enders(current);

  // Check if this punctuation exists
  var exists = false;
  $.each(QuickyAns.children('span'), function(index, element) {
    fake_use(index);
    if ($(element).text() === current) {
      exists = element;
      return false;
    }
    return undefined;
  });

  QuickyAns.children('span').css('font-weight', 'normal');

  if (exists) {
    // Word found so bold it and set the answer punctuation
    $(exists).css('font-weight', 'bold');

    // Change current nikud of orig element reference
    if (origElemRef !== false) {
      change_nikud($(exists));
    }

    return false;
  }

  // Update form
  // Create span element containing the current punctuation
  var currentSpan = print_nikud(current);

  // Append the new punctuation span to the quickyAns punctuation option word
  // span list and make it the chosen word
  currentSpan.css('font-weight', 'bold');
  QuickyAns.append(currentSpan);
  QuickyAns.append(' ');

  // If we are working on a word from the current text
  if (origElemRef !== false) {
    currentSpan.data('ID', $(origElemRef).data('ID'));
    $(origElemRef).attr('title', $(origElemRef).attr('title') + ',' + current);
    change_nikud(currentSpan);
  }
  return undefined;
}

function insert_Draft(value, letter) {
  if (!letter) {
    if (letterElemRef !== false) {
      letter = letterElemRef;
    }
    else {
      // Report error?
      return false;
    }
  }

  if (!value) {
    // Report error?
    return false;
  }

  var current = $(letter).text();

  // The idea is that there could be a shin sin sound, a movement and a
  // hiphen at most on any single letter
  if (value === ' ') {
    current = current.replace(nikudRegExp, '');
  }
  else if ((value === 'ׂ') || (value === 'ׁ') ||
      (value === 'ׁׂ') || (value === 'ׁׂ')) {
    if (current.search('ש') !== -1) {
      if (value.length === 1) {
        current = current.replace(sinNikudRegExp, '');
        current += value;
      }
      // We have an option of alternating shin sin sounds in memory of sagi
      // shagi saval shoval
      else {
        if (current.search('') !== -1) {
          current = current.replace(sinNikudRegExp, '');
          current += 'ׁ';
        }
        else {
          current = current.replace(sinNikudRegExp, '');
          current += 'ׂ';
        }
      }
    } else {
      show_to_user('error?!?');
    }
  }
  else if (value === 'ּ') {
    // h' is not here because it can have a mapik
    // the rest of the letters can't accept doubling
    // (except r in very esoteric cases)
    if (current.search('[אעחר]') === -1) {
      if (current.search(dageshRegExp) === -1) {
        if (current.search('ו') !== -1) {
          current = current.replace(nikudRegExp, '');
        }
        current += value;
      }
    }
  }
  else {
    if (current.search(nikudRegExp) !== -1) {
      if (current.search('ו') !== -1) {
        current = current.replace(dageshRegExp, '');
      }
      current = current.replace(notSinNikudRegExp, '');
    }
    current += value;
  }

  $(letter).text(current);
  return undefined;
}

/*
function imitate_nikud(from, to) {
  if (!to) {
    to = Draft.text();
  }
  from = trim(from);
  to = trim(to);
  var fromNN = from.replace(nikudRegExp, '');
  var toNN = to.replace(nikudRegExp, '');

  // Copy nikud from->to regardles of the letters
  if (fromNN.length == toNN.length) {
    to = '';
    var iNN = 0;
    for (var i = 0; i < from.length; i++) {
      if (from.charAt(i).match(/[א-ת]/)) {
        to += toNN.charAt(iNN);
        iNN++;
      }
      else to += from.charAt(i);
    }
  }


// Copy from-> part of to
  else if (undo_enders(toNN).search(undo_enders(fromNN)) != -1) {
    var exp = '';
    for (var i = 0; i < fromNN.length; i++) {
      exp += char_exp(fromNN.charAt(i));
      exp += nikudRegExp;
    }
    exp += '';
    var pos = to.search(exp);
    var lastPart = to.substring(RegExp.lastIndex);

    var target = to.substring(pos, RegExp.lastIndex);
    target = target.replace(nikudRegExp, '');
    if (target == fromNN) {
      to = to.substring(0, pos) + from + lastPart;
    } else {
      if (target == undo_enders(fromNN)) {
        to = to.substring(0, pos) + undo_enders(from) + lastPart;
      } else {
        to = to.substring(0, pos) + do_enders(from) + lastPart;
      }
    }
  }
  return to;
}

*/

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
  Draft = $('#Draft');
  Answer = $('#Answer');
  HelpBox = $('#HelpBox');
  NikudizeButton = $('#NikudizeButton');
  QuickyButton = $('#QuickyButton');
  DraftUpdateButton = $('#DraftUpdateButton');
  //SelectAll = $('#SelectAll');
  // Sometimes the browsers decide to save the latest state of the inputs
  // so override them
  MainText.removeAttr('disabled');
  NikudizeButton.removeAttr('disabled');
  Quicky.removeAttr('disabled');
  QuickyButton.removeAttr('disabled');

  // Input fields start empty; placeholders provide guidance

  // Clear placeholder and value on first user focus
  MainText.one('focus', function() { $(this).removeAttr('placeholder'); $(this).val(''); });
  Quicky.one('focus', function() { $(this).removeAttr('placeholder'); $(this).val(''); });

  // Enter in MainText triggers NikudizeButton
  MainText.keydown(function(evt) {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      NikudizeButton.click();
    }
  });

  // Enter in Quicky triggers QuickyButton
  Quicky.keydown(function(evt) {
    if (evt.key === 'Enter') {
      evt.preventDefault();
      QuickyButton.click();
    }
  });

  // Bind letter and help hotkeys
  function keyEventHandler(evt) {
    if ((evt.shiftKey) && (evt.ctrlKey)) {

      var keyNum = get_Key_Code(evt);

      switch (keyNum)
      {
        case 72:
          break;
        case 8:
          insert_Draft(' ');
          break;
        case 65:
          // Toggle shin & sin sounds
          insert_Draft('ׁׂ');
          break;
        case 220:
          insert_Draft('ֻ');
          break;
        case 48:
          insert_Draft('ּ');
          break;
        case 57:
          insert_Draft('ֹ');
          break;
        case 56:
          insert_Draft('ָ');
          break;
        case 55:
          insert_Draft('ַ');
          break;
        case 54:
          insert_Draft('ֶ');
          break;
        case 53:
          insert_Draft('ֵ');
          break;
        case 52:
          insert_Draft('ִ');
          break;
        case 51:
          insert_Draft('ֳ');
          break;
        case 50:
          insert_Draft('ֲ');
          break;
        case 49:
          insert_Draft('ֱ');
          break;
        case 192:
          insert_Draft('ְ');
          break;
        default:
          break;
      }

      // Cancel furthur handling
      return false;
    }
    return undefined;
  }

  // Opera wants keyup for some reason
  if ('opera' in window) {
    $(document).keyup(keyEventHandler);
  }
  else {
    $(document).keydown(keyEventHandler);
  }

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

  // Setup the Draft click event to handle all letter clicks
  Draft.click(function(evt) {
    if ($(evt.target).is('span')) {
      if (letterElemRef !== evt.target) {
        if (letterElemRef !== false) {
          $(letterElemRef).css('font-weight', 'normal');
        }

        letterElemRef = evt.target;
        $(letterElemRef).css('font-weight', 'bold');
      }
    }
  });

  // Setup the form buttons
  NikudizeButton.click(function(evt) {
    fake_use(evt);
    nikudize();
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
      Quicky.submit();
    }
  });

  DraftUpdateButton.click(function(evt) {
    fake_use(evt);
    update_Draft();
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
});
