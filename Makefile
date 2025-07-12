##############
# parameters #
##############
# do you want to see the commands executed ?
DO_MKDBG:=0
# do you want dependency on the makefile itself ?
DO_ALLDEP:=1

# do you want to check python code with pylint?
DO_PY_LINT:=1
# do you want to check bash syntax?
DO_BASH_CHECK:=1
# do you want to check the javascript code?
DO_JS_CHECK:=1
# do you want to validate html?
DO_HTML_CHECK:=1
# do you want to validate css?
DO_CSS_CHECK:=0

########
# code #
########
ALL:=

PY_SRC:=$(shell find src scripts -type f -and -name "*.py" 2> /dev/null)
PY_LINT=$(addprefix out/, $(addsuffix .lint, $(basename $(PY_SRC))))
BASH_SRC:=$(shell find scripts -type f -and -name "*.sh" 2> /dev/null)
BASH_CHECK:=$(addprefix out/, $(addsuffix .check, $(basename $(BASH_SRC))))
JS_SRC:=$(shell find src/js -type f -and -name "*.js" 2> /dev/null)
JS_CHECK:=$(addprefix out/, $(addsuffix .check, $(basename $(JS_SRC))))
HTML_SRC:=$(shell find src -type f -and -name "*.html" 2> /dev/null)
HTML_CHECK:=$(addprefix out/, $(addsuffix .check, $(basename $(HTML_SRC))))
CSS_SRC:=$(shell find static/css -type f -and -name "*.css" 2> /dev/null)
CSS_CHECK:=$(addprefix out/, $(addsuffix .check, $(basename $(CSS_SRC))))

ifeq ($(DO_PY_LINT),1)
ALL+=$(PY_LINT)
endif # DO_PY_LINT

ifeq ($(DO_BASH_CHECK),1)
ALL+=$(BASH_CHECK)
endif # DO_BASH_CHECK

ifeq ($(DO_JS_CHECK),1)
ALL+=$(JS_CHECK)
endif # DO_JS_CHECK

ifeq ($(DO_HTML_CHECK),1)
ALL+=$(HTML_CHECK)
endif # DO_HTML_CHECK

ifeq ($(DO_CSS_CHECK),1)
ALL+=$(CSS_CHECK)
endif # DO_CSS_CHECK

# silent stuff
ifeq ($(DO_MKDBG),1)
Q:=
# we are not silent in this branch
else # DO_MKDBG
Q:=@
#.SILENT:
endif # DO_MKDBG

#########
# rules #
#########
.PHONY: all
all: $(ALL)
	@true

.PHONY: debug
debug:
	$(info doing [$@])
	$(info PY_SRC is $(PY_SRC))
	$(info PY_LINT is $(PY_LINT))
	$(info BASH_SRC is $(BASH_SRC))
	$(info BASH_CHECK is $(BASH_CHECK))
	$(info JS_SRC is $(JS_SRC))
	$(info JS_CHECK is $(JS_CHECK))
	$(info HTML_SRC is $(HTML_SRC))
	$(info HTML_CHECK is $(HTML_CHECK))
	$(info CSS_SRC is $(CSS_SRC))
	$(info CSS_CHECK is $(CSS_CHECK))
.PHONY: clean
clean:
	$(info doing [$@])
	$(Q)-rm -f $(ALL)
.PHONY: clean_hard
clean_hard:
	$(info doing [$@])
	$(Q)git clean -qffxd

############
# patterns #
############
$(PY_LINT): out/%.lint: %.py .pylintrc
	$(info doing [$@])
	$(Q)pymakehelper error_on_print python -m pylint --reports=n --score=n $<
	$(Q)pymakehelper touch_mkdir $@
$(BASH_CHECK): out/%.check: %.sh .shellcheckrc
	$(info doing [$@])
	$(Q)shellcheck --severity=error --shell=bash --external-sources --source-path="$${HOME}" $<
	$(Q)pymakehelper touch_mkdir $@
$(JS_CHECK): out/%.check: %.js .jshintrc
	$(info doing [$@])
	$(Q)pymakehelper run_with_ignore $< NOJSHINT node_modules/.bin/jshint $<
	$(Q)pymakehelper touch_mkdir $@
$(HTML_CHECK): out/%.check: %.html scripts/run_tidy.py .tidy.config
	$(info doing [$@])
	$(Q)pymakehelper only_print_on_error node_modules/.bin/htmlhint $<
	$(Q)pymakehelper run_with_ignore $< NOTIDY tidy -errors -quiet -config .tidy.config $<
	$(Q)pymakehelper touch_mkdir $@
$(CSS_CHECK): out/%.check: %.css
	$(info doing [$@])
	$(Q)pymakehelper only_print_on_error node_modules/.bin/stylelint $<
	$(Q)pymakehelper touch_mkdir $@

##########
# alldep #
##########
ifeq ($(DO_ALLDEP),1)
.EXTRA_PREREQS+=$(foreach mk, ${MAKEFILE_LIST},$(abspath ${mk}))
endif # DO_ALLDEP
