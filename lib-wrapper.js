// SPDX-License-Identifier: MIT
// Copyright © 2020 fvtt-lib-wrapper Rui Pinheiro

'use strict';

(function() {
	const MODULE_ID = 'lib-wrapper';
	const VERSION   = '0.3.0';

	// Debug
	let DEBUG = false;
	let PROPERTIES_CONFIGURABLE = true;

	// Get global scope
	const glbl = (typeof window !== "undefined") ? window : (typeof global !== "undefined") ? global : null;
	if(!glbl)
		throw `libWrapper Library version ${VERSION} failed to initialize, unable to obtain global scope handle.`;

	console.info(`libWrapper Library ${VERSION} loaded.`);


	// TYPES
	const TYPES = {
		WRAPPER : 1,
		MIXED   : 2,
		OVERRIDE: 3
	};

	const TYPES_REVERSE = {};

	for(let key in TYPES) {
		TYPES_REVERSE[TYPES[key]] = key;
	}

	Object.freeze(TYPES);
	Object.freeze(TYPES_REVERSE);


	// Handler class - owns the function that is returned by the wrapper class
	class Handler {
		constructor(fn) {
			this.set(fn);

			let _this = this;
			this.fn = function() {
				return _this._fn(this, ...arguments);
			};
		}

		set(fn) {
			this._fn = fn;
		}
	}
	Object.freeze(Handler);


	// Wrapper class - this class is responsible for the actual wrapping
	class Wrapper {
		// Properties
		get name() {
			return this.names[0];
		}

		// Constructor
		constructor (obj, fn_name, name=undefined) {
			// Check if this object is already wrapped
			let descriptor = Object.getOwnPropertyDescriptor(obj, fn_name);

			if(descriptor) {
				if(descriptor.get?._lib_wrapper) {
					let wrapper = descriptor.get?._lib_wrapper;

					if(name && !wrapper.names.indexOf(name))
						wrapper.names.push(name);

					if(wrapper && wrapper instanceof this.constructor)
						return wrapper;
				}

				if(descriptor.configurable === false) {
					throw `libWrapper: '${name}' cannot be wrapped, the corresponding descriptor has 'configurable=false'.`;
				}
				else {
					if(descriptor.get)
						throw `libWrapper: Wrapping a property ('${name}') with a getter/setter is currently not supported.`;
					else
						this.wrapped = descriptor.value;
				}
			}
			else {
				this.wrapped = undefined;
			}

			// Setup instance variables
			this.object   = obj;
			this.names    = [];
			this.fn_name  = fn_name;
			this.fn_data = [];
			this.active   = false;

			this.warned_detected_classic_wrapper = false;

			// Add names
			if(name)
				this.names.push(name);
			this.names.push(fn_name);

			// Do actual wrapping
			this._wrap();
		}

		_wrap() {
			if(this.active)
				return;

			// Create a handler
			if(!this.handler)
				this._create_handler();

			// Setup setter / getter
			let getter = null;
			let setter = null;

			{
				let _this = this;

				getter = function() {
					return _this.handler.fn;
				};

				setter = function(value) {
					return _this.set(value, this);
				};
			}

			// Store a reference to this in the getter so that we can support 'singleton'-like functionality
			getter._lib_wrapper = this;

			// Define a property with a getter/setter
			Object.defineProperty(this.object, this.fn_name, {
				get: getter,
				set: setter,
				configurable: PROPERTIES_CONFIGURABLE
			});

			this.active = true;

			if(DEBUG)
				console.info(`libWrapper: Wrapped '${this.name}'.`);
		}

		_unwrap() {
			if(!this.active)
				return;

			if(!PROPERTIES_CONFIGURABLE)
				throw `libWrapper: Cannot unwrap when PROPERTIES_CONFIGURABLE==false`;


			// Kill the handler
			{
				let _fn_name = this.fn_name;

				this.handler.set(function(obj, ...args) {
					return obj[_fn_name].apply(obj, args);
				});
			}
			this.handler = null

			// Remove the property
			delete this.object[this.fn_name];
			this.object[this.fn_name] = this.wrapped;

			// Done
			this.active = false;

			if(DEBUG)
				console.info(`libWrapper: Unwrapped '${this.name}'.`);
		}

		_create_handler() {
			this.handler = new Handler(this.call_getter.bind(this, null));
		}


		// Getter/setters
		_get_parent_wrapper() {
			let descriptor = Object.getOwnPropertyDescriptor(this.object.constructor.prototype, this.methodName);
			let wrapper = descriptor?.get?._lib_wrapper;

			if(wrapper && wrapper != this)
				return wrapper;

			return null;
		}

		get_wrapped(obj) {
			// If 'obj' is not this.object, then we need to see if it has a local wrapper
			if(obj && obj != this.object) {
				let descriptor = Object.getOwnPropertyDescriptor(obj, this.methodName);

				let wrapper = descriptor?.get?._lib_wrapper;
				if(wrapper)
					return wrapper.get_wrapped(obj);
			}

			// Otherwise we just return our wrapped value
			return this.wrapped;
		}

		call_getter(state, obj, ...args) {
			// Keep track of call state
			if(state)
				state.called = true;

			// Grab the next function from the function data array
			const index = state?.index ?? 0;
			const data = this.fn_data[index];
			const fn = data?.fn;

			// If no more methods exist, then finish the chain
			if(!data) {
				// We need to call parent wrappers if they exist
				// Otherwise, we can immediately return the wrapped value
				let parent_wrapper = this._get_parent_wrapper();

				if(parent_wrapper && parent_wrapper != this)
					return parent_wrapper.call_getter(null, obj, ...args);
				else
					return this.get_wrapped(obj).apply(obj, args);
			}

			// OVERRIDE type does not continue the chain
			if(data.type >= TYPES.OVERRIDE) {
				// Call next method in the chain
				return fn.apply(obj, args);
			}

			// Prepare the continuation of the chain
			const next_state = {
				called: false,
				index : index + 1
			};
			const next_fn = this.call_getter.bind(this, next_state, obj);

			// Call next method in the chain
			const result = fn.call(obj, next_fn, ...args);

			// Check that next_fn was called
			if(!next_state.called) {
				const is_last_wrapper = (next_state.index == this.fn_data.length)

				// WRAPPER-type functions that do this are breaking an API requirement, as such we need to be loud about this.
				// As a "punishment" of sorts, we forcefully unregister them and ignore whatever they did.
				if(data.type == TYPES.WRAPPER) {
					console.error(`libWrapper: The wrapper for '${data.target}' registered by module '${data.module}' with type WRAPPER did not chain the call to the next wrapper, which breaks a libWrapper API requirement. This wrapper will be unregistered.`);
					libWrapper.unregister(data.module, data.target);

					if(!is_last_wrapper) {
						next_state.index = index;
						return next_fn.apply(obj, args);
					}
				}

				// Other TYPES only get a single log line
				else if(!is_last_wrapper && (DEBUG || !data.warned_conflict)) {
					const affectedModules = this.fn_data.filter((x) => {
						return x.type != TYPES.WRAPPER && x.module != data.module;
					}).map((x) => {
						return x.module;
					});

					console.warn(`libWrapper: Possible conflict detected between '${data.module}' and [${affectedModules.join(', ')}]. The former did not chain the wrapper for '${data.target}'.`);
					data.warned_conflict = true;
				}
			}

			// Done
			return result;
		}

		set(value, obj=null, reuse_handler=false) {
			// If assigning to an instance directly, create a wrapper for the instance
			if(obj != this.object) {
				let objWrapper = new this.constructor(obj, this.fn_name, `instanceof ${this.name}`);
				objWrapper.set(value, obj, true);
				return;
			}

			// Redirect current handler to directly call the wrapped method
			if(!reuse_handler)
			{
				let wrapped = this.wrapped;

				this.handler.set(function(obj, ...args) {
					return wrapped.apply(obj, args);
				});

				this._create_handler();
			}

			// Wrap the new value and create a new handler
			this.wrapped = value;

			if(DEBUG || !this.warned_detected_classic_wrapper) {
				this.warned_detected_classic_wrapper = true;
				console.warn(`libWrapper: Detected manual wrapping of '${this.name}', which could cause compatibility issues with non-libWrapper modules.`);

				if(DEBUG && console.trace)
					console.trace();
			}
		}


		// Wraper array methods
		sort() {
			this.fn_data.sort((a,b) => { return a.type - b.type; });
		}
	};
	Object.freeze(Wrapper);


	// Already overridden Error type
	class AlreadyOverriddenError extends Error {
		constructor(module, target, conflicting_module, ...args) {
			super(`libWrapper: Failed to wrap '${target}' for module '${module}' with type OVERRIDE. The module '${conflicting_module}' has already registered an OVERRIDE wrapper for the same method.`, ...args);

			// Maintains proper stack trace for where our error was thrown (only available on V8)
			if (Error.captureStackTrace)
				Error.captureStackTrace(this, AlreadyOverriddenError)

			this.name = 'AlreadyOverriddenError';

			// Custom debugging information
			this.module = module;
			this.target = target;
			this.conflicting_module = conflicting_module;
		}

		/**
		 * Returns the title of the module that caused the wrapping conflict
		 */
		get conflicting_module_title() {
			return game.modules.get(this.conflicting_module)?.data?.title;
		}
	}


	// Manager class
	class libWrapper {
		// Properties
		static get TYPES() { return TYPES; }

		static get version() { return VERSION; }
		static get shim() {	return false; }
		static get module_active() { return true; }
		static get debug() { return DEBUG; }
		static set debug(value) { DEBUG = !!value; }

		static get AlreadyOverriddenError() { return AlreadyOverriddenError; };


		// Variables
		static wrappers = new Set();
		static priority_overrides = new Map();


		// Utilities
		static _create_wrapper_from_object(obj, fn_name, name=undefined) {
			const wrapper = new Wrapper(obj, fn_name, name);
			this.wrappers.add(wrapper);
			return wrapper;
		}

		static _create_wrapper(target) {
			const split = target.split('.');
			const fn_name = split.pop();
			const obj = split.reduce((x,y)=>x[y], glbl);
			return this._create_wrapper_from_object(obj, fn_name, target);
		}

		static _find_wrapper_by_name(name) {
			for(let wrapper of this.wrappers) {
				if(wrapper.names.indexOf(name) != -1)
					return wrapper;
			}

			return null;
		}

		static _find_module_data_in_wrapper(module, wrapper) {
			return wrapper.fn_data.find((x) => { return x.module == module; });
		}

		static _find_module_data_with_target(module, target) {
			const wrapper = this._find_wrapper_by_name(target);
			if(!wrapper)
				return null;

			return this._find_module_data_in_wrapper(module, wrapper);
		}

		static _get_default_priority(module, target) {
			const module_key = `${module}:${target}`;
			if(this.priority_overrides.has(module_key))
				return this.priority_overrides.get(module_key);

			return 0;
		}


		static _clear(target) {
			const wrapper = this._find_wrapper_by_name(target);

			wrapper.fn_data = [];
			wrapper._unwrap();
			this.wrappers.delete(wrapper);

			console.info(`libWrapper: Cleared all wrapper functions for '${target}'.`);
		}


		// Public interface

		/**
		 * Register a new wrapper.
		 * @param {string} module          The module identifier, i.e. the 'name' field in your module's manifest.
		 * @param {string} target          A string containing the path to the function you wish to add the wrapper to, starting at global scope. For example: 'SightLayer.prototype.updateToken'
		 * @param {function} fn            Wrapper function. When called, the first parameter will be the next function in the chain.
		 * @param {libWrapper.TYPES} type  The type of the wrapper (see libWrapper.TYPES). Default is 'libWrapper.TYPES.MIXED'.
		 *
		 *   libWrapper.TYPES.WRAPPER:
		 *     Use if your wrapper will always call the next function in the chain.
		 *     This type has priority over every other type. It should be used whenever possible as it massively reduces the likelihood of conflicts.
		 *     Note that the library will auto-detect if you use this type but do not call the original function, and automatically unregister your wrapper.
		 *
		 *   libWrapper.TYPES.MIXED:
		 *     Default type. Your wrapper will be allowed to decide whether it should call the next function in the chain or not.
		 *     These will always come after 'WRAPPER'-type wrappers. Order is not guaranteed, but conflicts will be auto-detected.
		 *
		 *   libWrapper.TYPES.OVERRIDE:
		 *     Use if your wrapper never calls the next function in the chain. This type has the lowest priority, and will always be called last.
		 *     If another module already has an 'OVERRIDE' wrapper registered to the same method, using this type will throw a <AlreadyOverriddenError> exception.
		 *     This should allow you to fail gracefully, and for example warn the user of the conflict.
		 */
		static register(module, target, fn, type=libWrapper.TYPES.MIXED) {
			// Validate module
			let module_details = game.modules.get(module);
			if(module == MODULE_ID || !game.modules.get(module)?.active)
				throw `libWrapper: '${module}' is not a valid module`;

			// Validate arguments
			if(!fn || !(fn instanceof Function))
				throw `libWrapper: Parameter 'fn' must be a function.`;

			if(!(type in TYPES_REVERSE))
				throw `libWrapper: Parameter 'type' must be a valid libWrapper type (see libWrapper.TYPES).`;

			// Create wrapper
			let wrapper = this._create_wrapper(target);

			// Check if this wrapper is already registered
			if(this._find_module_data_in_wrapper(module, wrapper))
				throw `libWrapper: '${module}' has already registered a wrapper for '${target}'.`;

			// Only allow one 'OVERRIDE' type
			if(type == libWrapper.TYPES.OVERRIDE) {
				const last = wrapper.fn_data.slice(-1)[0];
				if(last && last.type == type)
					throw new AlreadyOverriddenError(module, target, last.module);
			}

			// Wrap
			let data = {
				module  : module,
				target  : target,
				fn      : fn,
				type    : type,
				wrapper : wrapper,
				priority: this._get_default_priority(module, target)
			};

			wrapper.fn_data.splice(0, 0, data);
			wrapper.sort();

			// Done
			console.info(`libWrapper: Registered a wrapper for '${target}' by '${module}' with type ${TYPES_REVERSE[type]}.`);
		}

		/**
		 * Unregister a new wrapper.
		 * Please do not use this to remove other module's wrappers.
		 * @param {string} module    The module identifier, i.e. the 'name' field in your module's manifest.
		 * @param {string} target    A string containing the path to the function you wish to remove the wrapper from, starting at global scope. For example: 'SightLayer.prototype.updateToken'
		 * @param {function} fail    [Optional] If true, this method will throw an exception if it fails to find the method to unwrap. Default is 'true'.
		 */
		static unregister(module, target, fail=true) {
			// Find wrapper
			const data = (target instanceof Wrapper) ? this.find_module_data_in_wrapper(module, target) : this._find_module_data_with_target(module, target);
			if(!data) {
				if(fail)
					throw `libWrapper: Cannot unregister '${target}' by '${module}', as no such wrapper has been registered`;
				return;
			}

			const wrapper = data.wrapper;

			// Remove from fn_data
			const fn_data_index = wrapper.fn_data.indexOf(data);
			wrapper.fn_data.splice(fn_data_index, 1);

			// If the wrapper is empty, and we can, then unwrap it
			if(wrapper.fn_data.length == 0 && PROPERTIES_CONFIGURABLE) {
				wrapper._unwrap();
				this.wrappers.delete(wrapper);
			}

			// Done
			console.info(`libWrapper: Unregistered the wrapper for '${target}' by '${module}'.`);
		}

		/**
		 * Clear all wrappers from a given module.
		 * Please do not use this to remove other module's wrappers.
		 * @param {string} module    The module identifier, i.e. the 'name' field in your module's manifest.
		 */
		static clear_module(module) {
			for(let wrapper of this.wrappers)
				this.unregister(module, wrapper.name);

			console.info(`libWrapper: Cleared all wrapper functions by module '${module}'.`);
		}
	};
	Object.freeze(libWrapper);


	// Make library available in the global scope or export it for Node
	if(typeof module !== 'undefined' && module.exports)
		module.exports = { libWrapper: libWrapper };

	// Define as property so that it can't be deleted
	delete glbl.libWrapper;
	Object.defineProperty(glbl, 'libWrapper', {
		get: () => { return libWrapper; },
		set: (value) => {},
		configurable: false
	});


	// Notify everyone the library has loaded
	Hooks.callAll('libWrapperLoaded', libWrapper);
})();