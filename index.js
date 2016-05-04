const _ = require('lodash');
const sdl2 = require('./sdl');

console.log(sdl2.init());

const windows = [
	new sdl2.Window('Hello!'),
	new sdl2.Window('Woah!'),
];

const eventIntervalId = setInterval(sdl2.pollEvents, 1000/60);

sdl2.events
.on('window', event => {
	if(event.event === 'close') {
		const w = _.find(windows, (w) => w.id === event.windowID);

		w.destroy();
		_.pull(windows, w);
	}
})
.on('quit', event => {
	clearInterval(eventIntervalId);

	sdl2.quit();
});
