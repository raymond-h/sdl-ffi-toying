'use strict';

const _ = require('lodash');
const ref = require('ref');
const Struct = require('ref-struct');
const Union = require('ref-union');
const ffi = require('ffi');
const EventEmitter = require('events').EventEmitter;

const SDL_WINDOWPOS_UNDEFINED = 0x1FFF0000;

const SDLRect = Struct({
	x: 'int',
	y: 'int',
	w: 'int',
	h: 'int',
});

const windowPtr = ref.refType('void');
const rendererPtr = ref.refType('void');
const texturePtr = ref.refType('void');
const rectPtr = ref.refType(SDLRect);

const eventMapping = {
	0x100: 'quit',
	0x200: 'window',
	0x400: 'motion',
};

const eventTypes = {
	'quit': Struct({
		type: 'uint32',
		timestamp: 'uint32',
	}),

	'window': Struct({
		type: 'uint32',
		timestamp: 'uint32',
		windowID: 'uint32',
		event: 'uint8',
		data1: 'int32',
		data2: 'int32',
	}),

	'motion': Struct({
		type: 'uint32',
		timestamp: 'uint32',
		windowID: 'uint32',
		which: 'uint32',
		state: 'uint32',
		x: 'int32',
		y: 'int32',
		xrel: 'int32',
		yrel: 'int32',
	})
};

const SDLEvent = Union(_.assign(
	{ type: 'uint32' }, eventTypes
));

const windowEvents = [
	'SDL_WINDOWEVENT_NONE',
	'SDL_WINDOWEVENT_SHOWN',
	'SDL_WINDOWEVENT_HIDDEN',
	'SDL_WINDOWEVENT_EXPOSED',
	'SDL_WINDOWEVENT_MOVED',
	'SDL_WINDOWEVENT_RESIZED',
	'SDL_WINDOWEVENT_SIZE_CHANGED',
	'SDL_WINDOWEVENT_MINIMIZED',
	'SDL_WINDOWEVENT_MAXIMIZED',
	'SDL_WINDOWEVENT_RESTORED',
	'SDL_WINDOWEVENT_ENTER',
	'SDL_WINDOWEVENT_LEAVE',
	'SDL_WINDOWEVENT_FOCUS_GAINED',
	'SDL_WINDOWEVENT_FOCUS_LOST',
	'SDL_WINDOWEVENT_CLOSE',
	'SDL_WINDOWEVENT_TAKE_FOCUS',
	'SDL_WINDOWEVENT_HIT_TEST',
]
.map(ev => ev.replace(/^SDL_WINDOWEVENT_(.+)$/, '$1'))
.map(ev => ev.toLowerCase());

const sdl2 = ffi.Library('SDL2', {
	SDL_Init: ['int', ['uint32']],
	SDL_Quit: ['void', []],
	SDL_GetError: ['string', []],

	SDL_CreateWindow: [windowPtr, ['string', 'int', 'int', 'int', 'int', 'uint32']],
	SDL_DestroyWindow: ['void', [windowPtr]],
	SDL_GetWindowID: ['uint32', [windowPtr]],
	SDL_GetWindowFromID: [windowPtr, ['uint32']],

	SDL_CreateRenderer: [rendererPtr, [windowPtr, 'int', 'uint32']],
	SDL_RenderPresent: ['void', [rendererPtr]],
	SDL_RenderCopy: ['int', [rendererPtr, texturePtr, rectPtr, rectPtr]],
	SDL_DestroyRenderer: ['void', [rendererPtr]],

	SDL_CreateTexture: [texturePtr, [rendererPtr, 'uint32', 'int', 'int', 'int']],
	SDL_LockTexture: ['int', [texturePtr, rectPtr, 'void**', 'int*']],
	SDL_UnlockTexture: ['void', [texturePtr]],
	// SDL_UpdateTexture: ['int', [texturePtr, rectPtr, 'void*', 'int']],
	SDL_DestroyTexture: ['void', [texturePtr]],

	SDL_WaitEvent: ['int', [ref.refType(SDLEvent)]],
	SDL_PollEvent: ['bool', [ref.refType(SDLEvent)]],
});

class Window {
	constructor(title, size) {
		size = size || { width: 640, height: 480 };

		this.ptr = sdl2.SDL_CreateWindow(
			title,
			SDL_WINDOWPOS_UNDEFINED, SDL_WINDOWPOS_UNDEFINED,
			size.width, size.height,
			0
		);
	}

	destroy() {
		sdl2.SDL_DestroyWindow(this.ptr);
	}

	get id() {
		return sdl2.SDL_GetWindowID(this.ptr);
	}

	createRenderer() {
		return new Renderer(this.ptr);
	}
}

class Renderer {
	constructor(winPtr) {
		this.ptr = sdl2.SDL_CreateRenderer(winPtr, -1, 0);
	}

	destroy() {
		sdl2.SDL_DestroyRenderer(this.ptr);
	}

	createTexture(size) {
		return new Texture(this.ptr, size);
	}

	renderTexture(texture) {
		sdl2.SDL_RenderCopy(this.ptr, texture.ptr, ref.NULL, ref.NULL);
	}

	present() {
		sdl2.SDL_RenderPresent(this.ptr);
	}
}

function pixelFormat(type, order, layout, bits) {
	return ((1 << 28) | ((type) << 24) | ((order) << 20) | ((layout) << 16) |
		((bits) << 8) | ((bits/8) << 0));
}

const RGBA8888_PIXELFORMAT = pixelFormat(6, 4, 6, 32);
const ABGR8888_PIXELFORMAT = pixelFormat(6, 7, 6, 32);

class Texture {
	constructor(rendPtr, size) {
		this.ptr = sdl2.SDL_CreateTexture(rendPtr,
			ABGR8888_PIXELFORMAT, 1, // streaming
			size.width, size.height
		);
	}

	destroy() {
		sdl2.SDL_DestroyTexture(this.ptr);
	}

	update(data, inPitch) {
		const pixelsPtrPtr = ref.alloc('char*', ref.NULL);
		const pitchPtr = ref.alloc('int', 0);

		sdl2.SDL_LockTexture(this.ptr, ref.NULL, pixelsPtrPtr, pitchPtr);

		const out = ref.reinterpret(pixelsPtrPtr.deref(), 640*480*4, 0);
		const pitch = pitchPtr.deref();

		for(let i = 0, sourceI = 0; i < out.length; i+=pitch, sourceI += inPitch) {
			data.copy(out, i, sourceI, sourceI+inPitch);
		}

		sdl2.SDL_UnlockTexture(this.ptr);
	}
}

const events = new EventEmitter();

events.on('sdl-event', (event) => {
	const name = eventMapping[event.type];

	if(name != null)
		events.emit(name,
			transformEvent(event[name].toObject())
		);
});

// events.on('sdl-event', (event) => {
// 	console.log('EVENT:', event.type);

// 	const name = eventMapping[event.type];
// 	if(name != null) {
// 		console.log(
// 			transformEvent(event[name].toObject())
// 		);
// 	}
// });

function transformEvent(event) {
	switch(eventMapping[event.type]) {
		case 'window': return _.assign({}, event, { event: windowEvents[event.event] });

		default: return event;
	}
}

function pollEvents() {
	const event = new SDLEvent();

	while(sdl2.SDL_PollEvent(event.ref())) {
		events.emit('sdl-event', event);
	}
}

module.exports = {
	init() {
		return sdl2.SDL_Init(0x00000020);
	},

	quit() {
		sdl2.SDL_Quit();
	},

	events: events,
	pollEvents: pollEvents,

	Window: Window,
	windowEvents: windowEvents
};