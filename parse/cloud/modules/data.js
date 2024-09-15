const crypto = require('crypto')

const fromEntries = require('object.fromentries')
if (!Object.fromEntries) {
  fromEntries.shim()
}

module.exports.pushAtIndex = function (object, index, newValue) {
  return Object.assign(
    {},
    Object.fromEntries(
      Object.entries(object)
        .map(([key, val]) => {
          const oldKey = parseInt(key)
          return oldKey >= index ? [oldKey + 1, val] : [key, val]
        })
    ),
    { [index]: newValue }
  )
}

/**
 * Simplified analogue of lodash get https://lodash.com/docs/4.17.15#get
 * Doesn't support [n] in path
 * Gets the value at path of object. If the resolved value is undefined, the defaultValue is returned in its place.
 * @param {Object} object
 * @param {Array|String} path
 * @param {*} defaultVal optional
 */
function get (object, path, defaultVal) {
  const PATH = Array.isArray(path)
    ? path
    : path.split('.').filter(i => i.length)
  if (!PATH.length) {
    return object === undefined ? defaultVal : object
  }
  if (object === null || object === undefined || typeof (object[PATH[0]]) === 'undefined') {
    return defaultVal
  }
  return get(object[PATH.shift()], PATH, defaultVal)
}
module.exports.get = get

// Returns a new random hex string of the given even size.
module.exports.randomHexString = function (size) {
  if (size === 0) {
    throw new Error('Zero-length randomHexString is useless.')
  }
  if (size % 2 !== 0) {
    throw new Error('randomHexString size must be divisible by 2.')
  }
  return (0, crypto.randomBytes)(size / 2).toString('hex')
}
