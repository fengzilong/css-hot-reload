// css链接尾部增加hash会导致页面抖动
// block样式，background insertCss的方案需要顺序控制，否则样式优先级会混乱，但onBeforeRequest的上下文对请求的先后是不知道的(detail上有个timesemap不知道是不是请求的start time)
// 最终方案，由content script检查当前链接是否开启监控，监听link标签加载完成事件，完成后检查是否存在与正则匹配的外链样式，存在的话通知background按顺序注入(同时传递tabId)，之后由background处理

// 启用列表配置

chrome.storage.local.set({
	enabledLinks: [
		
	]
});

console.log( 'background' );

let currentTabId = '';
chrome.browserAction.onClicked.addListener(tab => {
	currentTabId = tab.id;
	console.log( 'current', currentTabId );

	chrome.runtime.reload();

	// TODO: 记录当前开启hot css的链接，content script在执行逻辑前需要先获取该配置
});

function refreshCssFromId( tabid, id ) {
	let cache = window._cssCache;
	let cssContentArr = [];

	for( let i in cache ) {
		if( cache[ i ].id >= id ) {
			cssContentArr.push( cache[ i ].content );
		}
	}

	let i = 0;
	let applyCssNext = () => new Promise(( resolve, reject ) => {
		chrome.tabs.insertCSS(tabid, {
			code: cssContentArr[ i ]
		}, () => {
			resolve();
		});
	});

	return applyCssNext().then(() => {
		if( i < cssContentArr.length - 1 ) {
			i++;
		} else {
			console.log( 'new css applied' );
		}
		applyCssNext()
	});
}

function diffLinks( tabid, urls ) {
	let promises = [];
	for( let i = 0, len = urls.length; i < len; i++ ) {
		promises.push( fetch( urls[ i ] ).then( response => response.text() ) );
	}

	Promise.all( promises )
		.then(ret => {
			let changed = [];
			for( let i = 0, len = ret.length; i < len; i++ ) {
				if( ret[ i ] !== window._cssCache[ urls[ i ] ].content ) {
					console.log( urls[ i ], 'changed' );
					window._cssCache[ urls[ i ] ].content = ret[ i ];
					// refresh
					refreshCssFromId( tabid, window._cssCache[ urls[ i ] ].id );
				}
			}
		});
	;
}

function cacheCss( urls, content ) {
	if( typeof window._cssCache === 'undefined' ) {
		window._cssCache = {};
	}
	for( let i = 0, len = content.length; i < len; i++ ) {
		_cssCache[ urls[ i ] ] = {
			id: i,
			content: content[ i ]
		};
	}
}

function startMonitor( tabid, urls, content ) {
	cacheCss( urls, content );

	let tid = setInterval(() => diffLinks( tabid, urls ), 1000);

	return () => clearInterval( tid );
}

chrome.runtime.onMessage.addListener(( message, sender, sendResponse ) => {
	if( !message || !message.type ) {
		return;
	}

	const type = message.type;

	switch( type ) {
		case 'PRE_MONITOR':
			let asyncFetches = [];
			let { urls, pageUrl } = message.payload;

			for( let i = 0, len = urls.length; i < len; i++ ) {
				asyncFetches.push(
					fetch( urls[ i ] )
						.then( response => response.text() )
				);
			}

			Promise.all( asyncFetches )
				.then(ret => {
					chrome.tabs.query({
						url: pageUrl
					}, tabs => {
						let tab = tabs[ 0 ];
						if( !tab ) {
							return;
						}

						// insertCSS && remove links

						let i = 0;
						let applyCssNext = () => {
							return new Promise(( resolve, reject ) => {
								console.log( urls[ i ], 'inserted' );

								chrome.tabs.insertCSS(tab.id, {
									code: ret[ i ]
								}, () => {
									resolve();
								});
							})
							.then(() => {
								i++;
								if( i < ret.length ) {
									return applyCssNext();
								}
							});
						};

						applyCssNext()
							.then(() => {
								console.log( 'all inserted' );

								chrome.tabs.executeScript(tab.id, {
									code: `
										(function() {
											let links = document.querySelectorAll( 'link' );
											[].forEach.call(links, link => {
												document.head.removeChild( link );
											});
										})();
									`
								}, () => {
									console.log( 'link elements removed' );

									startMonitor( tab.id, urls, ret );
								});
							});
					});
				});
			break;
		case '':
			break;
		default:
			// default
	}
});
