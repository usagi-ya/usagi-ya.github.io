(function() {
	if (navigator.serviceWorker) {
		navigator.serviceWorker.register(
			"./serviceworker.js"
		).then(function(registration) {
			console.log('ServiceWorker registration successful with scope:', registration.scope);
		}).catch(function(error) {
			console.log('ServiceWorker registration failed:', error);
		});
	}
}());