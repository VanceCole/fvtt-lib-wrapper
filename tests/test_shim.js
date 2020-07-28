// SPDX-License-Identifier: MIT
// Copyright © 2020 fvtt-lib-wrapper Rui Pinheiro


'use strict';

require('./utilities.js');

var test = require('tape');


function setup() {
	game.modules.clear();
}


test('Shim: Basic functionality', function (t) {
	setup();

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

	// Use shim
	game.add_module('module1');
	let module1_check = 1;
	libWrapper_shim.register('module1', 'A.prototype.x', function(wrapped, ...args) {
		t.equal(wrapped.apply(this, args), module1_check, 'Module 1');
		return 1000;
	});
	t.equal(a.x(), 1000, 'Wrapped #1');

	// Enable lib wrapper module, then test to see if the shim used the full library
	game.add_module('lib-wrapper');
	let module1_check_2 = 1000;
	libWrapper_shim.register('module1', 'A.prototype.x', function(wrapped, ...args) {
		t.equal(wrapped.apply(this, args), module1_check_2, 'Module 1.2');
		return 2000;
	});
	t.equal(a.x(), 2000, 'Wrapped #1');

	t.end();
});