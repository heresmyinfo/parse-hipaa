const LRU = require('lru-cache')
const options = {
  max: 36 * 1024 * 100, // 36 is probably max size of 1 item (ipv6 + country code)
  length: (n, key) => {
    return n.length + key.length
  },
  maxAge: 1000 * 86400 // 1 day
}

const cache = new LRU(options)

module.exports = cache
