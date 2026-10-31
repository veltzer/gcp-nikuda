// Guided demo ("הדגמה" button): a tour of balloons, each pointing at one
// control. Before every step that types into a box or presses a button the
// user confirms it, and the demo then does it for them with a ready-made
// paragraph and word.
//
// Uses the globals that nikuda.js sets up on document ready (MainText,
// Answer, Quicky, QuickyAns, NikudizeButton, QuickyButton, nikudRegExp).

var DEMO_PARAGRAPH =
    'בשבוע שעבר נסענו לירושלים עם המשפחה. טיילנו בעיר העתיקה, ' +
    'אכלנו חומוס במסעדה קטנה וקנינו ספרים ישנים בשוק.\n' +
    'בערב ישבנו על המרפסת וסיפרנו סיפורים עד שהילדים נרדמו.';
// A word of the paragraph that has more than one vocalization.
var DEMO_PARAGRAPH_WORD = 'ספרים';
// A single word with many vocalizations (book, counted, told, barber...).
var DEMO_WORD = 'ספר';
// Longest wait for the server before giving up on a step.
var DEMO_TIMEOUT = 30000;
// Clicks this soon after a step appears are ignored, so a double-click or a
// click that lands as the balloon moves cannot skip the next step unread.
var DEMO_CLICK_GUARD = 300;

var demoSteps = [];
var demoIndex = -1;
var demoBalloon = null;
var demoTarget = null;
var demoTimer = null;
var demoShownAt = 0;

function demo_naked(text) {
  return text.replace(nikudRegExp, '');
}

// The span in the vocalized paragraph that holds word, once vocalized.
function demo_answer_word(word) {
  var found = null;
  Answer.children('span').each(function() {
    var text = $(this).text();
    if (demo_naked(text) === word && text.search(nikudRegExp) !== -1) {
      found = this;
      return false;
    }
    return undefined;
  });
  return found;
}

// Fill an input as if typed, first running its one-time focus handler
// (which clears the box) so it does not wipe the demo text later.
function demo_fill(input, text) {
  input.triggerHandler('focus');
  input.removeAttr('placeholder');
  input.val(text);
  // enables the button under the input, as typing would
  input.trigger('input');
}

// Call done once check() holds; call fail on a failed request or timeout.
function demo_wait(check, done, fail) {
  var start = Date.now();
  $(document).on('ajaxError.demo', function() {
    demo_stop_waiting();
    fail();
  });
  demoTimer = setInterval(function() {
    if (check()) {
      demo_stop_waiting();
      done();
    } else if (Date.now() - start > DEMO_TIMEOUT) {
      demo_stop_waiting();
      fail();
    }
  }, 150);
}

function demo_stop_waiting() {
  clearInterval(demoTimer);
  demoTimer = null;
  $(document).off('ajaxError.demo');
}

function demo_build_steps() {
  return [
    {
      text: 'ברוכים הבאים להדגמה של נִקֻּדַהּ! נעבור יחד על השימוש באתר, ' +
          'צעד אחר צעד. ההדגמה תכתוב טקסט לדוגמה בתיבות ותלחץ על ' +
          'הכפתורים בשבילכם, ולכן מה שכתבתם בתיבות יוחלף. להתחיל?',
      next: 'התחילו'
    },
    {
      target: '#MainText',
      enter: function() { demo_fill(MainText, DEMO_PARAGRAPH); },
      text: 'כאן כותבים או מדביקים פסקה בלי ניקוד. הכנסנו פסקה לדוגמה.'
    },
    {
      target: '#ParagraphMethod',
      text: 'כאן בוחרים איך לנקד את הפסקה: נקדימון מנקד לפי ההקשר במשפט, ' +
          'ומילון נקדה מנקד כל מילה לבדה.'
    },
    {
      target: '#NikudizeButton',
      text: 'עכשיו לוחצים על "נקד פסקה שלמה". ללחוץ בשבילכם?',
      next: 'נקד',
      action: function(done, fail) {
        NikudizeButton.click();
        demo_wait(function() {
          return demo_answer_word(DEMO_PARAGRAPH_WORD) !== null;
        }, done, fail);
      }
    },
    {
      target: '#Answer',
      text: 'הנה הפסקה המנוקדת. מילה שלא נמצא לה ניקוד מסומנת באדום ' +
          'בקו גלי.'
    },
    {
      target: function() { return demo_answer_word(DEMO_PARAGRAPH_WORD); },
      text: 'מילה נוקדה לא נכון? לוחצים עליה. ללחוץ בשבילכם על "' +
          DEMO_PARAGRAPH_WORD + '"?',
      next: 'לחצו',
      action: function(done) {
        $(demo_answer_word(DEMO_PARAGRAPH_WORD)).trigger('click');
        done();
      }
    },
    {
      target: '#QuickyAns',
      text: 'אלה אפשרויות הניקוד של המילה. לחיצה על אפשרות מחליפה את ' +
          'המילה בטקסט, וכל לחיצה נוספת על המילה בטקסט עוברת לאפשרות ' +
          'הבאה.'
    },
    {
      target: '#Quicky',
      enter: function() { demo_fill(Quicky, DEMO_WORD); },
      text: 'אפשר גם לנקד מילה בודדת: כותבים אותה כאן. הכנסנו את המילה "' +
          DEMO_WORD + '".'
    },
    {
      target: '#QuickyButton',
      text: 'לוחצים על "נקד מילה בודדת". ללחוץ בשבילכם?',
      next: 'נקד',
      action: function(done, fail) {
        QuickyButton.click();
        demo_wait(function() {
          var first = QuickyAns.children('span').first();
          return first.length > 0 && demo_naked(first.text()) === DEMO_WORD;
        }, done, fail);
      }
    },
    {
      target: '#QuickyAns',
      text: 'אלה כל הדרכים לנקד "' + DEMO_WORD + '". לחיצה על אפשרות ' +
          'בוחרת אותה.'
    },
    {
      target: '#HelpButton',
      text: 'זהו! פרטים נוספים וקיצורי מקלדת יש בכפתור "עזרה", ואפשר ' +
          'להריץ את ההדגמה שוב בכל עת.',
      next: 'סיום'
    }
  ];
}

