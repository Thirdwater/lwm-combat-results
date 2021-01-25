// ==UserScript==
// @name			LWM Combat Results
// @name:ru			Lorem ipsum
// @namespace		https://greasyfork.org/en/users/731199-thirdwater
// @description		Displays the result of the combats in the log page.
// @description:ru	Lorem ipsum
// @match			*://www.lordswm.com/pl_warlog.php?*
// @match			*://www.heroeswm.ru/pl_warlog.php?*
// @version			0.1
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
	
	
	var combat_link_regex = /warlog\.php\?warid\=\d+/;
	var combat_datetime_regex = /^\d{2}(\d{2})?-\d{2}-\d{2}(?:\s|&nbsp;)\d{2}:\d{2}/;
	var combat_id_group = /warid\=(\d+)/;
	var combat_crc_key_group = /show_for_all\=([a-zA-Z0-9]+)/;
	
	// too much, ignore this for now
	var config = {
		display: {
			owner_results_only: true,
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
	
	
	var combats = getCombats();
	combats.forEach(async function(combat) {
		console.log(combat.id);
		var encoding = await fetchCombatEncoding(combat);
		console.log(encoding.substring(0, 10));
	});


	function getCombats() {
		var links = document.getElementsByTagName('a');
		var num_links = links.length;
		
		var combats = [];
		for (var link of links) {
			if (isCombatLink(link)) {
				var combat = getCombatInfo(link);
				combats.push(combat)
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
			link_tag: link_element,
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

})();


