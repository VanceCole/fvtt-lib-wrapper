// SPDX-License-Identifier: MIT
// Copyright © 2020 fvtt-lib-wrapper Rui Pinheiro

'use strict';

require('./utilities.js');

var test = require('tape');


function setup() {
	game.modules.clear();
}


test('Library: Main', function (t) {
	class A {
		get xvalue() {
			return 1;
		}

		x() {
			return this.xvalue;
		}
	}
	global.A = A;
	let a = new A();
	t.equal(a.x(), 1, 'Original');

	// Register NORMAL
	game.add_module('module1');
	let module1_check = 1;
	libWrapper.register('module1', 'A.prototype.x', function(wrapped, ...args) {
		t.equal(wrapped.apply(this, args), module1_check, 'Module 1');
		return 1000;
	});
	t.equal(a.x(), 1000, 'Wrapped #1');

	// Registering the same method twice with the same module should fail
	t.throws(function() {
		libWrapper.register('module1', 'A.prototype.x', () => {});
	}, null, 'Registering twice with same module should fail');

	// Register WRAPPER
	game.add_module('module2');
	let module2_check = 1000;
	libWrapper.register('module2', 'A.prototype.x', function(wrapped, ...args) {
		t.equal(wrapped.apply(this, args), module2_check, 'Module 1');
		return 20000;
	}, libWrapper.TYPES.WRAPPER);
	t.equal(a.x(), 20000, 'Wrapped #2');

	// Register OVERRIDE
	game.add_module('module3');
	libWrapper.register('module3', 'A.prototype.x', function() {
		t.equal(arguments.length, 0, 'Override arguments');
		return 30000;
	}, libWrapper.TYPES.OVERRIDE);

	module1_check = 30000;
	t.equal(a.x(), 20000, 'Wrapped #3');

	// Registing another OVERRIDE should fail
	game.add_module('double-override');
	t.throws(function() {
		libWrapper.register('double-override', 'A.prototype.x', () => {}, libWrapper.TYPES.OVERRIDE);
	}, libWrapper.AlreadyOverriddenError, 'Registering second override should fail');

	// Try removing module2
	libWrapper.unregister('module2', 'A.prototype.x');
	module1_check = 30000;
	module2_check = -1;
	t.equal(a.x(), 1000, 'Wrapped #3');

	// Add a WRAPPER that does not chain
	libWrapper.register('module2', 'A.prototype.x', function(wrapped, ...args) {
		return -2;
	}, libWrapper.TYPES.WRAPPER);
	t.equal(a.x(), 1000, 'WRAPPER priority without chaining');

	// Add a NORMAL that does not chain
	libWrapper.register('module2', 'A.prototype.x', function(wrapped, ...args) {
		return 20000;
	});
	t.equal(a.x(), 20000, 'NORMAL priority without chaining');

	// Try clearing 'A.prototype.x'
	let pre_clear = A.prototype.x;
	libWrapper._clear('A.prototype.x');
	t.equal(a.x(), 1, 'Unwrapped');
	t.equal(pre_clear.apply(a), 1, 'Unwrapped, pre-clear');

	// Try to wrap again
	let rewrap_check = 1;
	libWrapper.register('module2', 'A.prototype.x', function(wrapped, ...args) {
		t.equal(wrapped.apply(this, args), rewrap_check, 'Wrapper: Rewrap after clear');
		return 500;
	});
	t.equal(a.x(), 500, 'Rewrap after clear');

	// Test manual wrapping
	A.prototype.x = (function() {
		const original = A.prototype.x;

		return function () {
			original.apply(this, arguments);
			return 5000;
		};
	})();
	rewrap_check = 5000;
	t.equal(a.x(), 500, 'Rewrap after clear');

	// Done
	delete global.A;
	t.end();
});