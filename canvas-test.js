const _ = require('lodash');
const Canvas = require('canvas');
const sdl2 = require('./sdl');

console.log(sdl2.init());

const win = new sdl2.Window('Canvas test');

const renderer = win.createRenderer();
const texture = renderer.createTexture({ width: 640, height: 480 });

const canvas = new Canvas(640, 480);
const ctx = canvas.getContext('2d');

ctx.fillStyle = 'rgb(255, 0, 0)';
ctx.fillRect(0, 0, 640, 480);

ctx.fillStyle = 'rgb(0, 0, 255)';
ctx.fillRect(0, 0, 50, 50);

const renderIntervalId = setInterval(() => {
	const imgData = ctx.getImageData(0, 0, 640, 480);
	const buffer = new Buffer(imgData.data);

	texture.update(buffer, imgData.width*4);
	renderer.renderTexture(texture);

	renderer.present();
}, 1000);

const eventIntervalId = setInterval(sdl2.pollEvents, 1000/60);

sdl2.events
.on('window', event => {
	if(event.event === 'close') {
		texture.destroy();
		renderer.destroy();
		win.destroy();
	}
})
.on('quit', event => {
	clearInterval(renderIntervalId);
	clearInterval(eventIntervalId);

	sdl2.quit();
});
