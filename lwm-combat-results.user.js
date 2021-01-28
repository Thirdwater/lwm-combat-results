// ==UserScript==
// @name            LWM Combat Results
// @name:ru         HWM Combat Results
// @namespace       https://greasyfork.org/en/users/731199-thirdwater
// @description     Displays the result of the combats in the log page.
// @description:ru  Displays the result of the combats in the log page.
// @match           *://www.lordswm.com/pl_warlog.php?*
// @match           *://www.heroeswm.ru/pl_warlog.php?*
// @version         0.1
// ==/UserScript==

/*
 * For comments, feedbacks, suggestions, etc. visit:
 * [greasyfork link]
 *
 * For pull requests, bug fixes, etc. visit:
 * https://github.com/Thirdwater/lwm-combat-results
 *
 * For lwm contact, visit:
 * https://www.lordswm.com/pl_info.php?id=4874384
 */
 
/*
 * Я открыт для всех сообщений на русском языке, но имейте в виду,
 * что я буду в основном использовать средства перевода для общения.
 *
 * Для комментариев, отзывов, предложений и т. Д. Посетите: 
 * [greasyfork link]
 *
 * Для переводов, запросов на вытягивание, исправлений ошибок и т. Д. Посетите:
 * https://github.com/Thirdwater/lwm-combat-results
 *
 * Для связи в hwm посетите:
 * https://www.heroeswm.ru/pl_info.php?id=4874384
 */

