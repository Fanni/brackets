/*
 * Copyright (c) 2013 Adobe Systems Incorporated. All rights reserved.
 *  
 * Permission is hereby granted, free of charge, to any person obtaining a
 * copy of this software and associated documentation files (the "Software"), 
 * to deal in the Software without restriction, including without limitation 
 * the rights to use, copy, modify, merge, publish, distribute, sublicense, 
 * and/or sell copies of the Software, and to permit persons to whom the 
 * Software is furnished to do so, subject to the following conditions:
 *  
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *  
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, 
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER 
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING 
 * FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER 
 * DEALINGS IN THE SOFTWARE.
 * 
 */


/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50 */
/*global define, $, window */

/**
 * Manages parts of the status bar related to the current editor's state.
 */
define(function (require, exports, module) {
    "use strict";
    
    // Load dependent modules
    var _                            = require("thirdparty/lodash"),
        AnimationUtils      = require("utils/AnimationUtils"),
        AppInit                      = require("utils/AppInit"),
        EditorManager                = require("editor/EditorManager"),
        Editor                       = require("editor/Editor").Editor,
        KeyEvent                     = require("utils/KeyEvent"),
        LanguageManager              = require("language/LanguageManager"),
        StatusBar                    = require("widgets/StatusBar"),
        Strings                      = require("strings"),
        StringUtils                  = require("utils/StringUtils");
    
    /* StatusBar indicators */
    var $languageSelect,
        $cursorInfo,
        $fileInfo,
        $indentType,
        $indentWidthLabel,
        $indentWidthInput,
        $statusOverwrite;
    
    
    function _formatCountable(number, singularStr, pluralStr) {
        return StringUtils.format(number > 1 ? pluralStr : singularStr, number);
    }
    
    function _updateLanguageInfo(editor) {
        var doc = editor.document,
            lang = doc.getLanguage();
        
        // Ensure width isn't left locked by a previous click of the dropdown (which may not have resulted in a "change" event at the time)
        $languageSelect.css("width", "auto");
        
        // Setting Untitled documents to non-text mode isn't supported yet, so disable the switcher in that case for now
        $languageSelect.prop("disabled", doc.isUntitled());
        
        // Only show the current language (full list populated only when dropdown is opened)
        $languageSelect.empty();
        $("<option />").val(lang.getId()).text(lang.getName())
            .appendTo($languageSelect);
        $languageSelect.val(lang.getId());
    }
    
    function _updateFileInfo(editor) {
        var lines = editor.lineCount();
        $fileInfo.text(_formatCountable(lines, Strings.STATUSBAR_LINE_COUNT_SINGULAR, Strings.STATUSBAR_LINE_COUNT_PLURAL));
    }
    
    function _updateIndentType() {
        var indentWithTabs = Editor.getUseTabChar();
        $indentType.text(indentWithTabs ? Strings.STATUSBAR_TAB_SIZE : Strings.STATUSBAR_SPACES);
        $indentType.attr("title", indentWithTabs ? Strings.STATUSBAR_INDENT_TOOLTIP_SPACES : Strings.STATUSBAR_INDENT_TOOLTIP_TABS);
        $indentWidthLabel.attr("title", indentWithTabs ? Strings.STATUSBAR_INDENT_SIZE_TOOLTIP_TABS : Strings.STATUSBAR_INDENT_SIZE_TOOLTIP_SPACES);
    }

    function _getIndentSize() {
        return Editor.getUseTabChar() ? Editor.getTabSize() : Editor.getSpaceUnits();
    }
    
    function _updateIndentSize() {
        var size = _getIndentSize();
        $indentWidthLabel.text(size);
        $indentWidthInput.val(size);
    }
    
    function _toggleIndentType() {
        Editor.setUseTabChar(!Editor.getUseTabChar());
        _updateIndentType();
        _updateIndentSize();
    }
    
    function _updateCursorInfo(event, editor) {
        editor = editor || EditorManager.getActiveEditor();

        // compute columns, account for tab size
        var cursor = editor.getCursorPos(true);
        
        var cursorStr = StringUtils.format(Strings.STATUSBAR_CURSOR_POSITION, cursor.line + 1, cursor.ch + 1);
        if (editor.hasSelection()) {
            // Show info about selection size when one exists
            var sel = editor.getSelection(),
                selStr;
            
            if (sel.start.line !== sel.end.line) {
                var lines = sel.end.line - sel.start.line + 1;
                if (sel.end.ch === 0) {
                    lines--;  // end line is exclusive if ch is 0, inclusive otherwise
                }
                selStr = _formatCountable(lines, Strings.STATUSBAR_SELECTION_LINE_SINGULAR, Strings.STATUSBAR_SELECTION_LINE_PLURAL);
            } else {
                var cols = editor.getColOffset(sel.end) - editor.getColOffset(sel.start);  // end ch is exclusive always
                selStr = _formatCountable(cols, Strings.STATUSBAR_SELECTION_CH_SINGULAR, Strings.STATUSBAR_SELECTION_CH_PLURAL);
            }
            $cursorInfo.text(cursorStr + selStr);
        } else {
            $cursorInfo.text(cursorStr);
        }
    }
    
    function _changeIndentWidth(value) {
        $indentWidthLabel.removeClass("hidden");
        $indentWidthInput.addClass("hidden");
        
        // remove all event handlers from the input field
        $indentWidthInput.off("blur keyup");
        
        // restore focus to the editor
        EditorManager.focusEditor();
        
        if (!value || isNaN(value)) {
            return;
        }
        
        value = Math.max(Math.min(Math.floor(value), 10), 1);
        if (Editor.getUseTabChar()) {
            Editor.setTabSize(value);
        } else {
            Editor.setSpaceUnits(value);
        }

        // update indicator
        _updateIndentSize();

        // column position may change when tab size changes
        _updateCursorInfo();
    }
    
    function _updateOverwriteLabel(event, editor, newstate) {
        $statusOverwrite.text(newstate ? Strings.STATUSBAR_OVERWRITE : Strings.STATUSBAR_INSERT);
        
        AnimationUtils.animateUsingClass($statusOverwrite[0], "flash");
    }
    
    function _updateEditorOverwriteMode() {
        var editor = EditorManager.getActiveEditor();
        
        editor.toggleOverwrite(null);
    }
    
    function _initOverwriteMode(currentEditor) {
        currentEditor.toggleOverwrite($statusOverwrite.text() === Strings.STATUSBAR_OVERWRITE);
    }
    
    function _onActiveEditorChange(event, current, previous) {
        if (previous) {
            $(previous).off(".statusbar");
            $(previous.document).off(".statusbar");
            previous.document.releaseRef();
        }
        
        if (!current) {
            StatusBar.hide();  // calls resizeEditor() if needed
        } else {
            StatusBar.show();  // calls resizeEditor() if needed
            
            $(current).on("cursorActivity.statusbar", _updateCursorInfo);
            $(current).on("optionChange.statusbar", function () {
                _updateIndentType();
                _updateIndentSize();
            });
            $(current).on("change.statusbar", function () {
                // async update to keep typing speed smooth
                window.setTimeout(function () { _updateFileInfo(current); }, 0);
            });
            $(current).on("overwriteToggle.statusbar", _updateOverwriteLabel);
            
            current.document.addRef();
            $(current.document).on("languageChanged.statusbar", function () {
                _updateLanguageInfo(current);
            });
            
            _updateCursorInfo(null, current);
            _updateLanguageInfo(current);
            _updateFileInfo(current);
            _initOverwriteMode(current);
            _updateIndentType();
            _updateIndentSize();
        }
    }
    
    /**
     * Setup and populate a custom <select> dropdown for switching the language
     * mode for the given document.
     * @param {!Document} document The document for which to switch the language
     */
    function _populateLanguageSelect(document) {
        // Lazy load the languages in the dropdown to avoid having to receive
        // updates from LanguageManager (not to mention unnecessary processing
        // since most users will not need to manually set the language).
        var languages = LanguageManager.getLanguages();
        
        // fill the dropbown using the languages list
        $languageSelect.empty();
        _.forEach(languages, function (lang) {
            if (!lang.isBinary()) {
                $("<option />").val(lang.getId()).text(lang.getName())
                    .appendTo($languageSelect);
            }
        });
        $languageSelect.val(document.getLanguage().getId());
        
        // sort dropdown alphabetically
        $languageSelect.html($languageSelect.find("option").sort(
            function (a, b) {
                return a.text.toLowerCase().localeCompare(b.text.toLowerCase());
            }
        ));
    }
    
    function _init() {
        $languageSelect     = $("#language-select");
        $cursorInfo         = $("#status-cursor");
        $fileInfo           = $("#status-file");
        $indentType         = $("#indent-type");
        $indentWidthLabel   = $("#indent-width-label");
        $indentWidthInput   = $("#indent-width-input");
        $statusOverwrite    = $("#status-overwrite");
        
        // indentation event handlers
        $indentType.on("click", _toggleIndentType);
        $indentWidthLabel
            .on("click", function () {
                // update the input value before displaying
                $indentWidthInput.val(_getIndentSize());

                $indentWidthLabel.addClass("hidden");
                $indentWidthInput.removeClass("hidden");
                $indentWidthInput.focus();
        
                $indentWidthInput
                    .on("blur", function () {
                        _changeIndentWidth($indentWidthInput.val());
                    })
                    .on("keyup", function (event) {
                        if (event.keyCode === KeyEvent.DOM_VK_RETURN) {
                            $indentWidthInput.blur();
                        } else if (event.keyCode === KeyEvent.DOM_VK_ESCAPE) {
                            _changeIndentWidth(false);
                        }
                    });
            });

        $indentWidthInput.focus(function () { $indentWidthInput.select(); });
        
        // When language select clicked, fully populate the dropdown before it opens
        // (which occurs on mouseup)
        $languageSelect.on("mousedown", function () {
            // Lock width of <select>, else it changes when it's populated
            // (this is reverted in _updateLanguageInfo())
            $languageSelect.css("width", $languageSelect.css("width"));
            
            _populateLanguageSelect(EditorManager.getActiveEditor().document);
        });
        
        // Language select change handler
        $languageSelect.on("change", function () {
            var document = EditorManager.getActiveEditor().document,
                selectedLang = LanguageManager.getLanguage($languageSelect.val()),
                defaultLang = LanguageManager.getLanguageForPath(document.file.fullPath);
            // if default language selected, don't "force" it
            // (passing in null will reset the force flag)
            document.setLanguageOverride(selectedLang === defaultLang ? null : selectedLang);
        });

        $statusOverwrite.on("click", _updateEditorOverwriteMode);
        
        _onActiveEditorChange(null, EditorManager.getActiveEditor(), null);
    }

    // Initialize: status bar focused listener
    $(EditorManager).on("activeEditorChange", _onActiveEditorChange);
    
    AppInit.htmlReady(_init);
});
