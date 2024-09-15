const facebook = require('./facebook')
const google = require('./google')
const apple = require('./apple')

const handlers = {
  facebook,
  google,
  apple
}

function getOAuthData (provider, payload = {}) {
  if (handlers[provider]) {
    return handlers[provider](payload)
  } else {
    return null
  }
}

module.exports = getOAuthData