(function() {

    'use strict';


    /*
     * Configurations
     */
    var profile_id_group = /pl_info\.php\?id\=(\d+)/;
    var ru_url_regex = /heroeswm\.ru/;
    var combat_link_regex = /warlog\.php\?warid\=\d+/;
    var combat_datetime_regex = /^\d{2}(\d{2})?-\d{2}-\d{2}(?:\s|&nbsp;)\d{2}:\d{2}/;
    var combat_id_group = /warid\=(\d+)/;
    var combat_crc_key_group = /show_for_all\=([a-zA-Z0-9]+)/;
    var encoding_result_group = {
        EN: /n(<f.*V.*)<br \/>(<f.*D.*)<br \/>\|#/,
        RU: /f(<f.*П.*)<br \/>(<f.*П.*)<br \/>\|#f/
    };
    var encoding_draw_group = {
        EN: /n(<f.*D.*)<br \/>\|#/,
        RU: /f(<f.*Н.*)<br \/>\|#f/
    };
    var encoding_restricted_regex = /restricted/;
    var encoding_player_group = /(.*) (?:gains|gets)/;

    var xpath_context = "/html/body/center/table[last()]/tbody/tr/td";
    var log_owner_xpath = "./center[1]/a";
    var combats_xpath = {
        vanilla: "./a",
        warlog_2_table: "./table/tbody/tr/td[1]/a"
    };
    xpath_context = getElementByXPath(xpath_context, document);

    // Put these after the "Combat log of [name]"
    // E.g. "Combat log of [name] | Options"
    var default_config = {
        player: {
            name: "",
            id: 0
        },
        locale: 'EN',
        has_warlog_2_table_script: false
    };


    /*
     * Main Logic
     */
    var config = loadConfig();
    var combats = getCombats();
    var result_nodes = [];
    formatLog(combats);
    combats.forEach(async function(combat) {
        var encoding = await fetchCombatEncoding(combat);
        var combat_result = parseEncoding(encoding);
        var result_node = addResultNode(combat, combat_result);
        result_nodes.push(result_node);
    });


    /*
     * Configuration Functions
     */
    function loadConfig() {
        var config = default_config;
        loadLocale(config);
        loadPlayer(config);
        checkWarlog2TableScript(config);
        // look into cookies and stuff
        return config;
    }

    function loadLocale(config) {
        var current_url = window.location.href;
        var is_ru = ru_url_regex.test(current_url);
        if (is_ru) {
            config.locale = 'RU';
        } else {
            config.locale = 'EN';
        }
    }

    function loadPlayer(config) {
        var log_owner_link = getElementByXPath(log_owner_xpath, xpath_context);
        config.player.name = log_owner_link.getElementsByTagName('b')[0].innerHTML;
        config.player.id = log_owner_link.href.match(profile_id_group)[1];
    }

    function checkWarlog2TableScript(config) {
        config.has_warlog_2_table_script = hasElementInXPath(
            combats_xpath.warlog_2_table, xpath_context);
    }


    /*
     * Combat Functions
     */
    function getCombats() {
        var xpath = combats_xpath.vanilla;
        if (config.has_warlog_2_table_script) {
            xpath = combats_xpath.warlog_2_table;
        }
        var links = getElementsByXPath(xpath, xpath_context);
        var num_links = links.snapshotLength;

        var combats = [];
        for (var i = 0; i < num_links; i++) {
            var link = links.snapshotItem(i);
            if (isCombatLink(link)) {
                var combat = getCombatInfo(link);
                combats.push(combat);
            }
        }
        return combats;
    }

    function isCombatLink(link_element) {
        var is_combat_link = combat_link_regex.test(link_element.href);
        var has_datetime = combat_datetime_regex.test(link_element.innerHTML);
        return is_combat_link && has_datetime;
    }

    function getCombatInfo(link_element) {
        var url = link_element.href;
        var id = url.match(combat_id_group)[1];
        var crc_key_match = url.match(combat_crc_key_group);
        var crc_key = (crc_key_match ? crc_key_match[1] : null);

        var combat = {
            link_node: link_element,
            url: url,
            id: id,
            crc_key: crc_key,
            datetime: link_element.innerHTML
        };
        return combat;
    }

    async function fetchCombatEncoding(combat) {
        var combat_encoding_link = "https://www.lordswm.com/battle.php?lastturn=-1";
        combat_encoding_link += "&warid=" + combat.id;
        if (combat.crc_key !== null) {
            combat_encoding_link += "&show_for_all=" + combat.crc_key;
        }

        var response = await fetch(combat_encoding_link)
        var encoding = await response.text();
        return encoding;
    }


    /*
     * Combat Result Functions
     */
    function parseEncoding(encoding) {
        var result = {restricted: false};
        if (encoding_restricted_regex.test(encoding.substring(0, 20))) {
            result.restricted = true;
            return result;
        }
        
        var win_en = [];
        var win_ru = [];
        var lose_en = [];
        var lose_ru = [];
        var draw_en = [];
        var draw_ru = [];
        var player = {};
        
        var en_results = encoding.match(encoding_result_group.EN);
        var ru_results = encoding.match(encoding_result_group.RU);
        if (en_results === null) {
            en_results = encoding.match(encoding_draw_group.EN);
            ru_results = encoding.match(encoding_draw_group.RU);
            draw_en = encodingToArray(en_results[1]);
            draw_ru = encodingToArray(ru_results[1]);
            
            player.full_text = {
                EN: getPlayerResult(draw_en),
                RU: getPlayerResult(draw_ru)
            };
        } else {
            win_en = encodingToArray(en_results[1]);
            win_ru = encodingToArray(ru_results[1]);
            lose_en = encodingToArray(en_results[2]);
            lose_ru = encodingToArray(ru_results[2]);
            
            var player_win = getPlayerResult(win_en);
            if (player_win === null) {
                player.full_text = {
                    EN: getPlayerResult(lose_en),
                    RU: getPlayerResult(lose_ru)
                };
            } else {
                player.full_text = {
                    EN: player_win,
                    RU: getPlayerResult(win_ru)
                };
            }
        }
        
        parsePlayerResult(player);
        result.player = player;
        var full_text_en = [].concat(win_en, lose_en, draw_en);
        var full_text_ru = [].concat(win_ru, lose_ru, draw_ru);
        result.full_text = {
            EN: full_text_en.join("\n"),
            RU: full_text_ru.join("\n")
        };
        return result;
    }
    
    function parsePlayerResult(player) {
        var full_text = player.full_text;
        // TODO: ru 
        var short_text_en = full_text.EN.replace(encoding_player_group, "");
        if (short_text_en[short_text_en.length - 1] === ".") {
            short_text_en = short_text_en.slice(0, -1);
        }
        player.short_text = {
            EN: short_text_en
        };
    }
    
    function encodingToArray(encoding) {
        var lines = encoding.split(/<br *\/?>/i);
        for (var i = 0; i < lines.length; i++) {
            lines[i] = stripHTMLTags(lines[i]);
        }
        return lines;
    }

    function getPlayerResult(result_lines) {
        for (var i = 0; i < result_lines.length; i++) {
            var result_line = result_lines[i];
            var player_line = result_line.match(encoding_player_group);
            if ((player_line !== null) && (player_line[1] === config.player.name)) {
                return result_line;
            }
        }
        return null;
    }

    function formatLog(combats) {
        var first_combat_node = combats[0].link_node;
        var table_node = first_combat_node.parentNode.parentNode.parentNode.parentNode;
        table_node.style.cssText += "white-space: nowrap;";
        if (!config.has_warlog_2_table_script) {
            var td_node = first_combat_node.parentNode;
            td_node.style.cssText += "max-width: 1000px";
            var reference_node = td_node.childNodes[2];
            formatVanillaLog(reference_node);
        }
    }
    
    function formatVanillaLog(reference_node) {
        var parent_node = reference_node.parentNode;
        var current_node = reference_node;
        var new_row = true;
        var container = null;
        while (current_node.nextSibling !== null) {
            current_node = current_node.nextSibling;
            if (new_row) {
                container = document.createElement('div');
                container.style.cssText = "display: flex; white-space: pre";
                parent_node.insertBefore(container, current_node);
                new_row = false;
            }
            if (current_node.nodeName.toLowerCase() !== 'br') {
                if (current_node.nodeType === Node.TEXT_NODE) {
                    var stripped_text = current_node.wholeText.replace(/\n/gm, "");
                    parent_node.removeChild(current_node);
                    if (stripped_text === " ") {
                        // Weird behavior when appending whitespace-only text nodes the normal way.
                        container.insertAdjacentHTML('beforeend', "&nbsp;");
                    } else {
                        container.appendChild(document.createTextNode(stripped_text));
                    }
                } else {
                    container.appendChild(current_node);
                }
            } else {
                parent_node.removeChild(current_node);
                container.insertAdjacentHTML('beforeend', "&nbsp;&nbsp;");
                new_row = true;
            }
            // Get back out of the container and continue.
            current_node = container;
        }
    }
    
    function addResultNode(combat, result) {
        var full_result = "";
        var short_result = "";
        if (!result.restricted) {
            full_result = result.full_text[config.locale];
            short_result = result.player.short_text[config.locale];
        }
        
        var result_node = null;
        if (config.has_warlog_2_table_script) {
            // See https://stackoverflow.com/a/5650542
            // This is why we shouldn't be using tables for layout.
            var row_node = combat.link_node.parentNode.parentNode;
            var column_node = document.createElement('td');
            var table_node = document.createElement('table');
            var table_row_node = document.createElement('tr');
            result_node = document.createElement('td');
            
            table_node.setAttribute('width', "100%");
            table_node.setAttribute('cellpadding', "0");
            table_node.setAttribute('cellspacing', "0");
            table_node.style.cssText = "table-layout: fixed; white-space: nowrap";
            result_node.style.cssText = "overflow: hidden; text-overflow: ellipsis;";
            result_node.textContent = short_result;
            result_node.setAttribute('title', full_result);
            
            table_row_node.appendChild(result_node);
            table_node.appendChild(table_row_node);
            column_node.appendChild(table_node);
            row_node.appendChild(column_node);
        } else {
            var container_node = combat.link_node.parentNode;
            result_node = document.createElement('span');
            result_node.style.cssText = "white-space: nowrap; overflow: hidden; text-overflow: ellipsis";
            result_node.textContent = short_result;
            result_node.setAttribute('title', full_result);
            
            container_node.appendChild(result_node);
        }
        return result_node;
    }

    /*
     * Utility Functions
     */
    function getElementByXPath(xpath, context) {
        var result = document.evaluate(
            xpath, context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
    }

    function getElementsByXPath(xpath, context) {
        return document.evaluate(
            xpath, context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
    }

    function hasElementInXPath(xpath, context) {
        var result = document.evaluate(
            xpath, context, null, XPathResult.ANY_UNORDERED_NODE_TYPE, null);
        return result.singleNodeValue !== null;
    }

    function stripHTMLTags(html_string) {
        var div = document.createElement('div');
        div.innerHTML = html_string;
        return div.innerText;
    }

})();
