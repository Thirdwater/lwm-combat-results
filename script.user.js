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
 * I am open to all Russian messages, but please be aware that
 * I will be primarily using translation tools to communicate.
 *
 * For comments, feedbacks, suggestions, etc. visit:
 * [greasyfork link]
 *
 * For translations, pull requests, bug fixes, etc. visit:
 * https://github.com/Thirdwater/lwm-combat-results
 *
 * For hwm contact, visit:
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
        has_warlog_2_table_script: false,
        // too much, ignore these for now
        display: {
            player_results_only: true,
            EXP: true,
            FSP: true,
            gold: true,
            AP: true,
            armaments: true,
            guilds: {
                HG: true,
                TG: true,
                RG: true,
                MG: true,
                CG: true,
                WG: true,
                WG_stars: true,
                LeG_units: true,
                LeG_costs: true
            },
            // Everything else such as event points, trinkets, etc.
            others: true
        }
    };


    /*
     * Main Logic
     */
    var config = loadConfig();
    var combats = getCombats();
    var result_nodes = [];
    prepareResults(combats);
    combats.forEach(async function(combat) {
        var encoding = await fetchCombatEncoding(combat);
        var combat_result = getCombatResults(encoding);
        var result_node = addResultNode(combat, combat_result);
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

    function getCombatResults(encoding) {
        // TODO: handle draws and restricted combats
        var en_results = encoding.match(encoding_result_group.EN);
        var ru_results = encoding.match(encoding_result_group.RU);
        var winner_result = {
            EN: en_results[1],
            RU: ru_results[1]
        };
        var loser_result = {
            EN: en_results[2],
            RU: ru_results[2]
        };
        var user_result = winner_result;
        if (loser_result.EN.includes(config.player.name)) {
            user_result = loser_result;
        }
        var results = {
            winner: winner_result,
            loser: loser_result,
            user: user_result
        };
        return results;
    }


    /*
     * Combat Result Functions
     */
    function prepareResults(combats) {
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
                    if (stripped_text === " ") {
                        // Weird behavior when appending whitespace-only text nodes the normal way.
                        current_node.previousSibling.insertAdjacentHTML('afterend', "&nbsp;");
                    } else {
                        container.appendChild(document.createTextNode(stripped_text));
                    }
                    parent_node.removeChild(current_node);
                } else {
                    container.appendChild(current_node);
                }
            } else {
                parent_node.removeChild(current_node);
                new_row = true;
            }
            // Get back out of the container and continue.
            current_node = container;
        }
    }
    
    function addResultNode(combat, result) {
        var full_result = formatResult(result);
        var filtered_result = filterResult(result);
        
        if (config.has_warlog_2_table_script) {
            // See https://stackoverflow.com/a/5650542
            // This is why we shouldn't be using tables for layout...
            var row_node = combat.link_node.parentNode.parentNode;
            var column_node = document.createElement('td');
            var table_node = document.createElement('table');
            var table_row_node = document.createElement('tr');
            var result_node = document.createElement('td');
            
            table_node.setAttribute('width', "100%");
            table_node.setAttribute('cellpadding', "0");
            table_node.setAttribute('cellspacing', "0");
            table_node.style.cssText = "table-layout: fixed; white-space: nowrap";
            result_node.style.cssText = "overflow: hidden; text-overflow: ellipsis;";
            result_node.textContent = filtered_result;
            result_node.setAttribute('title', full_result);
            
            table_row_node.appendChild(result_node);
            table_node.appendChild(table_row_node);
            column_node.appendChild(table_node);
            row_node.appendChild(column_node);
            
            return result_node;
        } else {
            /*
            var container = document.createElement('div');
            var result_node = document.createElement('span');
            var linebreak_node = combat.link_node.nextSibling;
            while (linebreak_node.nodeName.toLowerCase() !== 'br') {
                linebreak_node = linebreak_node.nextSibling;
            }
            var container = combat.link_node.parentNode;
            container.insertBefore(result_node, linebreak_node);*/
        }
    }

    function formatResult(result) {
        // TODO: extract and format
        var formatted_result = stripHTMLTags(result.user[config.locale]);
        return formatted_result;
    }
    
    function filterResult(result) {
        // TODO: filter based on config
        return result.user[config.locale];
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
