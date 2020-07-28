// SPDX-License-Identifier: MIT
// Copyright © 2020 fvtt-lib-wrapper Rui Pinheiro

// Emulate hooks
class Hooks {
	static callAll() {}
	static once() {}
};
global.Hooks = Hooks;


const game = {
	modules: new Map(),
	ready: true,
	add_module: (nm) => { game.modules.set(nm, { active: true }) }
}
global.game = game;


const shim = require('../shim.js');
global.libWrapper_shim = shim.libWrapper;

const main = require('../lib-wrapper.js');
global.libWrapper = main.libWrapper;


global.wrap_front = function(obj, fn_name, fn) {
	const wrapper = libWrapper._create_wrapper_from_object(obj, fn_name);
	wrapper.fn_data.splice(0, 0, {
		fn: fn,
		priority: undefined,
		active: true
	});
};