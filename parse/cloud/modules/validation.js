const dns = require('dns')
const { URL } = require('url')
const util = require('util')
const dnsResolveAsync = util.promisify(dns.resolve)

module.exports.validateEmail = (email) => {
  const emailRex = /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/
  return emailRex.test(email)
}

module.exports.validateName = (name) => name.trim().length > 0

module.exports.validateDomain = async (url) => {
  try {
    let addresses = await dnsResolveAsync(url)
    return addresses.length > 0
  } catch (err) {
    try {
      const myUrl = new URL(url)
      let addresses = await dnsResolveAsync(myUrl.hostname)
      return addresses.length > 0
    } catch (err) {
      return false
    }
  }
}

module.exports.validatePhone = (phone) => {
  const phoneRex = /^\+?\d+$/ // Any numbers optionally starting with +
  return phoneRex.test(phone)
}
