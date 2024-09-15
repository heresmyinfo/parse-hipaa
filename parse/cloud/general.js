const generate = require('nanoid/async/generate')

exports.normalizePhone = (val) => {
  console.log('general.normalizePhone input val', val)
  if (val && val.replace) {
    return `+${val.replace(/\D/g, '')}`
  }
  console.log('general.normalizePhone output val', val)
  return val
}

// Using numbers, lowercase and uppercase letters excluding lookalike letters: 1, l, I, 0, O, o, u, v
exports.getNewQRCode = async () => generate('23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstwxyz', 12)

// @todo change to using safe crypt random with nanoid lib
exports.getNew2FACode = () => {
  return Math.floor(Math.random() * 10000).toString().substr(0, 4).padStart(4, '0')
}