function demo_resolve_target(step) {
  if (!step.target) {
    return null;
  }
  var target = (typeof step.target === 'function') ?
      step.target() : $(step.target)[0];
  return target || null;
}

function demo_place() {
  if (!demoBalloon) {
    return;
  }
  var balloon = demoBalloon[0];
  var margin = 8;
  var gap = 14;
  var width = balloon.offsetWidth;
  var height = balloon.offsetHeight;
  var view = {w: window.innerWidth, h: window.innerHeight};
  demoBalloon.removeClass('demo-above demo-below demo-center');

  if (!demoTarget) {
    demoBalloon.addClass('demo-center');
    balloon.style.left = Math.max(margin, (view.w - width) / 2) + 'px';
    balloon.style.top = Math.max(margin, (view.h - height) / 2) + 'px';
    return;
  }

  var rect = demoTarget.getBoundingClientRect();
  var top = rect.bottom + gap;
  if (top + height > view.h - margin && rect.top - gap - height >= margin) {
    top = rect.top - gap - height;
    demoBalloon.addClass('demo-above');
  } else {
    top = Math.min(top, view.h - height - margin);
    demoBalloon.addClass('demo-below');
  }
  var center = rect.left + rect.width / 2;
  var left = Math.min(Math.max(margin, center - width / 2),
      view.w - width - margin);
  balloon.style.left = left + 'px';
  balloon.style.top = Math.max(margin, top) + 'px';
  var arrow = Math.min(Math.max(18, center - left), width - 18);
  demoBalloon.find('.demo-arrow').css('left', arrow + 'px');
}

function demo_show(index) {
  demo_stop_waiting();
  $(demoTarget).removeClass('demo-target');
  demoIndex = index;
  var step = demoSteps[index];
  if (step.enter) {
    step.enter();
  }
  demoTarget = demo_resolve_target(step);
  if (demoTarget) {
    $(demoTarget).addClass('demo-target');
    demoTarget.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }

  // In words: "1 / 11" in a right-to-left page is laid out as "11 / 1".
  demoBalloon.find('.demo-count').text(
      'שלב ' + (index + 1) + ' מתוך ' + demoSteps.length);
  demoBalloon.find('.demo-text').text(step.text);
  var last = index === demoSteps.length - 1;
  demoBalloon.find('.demo-next')
      .text(step.next || 'הבא')
      .prop('disabled', false);
  demoBalloon.find('.demo-stop').toggle(!last);
  demo_place();
  demoBalloon.find('.demo-next').trigger('focus');
  demoShownAt = Date.now();
}

function demo_next() {
  if (Date.now() - demoShownAt < DEMO_CLICK_GUARD) {
    return;
  }
  var step = demoSteps[demoIndex];
  if (demoIndex === demoSteps.length - 1) {
    demo_end();
    return;
  }
  if (!step.action) {
    demo_show(demoIndex + 1);
    return;
  }
  demoBalloon.find('.demo-next').text('רגע...').prop('disabled', true);
  step.action(function() {
    demo_show(demoIndex + 1);
  }, function() {
    demoBalloon.find('.demo-text').text(
        'השרת לא ענה הפעם. אפשר לנסות שוב או לסיים את ההדגמה.');
    demoBalloon.find('.demo-next').text('נסו שוב').prop('disabled', false);
    demo_place();
  });
}

function demo_keydown(evt) {
  if (evt.key === 'Escape') {
    demo_end();
  } else if (evt.key === 'Enter' && evt.repeat) {
    // A held Enter would press the focused button once per repeat.
    evt.preventDefault();
  }
}

function demo_end() {
  demo_stop_waiting();
  $(demoTarget).removeClass('demo-target');
  demoTarget = null;
  if (demoBalloon) {
    demoBalloon.remove();
    demoBalloon = null;
  }
  $(window).off('resize.demo');
  window.removeEventListener('scroll', demo_place, true);
  $(document).off('keydown', demo_keydown);
}

function demo_start() {
  demo_end();
  demoSteps = demo_build_steps();
  demoBalloon = $('<div>', {
    id: 'DemoBalloon',
    'class': 'demo-balloon',
    role: 'dialog',
    'aria-live': 'polite'
  }).append(
      $('<div>', {'class': 'demo-count'}),
      $('<div>', {'class': 'demo-text'}),
      $('<div>', {'class': 'demo-actions'}).append(
          $('<button>', {type: 'button', 'class': 'demo-next'}).click(demo_next),
          $('<button>', {type: 'button', 'class': 'demo-stop', text: 'סיום'})
              .click(demo_end)),
      $('<div>', {'class': 'demo-arrow'}));
  $('body').append(demoBalloon);
  $(window).on('resize.demo', demo_place);
  // Capture, so scrolling either panel moves the balloon with its target.
  window.addEventListener('scroll', demo_place, true);
  $(document).on('keydown', demo_keydown);
  demo_show(0);
}

$(document).ready(function() {
  $('#DemoButton').click(demo_start);
});
