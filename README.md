# FVTT libWrapper
Library for wrapping Foundry methods, meant to improve compatibility between modules that wrap the same methods.

> :warning: **This is an experimental library, and a work-in-progress!**
> You probably shouldn't be using this at this moment.


## Installation

### As a Module
1. Copy this link and use it in Foundry's Module Manager to install the Module

    > https://raw.githubusercontent.com/ruipin/fvtt-lib-wrapper/master/module.json

2. Enable the Module in your World's Module Settings

### As a Library
1. Include the ![shim.js](shim.js) file in your project

    or

2. Write your own shim.

    or

3. Require your users to install this library.


## Usage

### Libary

Using this library is very simple. All you need to do is to call the libWrapper.register method, and provide your modile ID, the scope of the method you want to override, and a wrapper function.

```javascript
libWrapper.register('my-fvtt-module', 'SightLayer.prototype.updateToken', function (wrapped, ...args) {
    console.log('updateToken was called');
    return wrapped.apply(this, args);
});
```

#### Registering a wrapper
To register a wrapper function, you should call the method `libWrapper.register(module, target, fn, type=libWrapper.TYPES.MIXED)`:

```javascript
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
```

See the usage example above.


#### Unregistering a wrapper
To unregister a wrapper function, you should call the method `libWrapper.unregister(module, target)`.
**Please only use this method to unregister wrapper functions belonging to your module.**

```javascript
/**
 * Unregister a new wrapper.
 * Please do not use this to remove other module's wrappers.
 * @param {string} module    The module identifier, i.e. the 'name' field in your module's manifest.
 * @param {string} target    A string containing the path to the function you wish to remove the wrapper from, starting at global scope. For example: 'SightLayer.prototype.updateToken'
 * @param {function} fail    [Optional] If true, this method will throw an exception if it fails to find the method to unwrap. Default is 'true'.
 */
```


#### Unregister a module
To unregister all wrapper functions belonging to a given module, you should call the method `libWrapper.clear_module(module)`.
**Please only use this method to unregister wrapper functions belonging to your module.**
```javascript
/**
 * Clear all wrappers from a given module.
 * Please do not use this to remove other module's wrappers.
 * @param {string} module    The module identifier, i.e. the 'name' field in your module's manifest.
 */
```


### Shim

The ![shim.js](shim.js) file in this repository can be used to avoid a hard dependency on libWrapper. The shim will automatically detect when the libWrapper module is installed, and disable itself. If you are planning to use this library, it is recommended to use it.

The shim implements the `register` function (see documentation above) using a fallback implementation that is more "traditional". It does not implement any of the more "fancy" features of the libWrapper library - most importantly, it does not check for module conflicts or enforce call order between the different wrapper types.