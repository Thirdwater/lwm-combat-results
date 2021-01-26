// ==UserScript==
// @name            LWM Combat Results
// @name:ru         Lorem ipsum
// @namespace       https://greasyfork.org/en/users/731199-thirdwater
// @description     Displays the result of the combats in the log page.
// @description:ru  Lorem ipsum
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
 * For lwm contact, mail to:
 * https://www.lordswm.com/pl_info.php?id=4874384
 */

(function() {

    'use strict';


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
    var combats_xpath = "./table/tbody/tr/td[1]/a";
    xpath_context = document.evaluate(
        xpath_context, document, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null).singleNodeValue;

    // Put these after the "Combat log of [name]"
    // E.g. "Combat log of [name] | Options"
    var default_config = {
        player: {
            name: "",
            id: 0
        },
        locale: 'EN',
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


    var config = loadConfig();
    var combats = getCombats();
    prepareTable();
    combats.forEach(async function(combat) {
        var encoding = await fetchCombatEncoding(combat);
        var combat_result = getCombatResults(encoding);
        addResultNode(combat, combat_result);
    });
    console.log(config.player);


    function loadConfig() {
        var config = default_config;
        loadLocale(config);
        loadPlayer(config);
        // look for warlog2table existence
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
        var log_owner_link = getElementByXPath(log_owner_xpath);
        config.player.name = log_owner_link.getElementsByTagName('b')[0].innerHTML;
        config.player.id = log_owner_link.href.match(profile_id_group)[1];
    }

    function getCombats() {
        var links = getElementsByXPath(combats_xpath);
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

    function getElementByXPath(xpath) {
        var result = document.evaluate(
            xpath, xpath_context, null, XPathResult.FIRST_ORDERED_NODE_TYPE, null);
        return result.singleNodeValue;
    }

    function getElementsByXPath(xpath) {
        return document.evaluate(
            xpath, xpath_context, null, XPathResult.ORDERED_NODE_SNAPSHOT_TYPE, null);
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

    function prepareTable() {
        
    }

    function addResultNode(combat, result) {
        // with warlog2table script:
        var row_element = combat.link_node.parentNode.parentNode;
        var table_element = row_element.parentNode.parentNode;
        var result_container = document.createElement('td');
        var result_node = document.createElement('div');

        // move these to a different place
        table_element.style.cssText += "white-space: nowrap; table-layout:fixed; width: 100%";
        result_node.style.cssText = "overflow: hidden; text-overflow: ellipsis;";

        result_node.textContent = formatResult(result);
        result_container.appendChild(result_node);
        row_element.appendChild(result_container);
    }

    function formatResult(result) {

        return result.user[config.locale];
    }

    function stripHTMLTags(html_string) {
        var div = document.createElement('div');
        div.innerHTML = html_string;
        return div.innerText;
    }

})();


