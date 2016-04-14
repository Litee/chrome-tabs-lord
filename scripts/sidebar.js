$(document).ready(onReady);

function onReady() {
	console.log("Sidebar view loaded! Reading information about existing windows...");

	var jsTree = $('#tree-root').jstree({
		'core' : {
			'check_callback': true,
			'themes' : {
	      		"dots" : false
	    	}
		},
	});

	jsTree.on("select_node.jstree",
        function(evt, data){
        	var nodeMeta = 	data.node.original;
        	if (nodeMeta.tabId) {
				chrome.windows.update(nodeMeta.parentWindowId, {focused:true}, function() {
					chrome.tabs.update(nodeMeta.tabId, {active:true});
				});
        	}
        }
	);

	chrome.windows.getAll({populate:true, windowTypes:["normal"]}, function(windowsArr) {
		windowsArr.forEach(function(window) {
			console.log("Populating window " + window.id);
			var windowNodeId = $('#tree-root').jstree("create_node", null, {"text": "Window", "windowId": window.id, "state": {"opened": true}});
			window.tabs.forEach(function(tab) {
				console.log("Populating tab " + tab.id);
				var windowNode = $('#tree-root').jstree("create_node", windowNodeId, {"text": tab.title, "tabId": tab.id, "parentWindowId": tab.windowId, "icon": tab.favIconUrl});
			});
		});
	});
	chrome.windows.onCreated.addListener(onWindowCreated);
	chrome.windows.onRemoved.addListener(onWindowRemoved);

	function onWindowCreated(window) {
		var windowNode = jsTree.create_node(null, {"text": "Window", "windowId": window.id});
	}

	function onWindowRemoved(window) {
		$("li.window-panel").filter(function(w) { return w.tabsMasterWindowId === window.id}).remove();
	}

	console.log("Existing windows parsed!");
}