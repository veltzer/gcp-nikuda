// Guided demo ("הדגמה" button): a tour of balloons, each pointing at one
// control. Before every step that types into a box or presses a button the
// user confirms it, and the demo then does it for them with a ready-made
// paragraph and word.
//
// Uses the globals that nikuda.js sets up on document ready (MainText,
// Answer, Quicky, QuickyAns, NikudizeButton, QuickyButton, nikudRegExp) and
// the 'nikuda:ajaxerror' event its call_json() fires on a failed request.

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
var demoFail = null;

function demo_naked(text) {
  return text.replace(nikudRegExp, '');
}

// The span in the vocalized paragraph that holds word, once vocalized.
function demo_answer_word(word) {
  var spans = Answer.querySelectorAll(':scope > span');
  for (var i = 0; i < spans.length; i++) {
    var text = spans[i].textContent;
    if (demo_naked(text) === word && text.search(nikudRegExp) !== -1) {
      return spans[i];
    }
  }
  return null;
}

// Fill an input as if typed, first running its one-time focus handler
// (which clears the box) so it does not wipe the demo text later. A
// dispatched focus event runs the handlers without moving the focus.
function demo_fill(input, text) {
  input.dispatchEvent(new Event('focus'));
  input.removeAttribute('placeholder');
  input.value = text;
  // enables the button under the input, as typing would
  input.dispatchEvent(new Event('input'));
}

// Call done once check() holds; call fail on a failed request or timeout.
function demo_wait(check, done, fail) {
  var start = Date.now();
  demoFail = function() {
    demo_stop_waiting();
    fail();
  };
  document.addEventListener('nikuda:ajaxerror', demoFail);
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
  if (demoFail) {
    document.removeEventListener('nikuda:ajaxerror', demoFail);
    demoFail = null;
  }
}

// The sentence about Dicta's Nakdan, only when nikuda.js has offered it
// (the server is configured for it).
function demo_nakdan_text() {
  return document.getElementById('NakdanMethod').hidden ? '' :
      ' הנקדן של דיקטה מנקד גם הוא לפי ההקשר, בעזרת השירות של dicta.org.il.';
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
          'ומילון נקדה מנקד כל מילה לבדה.' + demo_nakdan_text()
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
        demo_answer_word(DEMO_PARAGRAPH_WORD).click();
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
          var first = QuickyAns.querySelector(':scope > span');
          return first !== null && demo_naked(first.textContent) === DEMO_WORD;
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
      step.target() : document.querySelector(step.target);
  return target || null;
}

function demo_place() {
  if (!demoBalloon) {
    return;
  }
  var balloon = demoBalloon;
  var margin = 8;
  var gap = 14;
  var width = balloon.offsetWidth;
  var height = balloon.offsetHeight;
  var view = {w: window.innerWidth, h: window.innerHeight};
  balloon.classList.remove('demo-above', 'demo-below', 'demo-center');

  if (!demoTarget) {
    balloon.classList.add('demo-center');
    balloon.style.left = Math.max(margin, (view.w - width) / 2) + 'px';
    balloon.style.top = Math.max(margin, (view.h - height) / 2) + 'px';
    return;
  }

  var rect = demoTarget.getBoundingClientRect();
  var top = rect.bottom + gap;
  if (top + height > view.h - margin && rect.top - gap - height >= margin) {
    top = rect.top - gap - height;
    balloon.classList.add('demo-above');
  } else {
    top = Math.min(top, view.h - height - margin);
    balloon.classList.add('demo-below');
  }
  var center = rect.left + rect.width / 2;
  var left = Math.min(Math.max(margin, center - width / 2),
      view.w - width - margin);
  balloon.style.left = left + 'px';
  balloon.style.top = Math.max(margin, top) + 'px';
  var arrow = Math.min(Math.max(18, center - left), width - 18);
  demo_part('.demo-arrow').style.left = arrow + 'px';
}

// One part of the balloon (count, text, buttons, arrow).
function demo_part(selector) {
  return demoBalloon.querySelector(selector);
}

// The next/finish button: label and whether it can be pressed.
function demo_set_next(label, enabled) {
  var next = demo_part('.demo-next');
  next.textContent = label;
  next.disabled = !enabled;
}

function demo_untarget() {
  if (demoTarget) {
    demoTarget.classList.remove('demo-target');
  }
}

function demo_show(index) {
  demo_stop_waiting();
  demo_untarget();
  demoIndex = index;
  var step = demoSteps[index];
  if (step.enter) {
    step.enter();
  }
  demoTarget = demo_resolve_target(step);
  if (demoTarget) {
    demoTarget.classList.add('demo-target');
    demoTarget.scrollIntoView({block: 'nearest', inline: 'nearest'});
  }

  // In words: "1 / 11" in a right-to-left page is laid out as "11 / 1".
  demo_part('.demo-count').textContent =
      'שלב ' + (index + 1) + ' מתוך ' + demoSteps.length;
  demo_part('.demo-text').textContent = step.text;
  var last = index === demoSteps.length - 1;
  demo_set_next(step.next || 'הבא', true);
  demo_part('.demo-stop').style.display = last ? 'none' : '';
  demo_place();
  demo_part('.demo-next').focus();
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
  demo_set_next('רגע...', false);
  step.action(function() {
    demo_show(demoIndex + 1);
  }, function() {
    demo_part('.demo-text').textContent =
        'השרת לא ענה הפעם. אפשר לנסות שוב או לסיים את ההדגמה.';
    demo_set_next('נסו שוב', true);
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
  demo_untarget();
  demoTarget = null;
  if (demoBalloon) {
    demoBalloon.remove();
    demoBalloon = null;
  }
  window.removeEventListener('resize', demo_place);
  window.removeEventListener('scroll', demo_place, true);
  document.removeEventListener('keydown', demo_keydown);
}

function demo_start() {
  demo_end();
  demoSteps = demo_build_steps();
  demoBalloon = document.createElement('div');
  demoBalloon.id = 'DemoBalloon';
  demoBalloon.className = 'demo-balloon';
  demoBalloon.setAttribute('role', 'dialog');
  demoBalloon.setAttribute('aria-live', 'polite');
  demoBalloon.innerHTML =
      '<div class="demo-count"></div>' +
      '<div class="demo-text"></div>' +
      '<div class="demo-actions">' +
      '<button type="button" class="demo-next"></button>' +
      '<button type="button" class="demo-stop">סיום</button>' +
      '</div>' +
      '<div class="demo-arrow"></div>';
  demo_part('.demo-next').addEventListener('click', demo_next);
  demo_part('.demo-stop').addEventListener('click', demo_end);
  document.body.appendChild(demoBalloon);
  window.addEventListener('resize', demo_place);
  // Capture, so scrolling either panel moves the balloon with its target.
  window.addEventListener('scroll', demo_place, true);
  document.addEventListener('keydown', demo_keydown);
  demo_show(0);
}

document.addEventListener('DOMContentLoaded', function() {
  document.getElementById('DemoButton').addEventListener('click', demo_start);
});
