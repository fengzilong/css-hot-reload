const getAbsoluteUrl = u => {
	let tmp = document.createElement( 'a' );
	tmp.setAttribute( 'href', u );
	return tmp.href;
};

chrome.storage.local.get(config => {
	console.debug( 'config.enabledLinks', config.enabledLinks );
	let enabledLinks = config.enabledLinks;
	if( !~enabledLinks.indexOf( location.href ) ) {
		return;
	}

	let links = document.querySelectorAll( 'link' );
	let loadedPromises = [];
	let urls = [];

	[].forEach.call(links, link => {
		urls.push( getAbsoluteUrl( link.getAttribute( 'href' ) ) );
		let p = new Promise(( resolve, reject ) => {
			link.onload = () => {
				resolve();
			};
		});
		loadedPromises.push( p );
	});

	Promise.all( loadedPromises )
		.then(() => {
			console.debug( 'all loaded' );
			console.debug( urls );

			chrome.runtime.sendMessage({
				type: 'PRE_MONITOR',
				payload: {
					pageUrl: location.href,
					urls: urls
				}
			}, response => {
				console.log( response );
			});
		});
});
