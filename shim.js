// SPDX-License-Identifier: MIT
// Copyright © 2020 fvtt-lib-wrapper Rui Pinheiro

'use strict';

// A shim for the libWrapper library
(function() {
	const glbl = (typeof window !== "undefined") ? window : (typeof global !== "undefined") ? global : null;
	if(glbl.libWrapper)
		return;

	// Shim class
	class libWrapper_shim {
		static get is_shim() { return true };
		static get module_active() { return (game.modules.get('lib-wrapper')?.active === true); }

		static register(module, target, fn) {
			if(this.module_active) {
				if(glbl.libWrapper && glbl.libWrapper != this)
					return glbl.libWrapper.register(...arguments);
				return Hooks.once('libWrapper.Loaded', (libWrapper) => libWrapper.register(...arguments));
			}

			const split = target.split('.');
			const fn_name = split.pop();
			const obj = split.reduce((x,y)=>x[y], glbl);
			const original = obj[fn_name];
			obj[fn_name] = function() { return fn.call(this, original, ...arguments); };
		}
	}

	// Warn user to install library
	if(!libWrapper_shim.module_active) {
		Hooks.once('ready', () => {
			if(game.user.isGM)
				ui.notifications.warn("One or more modules depend on the 'libWrapper' library. Because it is not installed, they will use a less reliable fallback implementation.");
		});
	}

	// Store shim at global level
	if(typeof module !== 'undefined' && module.exports)
		module.exports = { libWrapper: libWrapper_shim };

	glbl.libWrapper = libWrapper_shim;
})();